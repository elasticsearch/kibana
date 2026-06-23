/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { expect } from '@kbn/scout/ui';
import { test } from '../fixtures';

/*
 * Custom-role auth (`browserAuth.loginWithCustomRole`) is not yet supported on
 * Elastic Cloud Hosted, so this suite only runs on local stateful (classic)
 * until ECH support lands.
 */
test.describe('Rule name validation — Discover flyout', { tag: '@local-stateful-classic' }, () => {
  const SOURCE_INDEX = 'test-discover-rule-validation';

  test.beforeAll(async ({ esClient }) => {
    await esClient.indices.create(
      {
        index: SOURCE_INDEX,
        mappings: {
          properties: {
            '@timestamp': { type: 'date' },
            message: { type: 'text' },
          },
        },
      },
      { ignore: [400] }
    );
  });

  test.beforeEach(async ({ browserAuth, pageObjects }) => {
    await browserAuth.loginAsAlertingV2Editor();
    await pageObjects.ruleForm.gotoDiscover();
    await pageObjects.ruleForm.switchToEsqlMode();
    await pageObjects.discover.writeAndSubmitEsqlQuery(
      `FROM ${SOURCE_INDEX} | WHERE message != "" | LIMIT 10`
    );
    await pageObjects.discover.waitUntilSearchingHasFinished();
  });

  test.afterAll(async ({ esClient }) => {
    await esClient.indices.delete({ index: SOURCE_INDEX }, { ignore: [404] });
  });

  test('opens rule form flyout and displays default placeholder name', async ({ pageObjects }) => {
    await pageObjects.ruleForm.openRulesFlyoutFromDiscover();
    // The name input lives on the Details step — navigate there first.
    await pageObjects.ruleForm.navigateToDetailsStep();

    await expect(pageObjects.ruleForm.nameInput).toBeVisible();
    await expect(pageObjects.ruleForm.nameInput).toHaveAttribute('placeholder', 'Untitled rule');
  });

  test('shows validation error when saving flyout with empty default name', async ({
    pageObjects,
  }) => {
    await pageObjects.ruleForm.openRulesFlyoutFromDiscover();
    // Navigate to the Details step where the name field lives.
    await pageObjects.ruleForm.navigateToDetailsStep();
    await expect(pageObjects.ruleForm.nameInput).toBeVisible();

    // Clicking Next on the Details step triggers name validation.
    await pageObjects.ruleForm.clickFlyoutSave();
    await expect(pageObjects.ruleForm.nameFieldError).toBeVisible();
    await expect(pageObjects.ruleForm.nameFieldError).toContainText('Name is required');
  });

  test('error callout scrolls into view in flyout on failed submission', async ({
    pageObjects,
  }) => {
    await pageObjects.ruleForm.openRulesFlyoutFromDiscover();
    // Navigate to the Details step where the name field lives.
    await pageObjects.ruleForm.navigateToDetailsStep();
    await expect(pageObjects.ruleForm.nameInput).toBeVisible();

    // Clicking Next on the Details step triggers name validation.
    await pageObjects.ruleForm.clickFlyoutSave();
    await expect(pageObjects.ruleForm.nameFieldError).toBeVisible();
    await expect(pageObjects.ruleForm.nameFieldError).toBeInViewport();
  });
});
