/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ScoutPage } from '@kbn/scout-oblt';
import { tags } from '@kbn/scout-oblt';
import { expect } from '@kbn/scout-oblt/ui';
import { test } from '../fixtures';
import type { TriggersActionsPageObjects } from '../fixtures/page_objects';
import {
  ALERTS_WITH_LOGS_RULES_AND_CASES_ROLE,
  ALERTS_WITH_LOGS_RULES_ROLE,
  ALERTS_WITH_METRICS_RULES_ROLE,
} from '../fixtures/roles';
import {
  alertIdForRule,
  cleanRuleLinkRbacAlerts,
  ingestRuleLinkRbacAlerts,
} from '../fixtures/rule_link_rbac_data';

/**
 * RBAC behavior of the Observability alert *details* page.
 *
 * Some rule types register a customized alert details overview ("app section")
 * via their rule type model. The page only renders that custom section when the
 * user is authorized to read the specific rule type (and consumer) behind the
 * alert; otherwise it falls back to the generic alert overview. Because rule
 * read is authorized per rule type, a user that can read *some* rules but not
 * the one behind this alert must still get the generic overview, not the custom
 * one.
 *
 * The alert under test is a logs threshold alert (`logs.alert.document.count`),
 * a rule type that ships a custom section (`logsThresholdAlertDetailsPage`) and
 * is enabled for the alert details page. Two personas, both able to read every
 * observability alert, are exercised against it:
 *  - a user that can read logs rules (sees the custom section),
 *  - a user that can read metrics rules but not logs rules (sees the generic
 *    overview instead).
 */
test.describe(
  'Observability alert details page - rule type RBAC',
  { tag: [...tags.stateful.classic, ...tags.serverless.observability.complete] },
  () => {
    let logsAlertId: string;

    // Custom overview registered by the logs threshold rule type.
    const CUSTOM_SECTION_SUBJ = 'logsThresholdAlertDetailsPage';
    // Generic overview shown when the custom section cannot be rendered.
    const DEFAULT_OVERVIEW_SUBJ = 'overviewTabPanel';
    // Tabs that need rule data (rule read), hidden when the rule is unreadable.
    const RULE_DEPENDENT_TAB_SUBJS = ['investigationGuideTab', 'relatedDashboardsTab'];
    // The "Add to case" button's test subject is suffixed with the rule type id.
    const ADD_TO_CASE_SELECTOR = '[data-test-subj^="add-to-cases-button-"]';

    test.beforeAll(async ({ apiServices, esClient }) => {
      const { logsRuleId } = await ingestRuleLinkRbacAlerts({
        esClient,
        apiServices,
        timestamp: new Date().toISOString(),
      });
      // `ingestRuleLinkRbacAlerts` indexes the alert document with a deterministic
      // `_id` derived from the rule id, which is what the details page resolves.
      logsAlertId = alertIdForRule(logsRuleId);
    });

    test.afterAll(async ({ apiServices, esClient }) => {
      await cleanRuleLinkRbacAlerts({ esClient, apiServices });
    });

    /**
     * Navigates to the logs alert details page and waits for the tabbed content
     * to render (which only happens once the alert has loaded), so callers can
     * assert on the resolved overview/tabs deterministically.
     */
    const gotoLogsAlertDetails = async (
      pageObjects: TriggersActionsPageObjects,
      page: ScoutPage
    ) => {
      await expect(async () => {
        await pageObjects.alertPage.goto(logsAlertId);
        await expect(page.testSubj.locator('alertDetailsTabbedContent')).toBeVisible();
      }).toPass({ timeout: 60_000, intervals: [2_000] });
    };

    test('logs rule reader sees the custom alert details overview', async ({
      page,
      browserAuth,
      pageObjects,
    }) => {
      await browserAuth.loginWithCustomRole(ALERTS_WITH_LOGS_RULES_ROLE);

      await gotoLogsAlertDetails(pageObjects, page);

      await test.step('renders the rule-type custom overview section', async () => {
        await expect(page.testSubj.locator(CUSTOM_SECTION_SUBJ)).toBeVisible();
        await expect(page.testSubj.locator(DEFAULT_OVERVIEW_SUBJ)).toBeHidden();
      });

      await test.step('shows the rule-read dependent tabs', async () => {
        for (const tabSubj of RULE_DEPENDENT_TAB_SUBJS) {
          await expect(page.testSubj.locator(tabSubj)).toBeVisible();
        }
      });
    });

    test('metrics rule reader sees the generic overview for a logs alert', async ({
      page,
      browserAuth,
      pageObjects,
    }) => {
      await browserAuth.loginWithCustomRole(ALERTS_WITH_METRICS_RULES_ROLE);

      await gotoLogsAlertDetails(pageObjects, page);

      await test.step('falls back to the generic overview section', async () => {
        await expect(page.testSubj.locator(DEFAULT_OVERVIEW_SUBJ)).toBeVisible();
        await expect(page.testSubj.locator(CUSTOM_SECTION_SUBJ)).toBeHidden();
      });

      await test.step('hides the rule-read dependent tabs', async () => {
        for (const tabSubj of RULE_DEPENDENT_TAB_SUBJS) {
          await expect(page.testSubj.locator(tabSubj)).toBeHidden();
        }
      });
    });

    test('shows the "Add to case" button only with cases privileges', async ({
      page,
      browserAuth,
      pageObjects,
    }) => {
      await test.step('shows the button for a user with cases privileges', async () => {
        await browserAuth.loginWithCustomRole(ALERTS_WITH_LOGS_RULES_AND_CASES_ROLE);
        await gotoLogsAlertDetails(pageObjects, page);
        await expect(page.locator(ADD_TO_CASE_SELECTOR)).toBeVisible();
      });

      await test.step('hides the button for a user without cases privileges', async () => {
        // This role can read the logs rule (so the rest of the header renders)
        // but has no cases access.
        await browserAuth.loginWithCustomRole(ALERTS_WITH_LOGS_RULES_ROLE);
        await gotoLogsAlertDetails(pageObjects, page);
        await expect(page.locator(ADD_TO_CASE_SELECTOR)).toBeHidden();
      });
    });
  }
);
