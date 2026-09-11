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
import { CASES_READ_WITH_ALERTS_ROLE } from '../../fixtures/roles';

// Ported from the "When user has read permissions for cases" suite in the FTR
// pages/alerts/add_to_case.ts. A user with read-only cases privileges does not
// see the add-to-case row actions.
test.describe(
  'Observability alerts - add to case (read-only)',
  { tag: [...tags.stateful.classic, ...tags.serverless.observability.complete] },
  () => {
    test.beforeAll(async ({ esClient }) => {
      await generateObservabilityAlerts(esClient);
    });

    test.beforeEach(async ({ browserAuth, pageObjects }) => {
      await browserAuth.loginWithCustomRole(CASES_READ_WITH_ALERTS_ROLE);
      await pageObjects.alertsTablePage.goto();
    });

    test('does not render the case options in the row actions menu', async ({ pageObjects }) => {
      const { alertsTablePage } = pageObjects;
      await alertsTablePage.waitForTableToLoad();
      // The actions menu still opens (other actions remain available), but the
      // case options must be absent for a read-only cases user.
      await alertsTablePage.openActionsMenuForRow(0);
      await expect(alertsTablePage.actionsMenu).toBeVisible();
      await expect(alertsTablePage.addToCaseAction).toBeHidden();
    });
  }
);
