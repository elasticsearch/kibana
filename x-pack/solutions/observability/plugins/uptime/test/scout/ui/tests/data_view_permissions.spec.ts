/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { expect } from '@kbn/scout-oblt/ui';
import { tags } from '@kbn/scout-oblt';
import { test } from '../fixtures';

const queryParams = {
  dateRangeStart: '2021-11-21T22:06:06.502Z',
  dateRangeEnd: '2021-11-21T22:10:08.203Z',
};

test.describe('DataViewPermissions', { tag: tags.stateful.classic }, () => {
  test.beforeAll(async ({ kbnClient }) => {
    try {
      await kbnClient.savedObjects.delete({
        type: 'index-pattern',
        id: 'synthetics_static_index_pattern_id_heartbeat_',
      });
    } catch {
      // Ignore - may not exist
    }
  });

  test('renders exploratory view for viewer user', async ({ pageObjects, browserAuth, page }) => {
    await browserAuth.loginAsViewer();
    await pageObjects.uptimeOverview.goto(queryParams);

    await pageObjects.uptimeOverview.clickExploreDataButton();
    await page.testSubj.locator('exploratoryViewMainContainer').waitFor();
    await expect(page.locator('[data-testid="echLegendItemLabel"]')).toHaveText('browser');
    await expect(page.testSubj.locator('o11yDataTypeBadge')).toHaveAttribute('title', 'Uptime');
    await expect(page.testSubj.locator('o11yReportMetricBadge')).toHaveAttribute(
      'title',
      'Monitor duration'
    );
  });
});
