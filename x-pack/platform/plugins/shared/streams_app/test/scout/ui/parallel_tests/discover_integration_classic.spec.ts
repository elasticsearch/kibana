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

const CLASSIC_STREAM_NAME = 'logs-generic-dataset';

test.describe(
  'Discover integration - Classic Stream - Navigate to Stream processing from document flyout',
  { tag: tags.serverless.observability.all },
  () => {
    test.beforeAll(async ({ logsSynthtraceEsClient }) => {
      // Generate logs data for a classic stream
      await generateLogsData(logsSynthtraceEsClient)({
        index: CLASSIC_STREAM_NAME,
        startTime: 'now-15m',
        endTime: 'now',
        defaults: { 'stream.name': CLASSIC_STREAM_NAME },
      });
    });

    test.afterAll(async ({ apiServices, logsSynthtraceEsClient }) => {
      await apiServices.streams.deleteStream(CLASSIC_STREAM_NAME);
      await logsSynthtraceEsClient.clean();
    });

    test('should navigate to Stream processing page from Discover document flyout in Data view mode', async ({
      browserAuth,
      pageObjects,
      page,
    }) => {
      await browserAuth.loginAsAdmin();

      // Navigate to Discover and wait for the page to be ready
      await pageObjects.discover.goto({ queryMode: 'classic' });
      await pageObjects.discover.waitUntilSearchingHasFinished();
      await pageObjects.discover.waitForHistogramRendered();

      await pageObjects.discover.selectDataView('All logs');
      await pageObjects.discover.waitUntilSearchingHasFinished();
      await pageObjects.dataGrid.waitForDocTableRendered();

      await pageObjects.dataGrid.openDocumentDetails({ rowIndex: 0 });

      // Verify the doc viewer flyout is open
      await pageObjects.dataGrid.waitForDocViewerFlyoutOpen();

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
        new RegExp(`streams/${CLASSIC_STREAM_NAME}/management/processing`)
      );

      // Verify the data source is correctly configured to show the Discover document
      const dataSourcesSelector = await pageObjects.streams.getDataSourcesSelector();
      await expect(dataSourcesSelector).toContainText(
        `Discover document from ${CLASSIC_STREAM_NAME}`
      );
    });

    test('should navigate to Stream processing page from Discover document flyout in ES|QL mode', async ({
      browserAuth,
      pageObjects,
      page,
    }) => {
      await browserAuth.loginAsAdmin();

      // Navigate to Discover and wait for the page to be ready
      await pageObjects.discover.goto({ queryMode: 'classic' });
      await pageObjects.discover.waitUntilSearchingHasFinished();
      await pageObjects.discover.waitForHistogramRendered();

      await pageObjects.discover.selectDataView('All logs');
      await pageObjects.discover.waitUntilSearchingHasFinished();

      // Switch to ES|QL mode by clicking the button
      await pageObjects.discover.selectTextBaseLang();

      // Wait for ES|QL results to load
      await pageObjects.discover.waitUntilSearchingHasFinished();
      await pageObjects.dataGrid.waitForDocTableRendered();

      await pageObjects.dataGrid.openDocumentDetails({ rowIndex: 0 });

      // Verify the doc viewer flyout is open
      await pageObjects.dataGrid.waitForDocViewerFlyoutOpen();

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
        new RegExp(`streams/${CLASSIC_STREAM_NAME}/management/processing`)
      );

      // Verify the data source is correctly configured
      // In ES|QL mode, the document doesn't have an _id, so it creates a custom samples data source
      const dataSourcesSelector = await pageObjects.streams.getDataSourcesSelector();
      await expect(dataSourcesSelector).toContainText(
        `Discover document from ${CLASSIC_STREAM_NAME}`
      );
    });
  }
);
