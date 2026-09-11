/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { expect } from '@kbn/scout/ui';
import {
  applyLensInlineEditorAndWaitClosed,
  cancelLensInlineEditorAndWaitClosed,
  convertToEsqlViaModal,
  openDimensionEditorAndWaitForFlyout,
  openInlineEditorAndWaitVisible,
  test,
  testData,
} from '../../fixtures';

test.describe('Lens Convert to ES|QL', { tag: '@local-stateful-classic' }, () => {
  test.beforeAll(async ({ esArchiver, kbnClient, uiSettings, apiServices }) => {
    await apiServices.core.settings({
      'feature_flags.overrides': {
        'lens.enable_esql_conversion': true,
      },
    });

    await esArchiver.loadIfNeeded(testData.ES_ARCHIVE_PATHS.LOGSTASH);
    await kbnClient.importExport.load(testData.KBN_ARCHIVE_PATHS.ESQL_CONVERSION_DASHBOARD);
    await uiSettings.set({
      defaultIndex: testData.DATA_VIEW_ID.LOGSTASH,
      'dateFormat:tz': 'UTC',
      'timepicker:timeDefaults': `{ "from": "${testData.LOGSTASH_IN_RANGE_DATES.from}", "to": "${testData.LOGSTASH_IN_RANGE_DATES.to}"}`,
    });
  });

  test.beforeEach(async ({ browserAuth, pageObjects }) => {
    await browserAuth.loginAsPrivilegedUser();
    const { dashboard } = pageObjects;

    await dashboard.openDashboardWithIdInEditMode(testData.ESQL_CONVERSION_DASHBOARD_ID);
    await dashboard.waitForPanelsToLoad(4);
  });

  test.afterAll(async ({ kbnClient, uiSettings, apiServices }) => {
    await uiSettings.unset('defaultIndex', 'dateFormat:tz', 'timepicker:timeDefaults');
    await kbnClient.savedObjects.cleanStandardList();
    // `setDynamicConfigOverrides` merges by flattened key, so an empty object here is a
    // no-op: the override must be nulled out explicitly to actually remove it.
    await apiServices.core.settings({
      'feature_flags.overrides': { 'lens.enable_esql_conversion': null },
    });
  });

  test('should display ES|QL conversion modal for inline visualizations', async ({
    pageObjects,
    page,
  }) => {
    const { lens } = pageObjects;

    await openInlineEditorAndWaitVisible(
      pageObjects,
      testData.ESQL_CONVERSION_PANEL_IDS.INLINE_METRIC
    );

    await convertToEsqlViaModal({ pageObjects, page });

    await applyLensInlineEditorAndWaitClosed({ lens });

    // Open editor again and check the "Apply and close" button is disabled
    await openInlineEditorAndWaitVisible(
      pageObjects,
      testData.ESQL_CONVERSION_PANEL_IDS.INLINE_METRIC
    );
    await expect(page.getByText('ES|QL Query Results')).toBeVisible();
    await expect(lens.applyFlyoutButton).toBeDisabled();

    // TODO: Add conversion assertions: https://github.com/elastic/kibana/issues/250385
  });

  test('should update and reflect the visualization configuration after the conversion', async ({
    pageObjects,
    page,
  }) => {
    const { dashboard, lens } = pageObjects;

    await openInlineEditorAndWaitVisible(
      pageObjects,
      testData.ESQL_CONVERSION_PANEL_IDS.INLINE_METRIC
    );

    await convertToEsqlViaModal({ pageObjects, page });

    // Update primary metric name from the dimension editor
    const metricDimensionPanel = page.getByTestId('lnsMetric_primaryMetricDimensionPanel');
    await openDimensionEditorAndWaitForFlyout(pageObjects, page, metricDimensionPanel);
    const nameInput = page.getByTestId('name-input');
    await nameInput.fill('Converted metric');
    await expect(nameInput).toHaveValue('Converted metric');

    // Check that the name has been updated in the panel
    const panel = dashboard.getPanelByEmbeddableId(
      testData.ESQL_CONVERSION_PANEL_IDS.INLINE_METRIC
    );
    await expect(panel).toContainText('Converted metric');

    await lens.workspace.secondaryFlyoutBackButton.click();

    await applyLensInlineEditorAndWaitClosed({ lens });

    // The "Apply and close" button is disabled when there are no unsaved changes
    await openInlineEditorAndWaitVisible(
      pageObjects,
      testData.ESQL_CONVERSION_PANEL_IDS.INLINE_METRIC
    );
    await expect(page.getByText('ES|QL Query Results')).toBeVisible();
    await expect(lens.applyFlyoutButton).toBeDisabled();
  });

  test('converts eligible data layers and preserves annotation and reference layers', async ({
    pageObjects,
    page,
  }) => {
    const { dashboard, lens } = pageObjects;

    await openInlineEditorAndWaitVisible(
      pageObjects,
      testData.ESQL_CONVERSION_PANEL_IDS.MULTI_LAYER
    );
    await convertToEsqlViaModal({ pageObjects, page, selectAllLayers: true });

    expect(await lens.layers.getLayerCount()).toBe(4);
    expect(await lens.workspace.getEsqlQuery()).toContain('STATS COUNT(*)');

    await lens.layers.activateLayerTab(1);
    expect(await lens.workspace.getEsqlQuery()).toContain('STATS MEDIAN(bytes)');

    await lens.layers.activateLayerTab(2);
    await expect(page.testSubj.locator('InlineEditingESQLEditor')).toBeHidden();
    await expect(lens.dimensions.getDimensionTriggersLocator('lnsXY_xAnnotationsPanel')).toHaveText(
      'Event'
    );

    await lens.layers.activateLayerTab(3);
    await expect(page.testSubj.locator('InlineEditingESQLEditor')).toBeHidden();
    expect(await lens.dimensions.getDimensionTriggerText('lnsXY_yReferenceLineLeftPanel')).toMatch(
      /^Static value: /
    );

    const panel = dashboard.getPanelByEmbeddableId(testData.ESQL_CONVERSION_PANEL_IDS.MULTI_LAYER);
    await expect(panel.getByRole('button', { name: /Count of records/ })).toBeVisible();
    await expect(panel.getByRole('button', { name: /Median of bytes/ })).toBeVisible();
    await expect(page.testSubj.locator('embeddableError')).toHaveCount(0);

    await applyLensInlineEditorAndWaitClosed({ lens });
    await openInlineEditorAndWaitVisible(
      pageObjects,
      testData.ESQL_CONVERSION_PANEL_IDS.MULTI_LAYER
    );
    expect(await lens.layers.getLayerCount()).toBe(4);
    expect(await lens.workspace.getEsqlQuery()).toContain('STATS COUNT(*)');
  });

  test('should disable Convert to ES|QL button when any data layer is unsupported', async ({
    pageObjects,
  }) => {
    // Partial conversion would leave a form-based data layer alongside text-based
    // ones, an invalid mixed state, so a single unsupported data layer
    // (here: "Include empty rows" on the bar layer) disables the conversion.
    await openInlineEditorAndWaitVisible(
      pageObjects,
      testData.ESQL_CONVERSION_PANEL_IDS.PARTIAL_MULTI_LAYER
    );
    await expect(pageObjects.lens.workspace.convertToEsqlButton).toBeDisabled();
  });

  test('should correctly cancel the conversion and close the flyout', async ({
    pageObjects,
    page,
  }) => {
    const { lens } = pageObjects;

    await openInlineEditorAndWaitVisible(
      pageObjects,
      testData.ESQL_CONVERSION_PANEL_IDS.INLINE_METRIC
    );

    await convertToEsqlViaModal({ pageObjects, page });

    await cancelLensInlineEditorAndWaitClosed({ lens });

    // Reopen and verify revert: form-based mode with Convert button visible
    await openInlineEditorAndWaitVisible(
      pageObjects,
      testData.ESQL_CONVERSION_PANEL_IDS.INLINE_METRIC
    );
    await expect(lens.workspace.convertToEsqlButton).toBeEnabled();
    await expect(page.getByTestId('ESQLEditor')).toBeHidden();
  });

  test('should disable Convert to ES|QL button for visualizations saved to library', async ({
    pageObjects,
  }) => {
    await openInlineEditorAndWaitVisible(
      pageObjects,
      testData.ESQL_CONVERSION_PANEL_IDS.SAVED_METRIC
    );
    await expect(pageObjects.lens.workspace.convertToEsqlButton).toBeDisabled();
  });

  test('should disable Convert to ES|QL button when the chart has query-based annotations', async ({
    pageObjects,
    page,
  }) => {
    const { lens } = pageObjects;

    await openInlineEditorAndWaitVisible(
      pageObjects,
      testData.ESQL_CONVERSION_PANEL_IDS.MULTI_LAYER
    );
    await expect(lens.workspace.convertToEsqlButton).toBeEnabled();

    // Turn the fixture's manual annotation into a query-based one; query annotations
    // are not yet supported on ES|QL charts, so this must gate the conversion.
    await lens.layers.activateLayerTab(2);
    await lens.dimensions.openDimensionEditor('lnsXY_xAnnotationsPanel > lns-dimensionTrigger', 2);
    await page.testSubj.click('lnsXY_annotation_query');
    await lens.style.configureQueryAnnotation({ queryString: '*', timeField: 'utc_time' });
    await lens.closeDimensionEditor();

    await expect(lens.workspace.convertToEsqlButton).toBeDisabled();

    await cancelLensInlineEditorAndWaitClosed({ lens });
  });
});
