/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { apiTest } from '@kbn/scout';
import { expect } from '@kbn/scout/api';
import { ROLLUP_ADMIN_ROLE } from '../../common/fixtures/constants';
import { createMockRollupIndex } from '../../common/fixtures/rollup_api';
import { COMMON_HEADERS } from '../fixtures/constants';
import type { RollupApi, RollupJobSummary } from '../fixtures/rollup_jobs';
import {
  cleanupRollupState,
  createSourceIndex,
  findJob,
  getJobPayload,
  rollupApi,
} from '../fixtures/rollup_jobs';

const JOB_ID = 'actions-job';

const getJobState = async (api: RollupApi) => {
  const { body } = await api.loadJobs();
  const job: RollupJobSummary | undefined = findJob(body, JOB_ID);
  return job?.status.job_state;
};

apiTest.describe(
  'Rollup job actions',
  { tag: ['@local-stateful-classic', '@cloud-stateful-classic'] },
  () => {
    let headers: Record<string, string>;

    apiTest.beforeAll(async ({ requestAuth }) => {
      const { apiKeyHeader } = await requestAuth.getApiKeyForCustomRole(ROLLUP_ADMIN_ROLE);
      headers = { ...COMMON_HEADERS, ...apiKeyHeader };
    });

    apiTest.beforeEach(async ({ apiClient, esClient }) => {
      await cleanupRollupState(esClient);
      // Since 8.15 ES only allows creating a rollup job when the cluster already has rollup usage,
      // which the mock index simulates.
      await createMockRollupIndex(esClient);
      const indexName = await createSourceIndex(esClient, 'actions');
      await rollupApi(apiClient, headers).createJob(getJobPayload(indexName, JOB_ID));
    });

    apiTest.afterEach(async ({ esClient }) => {
      await cleanupRollupState(esClient);
    });

    apiTest('starts a job', async ({ apiClient }) => {
      const api = rollupApi(apiClient, headers);
      expect(await getJobState(api)).toBe('stopped');

      const response = await api.startJob([JOB_ID]);

      expect(response).toHaveStatusCode(200);
      expect(response.body).toStrictEqual({ success: true });
      // Elasticsearch indexes the job state change asynchronously; allow extra time on slow CI.
      await expect.poll(() => getJobState(api), { timeout: 30_000 }).toBe('started');
    });

    apiTest('succeeds when starting an already started job', async ({ apiClient }) => {
      const api = rollupApi(apiClient, headers);
      await api.startJob([JOB_ID]);

      const response = await api.startJob([JOB_ID]);

      expect(response).toHaveStatusCode(200);
    });

    apiTest('stops a job', async ({ apiClient }) => {
      const api = rollupApi(apiClient, headers);
      await api.startJob([JOB_ID]);

      const response = await api.stopJob([JOB_ID]);

      expect(response).toHaveStatusCode(200);
      expect(response.body).toStrictEqual({ success: true });
      // The route is called with `waitForCompletion`, so the state is already settled.
      expect(await getJobState(api)).toBe('stopped');
    });

    apiTest('succeeds when stopping an already stopped job', async ({ apiClient }) => {
      const response = await rollupApi(apiClient, headers).stopJob([JOB_ID]);

      expect(response).toHaveStatusCode(200);
    });
  }
);
