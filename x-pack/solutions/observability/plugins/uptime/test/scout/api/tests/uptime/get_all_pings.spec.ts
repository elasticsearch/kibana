/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { RoleApiCredentials } from '@kbn/scout-oblt';
import { tags } from '@kbn/scout-oblt';
import { expect } from '@kbn/scout-oblt/api';
import { apiTest, testData } from '../../fixtures';

apiTest.describe('get_all_pings', { tag: tags.stateful.classic }, () => {
  let adminCredentials: RoleApiCredentials;

  apiTest.beforeAll(async ({ requestAuth, esArchiver }) => {
    adminCredentials = await requestAuth.getApiKey('admin');
    await esArchiver.loadIfNeeded(testData.ES_ARCHIVES.FULL_HEARTBEAT);
  });

  apiTest('should get all pings stored in index', async ({ apiClient }) => {
    const params = new URLSearchParams({
      sort: 'desc',
      from: testData.PINGS_DATE_RANGE_START,
      to: testData.PINGS_DATE_RANGE_END,
    });
    const response = await apiClient.get(`${testData.API_URLS.PINGS.slice(1)}?${params}`, {
      headers: { ...adminCredentials.apiKeyHeader, ...testData.COMMON_HEADERS },
      responseType: 'json',
    });
    expect(response.statusCode).toBe(200);
    expect(response.body.total).toBe(1931);
    expect(response.body.pings).toHaveLength(25);
    expect(response.body.pings[0].monitor.id).toBe('0074-up');
  });

  apiTest('should sort pings according to timestamp', async ({ apiClient }) => {
    const params = new URLSearchParams({
      sort: 'asc',
      from: testData.PINGS_DATE_RANGE_START,
      to: testData.PINGS_DATE_RANGE_END,
    });
    const response = await apiClient.get(`${testData.API_URLS.PINGS.slice(1)}?${params}`, {
      headers: { ...adminCredentials.apiKeyHeader, ...testData.COMMON_HEADERS },
      responseType: 'json',
    });
    expect(response.statusCode).toBe(200);
    expect(response.body.total).toBe(1931);
    expect(response.body.pings).toHaveLength(25);
    expect(response.body.pings[0]['@timestamp']).toBe('2019-09-11T03:31:04.396Z');
    expect(response.body.pings[1]['@timestamp']).toBe('2019-09-11T03:31:04.396Z');
  });

  apiTest('should return results of n length', async ({ apiClient }) => {
    const params = new URLSearchParams({
      sort: 'desc',
      size: String(1),
      from: testData.PINGS_DATE_RANGE_START,
      to: testData.PINGS_DATE_RANGE_END,
    });
    const response = await apiClient.get(`${testData.API_URLS.PINGS.slice(1)}?${params}`, {
      headers: { ...adminCredentials.apiKeyHeader, ...testData.COMMON_HEADERS },
      responseType: 'json',
    });
    expect(response.statusCode).toBe(200);
    expect(response.body.total).toBe(1931);
    expect(response.body.pings).toHaveLength(1);
    expect(response.body.pings[0].monitor.id).toBe('0074-up');
  });

  apiTest('should miss pings outside of date range', async ({ apiClient }) => {
    const from = new Date('2002-01-01').valueOf();
    const to = new Date('2002-01-02').valueOf();
    const params = new URLSearchParams({
      from: String(from),
      to: String(to),
    });
    const response = await apiClient.get(`${testData.API_URLS.PINGS.slice(1)}?${params}`, {
      headers: { ...adminCredentials.apiKeyHeader, ...testData.COMMON_HEADERS },
      responseType: 'json',
    });
    expect(response.statusCode).toBe(200);
    expect(response.body.total).toBe(0);
    expect(response.body.pings).toHaveLength(0);
  });
});
