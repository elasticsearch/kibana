/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Scout UI tests for the "Take action" menu inside the flyout_v2 document flyout.
 */

import {
  spaceTest,
  tags,
  CUSTOM_QUERY_RULE,
  AlertWorkflowStatus,
  ALERT_CLOSE_MENU_ITEM_TEST_SUBJ,
  ClosingReasonOption,
  ADD_TO_NEW_CASE_TEST_SUBJ,
  ALERT_TAGS_MENU_ITEM_TEST_SUBJ,
  INVESTIGATE_IN_TIMELINE_MENU_ITEM_TEST_SUBJ,
} from '@kbn/scout-security';
import { expect } from '@kbn/scout-security/ui';

spaceTest.describe(
  'Document flyout v2 — Take action menu',
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

    spaceTest.afterEach(async ({ apiServices }) => {
      await apiServices.detectionRule.deleteAll();
      await apiServices.detectionAlerts.deleteAll();
    });

    spaceTest(
      'status change: mark alert as closed with a closing reason',
      async ({ pageObjects }) => {
        await pageObjects.documentFlyout.openForRule(ruleName);

        await pageObjects.documentFlyout.openTakeActionMenu();
        await pageObjects.documentFlyout.clickTakeActionItem(ALERT_CLOSE_MENU_ITEM_TEST_SUBJ);

        // Closing reason sub-panel opens inside the context menu
        await pageObjects.documentFlyout.selectClosingReason(
          ClosingReasonOption.FALSE_POSITIVE.label
        );
        await pageObjects.documentFlyout.submitClosingReason();

        await expect(pageObjects.documentFlyout.statusBadge).toContainText(
          AlertWorkflowStatus.CLOSED,
          { timeout: 15_000 }
        );
      }
    );

    spaceTest('apply alert tags — opens tag management sub-panel', async ({ pageObjects }) => {
      await pageObjects.documentFlyout.openForRule(ruleName);

      await pageObjects.documentFlyout.openTakeActionMenu();
      await pageObjects.documentFlyout.clickTakeActionItem(ALERT_TAGS_MENU_ITEM_TEST_SUBJ);

      // Tag management sub-panel should appear inside the context menu
      await expect(pageObjects.documentFlyout.alertTagsSelectable).toBeVisible({
        timeout: 10_000,
      });
    });

    spaceTest('add to new case — opens case creation modal', async ({ pageObjects }) => {
      await pageObjects.documentFlyout.openForRule(ruleName);

      await pageObjects.documentFlyout.openTakeActionMenu();
      await pageObjects.documentFlyout.clickTakeActionItem(ADD_TO_NEW_CASE_TEST_SUBJ);

      await expect(pageObjects.documentFlyout.createCaseDialogTitle).toBeVisible({
        timeout: 10_000,
      });
    });

    // Note: the other "menu item opens its sub-panel/modal" wiring checks (assign alert, add to
    // existing case, run alert workflow) are thin and each sub-panel's rendering is covered at the
    // component level, so they're dropped. What's kept exercises more than wiring: the status change
    // above, the two representative panel/modal openers above (alert tags + new case), and the
    // investigate-in-timeline case below, which actually opens Timeline.

    spaceTest('investigate in timeline — opens Timeline with document', async ({ pageObjects }) => {
      await pageObjects.documentFlyout.openForRule(ruleName);

      await pageObjects.documentFlyout.openTakeActionMenu();
      await pageObjects.documentFlyout.clickTakeActionItem(
        INVESTIGATE_IN_TIMELINE_MENU_ITEM_TEST_SUBJ
      );

      await expect(pageObjects.timelinePage.panel).toBeVisible({ timeout: 15_000 });
    });
  }
);
