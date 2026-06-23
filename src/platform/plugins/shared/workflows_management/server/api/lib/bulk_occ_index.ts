/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { estypes } from '@elastic/elasticsearch';
import type { Logger } from '@kbn/core/server';
import {
  DEFAULT_MAX_RETRIES,
  DEFAULT_RETRY_DELAY_MS,
  delayMs,
  OCC_CONFLICT_STATUS_CODE,
} from '@kbn/occ';

import { extractBulkItemError } from './bulk_response_helpers';
import { maybeApplyWorkflowVersion } from '../../lib/workflow_version';
import type { WorkflowProperties, WorkflowStorage } from '../../storage/workflow_storage';

export interface OccWorkflowHit {
  _id: string;
  _source: WorkflowProperties;
  seqNo: number;
  primaryTerm: number;
}

export type WorkflowStorageClient = ReturnType<WorkflowStorage['getClient']>;
export type BulkOccIndexClient = Pick<WorkflowStorageClient, 'bulk' | 'search'>;

interface BulkIndexOperation {
  _id?: string | null;
  status?: number;
  error?: estypes.ErrorCause;
}

interface BulkIndexItem {
  index?: BulkIndexOperation;
}

const isBulkIndexItem = (item: unknown): item is BulkIndexItem =>
  typeof item === 'object' &&
  item !== null &&
  'index' in item &&
  (item.index === undefined || (typeof item.index === 'object' && item.index !== null));

const getBulkIndexOperation = (item: unknown): BulkIndexOperation | undefined => {
  if (!isBulkIndexItem(item)) {
    return undefined;
  }

  return item.index;
};

const toOccHit = (hit: {
  _id: string;
  _source: WorkflowProperties;
  _seq_no?: number;
  _primary_term?: number;
}): OccWorkflowHit => {
  if (hit._seq_no == null || hit._primary_term == null) {
    throw new Error(`Missing seq_no/primary_term for workflow ${hit._id}`);
  }

  return {
    _id: hit._id,
    _source: hit._source,
    seqNo: hit._seq_no,
    primaryTerm: hit._primary_term,
  };
};

const buildBulkIndexOperations = (
  hits: OccWorkflowHit[],
  mutate: (source: WorkflowProperties) => WorkflowProperties,
  versioningEnabled: boolean
) =>
  hits.map((hit) => ({
    index: {
      _id: hit._id,
      if_seq_no: hit.seqNo,
      if_primary_term: hit.primaryTerm,
      document: maybeApplyWorkflowVersion(mutate(hit._source), hit._source, versioningEnabled),
    },
  }));

const refreshOccHits = async (
  client: BulkOccIndexClient,
  ids: string[]
): Promise<{
  refreshed: OccWorkflowHit[];
  failures: Array<{ id: string; error: string }>;
}> => {
  if (ids.length === 0) {
    return { refreshed: [], failures: [] };
  }

  // Batch-read conflicted docs in one request. The storage adapter routes `get` through
  // `search`, so an ids query preserves alias routing and source migration semantics.
  const response = await client.search({
    query: { ids: { values: ids } },
    seq_no_primary_term: true,
    size: ids.length,
    track_total_hits: false,
  });

  const refreshed: OccWorkflowHit[] = [];
  const failures: Array<{ id: string; error: string }> = [];

  for (const hit of response.hits.hits) {
    if (hit._id && hit._source) {
      try {
        refreshed.push(
          toOccHit({
            _id: hit._id,
            _source: hit._source as WorkflowProperties,
            _seq_no: hit._seq_no,
            _primary_term: hit._primary_term,
          })
        );
      } catch (error) {
        failures.push({
          id: hit._id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  return { refreshed, failures };
};

/**
 * Bulk-indexes documents with per-item OCC, retrying only 409 conflicts after
 * batched refresh via search(ids) + seq_no_primary_term.
 */
export const bulkIndexWithOccRetry = async ({
  client,
  hits,
  mutate,
  logger,
  maxRetries = DEFAULT_MAX_RETRIES,
  retryDelayMs = DEFAULT_RETRY_DELAY_MS,
  refresh = true,
  versioningEnabled = false,
}: {
  client: BulkOccIndexClient;
  hits: OccWorkflowHit[];
  mutate: (source: WorkflowProperties) => WorkflowProperties;
  logger?: Logger;
  maxRetries?: number;
  retryDelayMs?: number;
  refresh?: boolean;
  versioningEnabled?: boolean;
}): Promise<{
  successIds: string[];
  successfulDocuments: Array<{ id: string; document: WorkflowProperties }>;
  failures: Array<{ id: string; error: string }>;
}> => {
  const successIds: string[] = [];
  const successfulDocuments: Array<{ id: string; document: WorkflowProperties }> = [];
  const failures: Array<{ id: string; error: string }> = [];
  let pendingHits = hits;
  const maxAttempts = 1 + maxRetries;

  for (let attempt = 1; attempt <= maxAttempts && pendingHits.length > 0; attempt++) {
    const operations = buildBulkIndexOperations(pendingHits, mutate, versioningEnabled);
    const bulkResponse = await client.bulk({
      operations,
      refresh,
    });

    const conflictIds: string[] = [];

    for (let itemIndex = 0; itemIndex < bulkResponse.items.length; itemIndex++) {
      const operation = getBulkIndexOperation(bulkResponse.items[itemIndex]);
      const bulkOperation = operations[itemIndex]?.index;
      const hit = pendingHits[itemIndex];

      if (operation && hit && bulkOperation?.document) {
        if (!operation.error) {
          if (operation._id) {
            successIds.push(operation._id);
            successfulDocuments.push({ id: operation._id, document: bulkOperation.document });
          }
        } else if (operation.status === OCC_CONFLICT_STATUS_CODE && attempt < maxAttempts) {
          conflictIds.push(hit._id);
        } else {
          failures.push({
            id: operation._id ?? hit._id,
            error: extractBulkItemError(operation.error),
          });
        }
      }
    }

    if (conflictIds.length === 0) {
      break;
    }

    logger?.debug(
      `Bulk OCC conflict for ${conflictIds.length} workflow(s), retrying (attempt ${attempt}/${maxAttempts})`
    );
    await delayMs(retryDelayMs);

    const { refreshed: refreshedHits, failures: refreshFailures } = await refreshOccHits(
      client,
      conflictIds
    );
    failures.push(...refreshFailures);

    const refreshedIds = new Set(refreshedHits.map((hit) => hit._id));
    const failedRefreshIds = new Set(refreshFailures.map((failure) => failure.id));

    for (const conflictId of conflictIds) {
      if (!refreshedIds.has(conflictId) && !failedRefreshIds.has(conflictId)) {
        failures.push({
          id: conflictId,
          error: `Workflow with id ${conflictId} not found during OCC retry`,
        });
      }
    }

    pendingHits = refreshedHits;
  }

  return { successIds, successfulDocuments, failures };
};

export { toOccHit };
