/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { apiTest } from '@kbn/scout';
import { expect } from '@kbn/scout/api';
import { ROLLUP_ADMIN_ROLE, ROLLUP_INDEX_NAME } from '../../common/fixtures/constants';
import { createMockRollupIndex } from '../../common/fixtures/rollup_api';
import { COMMON_HEADERS } from '../fixtures/constants';
import type { RollupJobSummary } from '../fixtures/rollup_jobs';
import {
  cleanupRollupState,
  createSourceIndex,
  findJob,
  getJobPayload,
  rollupApi,
} from '../fixtures/rollup_jobs';

// Local stateful only: `exposes the aggregations of the created rollup index` asserts on the whole
// `GET /indices` response, so any pre-existing rollup index in the cluster would fail it. Rollup
// does not exist on serverless.
apiTest.describe('Rollup jobs creation', { tag: ['@local-stateful-classic'] }, () => {
  let headers: Record<string, string>;
  let indexName: string;

  apiTest.beforeAll(async ({ requestAuth }) => {
    const { apiKeyHeader } = await requestAuth.getApiKeyForCustomRole(ROLLUP_ADMIN_ROLE);
    headers = { ...COMMON_HEADERS, ...apiKeyHeader };
  });

  apiTest.beforeEach(async ({ esClient }) => {
    await cleanupRollupState(esClient);
    // Since 8.15 ES only allows creating a rollup job when the cluster already has rollup usage,
    // which the mock index simulates.
    await createMockRollupIndex(esClient);
    indexName = await createSourceIndex(esClient, 'crud');
  });

  apiTest.afterEach(async ({ esClient }) => {
    await cleanupRollupState(esClient);
  });

  apiTest('returns an empty job list when no jobs exist', async ({ apiClient }) => {
    const response = await rollupApi(apiClient, headers).loadJobs();

    expect(response).toHaveStatusCode(200);
    expect(response.body).toStrictEqual({ jobs: [] });
  });

  apiTest('creates a rollup job', async ({ apiClient }) => {
    const response = await rollupApi(apiClient, headers).createJob(
      getJobPayload(indexName, 'crud-create-job')
    );

    expect(response).toHaveStatusCode(200);
  });

  apiTest('lists a newly created job', async ({ apiClient }) => {
    const api = rollupApi(apiClient, headers);
    await api.createJob(getJobPayload(indexName, 'crud-list-job'));

    const response = await api.loadJobs();

    expect(response).toHaveStatusCode(200);
    const job: RollupJobSummary | undefined = findJob(response.body, 'crud-list-job');
    expect(job).toBeDefined();
    expect(job?.config.index_pattern).toBe(indexName);
    expect(job?.config.rollup_index).toBe(ROLLUP_INDEX_NAME);
  });

  apiTest('rejects a duplicate job id', async ({ apiClient }) => {
    const api = rollupApi(apiClient, headers);
    const payload = getJobPayload(indexName, 'crud-duplicate-job');
    await api.createJob(payload);

    const response = await api.createJob(payload);

    expect(response).toHaveStatusCode(409);
  });

  apiTest('surfaces Elasticsearch validation errors', async ({ apiClient }) => {
    const { job } = getJobPayload(indexName, 'crud-invalid-job');

    const response = await rollupApi(apiClient, headers).createJob({
      job: { ...job, invalid: 'property' },
    });

    expect(response).toHaveStatusCode(400);
    expect(response.body.message).toContain('unknown field [invalid]');
  });

  apiTest('exposes the aggregations of the created rollup index', async ({ apiClient }) => {
    const api = rollupApi(apiClient, headers);
    await api.createJob(getJobPayload(indexName, 'crud-aggregations-job'));

    const response = await api.getIndices();

    expect(response).toHaveStatusCode(200);
    expect(response.body).toStrictEqual({
      [ROLLUP_INDEX_NAME]: {
        aggs: {
          date_histogram: {
            testCreatedField: {
              agg: 'date_histogram',
              delay: '1d',
              // The job is created with the deprecated `interval`, which ES coerces to
              // `fixed_interval` based on the value provided.
              fixed_interval: '24h',
              time_zone: 'UTC',
            },
          },
          max: { testCreatedField: { agg: 'max' } },
          min: { testCreatedField: { agg: 'min' } },
          terms: {
            testTagField: { agg: 'terms' },
            testTotalField: { agg: 'terms' },
          },
          histogram: {
            testTotalField: { agg: 'histogram', interval: 7 },
          },
          avg: { testTotalField: { agg: 'avg' } },
          value_count: { testTotalField: { agg: 'value_count' } },
        },
      },
    });
  });
});
