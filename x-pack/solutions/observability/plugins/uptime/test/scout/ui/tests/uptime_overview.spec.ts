/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { expect } from '@kbn/scout-oblt/ui';
import { tags } from '@kbn/scout-oblt';
import { test } from '../fixtures';

test.describe('UptimeOverview', { tag: tags.stateful.classic }, () => {
  test('navigates to overview and clicks monitor', async ({ pageObjects, browserAuth }) => {
    await browserAuth.loginAsViewer();

    await test.step('configure heartbeat indices', async () => {
      await pageObjects.uptimeOverview.goto({ dateRangeStart: '2018-01-01', dateRangeEnd: 'now' });
      await pageObjects.uptimeOverview.clickSettingsLink();
      await pageObjects.uptimeSettings.waitForLoadingToFinish();
      await expect(pageObjects.uptimeOverview.getHeartbeatIndicesInput()).toHaveValue(
        'heartbeat-*'
      );
    });

    await test.step('navigate to overview and click monitor', async () => {
      await pageObjects.uptimeOverview.goto({ dateRangeStart: '2018-01-01', dateRangeEnd: 'now' });
      await pageObjects.uptimeOverview.waitForMonitorTable();
      await pageObjects.uptimeOverview.clickMonitorLink('0001-up');
      await expect(pageObjects.uptimeOverview.getPingListTable()).toBeVisible();
    });
  });
});
