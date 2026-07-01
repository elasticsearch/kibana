/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Scout UI test for the host entity flyout's Alerts insight tool (a stacked system flyout).
 *
 * Entry path: Alerts page → alerts table host.name cell → host flyout → entity insight section →
 * Alerts insight tool. The seeded alert(s) reference the host, so the tool's alerts table renders them.
 */

import { spaceTest, tags, CUSTOM_QUERY_RULE, HOST_NAME } from '@kbn/scout-security';
import { expect } from '@kbn/scout-security/ui';

spaceTest.describe(
  'Host entity flyout v2 - Alerts insight tool',
  { tag: [...tags.stateful.classic, ...tags.serverless.security.complete] },
  () => {
    let ruleName: string;
    let sourceIndex: string;

    spaceTest.beforeEach(async ({ browserAuth, apiServices, scoutSpace }, testInfo) => {
      // Rule execution can be slow under parallel load.
      testInfo.setTimeout(testInfo.timeout + 120_000);

      ({ sourceIndex } = await apiServices.host.createHostFixture(scoutSpace.id));

      ruleName = `${CUSTOM_QUERY_RULE.name}_${scoutSpace.id}_${Date.now()}`;
      await apiServices.detectionRule.createCustomQueryRule({
        ...CUSTOM_QUERY_RULE,
        name: ruleName,
        index: [sourceIndex],
      });
      await apiServices.detectionAlerts.waitForAlerts(ruleName, 1, 60_000);

      await browserAuth.loginAsPlatformEngineer();
    });

    spaceTest.afterEach(async ({ apiServices, scoutSpace }) => {
      await apiServices.detectionRule.deleteAll();
      await apiServices.detectionAlerts.deleteAll();
      await apiServices.host.cleanupHostFixture(scoutSpace.id);
    });

    spaceTest(
      'filters the alerts table by severity',
      async ({ pageObjects, apiServices, scoutSpace }) => {
        // Add a second alert of a different severity (same host) so filtering is observable.
        const lowSeverityRuleName = `${CUSTOM_QUERY_RULE.name}_low_${scoutSpace.id}_${Date.now()}`;
        await apiServices.detectionRule.createCustomQueryRule({
          ...CUSTOM_QUERY_RULE,
          name: lowSeverityRuleName,
          rule_id: `${CUSTOM_QUERY_RULE.rule_id}-low`,
          severity: 'low',
          index: [sourceIndex],
        });
        await apiServices.detectionAlerts.waitForAlerts(lowSeverityRuleName, 1, 60_000);

        const { alertsTablePage, hostFlyout } = pageObjects;
        await alertsTablePage.navigate();
        await alertsTablePage.waitForRuleAlert(ruleName);
        await alertsTablePage.clickHostNameCell(HOST_NAME);
        await hostFlyout.waitForHostFlyout();
        await hostFlyout.openAlertsInsightTool();

        await spaceTest.step('both severities are listed', async () => {
          await expect(hostFlyout.alertsInsightsToolTable).toBeVisible();
          await expect(hostFlyout.alertsInsightsToolAlertSeverities).toHaveCount(2, {
            timeout: 15_000,
          });
        });

        await spaceTest.step(
          'clicking the Low severity segment filters to one Low alert',
          async () => {
            await hostFlyout.alertsInsightsToolSeveritySegment('Low').click();
            await expect(hostFlyout.alertsInsightsToolAlertSeverities).toHaveCount(1, {
              timeout: 15_000,
            });
            await expect(hostFlyout.alertsInsightsToolAlertSeverities).toContainText('Low');
          }
        );
      }
    );

    spaceTest('header opens the host as a child flyout', async ({ pageObjects }) => {
      const { alertsTablePage, hostFlyout } = pageObjects;
      await alertsTablePage.navigate();
      await alertsTablePage.waitForRuleAlert(ruleName);
      await alertsTablePage.clickHostNameCell(HOST_NAME);
      await hostFlyout.waitForHostFlyout();
      await hostFlyout.openAlertsInsightTool();

      // The tool header's source context targets the host, and only the originating host flyout
      // exists (mounted behind the tool) at this point.
      await expect(hostFlyout.toolsFlyoutTitle).toContainText(HOST_NAME);
      await expect(hostFlyout.header).toHaveCount(1);

      // Clicking it opens a second host flyout for the same host as a stacked child.
      await hostFlyout.toolsFlyoutTitle.click();
      await expect(hostFlyout.header).toHaveCount(2);
      await expect(hostFlyout.title.filter({ hasText: HOST_NAME })).toHaveCount(2);
    });

    spaceTest(
      'expanding an alert row opens the document flyout for that rule',
      async ({ pageObjects }) => {
        const { alertsTablePage, hostFlyout, documentFlyout } = pageObjects;
        await alertsTablePage.navigate();
        await alertsTablePage.waitForRuleAlert(ruleName);
        await alertsTablePage.clickHostNameCell(HOST_NAME);
        await hostFlyout.waitForHostFlyout();
        await hostFlyout.openAlertsInsightTool();

        await expect(hostFlyout.alertsInsightsToolTable).toBeVisible();
        await hostFlyout.alertsInsightsToolExpandFirstRow.click();

        // The row's expand control opens that alert's document flyout (a full alert flyout, not the
        // child-wrapped variant), titled with the rule name.
        await documentFlyout.waitForAlertFlyout();
        await expect(documentFlyout.title).toContainText(ruleName);
      }
    );
  }
);
