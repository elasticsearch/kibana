/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { expect } from '@kbn/scout-oblt/ui';
import { tags } from '@kbn/scout-oblt';
import { test } from '../fixtures';

const queryParams = {
  dateRangeStart: '2021-11-21T22:06:06.502Z',
  dateRangeEnd: '2021-11-21T22:10:08.203Z',
};

test.describe('DefaultEmailSettings', { tag: tags.stateful.classic }, () => {
  const name = `Test connector ${Date.now()}`;

  test('configures email connector and validates settings', async ({
    pageObjects,
    browserAuth,
    page,
  }) => {
    await browserAuth.loginAsPrivilegedUser();
    await pageObjects.uptimeSettings.goto(queryParams);

    await test.step('reset alerting defaults for idempotency', async () => {
      await pageObjects.uptimeSettings.waitForDefaultConnectorsLoaded();
      await pageObjects.uptimeSettings.clearToEmailAddresses();
      await pageObjects.uptimeSettings.clearDefaultConnectors();
      if (await pageObjects.uptimeSettings.getApplyButton().isEnabled()) {
        await pageObjects.uptimeSettings.clickSaveSettings();
      }
    });

    await test.step('no connector is defined by default', async () => {
      await expect(pageObjects.uptimeSettings.getDefaultConnectorsInput()).toHaveValue('');
    });

    await test.step('create email connector', async () => {
      await pageObjects.uptimeSettings.createEmailConnector({
        name,
        from: 'test@gmail.com',
        host: 'test',
        port: '1025',
      });
    });

    await test.step('select email connector and validate required fields', async () => {
      await expect(page.testSubj.locator('emailAddBccButton')).toBeHidden();
      await pageObjects.uptimeSettings.selectDefaultConnector(name);
      await expect(page.testSubj.locator('emailAddBccButton')).toBeVisible();
      await expect(pageObjects.uptimeSettings.getFormErrorText()).toHaveText(
        'To email is required for email connector'
      );

      await expect(pageObjects.uptimeSettings.getApplyButton()).toBeDisabled();
      await pageObjects.uptimeSettings.fillToEmail('test@gmail.com');
      await expect(pageObjects.uptimeSettings.getApplyButton()).toBeEnabled();
    });

    await test.step('validate invalid email handling', async () => {
      await pageObjects.uptimeSettings.fillToEmail('test@gmail');
      await expect(pageObjects.uptimeSettings.getFormErrorText()).toHaveText(
        'test@gmail is not a valid email.'
      );
      await expect(pageObjects.uptimeSettings.getApplyButton()).toBeDisabled();
      await pageObjects.uptimeSettings.removeInvalidEmail('test@gmail');
    });

    await test.step('save settings', async () => {
      await pageObjects.uptimeSettings.clickSaveSettings();
      await expect(page.getByText('Settings saved!')).toBeVisible();
    });
  });
});
