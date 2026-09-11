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
import { COMMON_HEADERS, TARGET_INDEX_PREFIX } from '../fixtures/constants';
import {
  cleanupRollupState,
  createSourceIndex,
  getJobPayload,
  rollupApi,
} from '../fixtures/rollup_jobs';

const TARGET_INDEX = `${TARGET_INDEX_PREFIX}-search`;

apiTest.describe(
  'Rollup search',
  { tag: ['@local-stateful-classic', '@cloud-stateful-classic'] },
  () => {
    let headers: Record<string, string>;

    apiTest.beforeAll(async ({ requestAuth }) => {
      const { apiKeyHeader } = await requestAuth.getApiKeyForCustomRole(ROLLUP_ADMIN_ROLE);
      headers = { ...COMMON_HEADERS, ...apiKeyHeader };
    });

    // Defensive sweep in case an interrupted run left rollup jobs or indices behind.
    apiTest.beforeEach(async ({ esClient }) => {
      await cleanupRollupState(esClient);
    });

    apiTest.afterEach(async ({ esClient }) => {
      await cleanupRollupState(esClient);
    });

    apiTest('returns 404 for a missing rollup index', async ({ apiClient }) => {
      const response = await rollupApi(apiClient, headers).search([
        { index: 'unknown', query: {} },
      ]);

      expect(response).toHaveStatusCode(404);
      expect(response.body.message).toContain('no such index [unknown]');
    });

    apiTest('searches an existing rollup index', async ({ apiClient, esClient }) => {
      const api = rollupApi(apiClient, headers);
      // Since 8.15 ES only allows creating a rollup job when the cluster already has rollup usage,
      // which the mock index simulates.
      await createMockRollupIndex(esClient);
      const indexName = await createSourceIndex(esClient, 'search');
      await api.createJob(getJobPayload(indexName, 'search-job', TARGET_INDEX));

      const response = await api.search([{ index: TARGET_INDEX, query: { size: 0 } }]);

      expect(response).toHaveStatusCode(200);
      // `hits.total` must be an integer, not the `{ value, relation }` object the ES search API
      // returns by default.
      expect(response.body[0].hits.total).toBe(0);
    });
  }
);
