/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { expect } from '@kbn/scout-oblt/ui';
import { tags } from '@kbn/scout-oblt';
import { test, testData } from '../fixtures';

test.describe('Uptime overview page', { tag: tags.stateful.classic }, () => {
  test.beforeEach(async ({ browserAuth, pageObjects }) => {
    await browserAuth.loginAsPrivilegedUser();
    await pageObjects.uptimeApp.navigateToOverview(testData.DEFAULT_NAVIGATION_SEARCH);
    await pageObjects.uptimeApp.resetFilters();
  });

  test('loads and displays uptime data based on date range', async ({ pageObjects }) => {
    await pageObjects.uptimeApp.waitForMonitorIds(['0000-intermittent']);
  });

  test('applies filters for multiple fields', async ({ pageObjects }) => {
    await test.step('select filters', async () => {
      await pageObjects.uptimeApp.selectFilterItem('Location', ['mpls']);
      await pageObjects.uptimeApp.selectFilterItem('Port', ['5678']);
      await pageObjects.uptimeApp.selectFilterItem('Scheme', ['http']);
    });

    await test.step('verify filtered monitor list', async () => {
      await pageObjects.uptimeApp.waitForMonitorIds([
        '0000-intermittent',
        '0001-up',
        '0002-up',
        '0003-up',
        '0004-up',
        '0005-up',
        '0006-up',
        '0007-up',
        '0008-up',
        '0009-up',
      ]);
    });
  });

  test('pagination is cleared when filter or page size changes', async ({ pageObjects }) => {
    await test.step('navigate to page 2 via pagination params', async () => {
      const paginationSearch = `${testData.DEFAULT_NAVIGATION_SEARCH}&pagination={"cursorDirection":"AFTER","sortOrder":"ASC","cursorKey":{"monitor_id":"0009-up"}}`;
      await pageObjects.uptimeApp.navigateToOverview(paginationSearch);
      await pageObjects.uptimeApp.waitForMonitorIds([
        '0010-down',
        '0011-up',
        '0012-up',
        '0013-up',
        '0014-up',
        '0015-intermittent',
        '0016-up',
        '0017-up',
        '0018-up',
        '0019-up',
      ]);
      const url = await pageObjects.uptimeApp.getCurrentUrl();
      expect(url).toContain('pagination');
    });

    await test.step('apply status filter and verify pagination is cleared', async () => {
      await pageObjects.uptimeApp.setStatusFilterUp();
      await pageObjects.uptimeApp.waitForMonitorIds([
        '0000-intermittent',
        '0001-up',
        '0002-up',
        '0003-up',
        '0004-up',
        '0005-up',
        '0006-up',
        '0007-up',
        '0008-up',
        '0009-up',
      ]);
      const url = await pageObjects.uptimeApp.getCurrentUrl();
      expect(url).not.toContain('pagination');
    });

    await test.step('go to next page then change page size', async () => {
      await pageObjects.uptimeApp.goToNextPage();
      await expect(async () => {
        const url = await pageObjects.uptimeApp.getCurrentUrl();
        expect(url).toContain('pagination');
      }).toPass({ timeout: 10_000 });

      await pageObjects.uptimeApp.setMonitorListPageSize(50);
      await expect(async () => {
        const url = await pageObjects.uptimeApp.getCurrentUrl();
        expect(url).not.toContain('pagination');
      }).toPass({ timeout: 10_000 });
    });
  });

  test('pagination size updates to reflect current selection', async ({ pageObjects }) => {
    await test.step('verify default page shows 10 monitors', async () => {
      await pageObjects.uptimeApp.waitForMonitorIds([
        '0000-intermittent',
        '0001-up',
        '0002-up',
        '0003-up',
        '0004-up',
        '0005-up',
        '0006-up',
        '0007-up',
        '0008-up',
        '0009-up',
      ]);
    });

    await test.step('change page size to 50 and verify all monitors visible', async () => {
      await pageObjects.uptimeApp.setMonitorListPageSize(50);
      await pageObjects.uptimeApp.waitForMonitorIds([
        '0000-intermittent',
        '0010-down',
        '0020-down',
        '0030-intermittent',
        '0040-down',
        '0049-up',
      ]);
    });
  });

  test('snapshot counts are not affected by status filter', async ({ pageObjects }) => {
    await test.step('verify counts with down filter', async () => {
      await pageObjects.uptimeApp.setStatusFilterDown();
      const counts = await pageObjects.uptimeApp.getSnapshotCount();
      expect(counts).toStrictEqual({ up: '93', down: '7' });
    });

    await test.step('reset and verify counts with up filter', async () => {
      await pageObjects.uptimeApp.resetStatusFilter();
      await pageObjects.uptimeApp.setStatusFilterUp();
      const counts = await pageObjects.uptimeApp.getSnapshotCount();
      expect(counts).toStrictEqual({ up: '93', down: '7' });
    });
  });

  test('runs kql filter query', async ({ pageObjects, page }) => {
    await test.step('switch to KQL', async () => {
      await page.testSubj.click('switchQueryLanguageButton');
      await page.testSubj.click('kqlLanguageMenuItem');
    });

    await test.step('filter by monitor status and ID', async () => {
      await pageObjects.uptimeApp.inputFilterQuery(
        'monitor.status:up and monitor.id:"0000-intermittent"'
      );
      await pageObjects.uptimeApp.waitForMonitorIds(['0000-intermittent']);
    });
  });
});
