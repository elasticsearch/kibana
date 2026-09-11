/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { expect } from '@kbn/scout/ui';
import {
  addDataLayer,
  completeLensCsvExport,
  createLogstashLensEditorSuiteSetup,
  openSharedLensUrl,
  spaceTest,
  waitForLensCsvContent,
} from '../fixtures';

spaceTest.describe('Lens share and CSV export', { tag: '@local-stateful-classic' }, () => {
  const suiteSetup = createLogstashLensEditorSuiteSetup();

  spaceTest.beforeAll(suiteSetup.beforeAll);

  spaceTest.beforeEach(suiteSetup.beforeEach);

  spaceTest.afterAll(suiteSetup.afterAll);

  // One journey: share enablement and CSV builds on the same editor session (FTR share.ts).
  spaceTest(
    'enables share/export for a valid config and preserves filters in the shared URL',
    async ({ page, pageObjects, context, kbnUrl }) => {
      spaceTest.setTimeout(120_000);
      const { lens, queryBar, filterBar, toasts } = pageObjects;

      await spaceTest.step('share disabled on empty visualization', async () => {
        await lens.waitForLensApp();
        await lens.workspace.openAppMenuOverflow();
        await expect(lens.workspace.shareButton).toBeDisabled();
        await lens.workspace.closeAppMenuOverflow();
      });

      await spaceTest.step('share stays disabled for incomplete XY', async () => {
        await page.testSubj
          .locator('lnsXY_xDimensionPanel > lns-empty-dimension')
          .waitFor({ state: 'visible' });
        await lens.configureDimension({
          dimension: 'lnsXY_xDimensionPanel > lns-empty-dimension',
          operation: 'date_histogram',
          field: '@timestamp',
        });
        await lens.workspace.openAppMenuOverflow();
        await expect(lens.workspace.shareButton).toBeDisabled();
        await lens.workspace.closeAppMenuOverflow();
      });

      await spaceTest.step('share and export enable for a valid config', async () => {
        await lens.configureDimension({
          dimension: 'lnsXY_yDimensionPanel > lns-empty-dimension',
          operation: 'average',
          field: 'bytes',
        });
        // Share/export enable after Lens has produced a request/visualization.
        await lens.waitForVisualization('xyVisChart');
        await lens.workspace.openAppMenuOverflow();
        await expect(lens.workspace.shareButton).toBeEnabled();
        await expect(lens.workspace.exportButton).toBeEnabled();
        await lens.workspace.closeAppMenuOverflow();

        // Modern share modal exposes Copy link directly (no `link` tab / tabbedModal-link-content).
        await lens.workspace.openShareModal();
        await expect(page.testSubj.locator('copyShareUrlButton')).toBeVisible();
        await lens.workspace.closeShareModal();
      });

      // Export while the chart still has data. The next step applies a filter that
      // yields "No results found", which disables CSV (`csvEnabled` requires hasData).
      await spaceTest.step('download CSV for single-layer visualization', async () => {
        await page.evaluate(() => {
          window.ELASTIC_LENS_CSV_DOWNLOAD_DEBUG = true;
          window.ELASTIC_LENS_CSV_CONTENT = undefined;
        });
        await completeLensCsvExport(page);
        const csvContent = await waitForLensCsvContent(page, 1);
        expect(Object.keys(csvContent)).toHaveLength(1);
      });

      await spaceTest.step('preserve filter and query when sharing URL', async () => {
        // Dismiss save/share toasts first — they sit over the filter bar and intercept clicks.
        await toasts.dismissAll();
        await filterBar.addFilter({ field: 'bytes', operator: 'is', value: '1' });
        await expect(page.testSubj.locator('~filter')).toHaveText(['bytes: 1']);

        await queryBar.setQuery('host.keyword www.elastic.co');
        await page.testSubj.click('querySubmitButton');
        // Save while the filtered request is in flight — share can stay disabled on empty results.
        // getSharedUrl → openShareModal waits until share is enabled (default waitForFunction timeout).
        await lens.save(`lens-share-${Date.now()}`, { addToDashboard: 'none' });

        const url = await lens.workspace.getSharedUrl();
        const { page: sharedPage, queryBar: sharedQueryBar } = await openSharedLensUrl({
          context,
          kbnUrl,
          url,
        });
        try {
          // URL-restored filters mount asynchronously; web-first text assert retries.
          await expect(sharedPage.testSubj.locator('~filter')).toHaveText(['bytes: 1']);
          expect(await sharedQueryBar.getQuery()).toBe('host.keyword www.elastic.co');
        } finally {
          await sharedPage.close();
        }
      });

      await spaceTest.step('download CSV for multi-layer visualization', async () => {
        // Start from a fresh editor so layer add is not racing a saved-object reload
        // after clearing filters on the shared saved viz (share-URL already covered filters).
        await suiteSetup.openEmptyLensEditor(pageObjects);
        await lens.configureDimension({
          dimension: 'lnsXY_xDimensionPanel > lns-empty-dimension',
          operation: 'date_histogram',
          field: '@timestamp',
        });
        await lens.configureDimension({
          dimension: 'lnsXY_yDimensionPanel > lns-empty-dimension',
          operation: 'average',
          field: 'bytes',
        });
        await lens.waitForVisualization('xyVisChart');

        await addDataLayer(page, 'bar');
        await lens.layers.ensureLayerTabIsActive(1);
        await expect(
          page.testSubj.locator('lns-layerPanel-1 > lnsXY_xDimensionPanel > lns-empty-dimension')
        ).toBeVisible();
        await lens.configureDimension({
          dimension: 'lns-layerPanel-1 > lnsXY_xDimensionPanel > lns-empty-dimension',
          operation: 'date_histogram',
          field: '@timestamp',
        });
        await lens.configureDimension({
          dimension: 'lns-layerPanel-1 > lnsXY_yDimensionPanel > lns-empty-dimension',
          operation: 'median',
          field: 'bytes',
        });
        await lens.waitForVisualization('xyVisChart');

        await page.evaluate(() => {
          window.ELASTIC_LENS_CSV_CONTENT = undefined;
          window.ELASTIC_LENS_CSV_DOWNLOAD_DEBUG = true;
        });
        await completeLensCsvExport(page);
        const csvContent = await waitForLensCsvContent(page, 2);
        expect(Object.keys(csvContent)).toHaveLength(2);

        await page.evaluate(() => {
          window.ELASTIC_LENS_CSV_DOWNLOAD_DEBUG = false;
        });
      });
    }
  );
});
