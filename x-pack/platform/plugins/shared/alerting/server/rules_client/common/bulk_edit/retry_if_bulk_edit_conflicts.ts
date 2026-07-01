/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import pMap from 'p-map';
import { chunk } from 'lodash';
import type { KueryNode } from '@kbn/es-query';
import type {
  Logger,
  SavedObjectsBulkUpdateObject,
  SavedObjectsUpdateResponse,
} from '@kbn/core/server';
import { isSavedObjectErrorResult } from '@kbn/core/server';
import type { BulkEditActionSkipResult } from '../../../../common/bulk_action';
import { convertRuleIdsToKueryNode } from '../../../lib';
import type { BulkOperationError } from '../../types';
import { waitBeforeNextRetry, RETRY_IF_CONFLICTS_ATTEMPTS } from '../wait_before_next_retry';
import { RULE_SAVED_OBJECT_TYPE } from '../../../saved_objects';
import type { RawRule } from '../../../types';

// max number of failed SO ids in one retry filter
const MaxIdsNumberInRetryFilter = 1000;

export interface BulkEditOperationResult {
  apiKeysToInvalidate: string[];
  rules: Array<SavedObjectsBulkUpdateObject<RawRule>>;
  resultSavedObjects: Array<SavedObjectsUpdateResponse<RawRule>>;
  errors: BulkOperationError[];
  skipped: BulkEditActionSkipResult[];
}
export type BulkEditOperation = (filter: KueryNode | null) => Promise<BulkEditOperationResult>;

interface ReturnRetry {
  apiKeysToInvalidate: string[];
  results: Array<SavedObjectsUpdateResponse<RawRule>>;
  errors: BulkOperationError[];
  skipped: BulkEditActionSkipResult[];
}

/**
 * Retries BulkEdit requests
 * If in response are presents conflicted savedObjects(409 statusCode), this util constructs filter with failed SO ids and retries bulkEdit operation until
 * all SO updated or number of retries exceeded
 * @param logger
 * @param name
 * @param bulkEditOperation
 * @param filter - KueryNode filter
 * @param retries - number of retries left
 * @param accApiKeysToInvalidate - accumulated apiKeys that need to be invalidated
 * @param accResults - accumulated updated savedObjects
 * @param accErrors - accumulated conflict errors
 * @returns Promise<ReturnRetry>
 */
export const retryIfBulkEditConflicts = async (
  logger: Logger,
  name: string,
  bulkEditOperation: BulkEditOperation,
  filter: KueryNode | null = null,
  retries: number = RETRY_IF_CONFLICTS_ATTEMPTS,
  accApiKeysToInvalidate: string[] = [],
  accResults: Array<SavedObjectsUpdateResponse<RawRule>> = [],
  accErrors: BulkOperationError[] = [],
  accSkipped: BulkEditActionSkipResult[] = []
): Promise<ReturnRetry> => {
  // run the operation, return if no errors or throw if not a conflict error
  try {
    const {
      apiKeysToInvalidate: localApiKeysToInvalidate,
      resultSavedObjects,
      errors: localErrors,
      rules: localRules,
      skipped: localSkipped,
    } = await bulkEditOperation(filter);

    const conflictErrorMap = resultSavedObjects.reduce<Map<string, { message: string }>>(
      (acc, item) => {
        if (
          item.type === RULE_SAVED_OBJECT_TYPE &&
          isSavedObjectErrorResult(item) &&
          item.error.statusCode === 409
        ) {
          return acc.set(item.id, { message: item.error.message });
        }
        return acc;
      },
      new Map()
    );

    const results = [
      ...accResults,
      ...resultSavedObjects.filter(
        (res): res is SavedObjectsUpdateResponse<RawRule> => !isSavedObjectErrorResult(res)
      ),
    ];
    const apiKeysToInvalidate = [...accApiKeysToInvalidate, ...localApiKeysToInvalidate];
    const errors = [...accErrors, ...localErrors];
    // Create array of unique skipped rules by id
    const skipped = [
      ...new Map([...accSkipped, ...localSkipped].map((item) => [item.id, item])).values(),
    ];

    if (conflictErrorMap.size === 0) {
      return {
        apiKeysToInvalidate,
        results,
        errors,
        skipped,
      };
    }

    if (retries <= 0) {
      logger.warn(`${name} conflicts, exceeded retries`);

      const conflictErrors = localRules
        .filter((obj) => conflictErrorMap.has(obj.id))
        .map((obj) => ({
          message: conflictErrorMap.get(obj.id)?.message ?? 'n/a',
          rule: {
            id: obj.id,
            name: obj.attributes?.name ?? 'n/a',
          },
        }));

      return {
        apiKeysToInvalidate,
        results,
        errors: [...errors, ...conflictErrors],
        skipped,
      };
    }

    const ids = Array.from(conflictErrorMap.keys());
    logger.debug(`${name} conflicts, retrying ..., ${ids.length} saved objects conflicted`);

    // delay before retry
    await waitBeforeNextRetry(retries);

    // here, we construct filter query with ids. But, due to a fact that number of conflicted saved objects can exceed few thousands we can encounter following error:
    // "all shards failed: search_phase_execution_exception: [query_shard_exception] Reason: failed to create query: maxClauseCount is set to 2621"
    // That's why we chunk processing ids into pieces by size equals to MaxIdsNumberInRetryFilter
    return (
      await pMap(
        chunk(ids, MaxIdsNumberInRetryFilter),
        async (queryIds) =>
          retryIfBulkEditConflicts(
            logger,
            name,
            bulkEditOperation,
            convertRuleIdsToKueryNode(queryIds),
            retries - 1,
            apiKeysToInvalidate,
            results,
            errors,
            skipped
          ),
        {
          concurrency: 1,
        }
      )
    ).reduce<ReturnRetry>(
      (acc, item) => {
        return {
          results: [...acc.results, ...item.results],
          apiKeysToInvalidate: [...acc.apiKeysToInvalidate, ...item.apiKeysToInvalidate],
          errors: [...acc.errors, ...item.errors],
          skipped: [...acc.skipped, ...item.skipped],
        };
      },
      { results: [], apiKeysToInvalidate: [], errors: [], skipped: [] }
    );
  } catch (err) {
    throw err;
  }
};
