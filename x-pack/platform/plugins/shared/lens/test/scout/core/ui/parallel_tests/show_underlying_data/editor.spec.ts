/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { expect } from '@kbn/scout/ui';
import {
  addDataLayer,
  createLogstashLensEditorSuiteSetup,
  openDiscoverFromPopup,
  spaceTest,
  testData,
} from '../../fixtures';

const SPLIT_TRIGGER = 'lnsXY_splitDimensionPanel > lns-dimensionTrigger';
const Y_TRIGGER = 'lnsXY_yDimensionPanel > lns-dimensionTrigger';
const Y_EMPTY = 'lnsXY_yDimensionPanel > lns-empty-dimension';

const COMPATIBLE_TITLES = ['extension.raw', 'bytes'] as const;
const FORMULA_TITLES = ['extension.raw', 'memory'] as const;

spaceTest.describe('Lens show underlying data', { tag: '@local-stateful-classic' }, () => {
  const suiteSetup = createLogstashLensEditorSuiteSetup({
    loadLensArchives: true,
    skipEmptyLensOpen: true,
  });

  spaceTest.beforeAll(suiteSetup.beforeAll);

  spaceTest.beforeEach(async ({ browserAuth, context, page, pageObjects }) => {
    await suiteSetup.beforeEach({ browserAuth, context, page, pageObjects });

    const { visualize, lens } = pageObjects;
    await visualize.goto();
    await visualize.openSavedVisualization(testData.LENS_BASIC_TITLES.XY_VIS, { waitFor: 'lens' });
    await lens.waitForVisualization(testData.XY_CHART);
    await lens.configureDimension({
      dimension: SPLIT_TRIGGER,
      operation: 'terms',
      field: 'extension.raw',
    });
    await lens.waitForVisualization(testData.XY_CHART);
  });

  spaceTest.afterAll(suiteSetup.afterAll);

  spaceTest(
    'opens Discover with columns from a compatible saved visualization',
    async ({ pageObjects, context, kbnUrl }) => {
      const { lens } = pageObjects;

      await lens.workspace.openAppMenuOverflow();
      await expect(lens.workspace.openInDiscoverButton).toBeEnabled();
      const discoverPage = await openDiscoverFromPopup({
        context,
        kbnUrl,
        click: () => lens.workspace.openInDiscoverButton.click(),
      });
      try {
        await expect(discoverPage.testSubj.locator('unifiedDataTableToolbar')).toBeVisible();
        await expect(discoverPage.testSubj.locator('dataGridHeaderCell-@timestamp')).toBeVisible();
        await expect(discoverPage.testSubj.locator('unifiedDataTableColumnTitle')).toHaveText([
          ...COMPATIBLE_TITLES,
        ]);
      } finally {
        await discoverPage.close();
      }
    }
  );

  spaceTest(
    'opens Discover when the visualization has an annotation layer',
    async ({ pageObjects, context, kbnUrl }) => {
      const { lens } = pageObjects;

      await spaceTest.step('add an annotation layer', async () => {
        await lens.layers.createLayer('annotations');
      });

      await spaceTest.step('open Discover and assert columns are unchanged', async () => {
        await lens.workspace.openAppMenuOverflow();
        await expect(lens.workspace.openInDiscoverButton).toBeEnabled();
        const discoverPage = await openDiscoverFromPopup({
          context,
          kbnUrl,
          click: () => lens.workspace.openInDiscoverButton.click(),
        });
        try {
          await expect(discoverPage.testSubj.locator('unifiedHistogramChart')).toBeVisible();
          await expect(
            discoverPage.testSubj.locator('dataGridHeaderCell-@timestamp')
          ).toBeVisible();
          await expect(discoverPage.testSubj.locator('unifiedDataTableColumnTitle')).toHaveText([
            ...COMPATIBLE_TITLES,
          ]);
        } finally {
          await discoverPage.close();
        }
      });
    }
  );

  spaceTest(
    'opens Discover when the visualization has a reference line layer',
    async ({ pageObjects, context, kbnUrl }) => {
      const { lens } = pageObjects;

      await spaceTest.step('add a reference line layer', async () => {
        await lens.layers.createLayer('referenceLine');
      });

      await spaceTest.step('open Discover and assert columns are unchanged', async () => {
        await lens.workspace.openAppMenuOverflow();
        await expect(lens.workspace.openInDiscoverButton).toBeEnabled();
        const discoverPage = await openDiscoverFromPopup({
          context,
          kbnUrl,
          click: () => lens.workspace.openInDiscoverButton.click(),
        });
        try {
          await expect(discoverPage.testSubj.locator('unifiedHistogramChart')).toBeVisible();
          await expect(
            discoverPage.testSubj.locator('dataGridHeaderCell-@timestamp')
          ).toBeVisible();
          await expect(discoverPage.testSubj.locator('unifiedDataTableColumnTitle')).toHaveText([
            ...COMPATIBLE_TITLES,
          ]);
        } finally {
          await discoverPage.close();
        }
      });
    }
  );

  spaceTest(
    'disables Open in Discover when the visualization has multiple data layers',
    async ({ page, pageObjects }) => {
      const { lens } = pageObjects;

      await addDataLayer(page, 'bar');
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
      await lens.waitForVisualization(testData.XY_CHART);

      await lens.workspace.openAppMenuOverflow();
      await expect(lens.workspace.openInDiscoverButton).toBeDisabled();
      await lens.workspace.closeAppMenuOverflow();
    }
  );

  spaceTest(
    'omits terms from the Discover query when Other is enabled',
    async ({ pageObjects, context, kbnUrl }) => {
      const { lens } = pageObjects;

      await spaceTest.step('enable terms Other bucket', async () => {
        await lens.dimensions.openDimensionEditor(SPLIT_TRIGGER);
        await lens.dimensions.enableTermsOtherBucket();
        await lens.closeDimensionEditor();
        await lens.waitForVisualization(testData.XY_CHART);
      });

      await spaceTest.step('open Discover with an empty query', async () => {
        await lens.workspace.openAppMenuOverflow();
        await expect(lens.workspace.openInDiscoverButton).toBeEnabled();
        const discoverPage = await openDiscoverFromPopup({
          context,
          kbnUrl,
          click: () => lens.workspace.openInDiscoverButton.click(),
        });
        try {
          await expect(discoverPage.testSubj.locator('unifiedHistogramChart')).toBeVisible();
          await expect(discoverPage.testSubj.locator('queryInput')).toHaveValue('');
        } finally {
          await discoverPage.close();
        }
      });
    }
  );

  spaceTest(
    'opens Discover with a Lucene dimension filter as a filter pill',
    async ({ pageObjects, context, kbnUrl }) => {
      const { lens } = pageObjects;

      await spaceTest.step('add a Lucene filter on the Y dimension', async () => {
        await lens.dimensions.openDimensionEditor(Y_TRIGGER);
        await lens.workspace.enableFilter();
        await lens.dimensions.setDimensionFilterLanguageToLucene();
        await lens.workspace.setDimensionFilterQuery('machine.ram:*');
        await expect(lens.workspace.dimensionFilterTrigger).toHaveText('machine.ram:*');
        await lens.closeDimensionEditor();
        await lens.waitForVisualization(testData.XY_CHART);
      });

      await spaceTest.step('open Discover and assert query plus Lucene pill', async () => {
        await lens.workspace.openAppMenuOverflow();
        await expect(lens.workspace.openInDiscoverButton).toBeEnabled();
        const discoverPage = await openDiscoverFromPopup({
          context,
          kbnUrl,
          click: () => lens.workspace.openInDiscoverButton.click(),
        });
        try {
          await expect(discoverPage.testSubj.locator('unifiedHistogramChart')).toBeVisible();
          await expect(discoverPage.testSubj.locator('queryInput')).toHaveValue(
            '( ( extension.raw: "png" ) OR ( extension.raw: "css" ) OR ( extension.raw: "jpg" ) )'
          );
          await expect(discoverPage.testSubj.locator('~filter')).toHaveText([
            'Lens context (lucene)',
          ]);
        } finally {
          await discoverPage.close();
        }
      });
    }
  );

  spaceTest(
    'extracts formula KQL filters and columns into Discover',
    async ({ page, pageObjects, context, kbnUrl }) => {
      const { lens } = pageObjects;

      await spaceTest.step('replace Y with a memory average formula plus KQL', async () => {
        await lens.workspace.removeAllDimensions('lnsXY_yDimensionPanel');
        await lens.configureDimension({
          dimension: Y_EMPTY,
          operation: 'formula',
          formula: `average(memory, kql=`,
          keepOpen: true,
        });
        await lens.typeInFormula(`bytes > 2000`, { focus: false });
        // FTR: tooltip stays while the formula query string is focused.
        await page.keyboard.press('ArrowRight');
        const renderCountBeforeClose = await lens.workspace.getVisualizationRenderCount(
          testData.XY_CHART
        );
        await lens.closeDimensionEditor();
        await lens.waitForVisualization(testData.XY_CHART, {
          afterCount: renderCountBeforeClose ?? undefined,
        });
        // Terms filters come from chart rows; wait until the post-formula top values exist
        // (beforeEach is png/css/jpg; formula metric changes that set to css/gif/jpg).
        await expect(lens.workspace.xyLegendItems.getByText('gif', { exact: true })).toBeVisible();
      });

      await spaceTest.step('open Discover and assert memory column plus combined KQL', async () => {
        await lens.workspace.openAppMenuOverflow();
        await expect(lens.workspace.openInDiscoverButton).toBeEnabled();
        const discoverPage = await openDiscoverFromPopup({
          context,
          kbnUrl,
          click: () => lens.workspace.openInDiscoverButton.click(),
        });
        try {
          await expect(discoverPage.testSubj.locator('unifiedHistogramChart')).toBeVisible();
          await expect(
            discoverPage.testSubj.locator('dataGridHeaderCell-@timestamp')
          ).toBeVisible();
          await expect(discoverPage.testSubj.locator('unifiedDataTableColumnTitle')).toHaveText([
            ...FORMULA_TITLES,
          ]);
          await expect(discoverPage.testSubj.locator('queryInput')).toHaveValue(
            '( ( bytes > 2000 ) AND ( ( extension.raw: "css" ) OR ( extension.raw: "gif" ) OR ( extension.raw: "jpg" ) ) )'
          );
        } finally {
          await discoverPage.close();
        }
      });
    }
  );

  spaceTest(
    'extracts a formula global filter into Discover',
    async ({ pageObjects, context, kbnUrl }) => {
      const { lens } = pageObjects;

      await spaceTest.step('replace Y with a count formula plus a global filter', async () => {
        await lens.workspace.removeAllDimensions('lnsXY_yDimensionPanel');
        await lens.configureDimension({
          dimension: Y_EMPTY,
          operation: 'formula',
          formula: `count()`,
          keepOpen: true,
        });
        await lens.workspace.enableFilter();
        await lens.workspace.setDimensionFilterQuery('bytes > 4000');
        await expect(lens.workspace.dimensionFilterTrigger).toHaveText('bytes > 4000');
        await lens.closeDimensionEditor();
        await lens.waitForVisualization(testData.XY_CHART);
        // Terms filters come from chart rows; wait until the post-formula top values exist
        // (beforeEach is png/css/jpg; count() + bytes filter changes that set to css/gif/jpg).
        await expect(lens.workspace.xyLegendItems.getByText('gif', { exact: true })).toBeVisible();
      });

      await spaceTest.step('open Discover and assert combined KQL', async () => {
        await lens.workspace.openAppMenuOverflow();
        await expect(lens.workspace.openInDiscoverButton).toBeEnabled();
        const discoverPage = await openDiscoverFromPopup({
          context,
          kbnUrl,
          click: () => lens.workspace.openInDiscoverButton.click(),
        });
        try {
          await expect(discoverPage.testSubj.locator('unifiedHistogramChart')).toBeVisible();
          await expect(discoverPage.testSubj.locator('queryInput')).toHaveValue(
            '( ( bytes > 4000 ) AND ( ( extension.raw: "css" ) OR ( extension.raw: "gif" ) OR ( extension.raw: "jpg" ) ) )'
          );
        } finally {
          await discoverPage.close();
        }
      });
    }
  );
});
