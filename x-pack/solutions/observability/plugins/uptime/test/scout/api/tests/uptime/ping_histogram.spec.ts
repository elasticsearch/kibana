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
import { expectFixtureEql } from '../../fixtures/helpers/expect_fixture_eql';

apiTest.describe('pingHistogram', { tag: tags.stateful.classic }, () => {
  let adminCredentials: RoleApiCredentials;

  const dateStart = '2019-09-11T03:31:04.380Z';
  const dateEnd = '2019-09-11T03:40:34.410Z';
  const timeZone = 'UTC';

  apiTest.beforeAll(async ({ requestAuth, esArchiver }) => {
    adminCredentials = await requestAuth.getApiKey('admin');
    await esArchiver.loadIfNeeded(testData.ES_ARCHIVES.FULL_HEARTBEAT);
  });

  apiTest('will fetch histogram data for all monitors', async ({ apiClient }) => {
    const params = new URLSearchParams({
      dateStart,
      dateEnd,
      timeZone,
    });
    const response = await apiClient.get(`${testData.API_URLS.PING_HISTOGRAM.slice(1)}?${params}`, {
      headers: { ...adminCredentials.apiKeyHeader, ...testData.COMMON_HEADERS },
      responseType: 'json',
    });
    expect(response.statusCode).toBe(200);
    expectFixtureEql(response.body, 'ping_histogram');
  });

  apiTest('will fetch histogram data for a given monitor id', async ({ apiClient }) => {
    const params = new URLSearchParams({
      monitorId: '0002-up',
      dateStart,
      dateEnd,
      timeZone,
    });
    const response = await apiClient.get(`${testData.API_URLS.PING_HISTOGRAM.slice(1)}?${params}`, {
      headers: { ...adminCredentials.apiKeyHeader, ...testData.COMMON_HEADERS },
      responseType: 'json',
    });
    expect(response.statusCode).toBe(200);
    expectFixtureEql(response.body, 'ping_histogram_by_id');
  });

  apiTest('will fetch histogram data for a given filter', async ({ apiClient }) => {
    const params = new URLSearchParams({
      dateStart,
      dateEnd,
      timeZone,
      filters: '{"bool":{"must":[{"match":{"monitor.status":{"query":"up","operator":"and"}}}]}}',
    });
    const response = await apiClient.get(`${testData.API_URLS.PING_HISTOGRAM.slice(1)}?${params}`, {
      headers: { ...adminCredentials.apiKeyHeader, ...testData.COMMON_HEADERS },
      responseType: 'json',
    });
    expect(response.statusCode).toBe(200);
    expectFixtureEql(response.body, 'ping_histogram_by_filter');
  });
});
