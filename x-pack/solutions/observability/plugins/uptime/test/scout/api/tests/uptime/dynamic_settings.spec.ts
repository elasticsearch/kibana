/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { KbnClient, RoleApiCredentials } from '@kbn/scout-oblt';
import { tags } from '@kbn/scout-oblt';
import { expect } from '@kbn/scout-oblt/api';
import { apiTest, testData } from '../../fixtures';

apiTest.describe('dynamic settings', { tag: tags.stateful.classic }, () => {
  let adminCredentials: RoleApiCredentials;

  apiTest.beforeAll(async ({ requestAuth }) => {
    adminCredentials = await requestAuth.getApiKey('admin');
  });

  const cleanupSettings = async (kbnClient: KbnClient) => {
    try {
      await kbnClient.savedObjects.delete({
        type: 'uptime-dynamic-settings',
        id: 'uptime-dynamic-settings-singleton',
      });
    } catch (e: any) {
      if (!e.message?.includes('404') && e.response?.status !== 404) throw e;
    }
  };

  apiTest.beforeEach(async ({ kbnClient }) => {
    await cleanupSettings(kbnClient);
  });

  apiTest.afterEach(async ({ kbnClient }) => {
    await cleanupSettings(kbnClient);
  });

  apiTest('returns the defaults when no user settings have been saved', async ({ apiClient }) => {
    const response = await apiClient.get(testData.API_URLS.DYNAMIC_SETTINGS.slice(1), {
      headers: { ...adminCredentials.apiKeyHeader, ...testData.COMMON_HEADERS },
      responseType: 'json',
    });
    expect(response.statusCode).toBe(200);
    expect(response.body).toStrictEqual({
      heartbeatIndices: 'heartbeat-*',
      certAgeThreshold: 730,
      certExpirationThreshold: 30,
      defaultConnectors: [],
      defaultEmail: { to: [], cc: [], bcc: [] },
    });
  });

  apiTest('can change the settings', async ({ apiClient }) => {
    const newSettings = {
      heartbeatIndices: 'myIndex1*',
      certAgeThreshold: 15,
      certExpirationThreshold: 5,
      defaultConnectors: [],
    };

    const putResponse = await apiClient.put(testData.API_URLS.DYNAMIC_SETTINGS.slice(1), {
      headers: { ...adminCredentials.apiKeyHeader, ...testData.COMMON_HEADERS },
      body: newSettings,
      responseType: 'json',
    });
    expect(putResponse.statusCode).toBe(200);
    expect(putResponse.body).toStrictEqual({
      heartbeatIndices: 'myIndex1*',
      certExpirationThreshold: 5,
      certAgeThreshold: 15,
      defaultConnectors: [],
      defaultEmail: { to: [], cc: [], bcc: [] },
    });

    const getResponse = await apiClient.get(testData.API_URLS.DYNAMIC_SETTINGS.slice(1), {
      headers: { ...adminCredentials.apiKeyHeader, ...testData.COMMON_HEADERS },
      responseType: 'json',
    });
    expect(getResponse.statusCode).toBe(200);
    expect(getResponse.body).toStrictEqual({
      ...newSettings,
      defaultEmail: { to: [], cc: [], bcc: [] },
    });
  });
});
