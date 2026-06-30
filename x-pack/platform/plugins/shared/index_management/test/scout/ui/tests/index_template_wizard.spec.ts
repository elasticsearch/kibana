/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { expect } from '@kbn/scout/ui';
import { tags } from '@kbn/scout';
import { test } from '../fixtures';

test.describe('Index template wizard - Create', { tag: tags.stateful.classic }, () => {
  test.afterEach(async ({ esClient, log }) => {
    try {
      await esClient.indices.deleteIndexTemplate({ name: 'test-index-template' });
    } catch (e) {
      log.debug(
        `Template cleanup failed for test-index-template: ${
          e instanceof Error ? e.message : String(e)
        }`
      );
    }
  });

  test('can walk through all wizard steps and create a template', async ({
    page,
    pageObjects,
    browserAuth,
  }) => {
    await browserAuth.loginAsIndexManagementUser();
    await pageObjects.indexManagement.navigateToIndexManagementTab('templates');
    await page.testSubj.locator('createTemplateButton').click();

    await test.step('verify page title', async () => {
      await expect(page.testSubj.locator('appHeaderTitle')).toBeVisible();
      await expect(page.testSubj.locator('appHeaderTitle')).toHaveText('Create template');
    });

    await test.step('1: Logistics', async () => {
      await expect(page.testSubj.locator('stepTitle')).toHaveText('Logistics');
      await pageObjects.indexManagement.indexTemplateWizard.completeStepOne();
    });

    await test.step('2: Component templates', async () => {
      await expect(page.testSubj.locator('emptyPrompt')).toBeVisible();
      await pageObjects.indexManagement.clickNextButton();
    });

    await test.step('3: Index settings', async () => {
      await expect(page.testSubj.locator('stepTitle')).toHaveText('Index settings (optional)');
      await expect(page.testSubj.locator('indexModeCallout')).toHaveText(
        'The index.mode setting has been set to Standard within the Logistics step. Any changes to index.mode set on this page will be overwritten by the Logistics selection.'
      );
      await pageObjects.indexManagement.clickNextButton();
    });

    await test.step('4: Mappings', async () => {
      await expect(page.testSubj.locator('stepTitle')).toHaveText('Mappings (optional)');
      await pageObjects.indexManagement.clickNextButton();
    });

    await test.step('5: Aliases', async () => {
      await expect(page.testSubj.locator('stepTitle')).toHaveText('Aliases (optional)');
      await pageObjects.indexManagement.clickNextButton();
    });

    await test.step('6: Review and create template', async () => {
      await expect(page.testSubj.locator('stepTitle')).toHaveText(
        "Review details for 'test-index-template'"
      );
      await expect(page.testSubj.locator('summaryTabContent')).toBeVisible();
      await expect(page.testSubj.locator('indexModeTitle')).toBeVisible();
      await expect(page.testSubj.locator('indexModeValue')).toHaveText('Standard');
      await pageObjects.indexManagement.clickNextButton();
    });
  });
});
