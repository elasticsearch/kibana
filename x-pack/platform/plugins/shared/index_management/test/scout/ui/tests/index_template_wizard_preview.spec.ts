/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { EuiFieldTextWrapper, tags } from '@kbn/scout';
import { expect } from '@kbn/scout/ui';
import { test } from '../fixtures';

test.describe('Index template wizard - Preview template', { tag: tags.stateful.classic }, () => {
  test.afterEach(async ({ esClient, log }) => {
    try {
      await esClient.indices.deleteIndexTemplate({ name: 'a-star' });
    } catch (e) {
      log.debug(
        `Template cleanup failed for a-star: ${e instanceof Error ? e.message : String(e)}`
      );
    }
  });

  test('can create and preview an index template', async ({ page, pageObjects, browserAuth }) => {
    await browserAuth.loginAsIndexManagementUser();
    await pageObjects.indexManagement.navigateToIndexManagementTab('templates');

    await test.step('open wizard and fill logistics', async () => {
      await page.testSubj.locator('createTemplateButton').click();
      await expect(page.testSubj.locator('appHeaderTitle')).toHaveText('Create template');
      await expect(page.testSubj.locator('stepTitle')).toHaveText('Logistics');

      const nameField = new EuiFieldTextWrapper(page, { dataTestSubj: 'nameField' });
      await nameField.fill('a-star');
      const indexPatternsField = new EuiFieldTextWrapper(page, {
        dataTestSubj: 'indexPatternsField',
      });
      await indexPatternsField.fill('a*');
      const priorityField = new EuiFieldTextWrapper(page, { dataTestSubj: 'priorityField' });
      await priorityField.fill('1000');
      await pageObjects.indexManagement.clickNextButton();
    });

    await test.step('skip component templates', async () => {
      await expect(page.testSubj.locator('emptyPrompt')).toBeVisible();
      await pageObjects.indexManagement.clickNextButton();
    });

    await test.step('skip index settings', async () => {
      await expect(page.testSubj.locator('stepTitle')).toHaveText('Index settings (optional)');
      await pageObjects.indexManagement.clickNextButton();
    });

    await test.step('skip mappings', async () => {
      await expect(page.testSubj.locator('stepTitle')).toHaveText('Mappings (optional)');
      await pageObjects.indexManagement.clickNextButton();
    });

    await test.step('skip aliases', async () => {
      await expect(page.testSubj.locator('stepTitle')).toHaveText('Aliases (optional)');
      await pageObjects.indexManagement.clickNextButton();
    });

    await test.step('review and create template', async () => {
      await expect(page.testSubj.locator('stepTitle')).toHaveText("Review details for 'a-star'");
      await expect(page.testSubj.locator('summaryTabContent')).toBeVisible();
      await expect(page.testSubj.locator('indexModeTitle')).toBeVisible();
      await expect(page.testSubj.locator('indexModeValue')).toHaveText('Standard');
      await pageObjects.indexManagement.clickNextButton();
    });

    await test.step('preview template and verify no errors', async () => {
      await page.testSubj.locator('previewTabBtn').click();
      const templatePreview = await page.testSubj.locator('simulateTemplatePreview').textContent();
      expect(templatePreview).not.toContain('error');
      await page.testSubj.locator('closeDetailsButton').click();
    });
  });
});
