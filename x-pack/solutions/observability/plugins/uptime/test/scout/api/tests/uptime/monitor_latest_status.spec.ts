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

apiTest.describe('get monitor latest status API', { tag: tags.stateful.classic }, () => {
  let adminCredentials: RoleApiCredentials;

  apiTest.beforeAll(async ({ requestAuth, esArchiver }) => {
    adminCredentials = await requestAuth.getApiKey('admin');
    await esArchiver.loadIfNeeded(testData.ES_ARCHIVES.FULL_HEARTBEAT);
  });

  apiTest('returns the status for only the given monitor', async ({ apiClient }) => {
    const params = new URLSearchParams({
      monitorId: '0002-up',
      dateStart: '2018-01-28T17:40:08.078Z',
      dateEnd: '2025-01-28T19:00:16.078Z',
    });
    const response = await apiClient.get(`${testData.API_URLS.MONITOR_STATUS.slice(1)}?${params}`, {
      headers: { ...adminCredentials.apiKeyHeader, ...testData.COMMON_HEADERS },
      responseType: 'json',
    });
    expect(response.statusCode).toBe(200);
    expectFixtureEql(response.body, 'monitor_latest_status');
  });
});
