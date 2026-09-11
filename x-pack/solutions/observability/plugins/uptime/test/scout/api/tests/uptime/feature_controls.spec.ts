/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { expect } from '@kbn/scout-oblt/api';
import { tags } from '@kbn/scout-oblt';
import { apiTest, testData } from '../../fixtures';

apiTest.describe('feature controls', { tag: tags.stateful.classic }, () => {
  const space1Id = 'space_1';

  apiTest.beforeAll(async ({ kbnClient }) => {
    try {
      await kbnClient.spaces.create({ id: space1Id, name: space1Id, disabledFeatures: [] });
    } catch {
      // space already exists
    }
  });

  apiTest.afterAll(async ({ kbnClient }) => {
    try {
      await kbnClient.spaces.delete(space1Id);
    } catch {
      // ignore
    }
  });

  apiTest('heartbeat-* read privileges only returns 403', async ({ samlAuth, apiClient }) => {
    const credentials = await samlAuth.asInteractiveUser({
      indices: [{ names: ['heartbeat-*'], privileges: ['read', 'view_index_metadata'] }],
    });

    const params = new URLSearchParams({
      sort: 'desc',
      from: testData.PINGS_DATE_RANGE_START,
      to: testData.PINGS_DATE_RANGE_END,
    });
    const response = await apiClient.get(`${testData.API_URLS.PINGS.slice(1)}?${params}`, {
      headers: { ...credentials.cookieHeader, ...testData.COMMON_HEADERS },
      responseType: 'json',
    });

    expect(response.statusCode).toBe(403);
  });

  apiTest('global all plus heartbeat-* read returns 200', async ({ samlAuth, apiClient }) => {
    const credentials = await samlAuth.asInteractiveUser({
      elasticsearch: {
        cluster: [],
        indices: [{ names: ['heartbeat-*'], privileges: ['read', 'view_index_metadata'] }],
      },
      kibana: [{ base: ['all'], feature: {}, spaces: ['*'] }],
    });

    const params = new URLSearchParams({
      sort: 'desc',
      from: testData.PINGS_DATE_RANGE_START,
      to: testData.PINGS_DATE_RANGE_END,
    });
    const response = await apiClient.get(`${testData.API_URLS.PINGS.slice(1)}?${params}`, {
      headers: { ...credentials.cookieHeader, ...testData.COMMON_HEADERS },
      responseType: 'json',
    });

    expect(response.statusCode).toBe(200);
  });

  apiTest('dashboard all plus heartbeat-* read returns 403', async ({ samlAuth, apiClient }) => {
    const credentials = await samlAuth.asInteractiveUser({
      elasticsearch: {
        cluster: [],
        indices: [{ names: ['heartbeat-*'], privileges: ['read', 'view_index_metadata'] }],
      },
      kibana: [
        {
          base: [],
          feature: { dashboard: ['all'] },
          spaces: ['*'],
        },
      ],
    });

    const params = new URLSearchParams({
      sort: 'desc',
      from: testData.PINGS_DATE_RANGE_START,
      to: testData.PINGS_DATE_RANGE_END,
    });
    const response = await apiClient.get(`${testData.API_URLS.PINGS.slice(1)}?${params}`, {
      headers: { ...credentials.cookieHeader, ...testData.COMMON_HEADERS },
      responseType: 'json',
    });

    expect(response.statusCode).toBe(403);
  });

  apiTest(
    'uptime read in space_1 can access pings API in space_1',
    async ({ samlAuth, apiClient }) => {
      const credentials = await samlAuth.asInteractiveUser({
        elasticsearch: {
          cluster: [],
          indices: [{ names: ['heartbeat-*'], privileges: ['read', 'view_index_metadata'] }],
        },
        kibana: [
          {
            base: [],
            feature: { uptime: ['read'] },
            spaces: [space1Id],
          },
        ],
      });

      const params = new URLSearchParams({
        sort: 'desc',
        from: testData.PINGS_DATE_RANGE_START,
        to: testData.PINGS_DATE_RANGE_END,
      });
      const response = await apiClient.get(
        `s/${space1Id}/${testData.API_URLS.PINGS.slice(1)}?${params}`,
        {
          headers: { ...credentials.cookieHeader, ...testData.COMMON_HEADERS },
          responseType: 'json',
        }
      );

      expect(response.statusCode).toBe(200);
    }
  );

  apiTest(
    'uptime read in space_1 cannot access pings API in default space',
    async ({ samlAuth, apiClient }) => {
      const credentials = await samlAuth.asInteractiveUser({
        elasticsearch: {
          cluster: [],
          indices: [{ names: ['heartbeat-*'], privileges: ['read', 'view_index_metadata'] }],
        },
        kibana: [
          {
            base: [],
            feature: { uptime: ['read'] },
            spaces: [space1Id],
          },
        ],
      });

      const params = new URLSearchParams({
        sort: 'desc',
        from: testData.PINGS_DATE_RANGE_START,
        to: testData.PINGS_DATE_RANGE_END,
      });
      const response = await apiClient.get(`${testData.API_URLS.PINGS.slice(1)}?${params}`, {
        headers: { ...credentials.cookieHeader, ...testData.COMMON_HEADERS },
        responseType: 'json',
      });

      expect(response.statusCode).toBe(403);
    }
  );
});
