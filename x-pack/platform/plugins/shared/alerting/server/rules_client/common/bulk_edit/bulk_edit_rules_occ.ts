/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import pMap from 'p-map';
import type { KueryNode } from '@kbn/es-query';
import type {
  SavedObjectsBulkCreateObject,
  SavedObjectsBulkResponse,
  SavedObjectsBulkUpdateObject,
  SavedObjectsFindResult,
} from '@kbn/core/server';
import type { RuleChangeTracking } from '@kbn/alerting-types';
import { RuleChangeTrackingAction } from '@kbn/alerting-types';
import { logRuleChanges } from '../../../application/rule/methods/common_utils/log_rule_changes';
import type { RuleParams } from '../../../application/rule/types';
import type { ValidateScheduleLimitResult } from '../../../application/rule/methods/get_schedule_frequency';
import { validateScheduleLimit } from '../../../application/rule/methods/get_schedule_frequency';
import { RULE_SAVED_OBJECT_TYPE } from '../../../saved_objects';
import { bulkMigrateLegacyActions } from '../../lib';
import { bulkCreateRulesSo } from '../../../data/rule';
import type { BulkOperationError, RulesClientContext } from '../../types';
import {
  getRuleCircuitBreakerErrorMessage,
  type BulkEditActionSkipResult,
  type RawRule,
} from '../../../types';
import { API_KEY_GENERATE_CONCURRENCY } from '../constants';
import type { BulkEditOperationResult } from './retry_if_bulk_edit_conflicts';
import { bulkMarkApiKeysForInvalidation } from '../../../invalidate_pending_api_keys/bulk_mark_api_keys_for_invalidation';
import type {
  ApiKeysMap,
  ParamsModifier,
  ShouldIncrementRevision,
  UpdateOperationOpts,
} from './types';

export interface BulkEditOccOptions<Params extends RuleParams> {
  filter: KueryNode | null;
  updateFn: (opts: UpdateOperationOpts) => Promise<void>;
  shouldValidateSchedule?: boolean;
  shouldInvalidateApiKeys: boolean;
  paramsModifier?: ParamsModifier<Params>;
  shouldIncrementRevision?: ShouldIncrementRevision<Params>;
  changeTracking?: RuleChangeTracking;
}

const isValidInterval = (interval: string | undefined): interval is string => {
  return interval !== undefined;
};

export async function bulkEditRulesOcc<Params extends RuleParams>(
  context: RulesClientContext,
  options: BulkEditOccOptions<Params>
): Promise<BulkEditOperationResult> {
  const rulesFinder =
    await context.encryptedSavedObjectsClient.createPointInTimeFinderDecryptedAsInternalUser<RawRule>(
      {
        filter: options.filter,
        type: RULE_SAVED_OBJECT_TYPE,
        perPage: 100,
        ...(context.namespace ? { namespaces: [context.namespace] } : undefined),
      }
    );

  const rules: Array<SavedObjectsBulkUpdateObject<RawRule>> = [];
  const skipped: BulkEditActionSkipResult[] = [];
  const errors: BulkOperationError[] = [];
  const apiKeysMap: ApiKeysMap = new Map();
  const username = await context.getUserName();
  const prevInterval: string[] = [];

  for await (const response of rulesFinder.find()) {
    if (options.shouldValidateSchedule) {
      const intervals = response.saved_objects
        .filter((rule) => rule.attributes.enabled)
        .map((rule) => rule.attributes.schedule?.interval)
        .filter(isValidInterval);

      prevInterval.concat(intervals);
    }

    await bulkMigrateLegacyActions({ context, rules: response.saved_objects });

    await pMap(
      response.saved_objects,
      async (rule: SavedObjectsFindResult<RawRule>) =>
        options.updateFn({
          rule,
          apiKeysMap,
          rules,
          skipped,
          errors,
          username,
        }),
      { concurrency: API_KEY_GENERATE_CONCURRENCY }
    );
  }
  await rulesFinder.close();

  if (options.shouldValidateSchedule) {
    const updatedInterval = rules
      .filter((rule) => rule.attributes.enabled)
      .map((rule) => rule.attributes.schedule?.interval)
      .filter(isValidInterval);

    let validationPayload: ValidateScheduleLimitResult = null;
    validationPayload = await validateScheduleLimit({
      context,
      prevInterval,
      updatedInterval,
    });

    if (validationPayload) {
      const apiKeysToInvalidate = [];

      for (const { newUiamApiKey, newApiKey } of apiKeysMap.values()) {
        if (newUiamApiKey) {
          apiKeysToInvalidate.push(newUiamApiKey);
        }
        if (newApiKey) {
          apiKeysToInvalidate.push(newApiKey);
        }
      }

      return {
        apiKeysToInvalidate: options.shouldInvalidateApiKeys ? apiKeysToInvalidate : [],
        resultSavedObjects: [],
        rules: [],
        errors: rules.map((rule) => ({
          message: getRuleCircuitBreakerErrorMessage({
            name: rule.attributes.name || 'n/a',
            interval: validationPayload!.interval,
            intervalAvailable: validationPayload!.intervalAvailable,
            action: 'bulkEdit',
            rules: updatedInterval.length,
          }),
          rule: {
            id: rule.id,
            name: rule.attributes.name || 'n/a',
          },
        })),
        skipped: [],
      };
    }
  }

  if (rules.length === 0) {
    return {
      apiKeysToInvalidate: [],
      resultSavedObjects: [],
      rules,
      errors,
      skipped,
    };
  }

  const { result, apiKeysToInvalidate } = await saveBulkUpdatedRules({
    context,
    rules,
    apiKeysMap,
    shouldInvalidateApiKeys: options.shouldInvalidateApiKeys,
    changeTracking: options.changeTracking,
  });

  return {
    apiKeysToInvalidate: options.shouldInvalidateApiKeys ? apiKeysToInvalidate : [],
    resultSavedObjects: result.saved_objects,
    errors,
    rules,
    skipped,
  };
}

