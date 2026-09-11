/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { apiTest } from '@kbn/scout';
import { expect } from '@kbn/scout/api';
import { ROLLUP_ADMIN_ROLE } from '../../common/fixtures/constants';
import { COMMON_HEADERS } from '../fixtures/constants';
import {
  cleanupRollupState,
  createSourceIndex,
  getJobPayload,
  rollupApi,
} from '../fixtures/rollup_jobs';

// Local stateful only: both tests assert that the cluster has *no* rollup usage at all, which is
// only guaranteed on a fresh local cluster. Rollup does not exist on serverless.
apiTest.describe(
  'Rollup indices without rollup usage in the cluster',
  { tag: ['@local-stateful-classic'] },
  () => {
    let headers: Record<string, string>;

    apiTest.beforeAll(async ({ requestAuth }) => {
      const { apiKeyHeader } = await requestAuth.getApiKeyForCustomRole(ROLLUP_ADMIN_ROLE);
      headers = { ...COMMON_HEADERS, ...apiKeyHeader };
    });

    apiTest.beforeEach(async ({ esClient }) => {
      await cleanupRollupState(esClient);
    });

    apiTest.afterEach(async ({ esClient }) => {
      await cleanupRollupState(esClient);
    });

    apiTest('returns no rollup indices', async ({ apiClient }) => {
      const response = await rollupApi(apiClient, headers).getIndices();

      expect(response).toHaveStatusCode(200);
      expect(response.body).toStrictEqual({});
    });

    // Since 8.15 ES only allows creating a rollup job when the cluster already has rollup usage.
    apiTest('rejects job creation', async ({ apiClient, esClient }) => {
      const indexName = await createSourceIndex(esClient, 'no-usage');

      const response = await rollupApi(apiClient, headers).createJob(
        getJobPayload(indexName, 'no-rollup-usage-job')
      );

      expect(response).toHaveStatusCode(400);
      // Guard against unrelated 400s (XSRF, validation): the ES error is about rollup usage.
      expect(String(response.body.message).toLowerCase()).toContain('rollup');
    });
  }
);
