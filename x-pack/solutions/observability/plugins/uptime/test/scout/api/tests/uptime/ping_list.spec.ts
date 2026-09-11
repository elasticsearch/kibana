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

apiTest.describe('pingList query', { tag: tags.stateful.classic }, () => {
  let adminCredentials: RoleApiCredentials;

  const from = '2019-01-28T17:40:08.078Z';
  const to = '2025-01-28T19:00:16.078Z';

  apiTest.beforeAll(async ({ requestAuth, esArchiver, esClient }) => {
    adminCredentials = await requestAuth.getApiKey('admin');
    await esClient.indices.delete({ index: 'heartbeat-8-full-test', ignore_unavailable: true });
    await esArchiver.loadIfNeeded(testData.ES_ARCHIVES.FULL_HEARTBEAT);
  });

  apiTest('returns a list of pings for the date range and given size', async ({ apiClient }) => {
    const params = new URLSearchParams({
      from,
      to,
      size: String(50),
    });
    const response = await apiClient.get(`${testData.API_URLS.PINGS.slice(1)}?${params}`, {
      headers: { ...adminCredentials.apiKeyHeader, ...testData.COMMON_HEADERS },
      responseType: 'json',
    });
    expect(response.statusCode).toBe(200);
    expect(response.body.total).toBe(2000);
    expect(response.body.pings).toHaveLength(50);
    expect(
      response.body.pings.map(({ monitor: { id } }: { monitor: { id: string } }) => id)
    ).toStrictEqual([
      '0074-up',
      '0073-up',
      '0099-up',
      '0098-up',
      '0075-intermittent',
      '0097-up',
      '0049-up',
      '0047-up',
      '0077-up',
      '0076-up',
      '0050-down',
      '0048-up',
      '0072-up',
      '0096-up',
      '0092-up',
      '0069-up',
      '0093-up',
      '0070-down',
      '0071-up',
      '0095-up',
      '0032-up',
      '0094-up',
      '0046-up',
      '0091-up',
      '0067-up',
      '0068-up',
      '0090-intermittent',
      '0031-up',
      '0066-up',
      '0084-up',
      '0083-up',
      '0041-up',
      '0045-intermittent',
      '0042-up',
      '0030-intermittent',
      '0063-up',
      '0061-up',
      '0065-up',
      '0062-up',
      '0026-up',
      '0085-up',
      '0025-up',
      '0088-up',
      '0089-up',
      '0087-up',
      '0028-up',
      '0086-up',
      '0064-up',
      '0029-up',
      '0044-up',
    ]);
  });

  apiTest('returns a list of pings for a monitor ID', async ({ apiClient }) => {
    const params = new URLSearchParams({
      from,
      to,
      monitorId: '0001-up',
      size: String(15),
    });
    const response = await apiClient.get(`${testData.API_URLS.PINGS.slice(1)}?${params}`, {
      headers: { ...adminCredentials.apiKeyHeader, ...testData.COMMON_HEADERS },
      responseType: 'json',
    });
    expect(response.statusCode).toBe(200);
    expect(response.body.total).toBe(20);
    response.body.pings.forEach(({ monitor: { id } }: { monitor: { id: string } }) => {
      expect(id).toBe('0001-up');
    });
    expect(
      response.body.pings.map(({ timestamp }: { timestamp: string }) => timestamp)
    ).toStrictEqual([
      '2019-09-11T03:40:34.371Z',
      '2019-09-11T03:40:04.370Z',
      '2019-09-11T03:39:34.370Z',
      '2019-09-11T03:39:04.371Z',
      '2019-09-11T03:38:34.370Z',
      '2019-09-11T03:38:04.370Z',
      '2019-09-11T03:37:34.370Z',
      '2019-09-11T03:37:04.370Z',
      '2019-09-11T03:36:34.371Z',
      '2019-09-11T03:36:04.370Z',
      '2019-09-11T03:35:34.373Z',
      '2019-09-11T03:35:04.371Z',
      '2019-09-11T03:34:34.371Z',
      '2019-09-11T03:34:04.381Z',
      '2019-09-11T03:33:34.371Z',
    ]);
  });

  apiTest('returns a list of pings sorted ascending', async ({ apiClient }) => {
    const params = new URLSearchParams({
      from,
      to,
      monitorId: '0001-up',
      size: String(5),
      sort: 'asc',
    });
    const response = await apiClient.get(`${testData.API_URLS.PINGS.slice(1)}?${params}`, {
      headers: { ...adminCredentials.apiKeyHeader, ...testData.COMMON_HEADERS },
      responseType: 'json',
    });
    expect(response.statusCode).toBe(200);
    expect(response.body.total).toBe(20);
    expect(
      response.body.pings.map(({ timestamp }: { timestamp: string }) => timestamp)
    ).toStrictEqual([
      '2019-09-11T03:31:04.380Z',
      '2019-09-11T03:31:34.366Z',
      '2019-09-11T03:32:04.372Z',
      '2019-09-11T03:32:34.375Z',
      '2019-09-11T03:33:04.370Z',
    ]);
  });
});
