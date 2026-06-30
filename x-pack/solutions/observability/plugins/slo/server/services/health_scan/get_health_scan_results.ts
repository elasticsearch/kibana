/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { IScopedClusterClient } from '@kbn/core/server';
import type { SortResults } from '@elastic/elasticsearch/lib/api/types';
import type { GetHealthScanResultsResponse, HealthScanResultResponse } from '@kbn/slo-schema';
import type { TaskManagerStartContract } from '@kbn/task-manager-plugin/server';
import { HEALTH_DATA_STREAM_NAME } from '../../../common/constants';
import { IllegalArgumentError } from '../../errors';
import type { HealthDocument } from '../tasks/health_scan_task/types';
import { decodeSearchAfter, encodeSearchAfter } from '../utils/search_after';

interface Dependencies {
  scopedClusterClient: IScopedClusterClient;
  taskManager: TaskManagerStartContract;
  spaceIds: string[];
}

interface Params {
  scanId: string;
  size?: number;
  problematic?: boolean;
  searchAfter?: string;
}

export async function getHealthScanResults(
  params: Params,
  { scopedClusterClient, taskManager, spaceIds }: Dependencies
): Promise<GetHealthScanResultsResponse> {
  const { scanId, size = 100, problematic, searchAfter: searchAfterStr } = params;
  const searchAfter = searchAfterStr ? decodeSearchAfter<SortResults>(searchAfterStr) : undefined;
  if (size <= 0 || size > 100) {
    throw new IllegalArgumentError('Size must be between 1 and 100');
  }

  const [scanTask, { total, results, nextSearchAfter }, summaryAgg] = await Promise.all([
    getScanTask(taskManager, scanId),
    getScanResults(scopedClusterClient, {
      size,
      scanId,
      spaceIds,
      problematic,
      searchAfter,
    }),
    getScanSummary(scopedClusterClient, scanId, spaceIds),
  ]);

  const isScanScheduledSoon = !scanTask && total === 0;

  return {
    results,
    scan: {
      scanId,
      latestTimestamp: summaryAgg?.latest_timestamp.value_as_string ?? new Date().toISOString(),
      total: summaryAgg?.processed.value ?? 0,
      problematic: summaryAgg?.problematic.doc_count ?? 0,
      status: isScanScheduledSoon
        ? 'pending'
        : scanTask?.state.isDone === false
        ? 'pending'
        : 'completed',
    },
    total,
    searchAfter: nextSearchAfter ? encodeSearchAfter(nextSearchAfter) : undefined,
  };
}

async function getScanResults(
  scopedClusterClient: IScopedClusterClient,
  {
    size,
    scanId,
    spaceIds,
    problematic,
    searchAfter,
  }: {
    spaceIds: string[];
    scanId: string;
    size: number;
    problematic?: boolean;
    searchAfter?: SortResults;
  }
) {
  const result = await scopedClusterClient.asInternalUser.search<HealthDocument>({
    index: HEALTH_DATA_STREAM_NAME,
    size,
    query: {
      bool: {
        filter: [
          { term: { scanId } },
          { terms: { spaceId: spaceIds } },
          ...(problematic ? [{ term: { 'health.isProblematic': problematic } }] : []),
        ],
      },
    },
    sort: [
      { '@timestamp': 'desc' },
      { scanId: 'desc' },
      { spaceId: 'asc' },
      { 'health.isProblematic': 'asc' },
      { 'slo.id': 'asc' },
    ],
    search_after: searchAfter,
  });

  const hits = result.hits.hits;
  const total =
    typeof result.hits.total === 'number' ? result.hits.total : result.hits.total?.value ?? 0;
  const lastHit = hits[hits.length - 1];
  const nextSearchAfter = lastHit && hits.length === size ? lastHit.sort : undefined;

  const results = hits
    .map((hit) => hit._source)
    .filter((source): source is HealthScanResultResponse => source !== undefined);
  return { total, results, nextSearchAfter };
}

async function getScanTask(taskManager: TaskManagerStartContract, scanId: string) {
  return await taskManager.get(scanId).catch(() => null);
}

async function getScanSummary(
  scopedClusterClient: IScopedClusterClient,
  scanId: string,
  spaceIds: string[]
) {
  interface SummaryAgg {
    latest_timestamp: { value: number; value_as_string: string };
    processed: { value: number };
    problematic: { doc_count: number };
  }

  const summary = await scopedClusterClient.asInternalUser.search<unknown, SummaryAgg>({
    index: HEALTH_DATA_STREAM_NAME,
    size: 0,
    query: { bool: { filter: [{ term: { scanId } }, { terms: { spaceId: spaceIds } }] } },
    aggs: {
      latest_timestamp: {
        max: {
          field: '@timestamp',
        },
      },
      processed: {
        value_count: {
          field: 'scanId',
        },
      },
      problematic: {
        filter: {
          term: {
            'health.isProblematic': true,
          },
        },
      },
    },
  });

  return summary.aggregations;
}
