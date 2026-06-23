/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { tags } from '@kbn/scout-oblt';
import { expect } from '@kbn/scout-oblt/ui';
import { test } from '../../fixtures';
import { generateObservabilityAlerts } from '../../fixtures/alerts_data';

// Ported from the FTR `Observability alerts page / State synchronization` suite
// (x-pack/solutions/observability/test/observability_functional/apps/observability/pages/alerts/state_synchronization.ts).
//
// Only the deterministic URL<->UI hydration cases are ported here. The three
// "shared time range" cases (sync to/from the overview page) are intentionally
// deferred: they require the oblt solution-view sidebar (`spaceTest` +
// `scoutSpace.setSolutionView('oblt')`) for cross-app SPA navigation plus a
// relative-range date-picker helper Scout does not yet provide, and porting
// them under the classic harness would be flaky. Tracked in the migration plan.
test.describe(
  'Observability alerts - URL state synchronization',
  { tag: [...tags.stateful.classic] },
  () => {
    test.beforeAll(async ({ esClient }) => {
      await generateObservabilityAlerts(esClient);
    });

    test.beforeEach(async ({ browserAuth }) => {
      await browserAuth.loginAsViewer();
    });

    test('hydrates the query bar and time range from the URL', async ({ pageObjects }) => {
      const { alertsTablePage, datePicker } = pageObjects;
      const kuery = 'kibana.alert.evaluation.threshold > 75';

      await alertsTablePage.gotoWithAppState({
        kuery,
        rangeFrom: 'now-30d',
        rangeTo: 'now-10d',
      });

      await expect(alertsTablePage.queryInput).toHaveValue(kuery);
      // The legacy picker humanises this relative-to-relative range as
      // "~ a month ago - ~ 10 days ago"; the new DateRangePicker formats each
      // bound separately as "30 days ago → 10 days ago".
      await expect
        .poll(() => datePicker.getTimeRangeText())
        .toMatch(/^(~ a month ago - ~ 10 days ago|30 days ago → 10 days ago)$/);
    });

    test('applies defaults when the URL carries no state', async ({ pageObjects }) => {
      const { alertsTablePage, datePicker } = pageObjects;

      await alertsTablePage.goto({ withoutFilter: true });

      await expect(alertsTablePage.queryInput).toHaveValue('');
      // "Last 24 hours" is a preset in both pickers, so the label is identical.
      await expect.poll(() => datePicker.getTimeRangeText()).toBe('Last 24 hours');
    });
  }
);
