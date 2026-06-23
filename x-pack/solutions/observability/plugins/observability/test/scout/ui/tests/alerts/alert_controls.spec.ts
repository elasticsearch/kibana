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

// Ported from the FTR `Alert controls` suite
// (x-pack/solutions/observability/test/observability_functional/apps/observability/pages/alerts/alert_controls.ts).
// The three FTR `it` blocks shared a single browser journey (each step mutated the
// status control and re-checked the row count), so they are combined into one test
// with `test.step` boundaries.
// Failing: See https://github.com/elastic/kibana/issues/274168
test.describe.skip(
  'Observability alerts - status controls',
  { tag: [...tags.stateful.classic] },
  () => {
    test.beforeAll(async ({ esClient }) => {
      await generateObservabilityAlerts(esClient);
    });

    test.beforeEach(async ({ browserAuth, pageObjects }) => {
      await browserAuth.loginAsViewer();
      await pageObjects.alertsTablePage.goto();
    });

    test('filters the alerts table by status', async ({ pageObjects }) => {
      const { alertsTablePage, alertControls } = pageObjects;

      await test.step('is filtered to only show active alerts by default', async () => {
        await expect.poll(() => alertsTablePage.getRowCount()).toBe(ALERT_COUNTS.ACTIVE);
      });

      await test.step('shows all alerts once the status filter is cleared', async () => {
        await alertControls.clearControlSelections(ALERT_STATUS_CONTROL_ID);
        await alertsTablePage.waitForTableToLoad();
        await expect.poll(() => alertsTablePage.getRowCount()).toBe(ALERT_COUNTS.ALL);
      });

      await test.step('shows only recovered alerts when selected via the filter', async () => {
        await alertControls.openOptionsListPopover(ALERT_STATUS_CONTROL_ID);
        await alertControls.selectOption('recovered');
        await alertControls.ensurePopoverIsClosed(ALERT_STATUS_CONTROL_ID);
        await alertsTablePage.waitForTableToLoad();
        await expect.poll(() => alertsTablePage.getRowCount()).toBe(ALERT_COUNTS.RECOVERED);
      });
    });
  }
);
