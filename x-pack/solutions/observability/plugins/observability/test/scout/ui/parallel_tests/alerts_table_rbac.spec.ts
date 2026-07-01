/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { tags } from '@kbn/scout-oblt';
import type { ScoutPage } from '@kbn/scout-oblt';
import { expect } from '@kbn/scout-oblt/ui';
import { test } from '../fixtures';
import type { TriggersActionsPageObjects } from '../fixtures/page_objects';
import {
  ALERTS_ONLY_ROLE,
  ALERTS_WITH_LOGS_RULES_ROLE,
  ALERTS_WITH_METRICS_RULES_ROLE,
} from '../fixtures/roles';
import { cleanRuleLinkRbacAlerts, ingestRuleLinkRbacAlerts } from '../fixtures/rule_link_rbac_data';

/**
 * RBAC behavior of the Observability alerts page and its table/flyout.
 *
 * Rule read is authorized per rule type (and consumer), so the rule links in the
 * alerts table flyout must be gated on the specific rule behind each alert
 * rather than a coarse "can read any rules" flag. The page-level rule
 * management affordances (Manage rules button, rule stats) are instead gated on
 * whether the user can read *any* rules.
 *
 * Three personas are exercised against the same two alerts (one logs, one
 * metrics), all of which can read every observability alert:
 *  - a user that can read logs rules only,
 *  - a user that can read metrics rules only,
 *  - a user that can read no rules at all (Observability Alerts only).
 */
