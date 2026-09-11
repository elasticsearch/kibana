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
import { CASES_ALL_WITH_ALERTS_ROLE } from '../../fixtures/roles';

// Ported from the "When user has all privileges for cases" suite in the FTR
// pages/alerts/add_to_case.ts. A user with cases write privileges sees the
// add-to-case row action and can open the case selector.
test.describe(
  'Observability alerts - add to case (all privileges)',
  { tag: [...tags.stateful.classic, ...tags.serverless.observability.complete] },
  () => {
    test.beforeAll(async ({ esClient }) => {
      await generateObservabilityAlerts(esClient);
    });

    test.beforeEach(async ({ browserAuth, pageObjects }) => {
      await browserAuth.loginWithCustomRole(CASES_ALL_WITH_ALERTS_ROLE);
      await pageObjects.alertsTablePage.goto();
    });

    test.afterAll(async ({ apiServices }) => {
      await apiServices.cases.cleanup.deleteAllCases();
    });

    test('renders the case action in the row actions menu', async ({ pageObjects }) => {
      const { alertsTablePage } = pageObjects;
      await alertsTablePage.waitForTableToLoad();
      await alertsTablePage.openActionsMenuForRow(0);
      await expect(alertsTablePage.addToCaseAction).toBeVisible();
    });

    test('opens the case selector from "Add to case"', async ({ pageObjects }) => {
      const { alertsTablePage } = pageObjects;
      await alertsTablePage.waitForTableToLoad();
      await alertsTablePage.openActionsMenuForRow(0);
      await alertsTablePage.clickAddToCase();
      await expect(alertsTablePage.addToExistingCaseModal).toBeVisible();
    });
  }
);
