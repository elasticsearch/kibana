/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { tags } from '@kbn/scout-oblt';
import { expect } from '@kbn/scout-oblt/ui';
import { test } from '../../fixtures';
import { ALERT_COUNTS, ALERT_STATUS_CONTROL_ID } from '../../fixtures/constants';
import { generateObservabilityAlerts } from '../../fixtures/alerts_data';

// Ported from the `Alerts table` describe of the FTR `Observability alerts` suite
// (x-pack/solutions/observability/test/observability_functional/apps/observability/pages/alerts/index.ts).
// The FTR suite asserted cell counts (rows x columns); here we assert the alert
// (row) counts directly. The vestigial sample-data + custom-threshold-rule setup
// from the FTR `before` hook is dropped: the assertions only depend on the
// generated alerts, not on a live rule.
test.describe(
  'Observability alerts - table & query bar',
  { tag: [...tags.stateful.classic] },
  () => {
    test.beforeAll(async ({ esClient }) => {
      await generateObservabilityAlerts(esClient);
    });

    test.beforeEach(async ({ browserAuth, pageObjects }) => {
      await browserAuth.loginAsViewer();
      await pageObjects.alertsTablePage.goto();
      // Start every scenario from the full, unfiltered set of alerts.
      await pageObjects.alertControls.clearControlSelections(ALERT_STATUS_CONTROL_ID);
      await pageObjects.alertsTablePage.waitForTableToLoad();
    });

    test('renders the alerts table with every alert', async ({ pageObjects }) => {
      await expect(pageObjects.alertsTablePage.table).toBeVisible();
      await expect.poll(() => pageObjects.alertsTablePage.getRowCount()).toBe(ALERT_COUNTS.ALL);
    });

    test('filters alerts by status through the query bar', async ({ pageObjects }) => {
      await pageObjects.alertsTablePage.submitQuery('kibana.alert.status: recovered');
      await expect
        .poll(() => pageObjects.alertsTablePage.getRowCount())
        .toBe(ALERT_COUNTS.RECOVERED);
    });

    test('shows the no-data state when a filter matches nothing', async ({ pageObjects }) => {
      await pageObjects.alertsTablePage.submitQuery('kibana.alert.consumer: uptime');
      await expect(pageObjects.alertsTablePage.noDataState).toBeVisible();
    });

    test('keeps the page usable when the query input is invalid', async ({ pageObjects }) => {
      await pageObjects.alertsTablePage.submitQuery('""""');
      await expect(pageObjects.alertsTablePage.errorToast).toBeVisible();
      // The page should keep showing the previous results instead of going blank.
      await expect(pageObjects.alertsTablePage.pageWithData).toBeVisible();
    });

    test('applies date picker selections', async ({ pageObjects }) => {
      const { alertsTablePage, datePicker } = pageObjects;
      // The generated alerts are timestamped in 2021, so narrowing the window to
      // the last 15 minutes leaves the table with nothing to show.
      await alertsTablePage.submitQuery('kibana.alert.status: recovered');
      // Pass the legacy "commonly used" form; the shared picker PO normalises it
      // to the new DateRangePicker's preset test-subject when that picker is active.
      await datePicker.setCommonlyUsedTime('Last_15 minutes');
      await alertsTablePage.waitForTableToLoad();
      await expect(alertsTablePage.noDataState).toBeVisible();
    });
  }
);
