/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { expect } from '@kbn/scout/ui';
import { tags } from '@kbn/scout';
import { test } from '../fixtures';
import { generateLogsData } from '../fixtures/generators';

const WIRED_STREAM_NAME = 'logs.otel.child';

test.describe(
  'Discover integration - Wired Stream - Navigate to Stream processing from document flyout',
  { tag: tags.serverless.observability.all },
  () => {
    test.beforeAll(async ({ apiServices, logsSynthtraceEsClient }) => {
      // Create a wired stream
      await apiServices.streams.forkStream('logs.otel', WIRED_STREAM_NAME, {
        always: {},
      });
      // Generate logs data for the wired stream
      await generateLogsData(logsSynthtraceEsClient)({
        index: 'logs.otel',
        startTime: 'now-15m',
        endTime: 'now',
      });
    });

    test.afterAll(async ({ apiServices, logsSynthtraceEsClient }) => {
      await apiServices.streams.deleteStream(WIRED_STREAM_NAME);
      await logsSynthtraceEsClient.clean();
    });

    test('should navigate to Stream processing page from Discover document flyout in Data view mode', async ({
      browserAuth,
      pageObjects,
      page,
    }) => {
      await browserAuth.loginAsAdmin();

      // Navigate to Discover
      await pageObjects.discover.goto({ queryMode: 'classic' });
      // Select the data view for our test stream
      await pageObjects.discover.selectDataView('logs.otel.child');
      await pageObjects.discover.waitUntilSearchingHasFinished();
      await pageObjects.dataGrid.waitForDocTableRendered();

      // Refresh and wait for the row — stream routing may take time
      await page.testSubj.click('querySubmitButton');
      await pageObjects.discover.waitUntilSearchingHasFinished();
      await pageObjects.dataGrid.waitForDocTableRendered();

      await pageObjects.dataGrid.openDocumentDetails({ rowIndex: 0 });

      // Verify the doc viewer flyout is open
      await expect(page.getByTestId('kbnDocViewer')).toBeVisible();

      // Click on the Log Overview tab
      const logOverviewTab = page.getByTestId('docViewerTab-doc_view_logs_overview');
      await expect(logOverviewTab).toBeVisible();
      await logOverviewTab.click();

      // Find and click the "Parse content in Streams" link
      const parseInStreamsLink = page.getByRole('link', { name: /parse content in streams/i });
      await expect(parseInStreamsLink).toBeVisible();
      await parseInStreamsLink.click();

      // Verify we are on the stream processing page
      await expect(page).toHaveURL(
        new RegExp(`streams/${WIRED_STREAM_NAME}/management/processing`)
      );

      // Verify the data source is correctly configured to show the Discover document
      const dataSourcesSelector = await pageObjects.streams.getDataSourcesSelector();
      await expect(dataSourcesSelector).toContainText(
        `Discover document from ${WIRED_STREAM_NAME}`
      );
    });

    test('should navigate to Stream processing page from Discover document flyout in ES|QL mode', async ({
      browserAuth,
      pageObjects,
      page,
    }) => {
      await browserAuth.loginAsAdmin();

      // Navigate to Discover
      await pageObjects.discover.goto({ queryMode: 'classic' });
      await pageObjects.discover.waitUntilFieldListHasCountOfFields();
      await pageObjects.discover.selectDataView('logs.otel.child');
      await expect(pageObjects.discover.getSelectedDataView()).toHaveText('logs.otel.child');
      await pageObjects.discover.waitUntilFieldListHasCountOfFields();

      // Switch to ES|QL mode by clicking the button and waiting for doc table to load
      await pageObjects.discover.selectTextBaseLang();

      await pageObjects.dataGrid.openDocumentDetails({ rowIndex: 0 });

      // Verify the doc viewer flyout is open
      await expect(page.getByTestId('kbnDocViewer')).toBeVisible();

      // Click on the Log Overview tab
      const logOverviewTab = page.getByTestId('docViewerTab-doc_view_logs_overview');
      await expect(logOverviewTab).toBeVisible();
      await logOverviewTab.click();

      // Find and click the "Parse content in Streams" link
      const parseInStreamsLink = page.getByRole('link', { name: /parse content in streams/i });
      await expect(parseInStreamsLink).toBeVisible();
      await parseInStreamsLink.click();

      // Verify we are on the stream processing page
      await expect(page).toHaveURL(
        new RegExp(`streams/${WIRED_STREAM_NAME}/management/processing`)
      );

      // Verify the data source is correctly configured
      // In ES|QL mode, the document doesn't have an _id, so it creates a custom samples data source
      const dataSourcesSelector = await pageObjects.streams.getDataSourcesSelector();
      await expect(dataSourcesSelector).toContainText(
        `Discover document from ${WIRED_STREAM_NAME}`
      );
    });
  }
);
