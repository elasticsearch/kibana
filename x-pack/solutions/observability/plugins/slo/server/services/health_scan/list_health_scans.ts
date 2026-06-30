/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { IScopedClusterClient } from '@kbn/core/server';
import type { ListHealthScanResponse } from '@kbn/slo-schema';
import type { TaskManagerStartContract } from '@kbn/task-manager-plugin/server';
import { HEALTH_DATA_STREAM_NAME } from '../../../common/constants';
import { IllegalArgumentError } from '../../errors';
import { HEALTH_SCAN_TASK_TYPE } from '../tasks/health_scan_task/health_scan_task';

interface Dependencies {
  scopedClusterClient: IScopedClusterClient;
  taskManager: TaskManagerStartContract;
  spaceIds: string[];
}

interface Params {
  size?: number;
}

export async function listHealthScans(
  params: Params,
  { scopedClusterClient, taskManager, spaceIds }: Dependencies
): Promise<ListHealthScanResponse> {
  const { size = 25 } = params;
  if (size <= 0 || size > 100) {
    throw new IllegalArgumentError('Size must be between 1 and 100');
  }

  const [recentTasks, buckets] = await Promise.all([
    getRecentTasks(taskManager, size),
    getScanBuckets(scopedClusterClient, size, spaceIds),
  ]);

  const scanIds = buckets.map((bucket) => bucket.key.scanId);

  // scans that are scheduled or still running (if any) and did not produce any document yet
  const scheduledScans = recentTasks.docs.filter((t) => !scanIds.includes(t.id));
  // scans matching a task found in recent tasks, can derive status from their state.
  const pendingScans = recentTasks.docs
    .filter((t) => scanIds.includes(t.id) && t.state.isDone === false)
    .map((t) => t.id);

  const scans = buckets.map((bucket) => ({
    scanId: bucket.key.scanId,
    latestTimestamp: bucket.latest_timestamp.value_as_string,
    total: bucket.doc_count,
    problematic: bucket.problematic.doc_count,
    status: pendingScans.includes(bucket.key.scanId)
      ? ('pending' as const) // recent task found and not done = pending
      : ('completed' as const), // not recent, considere completed
  }));

  return {
    scans: [
      ...scheduledScans.map((task) => ({
        scanId: task.id,
        latestTimestamp: task.scheduledAt.toISOString(),
        total: 0,
        problematic: 0,
        status: 'pending' as const,
      })),
      ...scans,
    ].slice(0, size),
  };
}

async function getRecentTasks(taskManager: TaskManagerStartContract, size: number) {
  return await taskManager
    .fetch({
      sort: [{ 'task.scheduledAt': 'desc' }],
      size,
      query: {
        bool: {
          filter: [
            { range: { 'task.scheduledAt': { gte: 'now-1h' } } },
            { term: { 'task.taskType': HEALTH_SCAN_TASK_TYPE } },
          ],
        },
      },
    })
    .catch(() => ({ docs: [] }));
}

async function getScanBuckets(
  scopedClusterClient: IScopedClusterClient,
  size: number,
  spaceIds: string[]
) {
  interface ScanBucket {
    key: { scanId: string };
    doc_count: number;
    latest_timestamp: { value: number; value_as_string: string };
    problematic: { doc_count: number };
  }

  const result = await scopedClusterClient.asInternalUser.search<
    unknown,
    { scans: { buckets: ScanBucket[] } }
  >({
    index: HEALTH_DATA_STREAM_NAME,
    size: 0,
    query: {
      bool: {
        filter: [{ terms: { spaceId: spaceIds } }],
      },
    },
    aggs: {
      scans: {
        composite: {
          size,
          sources: [
            {
              scanId: {
                terms: {
                  order: 'desc',
                  field: 'scanId',
                },
              },
            },
          ],
        },
        aggs: {
          latest_timestamp: {
            max: {
              field: '@timestamp',
            },
          },
          problematic: {
            filter: {
              term: {
                'health.isProblematic': true,
              },
            },
          },
          sorted: {
            bucket_sort: {
              sort: [{ latest_timestamp: { order: 'desc' } }],
            },
          },
        },
      },
    },
  });

  const buckets = result.aggregations?.scans.buckets ?? [];
  return buckets;
}
