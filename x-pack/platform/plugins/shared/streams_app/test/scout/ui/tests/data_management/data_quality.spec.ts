/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { expect } from '@kbn/scout/ui';
import { tags } from '@kbn/scout';
import { test } from '../../fixtures';
import { generateLogsData } from '../../fixtures/generators';
import { saveFailureStoreChanges } from '../../fixtures/data_lifecycle_helpers';

const TEST_STREAM = 'logs-nginx-default';

test.describe(
  'Stream data quality',
  { tag: [...tags.stateful.classic, ...tags.serverless.observability.complete] },
  () => {
    test.beforeAll(async ({ apiServices, logsSynthtraceEsClient }) => {
      const currentTime = Date.now();
      const generateLogs = generateLogsData(logsSynthtraceEsClient);

      // Create a test stream with routing rules first
      await apiServices.streams.forkStream('logs.otel', 'logs.otel.nginx', {
        field: 'service.name',
        eq: 'nginx',
      });

      // Generate some normal logs
      await generateLogs({
        index: TEST_STREAM,
        startTime: new Date(currentTime - 5 * 60 * 1000).toISOString(),
        endTime: new Date(currentTime).toISOString(),
        docsPerMinute: 10,
        isMalformed: false,
      });

      // Generate some malformed logs to create degraded fields
      await generateLogs({
        index: TEST_STREAM,
        startTime: new Date(currentTime - 60 * 1000).toISOString(),
        endTime: new Date(currentTime).toISOString(),
        docsPerMinute: 1,
        isMalformed: true,
      });

      // Add a processor that always fails to create failed docs
      await apiServices.streams.updateStreamProcessors(TEST_STREAM, {
        steps: [
          {
            action: 'rename',
            from: 'non_existent_field',
            to: 'renamed_field',
            ignore_missing: false,
            override: false,
          },
        ],
      });

      // Add 1 failed doc
      await generateLogs({
        index: TEST_STREAM,
        startTime: new Date(currentTime - 60 * 1000).toISOString(),
        endTime: new Date(currentTime).toISOString(),
        docsPerMinute: 1,
      });
    });

    test.beforeEach(async ({ browserAuth, pageObjects }) => {
      await browserAuth.loginAsAdmin();
      await pageObjects.streams.gotoDataQualityTab(TEST_STREAM);
    });

    test.afterAll(async ({ apiServices, logsSynthtraceEsClient }) => {
      // Clear existing rules
      await apiServices.streams.clearStreamChildren('logs.otel');
      // Clean up the test stream
      await apiServices.streams.deleteStream(TEST_STREAM);
      // Clean up synthetic logs
      await logsSynthtraceEsClient.clean();
    });

    test('should show data quality metrics', async ({ page }) => {
      // Degraded and failed documents metrics should be visible
      await expect(
        page.getByTestId('datasetQualityDetailsSummaryKpiCard-Degraded documents')
      ).toBeVisible();
      await expect(
        page.getByTestId('datasetQualityDetailsSummaryKpiCard-Failed documents')
      ).toBeVisible();

      // Edit failure store button should not be visible for wired streams
      await page.getByTestId('datasetQualityDetailsSummaryKpiCard-Failed documents').click();
      await expect(page.getByTestId('datasetQualityDetailsEditFailureStore')).toBeVisible();

      // Quality issues table should be visible
      await expect(page.getByTestId('datasetQualityDetailsDegradedFieldTable')).toBeVisible();
    });

    test('date picker should show same time range as Streams Main page', async ({
      pageObjects,
    }) => {
      // Go to Main page
      await pageObjects.streams.gotoStreamMainPage();
      const mainTimeRange = {
        from: 'Sep 20, 2023 @ 00:00:00.000',
        to: 'Sep 20, 2023 @ 00:30:00.000',
      };
      // Change date picker
      await pageObjects.datePicker.setAbsoluteRange(mainTimeRange);

      // Go to Data Quality tab
      await pageObjects.streams.clickStreamNameLink('logs.otel.nginx');
      await pageObjects.streams.clickDataQualityTab();
      await pageObjects.streams.verifyDatePickerTimeRange(mainTimeRange);
    });

    test('changing time range should also update date picker on Streams Main page', async ({
      pageObjects,
    }) => {
      const dataQualityTimeRange = {
        from: 'Sep 20, 2023 @ 00:00:00.000',
        to: 'Sep 20, 2023 @ 00:30:00.000',
      };
      await pageObjects.datePicker.setAbsoluteRange(dataQualityTimeRange);

      // Go to Streams main page
      await pageObjects.streams.clickStreamsBreadcrumb();
      await pageObjects.streams.verifyDatePickerTimeRange(dataQualityTimeRange);
    });

    test('time range should persist after page refresh on Data Quality tab', async ({
      page,
      pageObjects,
    }) => {
      const timeRange = {
        from: 'Sep 20, 2023 @ 00:00:00.000',
        to: 'Sep 20, 2023 @ 00:30:00.000',
      };
      // Set time range
      await pageObjects.datePicker.setAbsoluteRange(timeRange);

      // Refresh the page
      await page.reload();

      // Verify time range persisted after refresh
      await pageObjects.streams.verifyDatePickerTimeRange(timeRange);
    });

    test('time range should persist after page refresh on Retention tab', async ({
      page,
      pageObjects,
    }) => {
      const timeRange = {
        from: 'Sep 20, 2023 @ 00:00:00.000',
        to: 'Sep 20, 2023 @ 00:30:00.000',
      };
      // Go to Retention tab
      await pageObjects.streams.clickRetentionTab();
      // Scroll to date picker within the first ingestion rate panel
      // eslint-disable-next-line playwright/no-nth-methods
      const firstIngestionRatePanel = page.testSubj.locator('ingestionRatePanel').first();
      await expect(firstIngestionRatePanel).toBeVisible();
      await firstIngestionRatePanel.scrollIntoViewIfNeeded();

      // Set time range within the ingestion rate panel container
      await pageObjects.datePicker.setAbsoluteRangeInRootContainer({
        to: timeRange.to,
        from: timeRange.from,
        containerLocator: firstIngestionRatePanel,
      });

      // Verify time range is displayed correctly on Retention tab
      await pageObjects.streams.verifyDatePickerTimeRange(timeRange);

      // Refresh the page
      await page.reload();

      // Verify time range persisted after refresh
      await pageObjects.streams.verifyDatePickerTimeRange(timeRange);
    });

    test('time range should be globally synced across all tabs', async ({ pageObjects }) => {
      const timeRange = {
        from: 'Sep 20, 2023 @ 00:00:00.000',
        to: 'Sep 20, 2023 @ 00:30:00.000',
      };

      // Set time on Data Quality tab
      await pageObjects.datePicker.setAbsoluteRange(timeRange);

      // Verify on Retention tab
      await pageObjects.streams.clickRetentionTab();
      await pageObjects.streams.verifyDatePickerTimeRange(timeRange);

      // Verify on Main page
      await pageObjects.streams.clickStreamsBreadcrumb();
      await pageObjects.streams.verifyDatePickerTimeRange(timeRange);

      // Navigate to a different stream and verify time persists
      await pageObjects.streams.clickStreamNameLink('logs.otel.nginx');
      await pageObjects.streams.clickDataQualityTab();
      await pageObjects.streams.verifyDatePickerTimeRange(timeRange);
    });

    test('should toggle between degraded and failed docs quality issues charts', async ({
      page,
    }) => {
      // Default chart should be for degraded docs
      await expect(page.getByTestId('datasetQualityDetailsLinkToDiscover')).toBeVisible();

      // Click to show failed docs chart
      await page.getByTestId('datasetQualityDetailsSummaryKpiCard-Failed documents').click();
    });

    test('should show degraded fields table with data', async ({ page }) => {
      // Quality issues table should be visible
      const degradedFieldTable = page.getByTestId('datasetQualityDetailsDegradedFieldTable');
      await expect(degradedFieldTable).toBeVisible();

      // Should show table headers (scope to the table to avoid ambiguity)
      await expect(degradedFieldTable.getByRole('columnheader', { name: 'Field' })).toBeVisible();
      await expect(
        degradedFieldTable.getByRole('columnheader', { name: 'Documents' })
      ).toBeVisible();
      await expect(degradedFieldTable.getByRole('columnheader', { name: 'Issue' })).toBeVisible();
      await expect(
        degradedFieldTable.getByRole('columnheader', { name: 'Last occurred' })
      ).toBeVisible();

      // Verify there is at least one degraded field row
      const degradedFieldRows = degradedFieldTable.locator('tbody tr');
      expect(await degradedFieldRows.count()).toBeGreaterThan(0);

      // Verify the log.level field is present (from malformed data)
      await expect(
        degradedFieldTable.getByRole('row').filter({ hasText: 'log.level' })
      ).toBeVisible();
    });

    test('should open and close degraded field flyout', async ({ page, pageObjects }) => {
      // Wait for degraded fields table to be visible
      const degradedFieldTable = page.getByTestId('datasetQualityDetailsDegradedFieldTable');
      await expect(degradedFieldTable).toBeVisible();

      // Get the row for log.level field (which we created as malformed)
      const logLevelRow = degradedFieldTable.getByRole('row').filter({ hasText: 'log.level' });
      await expect(logLevelRow).toBeVisible();

      // Click on the expand button for log.level
      await logLevelRow.locator('button[aria-label="Expand"]').click();

      // Flyout should be visible
      await expect(page.getByTestId('datasetQualityDetailsDegradedFieldFlyout')).toBeVisible();

      // Verify flyout shows the field name
      await expect(page.getByTestId('datasetQualityDetailsDegradedFieldFlyout')).toContainText(
        'log.level'
      );

      // Close the flyout
      await pageObjects.streams.closeFlyout();

      // Flyout should be hidden
      await expect(page.getByTestId('datasetQualityDetailsDegradedFieldFlyout')).toBeHidden();
    });

    test('should navigate to Discover from degraded field flyout', async ({ page }) => {
      // Wait for degraded fields table to be visible
      const degradedFieldTable = page.getByTestId('datasetQualityDetailsDegradedFieldTable');
      await expect(degradedFieldTable).toBeVisible();

      // Get the row for log.level field (which we created as malformed)
      const logLevelRow = degradedFieldTable.getByRole('row').filter({ hasText: 'log.level' });
      await expect(logLevelRow).toBeVisible();

      // Click on the expand button for log.level
      await logLevelRow.locator('button[aria-label="Expand"]').click();

      // Flyout should be visible and show the degraded field name
      const flyout = page.getByTestId('datasetQualityDetailsDegradedFieldFlyout');
      await expect(flyout).toBeVisible();
      await expect(flyout).toContainText('log.level');

      // Click the link to Discover in the flyout
      await page.getByTestId('datasetQualityDetailsDegradedFieldFlyoutTitleLinkToDiscover').click();

      // Should navigate to Discover in ES|QL mode with field-specific _ignored query
      await expect(page).toHaveURL(/.*\/app\/discover/);
      await expect(page).toHaveURL(/.*esql.*FROM.*MV_CONTAINS.*_ignored.*log\.level/);
    });

    test('should edit failure store for wired streams', async ({ page }) => {
      // Open failed documents panel
      await page.getByTestId('datasetQualityDetailsSummaryKpiCard-Failed documents').click();

      // Click the edit button to open the failure store modal
      await page.getByTestId('datasetQualityDetailsEditFailureStore').click();

      // Modal should be visible
      await expect(page.getByTestId('editFailureStoreModal')).toBeVisible();

      // Inherit failure store switch should be visible for wired streams
      await expect(page.getByTestId('inheritFailureStoreSwitch')).toBeVisible();

      // Toggle the inherit failure store switch
      await page.getByTestId('inheritFailureStoreSwitch').click();
      await saveFailureStoreChanges(page);

      // Verify the modal is closed
      await expect(page.getByTestId('editFailureStoreModal')).toBeHidden();
    });
  }
);
