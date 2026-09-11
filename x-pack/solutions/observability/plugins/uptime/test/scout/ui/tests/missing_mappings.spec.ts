/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { expect } from '@kbn/scout-oblt/ui';
import { tags } from '@kbn/scout-oblt';
import { test, testData } from '../fixtures';

const { DYNAMIC_SETTINGS_DEFAULTS } = testData;

test.describe('Uptime missing mappings', { tag: tags.stateful.classic }, () => {
  const testIndex = 'heartbeat-missing-mappings-test';

  test.beforeAll(async ({ esClient }) => {
    try {
      await esClient.indices.delete({ index: testIndex });
    } catch {
      // index may not exist
    }

    await esClient.index({
      index: testIndex,
      document: {
        '@timestamp': new Date().toISOString(),
        monitor: {
          id: 'test-missing-mapping',
          status: 'up',
          type: 'http',
        },
      },
      refresh: 'wait_for',
    });
  });

  test.afterAll(async ({ esClient }) => {
    try {
      await esClient.indices.delete({ index: testIndex });
    } catch {
      // ignore
    }
  });

  test('redirects to mappings error page when mappings are incomplete', async ({
    browserAuth,
    pageObjects,
    kbnClient,
  }) => {
    await browserAuth.loginAsPrivilegedUser();

    await kbnClient.request({
      method: 'PUT',
      path: '/api/uptime/settings',
      body: { heartbeatIndices: testIndex },
    });

    try {
      await pageObjects.uptimeApp.navigateToOverview();
      await expect(async () => {
        const hasMappingsError = await pageObjects.uptimeApp.hasMappingsError();
        expect(hasMappingsError).toBe(true);
      }).toPass({ timeout: 15_000 });
    } finally {
      await kbnClient.request({
        method: 'PUT',
        path: '/api/uptime/settings',
        body: { heartbeatIndices: DYNAMIC_SETTINGS_DEFAULTS.heartbeatIndices },
      });
    }
  });
});
