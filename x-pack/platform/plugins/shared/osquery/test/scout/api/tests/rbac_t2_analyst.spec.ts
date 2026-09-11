/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { RoleApiCredentials, RoleSessionCredentials } from '@kbn/scout';
import { expect } from '@kbn/scout/api';
import { apiTest, testData } from '../fixtures';
import { T2_ANALYST_ROLE } from '../fixtures/roles';

apiTest.describe(
  'Osquery RBAC - t2_analyst role',
  { tag: ['@local-stateful-classic', '@local-serverless-security_complete'] },
  () => {
    let t2Credentials: RoleApiCredentials;
    let adminCredentials: RoleSessionCredentials;
    let savedQueryId: string;
    let savedQuerySoId: string;

    apiTest.beforeAll(async ({ requestAuth, samlAuth, apiClient }) => {
      t2Credentials = await requestAuth.getApiKeyForCustomRole(T2_ANALYST_ROLE);
      adminCredentials = await samlAuth.asInteractiveUser('admin');

      // Create a saved query as admin for the t2_analyst to run
      const createResponse = await apiClient.post(testData.API_PATHS.OSQUERY_SAVED_QUERIES, {
        headers: { ...testData.COMMON_HEADERS, ...adminCredentials.cookieHeader },
        body: testData.getMinimalSavedQuery(),
        responseType: 'json',
      });
      expect(createResponse).toHaveStatusCode(200);
      savedQueryId = createResponse.body.data.id;
      savedQuerySoId = createResponse.body.data.saved_object_id;
    });

    apiTest.afterAll(async ({ apiServices }) => {
      if (savedQuerySoId) {
        await apiServices.osquery.savedQueries.delete(savedQuerySoId);
      }
    });

    apiTest('is not rejected when running a saved query via live query', async ({ apiClient }) => {
      const response = await apiClient.post(testData.API_PATHS.OSQUERY_LIVE_QUERIES, {
        headers: { ...testData.COMMON_HEADERS, ...t2Credentials.apiKeyHeader },
        body: testData.getSavedQueryLiveQuery(savedQueryId),
        responseType: 'json',
      });

      // Permission check passes — NOT 403. Without enrolled agents the server may return 500
      // (cannot dispatch), but the RBAC boundary is what we're testing.
      expect(response.statusCode).not.toBe(403);
    });

    apiTest(
      'returns 403 when the supplied query does not match the saved query',
      async ({ apiClient }) => {
        const response = await apiClient.post(testData.API_PATHS.OSQUERY_LIVE_QUERIES, {
          headers: { ...testData.COMMON_HEADERS, ...t2Credentials.apiKeyHeader },
          body: testData.getSavedQueryLiveQuery(savedQueryId, {
            query: 'select 42 as custom;',
          }),
          responseType: 'json',
        });

        expect(response).toHaveStatusCode(403);
      }
    );

    apiTest(
      'returns 403 when a queries array is supplied with a saved query id',
      async ({ apiClient }) => {
        const response = await apiClient.post(testData.API_PATHS.OSQUERY_LIVE_QUERIES, {
          headers: { ...testData.COMMON_HEADERS, ...t2Credentials.apiKeyHeader },
          body: testData.getSavedQueryLiveQuery(savedQueryId, {
            queries: [{ id: 'extra', query: 'select 42 as custom;' }],
          }),
          responseType: 'json',
        });

        expect(response).toHaveStatusCode(403);
      }
    );

    apiTest('returns 403 when the saved query id is blank', async ({ apiClient }) => {
      const response = await apiClient.post(testData.API_PATHS.OSQUERY_LIVE_QUERIES, {
        headers: { ...testData.COMMON_HEADERS, ...t2Credentials.apiKeyHeader },
        body: testData.getSavedQueryLiveQuery(' ', { query: 'select 42 as custom;' }),
        responseType: 'json',
      });

      expect(response).toHaveStatusCode(403);
    });

    apiTest('returns 403 when the saved query id does not resolve', async ({ apiClient }) => {
      const response = await apiClient.post(testData.API_PATHS.OSQUERY_LIVE_QUERIES, {
        headers: { ...testData.COMMON_HEADERS, ...t2Credentials.apiKeyHeader },
        body: testData.getSavedQueryLiveQuery('non-existent-saved-query-id', {
          query: 'select 42 as custom;',
        }),
        responseType: 'json',
      });

      expect(response).toHaveStatusCode(403);
    });

    apiTest('returns 403 when running a custom query from scratch', async ({ apiClient }) => {
      const response = await apiClient.post(testData.API_PATHS.OSQUERY_LIVE_QUERIES, {
        headers: { ...testData.COMMON_HEADERS, ...t2Credentials.apiKeyHeader },
        body: testData.getMinimalLiveQuery(),
        responseType: 'json',
      });

      expect(response).toHaveStatusCode(403);
    });

    apiTest('returns 403 when creating a saved query', async ({ apiClient }) => {
      const response = await apiClient.post(testData.API_PATHS.OSQUERY_SAVED_QUERIES, {
        headers: { ...testData.COMMON_HEADERS, ...t2Credentials.apiKeyHeader },
        body: testData.getMinimalSavedQuery(),
        responseType: 'json',
      });

      expect(response).toHaveStatusCode(403);
    });

    apiTest('returns 403 when creating a pack', async ({ apiClient }) => {
      const response = await apiClient.post(testData.API_PATHS.OSQUERY_PACKS, {
        headers: { ...testData.COMMON_HEADERS, ...t2Credentials.apiKeyHeader },
        body: testData.getMinimalPack(),
        responseType: 'json',
      });

      expect(response).toHaveStatusCode(403);
    });
  }
);