async function saveBulkUpdatedRules({
  context,
  rules,
  apiKeysMap,
  shouldInvalidateApiKeys,
  changeTracking,
}: {
  context: RulesClientContext;
  rules: Array<SavedObjectsBulkUpdateObject<RawRule>>;
  shouldInvalidateApiKeys: boolean;
  apiKeysMap: ApiKeysMap;
  changeTracking?: RuleChangeTracking;
}) {
  const apiKeysToInvalidate: string[] = [];
  let result: SavedObjectsBulkResponse<RawRule>;
  try {
    // TODO (http-versioning): for whatever reasoning we are using SavedObjectsBulkUpdateObject
    // everywhere when it should be SavedObjectsBulkCreateObject. We need to fix it in
    // bulk_disable, bulk_enable, etc. to fix this cast
    const bulkEditRulesTimestamp = Date.now();

    result = await bulkCreateRulesSo({
      savedObjectsClient: context.unsecuredSavedObjectsClient,
      bulkCreateRuleAttributes: rules as Array<SavedObjectsBulkCreateObject<RawRule>>,
      savedObjectsBulkCreateOptions: { overwrite: true },
    });

    await logRuleChanges({
      ruleSOs: result.saved_objects,
      encryptedFieldsMap: new Map(
        [...apiKeysMap.entries()].map(([ruleId, { newApiKey, newUiamApiKey }]) => [
          ruleId,
          { apiKey: newApiKey ?? null, uiamApiKey: newUiamApiKey ?? null },
        ])
      ),
      rulesClientContext: context,
      changesContext: {
        action: changeTracking?.action ?? RuleChangeTrackingAction.ruleUpdate,
        timestamp: bulkEditRulesTimestamp,
        metadata: changeTracking?.metadata,
      },
    });
  } catch (e) {
    // avoid unused newly generated API keys

    if (apiKeysMap.size > 0) {
      const newApiKeysToInvalidate = [];

      for (const { newUiamApiKey, newApiKey, newApiKeyCreatedByUser } of apiKeysMap.values()) {
        if (newUiamApiKey && !newApiKeyCreatedByUser) {
          newApiKeysToInvalidate.push(newUiamApiKey);
        }
        if (newApiKey && !newApiKeyCreatedByUser) {
          newApiKeysToInvalidate.push(newApiKey);
        }
      }
      if (newApiKeysToInvalidate.length > 0) {
        await bulkMarkApiKeysForInvalidation(
          { apiKeys: newApiKeysToInvalidate },
          context.logger,
          context.unsecuredSavedObjectsClient
        );
      }
    }
    throw e;
  }

  if (shouldInvalidateApiKeys) {
    result.saved_objects.map(({ id, error }) => {
      const apiKey = apiKeysMap.get(id);

      const oldApiKey = apiKey?.oldApiKey;
      const oldApiKeyCreatedByUser = apiKey?.oldApiKeyCreatedByUser;
      const newApiKey = apiKey?.newApiKey;
      const newApiKeyCreatedByUser = apiKey?.newApiKeyCreatedByUser;
      const oldUiamApiKey = apiKey?.oldUiamApiKey;
      const newUiamApiKey = apiKey?.newUiamApiKey;

      // if SO wasn't saved and has new API key it will be invalidated
      if (error && newApiKey && !newApiKeyCreatedByUser) {
        apiKeysToInvalidate.push(newApiKey);
        // if SO saved and has old Api Key it will be invalidate
      } else if (!error && oldApiKey && !oldApiKeyCreatedByUser) {
        apiKeysToInvalidate.push(oldApiKey);
      }

      if (error && newUiamApiKey && !newApiKeyCreatedByUser) {
        apiKeysToInvalidate.push(newUiamApiKey);
      } else if (!error && oldUiamApiKey && !oldApiKeyCreatedByUser) {
        apiKeysToInvalidate.push(oldUiamApiKey);
      }
    });
  }

  return { result, apiKeysToInvalidate };
}
