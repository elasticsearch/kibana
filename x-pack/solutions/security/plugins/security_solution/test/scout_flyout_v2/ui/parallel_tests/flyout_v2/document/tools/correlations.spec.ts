/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { spaceTest, tags, CUSTOM_QUERY_RULE } from '@kbn/scout-security';
import { expect } from '@kbn/scout-security/ui';

spaceTest.describe(
  'Document flyout v2 — Correlations tool overlay',
  { tag: [...tags.stateful.classic, ...tags.serverless.security.complete] },
  () => {
    let ruleName: string;

    spaceTest.beforeEach(async ({ browserAuth, apiServices, scoutSpace }) => {
      const { sourceIndex } = await apiServices.correlations.createCorrelationsFixture(
        scoutSpace.id
      );

      ruleName = `${CUSTOM_QUERY_RULE.name}_${scoutSpace.id}_${Date.now()}`;
      await apiServices.detectionRule.createCustomQueryRule({
        ...CUSTOM_QUERY_RULE,
        name: ruleName,
        index: [sourceIndex],
      });
      await browserAuth.loginAsT1Analyst();
    });

    spaceTest.afterEach(async ({ apiServices, scoutSpace }) => {
      await apiServices.detectionRule.deleteAll();
      await apiServices.correlations.cleanupCorrelationsFixture(scoutSpace.id);
      await apiServices.detectionAlerts.deleteAll();
    });

    spaceTest(
      'opens correlations tool overlay and section row expand opens the correct child flyout',
      async ({ pageObjects }) => {
        await pageObjects.documentFlyout.openForRule(ruleName);

        await expect(pageObjects.documentFlyout.insightsSection).toBeVisible();

        await pageObjects.correlationsTool.titleLink.waitFor({ state: 'visible' });
        await pageObjects.correlationsTool.titleLink.click();

        await expect(pageObjects.correlationsTool.toolsFlyoutHeader).toBeVisible({
          timeout: 20_000,
        });

        await expect(pageObjects.correlationsTool.sameSourceAlertsSectionTable).toBeVisible();
        await pageObjects.correlationsTool.sameSourceAlertsSectionFirstPreviewButton.click();
        await pageObjects.documentFlyout.waitForChildDocumentFlyout();
        await expect(pageObjects.documentFlyout.childDocumentAlertTitle).toContainText(ruleName);

        // Close the child flyout
        await pageObjects.documentFlyout.closeChildDocumentFlyout();

        await expect(pageObjects.correlationsTool.sessionAlertsSectionTable).toBeVisible();
        await pageObjects.correlationsTool.sessionAlertsSectionFirstPreviewButton.click();
        await pageObjects.documentFlyout.waitForChildDocumentFlyout();
        await expect(pageObjects.documentFlyout.childDocumentAlertTitle).toContainText(ruleName);

        // TODO: Related Attacks
      }
    );

    spaceTest(
      'sameSource section Investigate in timeline button opens the timeline',
      async ({ pageObjects }) => {
        await pageObjects.documentFlyout.openForRule(ruleName);

        await expect(pageObjects.documentFlyout.insightsSection).toBeVisible();

        await pageObjects.correlationsTool.titleLink.waitFor({ state: 'visible' });
        await pageObjects.correlationsTool.titleLink.click();

        await expect(pageObjects.correlationsTool.toolsFlyoutHeader).toBeVisible({
          timeout: 20_000,
        });

        await expect(pageObjects.correlationsTool.sameSourceAlertsSectionTable).toBeVisible();
        await pageObjects.correlationsTool.clickSameSourceInvestigateInTimeline();

        await expect(pageObjects.timelinePage.panel).toBeVisible({ timeout: 15_000 });

        await expect(pageObjects.timelinePage.providerBadge).toBeVisible();
        await expect(pageObjects.timelinePage.providerBadge).toContainText('_id:');
      }
    );
  }
);
