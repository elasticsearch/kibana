/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { spaceTest, tags, CUSTOM_QUERY_RULE } from '@kbn/scout-security';
import { expect } from '@kbn/scout-security/ui';

spaceTest.describe(
  'Document flyout v2 — About section',
  { tag: [...tags.stateful.classic, ...tags.serverless.security.complete] },
  () => {
    let ruleName: string;

    spaceTest.beforeEach(async ({ browserAuth, apiServices, scoutSpace }) => {
      ruleName = `${CUSTOM_QUERY_RULE.name}_${scoutSpace.id}_${Date.now()}`;
      await apiServices.detectionRule.createCustomQueryRule({
        ...CUSTOM_QUERY_RULE,
        name: ruleName,
        index: ['auditbeat-*'],
      });
      await browserAuth.loginAsPlatformEngineer();
    });

    spaceTest.afterEach(async ({ apiServices, scoutSpace }) => {
      await apiServices.detectionRule.deleteAll();
      await apiServices.detectionAlerts.deleteAll();
      await scoutSpace.savedObjects.cleanStandardList();
    });

    spaceTest(
      'rule description: "Show rule summary" opens the rule summary as a child flyout',
      async ({ pageObjects }) => {
        await pageObjects.documentFlyout.openForRule(ruleName);

        // The About section and its "Show rule summary" button render for a readable rule.
        await expect(pageObjects.documentFlyout.aboutSection).toBeVisible();
        await expect(pageObjects.documentFlyout.ruleSummaryButton).toBeVisible();
        await expect(pageObjects.documentFlyout.ruleSummaryButton).toBeEnabled();

        await pageObjects.documentFlyout.ruleSummaryButton.click();

        // The rule summary opens as a child flyout titled with the rule name.
        await pageObjects.ruleFlyout.waitForRuleFlyout();
        await expect(pageObjects.ruleFlyout.title).toContainText(ruleName);
      }
    );

    spaceTest(
      'alert reason: "Show full reason" popover key-value pairs expose working cell actions on hover',
      async ({ pageObjects }) => {
        await pageObjects.documentFlyout.openForRule(ruleName);

        await expect(pageObjects.documentFlyout.aboutSection).toBeVisible();

        // "Show full reason" opens a popover that renders the reason as key-value pairs.
        await pageObjects.documentFlyout.openReasonPopover();
        await expect(pageObjects.documentFlyout.reasonHostNameValue).toBeVisible({
          timeout: 10_000,
        });

        // Hovering a key-value pair reveals its cell-action buttons.
        await pageObjects.documentFlyout.hoverReasonHostName();
        await expect(pageObjects.documentFlyout.cellActionsFilterInButton).toBeVisible();
        await expect(pageObjects.documentFlyout.cellActionsFilterOutButton).toBeVisible();
        await expect(pageObjects.documentFlyout.cellActionsAddToTimelineButton).toBeVisible();

        // "Filter for" works: clicking it adds a single filter pill to the page search bar.
        await pageObjects.documentFlyout.cellActionsFilterInButton.click();
        await expect(pageObjects.documentFlyout.pageFilterBadges).toHaveCount(1, {
          timeout: 10_000,
        });
      }
    );
  }
);
