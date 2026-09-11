/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { EsClient } from '@kbn/scout';
import { deleteIndicesMatching } from '../../common/fixtures/rollup_api';
import { MOCK_ROLLUP_INDEX_NAME, SOURCE_INDEX_PREFIX, TARGET_INDEX_NAME } from './constants';

export { createMockRollupIndex, deleteAllRollupJobs } from '../../common/fixtures/rollup_api';

// `MM-DD-YYYY`, matching the FTR `mockIndices` index naming.
const formatDay = (date: Date) =>
  `${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(
    2,
    '0'
  )}-${date.getUTCFullYear()}`;

/**
 * Seed three past-day source indices (`to-be-*`) with a timestamp and an arbitrary metric so the
 * wizard's index pattern has matching indices. We don't test rollup functionality, only the UI.
 */
export const seedSourceIndices = async (esClient: EsClient) => {
  const now = Date.now();
  const days = [1, 2, 3].map((offset) => new Date(now - offset * 24 * 60 * 60 * 1000));
  for (const day of days) {
    await esClient.index({
      index: `${SOURCE_INDEX_PREFIX}-${formatDay(day)}`,
      refresh: 'wait_for',
      document: { '@timestamp': day.toISOString(), foo_metric: 1 },
    });
  }
};

/** Delete the mock rollup index, the seeded source indices, and the wizard's target index. */
export const cleanupRollupIndices = async (esClient: EsClient) =>
  deleteIndicesMatching(esClient, [
    MOCK_ROLLUP_INDEX_NAME,
    `${SOURCE_INDEX_PREFIX}-*`,
    `${TARGET_INDEX_NAME}*`,
  ]);

const daysAgo = (offset: number) => new Date(Date.now() - offset * 24 * 60 * 60 * 1000);

/**
 * Seed the hybrid-data-view fixtures: three source docs, a rollup job over them, matching rolled-up
 * docs in the target index, and one live doc in a regular index — mirroring the FTR setup (we test
 * the data-view UI over a rollup target, not rollup functionality itself).
 */
export const seedHybridRollup = async (
  esClient: EsClient,
  jobName: string,
  { sourcePrefix, targetIndex, regularPrefix }: HybridSeed
) => {
  const days = [1, 2, 3].map(daysAgo);

  for (const day of days) {
    await esClient.index({
      index: `${sourcePrefix}-${day.getTime()}`,
      document: { '@timestamp': day.toISOString(), foo_metric: 1 },
    });
  }
  await esClient.indices.refresh({ index: `${sourcePrefix}*` });

  await esClient.rollup.putJob({
    id: jobName,
    index_pattern: `${sourcePrefix}*`,
    rollup_index: targetIndex,
    cron: '*/10 * * * * ?',
    page_size: 1000,
    groups: {
      date_histogram: { fixed_interval: '1000ms', field: '@timestamp', time_zone: 'UTC' },
    },
  });

  for (const day of days) {
    await esClient.index({
      index: targetIndex,
      document: {
        '_rollup.version': 2,
        '@timestamp.date_histogram.time_zone': 'UTC',
        '@timestamp.date_histogram.timestamp': day.toISOString(),
        '@timestamp.date_histogram.interval': '1000ms',
        '@timestamp.date_histogram._count': 1,
        '_rollup.id': jobName,
      },
    });
  }

  await esClient.index({
    index: `${regularPrefix}-${Date.now()}`,
    refresh: 'wait_for',
    document: { '@timestamp': new Date().toISOString(), foo_metric: 1 },
  });
};

/** Point an alias at an index (used to build a rollup data view over an alias to the target). */
export const createAlias = async (esClient: EsClient, index: string, alias: string) => {
  await esClient.indices.putAlias({ index, name: alias });
};

/**
 * Delete the hybrid-data-view indices. Pair with `deleteAllRollupJobs` (which stops/deletes the
 * job); kept index-only so it can also run defensively in `beforeEach` without a job name.
 */
export const cleanupHybridIndices = async (
  esClient: EsClient,
  { sourcePrefix, targetIndex, regularPrefix }: HybridSeed
) =>
  deleteIndicesMatching(esClient, [
    targetIndex,
    `${regularPrefix}*`,
    `${sourcePrefix}*`,
    MOCK_ROLLUP_INDEX_NAME,
  ]);

interface HybridSeed {
  sourcePrefix: string;
  targetIndex: string;
  regularPrefix: string;
}

/**
 * Seed the TSVB fixtures: a rollup job over `sourceIndex` plus three rolled-up docs in `targetIndex`
 * (each contributes `_count: 1`, so the Metric panel renders the doc total). Recent timestamps so
 * they land in today's 1d bucket and the default time range catches them.
 */
export const seedTsvbRollup = async (
  esClient: EsClient,
  jobName: string,
  { sourceIndex, targetIndex }: { sourceIndex: string; targetIndex: string }
) => {
  const now = Date.now();
  const dates = [0, 60_000, 120_000].map((offset) => new Date(now - offset).toISOString());

  await esClient.index({
    index: sourceIndex,
    refresh: 'wait_for',
    document: { '@timestamp': dates[0] },
  });

  await esClient.rollup.putJob({
    id: jobName,
    index_pattern: sourceIndex,
    rollup_index: targetIndex,
    cron: '*/10 * * * * ?',
    page_size: 1000,
    groups: {
      date_histogram: { fixed_interval: '1000ms', field: '@timestamp', time_zone: 'UTC' },
    },
  });

  for (const date of dates) {
    await esClient.index({
      index: targetIndex,
      document: {
        '_rollup.version': 2,
        '@timestamp.date_histogram.time_zone': 'UTC',
        '@timestamp.date_histogram.timestamp': date,
        '@timestamp.date_histogram.interval': '1000ms',
        '@timestamp.date_histogram._count': 1,
        '_rollup.id': jobName,
      },
    });
  }
  await esClient.indices.refresh({ index: targetIndex });
};

/** Delete the TSVB rollup indices (pair with `deleteAllRollupJobs`). */
export const cleanupTsvbIndices = async (
  esClient: EsClient,
  { sourceIndex, targetIndex }: { sourceIndex: string; targetIndex: string }
) => deleteIndicesMatching(esClient, [sourceIndex, targetIndex, MOCK_ROLLUP_INDEX_NAME]);