test.describe(
  'Observability alerts page - alerts table RBAC',
  { tag: [...tags.stateful.classic, ...tags.serverless.observability.complete] },
  () => {
    let logsRuleId: string;
    let metricsRuleId: string;

    const RULE_LINK_SUBJ = 'o11yAlertFlyoutRuleLink';
    const VIEW_RULE_DETAILS_SUBJ = 'viewRuleDetailsFlyout';
    const ROW_VIEW_RULE_DETAILS_SUBJ = 'viewRuleDetails';
    const MANAGE_RULES_SUBJ = 'manageRulesPageButton';
    const RULE_STAT_SUBJS = ['statRuleCount', 'statDisabled', 'statMuted', 'statErrors'];

    test.beforeAll(async ({ apiServices, esClient }) => {
      const ruleIds = await ingestRuleLinkRbacAlerts({
        esClient,
        apiServices,
        timestamp: new Date().toISOString(),
      });
      logsRuleId = ruleIds.logsRuleId;
      metricsRuleId = ruleIds.metricsRuleId;
    });

    test.afterAll(async ({ apiServices, esClient }) => {
      await cleanRuleLinkRbacAlerts({ esClient, apiServices });
    });

    /**
     * Navigates to the alerts page filtered to the single alert for `ruleId`. The
     * page header (Manage rules button, rule stats) renders regardless of the
     * query, so callers can assert on it here too.
     */
    const gotoAlertsForRule = async (pageObjects: TriggersActionsPageObjects, ruleId: string) => {
      await expect(async () => {
        await pageObjects.alertsTablePage.gotoWithAppState({
          kuery: `kibana.alert.rule.uuid: "${ruleId}"`,
          rangeFrom: 'now-1y',
          rangeTo: 'now',
        });
        expect(await pageObjects.alertsTablePage.getRowCount()).toBe(1);
      }).toPass({ timeout: 60_000, intervals: [2_000] });
    };

    /**
     * Opens the flyout for the single alert currently rendered in the table and
     * waits for the overview panel (which hosts the rule links) to render.
     */
    const openAlertFlyout = async (pageObjects: TriggersActionsPageObjects) => {
      await pageObjects.alertsTablePage.openFlyout(0);
      await expect(pageObjects.alertsTablePage.flyoutOverviewPanel).toBeVisible();
    };

    /**
     * Opens the row actions menu for the single alert in the table and asserts
     * whether the "View rule details" action is present, then closes the menu so
     * the table is interactable again.
     */
    const expectRowViewRuleDetails = async (
      page: ScoutPage,
      pageObjects: TriggersActionsPageObjects,
      shouldBeVisible: boolean
    ) => {
      await pageObjects.alertsTablePage.openActionsMenuForRow(0);
      const action = page.testSubj.locator(ROW_VIEW_RULE_DETAILS_SUBJ);
      if (shouldBeVisible) {
        await expect(action).toBeVisible();
      } else {
        await expect(action).toBeHidden();
      }
      await page.keyboard.press('Escape');
    };

    test('logs rule reader sees rule links only for the logs alert', async ({
      page,
      browserAuth,
      pageObjects,
    }) => {
      await browserAuth.loginWithCustomRole(ALERTS_WITH_LOGS_RULES_ROLE);

      await test.step('shows the rule management affordances', async () => {
        await gotoAlertsForRule(pageObjects, logsRuleId);
        await expect(page.testSubj.locator(MANAGE_RULES_SUBJ)).toBeVisible();
        await expect(page.testSubj.locator('statRuleCount')).toBeVisible();
      });

      await test.step('shows the rule links for the logs alert', async () => {
        await openAlertFlyout(pageObjects);
        await expect(page.testSubj.locator(RULE_LINK_SUBJ)).toBeVisible();
        await expect(page.testSubj.locator(VIEW_RULE_DETAILS_SUBJ)).toBeVisible();
        await pageObjects.alertsTablePage.closeFlyout();
      });

      await test.step('shows the row "View rule details" action for the logs alert', async () => {
        await expectRowViewRuleDetails(page, pageObjects, true);
      });

      await test.step('hides the rule links for the metrics alert', async () => {
        await gotoAlertsForRule(pageObjects, metricsRuleId);
        await openAlertFlyout(pageObjects);
        await expect(page.testSubj.locator(RULE_LINK_SUBJ)).toBeHidden();
        await expect(page.testSubj.locator(VIEW_RULE_DETAILS_SUBJ)).toBeHidden();
        await pageObjects.alertsTablePage.closeFlyout();
      });

      await test.step('hides the row "View rule details" action for the metrics alert', async () => {
        await expectRowViewRuleDetails(page, pageObjects, false);
      });
    });

    test('metrics rule reader sees rule links only for the metrics alert', async ({
      page,
      browserAuth,
      pageObjects,
    }) => {
      await browserAuth.loginWithCustomRole(ALERTS_WITH_METRICS_RULES_ROLE);

      await test.step('shows the rule management affordances', async () => {
        await gotoAlertsForRule(pageObjects, metricsRuleId);
        await expect(page.testSubj.locator(MANAGE_RULES_SUBJ)).toBeVisible();
        await expect(page.testSubj.locator('statRuleCount')).toBeVisible();
      });

      await test.step('shows the rule links for the metrics alert', async () => {
        await openAlertFlyout(pageObjects);
        await expect(page.testSubj.locator(RULE_LINK_SUBJ)).toBeVisible();
        await expect(page.testSubj.locator(VIEW_RULE_DETAILS_SUBJ)).toBeVisible();
        await pageObjects.alertsTablePage.closeFlyout();
      });

      await test.step('shows the row "View rule details" action for the metrics alert', async () => {
        await expectRowViewRuleDetails(page, pageObjects, true);
      });

      await test.step('hides the rule links for the logs alert', async () => {
        await gotoAlertsForRule(pageObjects, logsRuleId);
        await openAlertFlyout(pageObjects);
        await expect(page.testSubj.locator(RULE_LINK_SUBJ)).toBeHidden();
        await expect(page.testSubj.locator(VIEW_RULE_DETAILS_SUBJ)).toBeHidden();
        await pageObjects.alertsTablePage.closeFlyout();
      });

      await test.step('hides the row "View rule details" action for the logs alert', async () => {
        await expectRowViewRuleDetails(page, pageObjects, false);
      });
    });

    test('Observability Alerts only user has no rule management affordances or rule links', async ({
      page,
      browserAuth,
      pageObjects,
    }) => {
      await browserAuth.loginWithCustomRole(ALERTS_ONLY_ROLE);

      await gotoAlertsForRule(pageObjects, logsRuleId);

      await test.step('hides the Manage rules button and rule stats', async () => {
        // The alerts table still renders (alert read is granted) ...
        await expect(pageObjects.alertsTablePage.table).toBeVisible();
        // ... but no rule-read-dependent page header affordances are shown.
        await expect(page.testSubj.locator(MANAGE_RULES_SUBJ)).toBeHidden();
        for (const statSubj of RULE_STAT_SUBJS) {
          await expect(page.testSubj.locator(statSubj)).toBeHidden();
        }
      });

      await test.step('hides the rule links in the alert flyout', async () => {
        await openAlertFlyout(pageObjects);
        await expect(page.testSubj.locator(RULE_LINK_SUBJ)).toBeHidden();
        await expect(page.testSubj.locator(VIEW_RULE_DETAILS_SUBJ)).toBeHidden();
        await pageObjects.alertsTablePage.closeFlyout();
      });

      await test.step('hides the row "View rule details" action', async () => {
        await expectRowViewRuleDetails(page, pageObjects, false);
      });
    });
  }
);
