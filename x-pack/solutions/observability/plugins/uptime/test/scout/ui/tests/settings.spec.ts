/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { KbnClient } from '@kbn/scout-oblt';
import { tags } from '@kbn/scout-oblt';
import { expect } from '@kbn/scout-oblt/ui';
import { test, testData } from '../fixtures';

const { DYNAMIC_SETTINGS_DEFAULTS } = testData;

const resetUptimeSettings = async (kbnClient: KbnClient) => {
  await kbnClient
    .request({
      method: 'PUT',
      path: '/api/uptime/settings',
      body: DYNAMIC_SETTINGS_DEFAULTS,
    })
    .catch(() => {});
};

test.describe('Uptime settings page', { tag: tags.stateful.classic }, () => {
  test.beforeEach(async ({ browserAuth, pageObjects, kbnClient }) => {
    await browserAuth.loginAsPrivilegedUser();
    await resetUptimeSettings(kbnClient);
    await pageObjects.uptimeApp.navigateToOverview(testData.DEFAULT_NAVIGATION_SEARCH);
  });

  test.afterEach(async ({ kbnClient }) => {
    await resetUptimeSettings(kbnClient);
  });

  test('changing index pattern setting is reflected elsewhere in UI', async ({ pageObjects }) => {
    await test.step('verify initial monitor count', async () => {
      await pageObjects.uptimeApp.waitForDataLoaded();
      await expect(async () => {
        const originalCount = await pageObjects.uptimeApp.getSnapshotCount();
        expect(Number(originalCount.up)).toBeGreaterThanOrEqual(1);
      }).toPass({ timeout: 30_000 });
    });

    await test.step('change heartbeat indices to non-matching pattern', async () => {
      await pageObjects.uptimeApp.navigateToSettings();
      await pageObjects.uptimeApp.changeHeartbeatIndicesInput('new*');
      await pageObjects.uptimeApp.applySettings();
    });

    await test.step('verify no data found with new pattern', async () => {
      await pageObjects.uptimeApp.navigateToOverview(testData.DEFAULT_NAVIGATION_SEARCH);
      await pageObjects.uptimeApp.waitForLoadingToFinish();
      await expect(async () => {
        const hasMissingData = await pageObjects.uptimeApp.hasMissingData();
        expect(hasMissingData).toBe(true);
      }).toPass({ timeout: 30_000 });
    });

    await test.step('verify saved value persists on settings page', async () => {
      await pageObjects.uptimeApp.navigateToSettings();
      const fields = await pageObjects.uptimeApp.loadSettingsFields();
      expect(fields.heartbeatIndices).toBe('new*');
    });
  });

  test('changing certificate thresholds is reflected in settings page', async ({ pageObjects }) => {
    await test.step('change expiration threshold', async () => {
      await pageObjects.uptimeApp.navigateToSettings();
      await pageObjects.uptimeApp.changeErrorThresholdInput('5');
      await pageObjects.uptimeApp.applySettings();
    });

    await test.step('verify expiration threshold persists', async () => {
      await pageObjects.uptimeApp.navigateToOverview(testData.DEFAULT_NAVIGATION_SEARCH);
      await pageObjects.uptimeApp.navigateToSettings();
      const fields = await pageObjects.uptimeApp.loadSettingsFields();
      expect(fields.certExpirationThreshold).toBe(5);
    });

    await test.step('change age threshold', async () => {
      await pageObjects.uptimeApp.changeWarningThresholdInput('15');
      await pageObjects.uptimeApp.applySettings();
    });

    await test.step('verify age threshold persists', async () => {
      await pageObjects.uptimeApp.navigateToOverview(testData.DEFAULT_NAVIGATION_SEARCH);
      await pageObjects.uptimeApp.navigateToSettings();
      const fields = await pageObjects.uptimeApp.loadSettingsFields();
      expect(fields.certAgeThreshold).toBe(15);
    });
  });
});
