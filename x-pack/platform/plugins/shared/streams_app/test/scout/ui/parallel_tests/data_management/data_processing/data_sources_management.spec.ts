/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/* eslint-disable playwright/expect-expect */

import { expect } from '@kbn/scout/ui';
import { tags } from '@kbn/scout';
import { test } from '../../../fixtures';
import { DATE_RANGE, generateLogsData } from '../../../fixtures/generators';

test.describe(
  'Stream data processing - data sources management',
  { tag: [...tags.stateful.classic, ...tags.serverless.observability.complete] },
  () => {
    test.beforeAll(async ({ logsSynthtraceEsClient }) => {
      await generateLogsData(logsSynthtraceEsClient)({ index: 'logs-generic-default' });
    });

    test.beforeEach(async ({ apiServices, browserAuth, pageObjects }) => {
      await browserAuth.loginAsAdmin();
      // Clear existing processors before each test
      await apiServices.streams.clearStreamProcessors('logs-generic-default');

      await pageObjects.streams.gotoProcessingTab('logs-generic-default');
    });

    test.afterAll(async ({ apiServices, logsSynthtraceEsClient }) => {
      await apiServices.streams.clearStreamProcessors('logs-generic-default');
      await logsSynthtraceEsClient.clean();
    });

    test('should load by default a latest samples data source', async ({ pageObjects }) => {
      await expect(pageObjects.streams.getDataSourcesList()).toBeVisible();
      const dataSourcesSelector = await pageObjects.streams.getDataSourcesSelector();
      await expect(dataSourcesSelector).toHaveText('Latest samplesPartial');
    });

    test('should allow adding a new kql data source', async ({ page, pageObjects }) => {
      await pageObjects.streams.clickManageDataSourcesButton();
      await pageObjects.streams.addDataSource('kql');
      // Scope interactions to the KQL data source card to avoid conflicts with other data sources (e.g., failure store)
      const kqlDataSourceCard = page.getByTestId('streamsAppKqlSamplesDataSourceCard');
      await kqlDataSourceCard
        .getByTestId('streamsAppKqlSamplesDataSourceNameField')
        .fill('Kql Samples');
      // Set date range within the KQL data source card. The page object opens
      // the picker (legacy or new) and clicks Apply for both variants.
      await pageObjects.datePicker.setAbsoluteRangeInRootContainer({
        from: DATE_RANGE.from,
        to: DATE_RANGE.to,
        containerLocator: kqlDataSourceCard,
      });
      await pageObjects.datePicker.waitToBeHidden();
      await kqlDataSourceCard
        .getByTestId('unifiedQueryInput')
        .getByRole('textbox')
        .fill('log.level: warn');
      await kqlDataSourceCard.getByTestId('querySubmitButton').click();

      // Assert that the custom samples are correctly displayed in the preview
      await pageObjects.streams.closeFlyout();
      await pageObjects.streams.switchToColumnsView();
      const rows = await pageObjects.streams.getPreviewTableRows();
      for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
        await pageObjects.streams.expectCellValueContains({
          columnName: 'log.level',
          rowIndex,
          value: 'warn',
        });
      }
    });

    test('should allow adding a new custom data source', async ({ page, pageObjects }) => {
      await pageObjects.streams.clickManageDataSourcesButton();
      await pageObjects.streams.addDataSource('custom');
      await page.getByTestId('streamsAppCustomSamplesDataSourceNameField').fill('Custom Samples');
      await pageObjects.streams.fillCustomSamplesEditor(
        '[{"@timestamp": "2023-01-01T00:00:00.000Z", "message": "Sample log 1"}]'
      );

      // Assert that the custom samples are correctly displayed in the preview
      await pageObjects.streams.closeFlyout();
      const dataSourcesSelector = await pageObjects.streams.getDataSourcesSelector();
      await expect(dataSourcesSelector).toHaveText('Custom SamplesComplete');
    });

    test('should persist existing data sources on page reload', async ({ page, pageObjects }) => {
      // Create a new kql data source and assert existence on refresh
      await pageObjects.streams.clickManageDataSourcesButton();
      await pageObjects.streams.addDataSource('kql');
      await page.getByTestId('streamsAppKqlSamplesDataSourceNameField').fill('Kql Samples');
      await page.waitForURL(/Kql%20Samples/);
      await page.reload();
      await expect(await pageObjects.streams.getDataSourcesSelector()).toHaveText(
        'Kql SamplesPartial'
      );

      // Create a new custom data source and assert existence on refresh
      await pageObjects.streams.clickManageDataSourcesButton();
      await pageObjects.streams.addDataSource('custom');
      await page.getByTestId('streamsAppCustomSamplesDataSourceNameField').fill('Custom Samples');
      await page.waitForURL(/Custom%20Samples/);
      await page.reload();
      await expect(await pageObjects.streams.getDataSourcesSelector()).toHaveText(
        'Custom SamplesComplete'
      );
    });
  }
);
