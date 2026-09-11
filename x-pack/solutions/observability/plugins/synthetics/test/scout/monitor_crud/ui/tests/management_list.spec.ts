/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { tags } from '@kbn/scout-oblt';
import { expect } from '@kbn/scout-oblt/ui';
import { test } from '../../../common/ui/fixtures';

test.describe(
  'ManagementList',
  { tag: [...tags.stateful.classic, ...tags.serverless.observability.complete] },
  () => {
    const testMonitor1 = 'Test monitor 1';
    const testMonitor2 = 'Test monitor 2';
    const testMonitor3 = 'Test monitor 3';

    test.beforeAll(async ({ syntheticsServices }) => {
      await syntheticsServices.enable();
      await syntheticsServices.deleteMonitors();
      await syntheticsServices.addMonitorSimple(testMonitor1, {
        type: 'http',
        urls: 'https://www.elastic.co',
      });
      await syntheticsServices.addMonitorSimple(testMonitor2, {
        type: 'http',
        urls: 'https://www.elastic.co',
      });
      await syntheticsServices.addMonitorSimple(testMonitor3, {
        type: 'browser',
        schedule: { unit: 'm', number: '5' },
      });
    });

    test.afterAll(async ({ syntheticsServices }) => {
      await syntheticsServices.deleteMonitors();
    });

    test('displays management list with search and filters', async ({
      pageObjects,
      page,
      browserAuth,
    }) => {
      await test.step('login and navigate to management', async () => {
        await browserAuth.loginAsPrivilegedUser();
        await pageObjects.syntheticsApp.navigateToMonitorManagement();
      });

      await test.step('shows the count', async () => {
        await expect(page.getByText('1-3')).toBeVisible();
      });

      await test.step('filter by type and search', async () => {
        await expect(page.getByText('Showing 1-3 of 3 Configurations')).toBeVisible();
        await pageObjects.syntheticsApp.selectFilterOption('Type', 'Browser / Page');
        await pageObjects.syntheticsApp.waitForMonitorManagementLoadingToFinish();
        await expect(page.getByText('Showing 1-1 of 1 Configuration')).toBeVisible();

        const searchInput = page.testSubj.locator('syntheticsOverviewSearchInput');
        await searchInput.click();
        await searchInput.fill('3');
        await pageObjects.syntheticsApp.waitForMonitorManagementLoadingToFinish();
        await expect(page.getByText('Showing 1-1 of 1 Configuration')).toBeVisible();

        await searchInput.clear();
        await pageObjects.syntheticsApp.selectFilterOption('Type', 'Browser / Page');
        await pageObjects.syntheticsApp.waitForMonitorManagementLoadingToFinish();
        await expect(page.getByText('Showing 1-3 of 3 Configurations')).toBeVisible();
      });

      await test.step('no results search', async () => {
        const searchInput = page.testSubj.locator('syntheticsOverviewSearchInput');
        await searchInput.fill('5553');
        await pageObjects.syntheticsApp.waitForMonitorManagementLoadingToFinish();
        await expect(page.getByText('0-0')).toBeVisible();
        await searchInput.press('Escape');
        await pageObjects.syntheticsApp.waitForMonitorManagementLoadingToFinish();
        await expect(page.getByText('1-3')).toBeVisible();
      });

      await test.step('shows summary stats', async () => {
        const statPanel = page.testSubj.locator('syntheticsManagementSummaryStats');
        await expect(statPanel.locator('text=3')).toBeVisible();
      });

      await test.step('filter by frequency', async () => {
        const frequencyFilter = page.locator('.euiFilterButton__text', { hasText: 'Frequency' });
        // eslint-disable-next-line playwright/no-nth-methods
        const fiveMinOption = page.getByText('Every 5 minutes').first();
        await frequencyFilter.click();
        await fiveMinOption.click();
        await page.getByText('Apply').click();
        await pageObjects.syntheticsApp.waitForMonitorManagementLoadingToFinish();
        await expect(page.getByText('1-1')).toBeVisible();

        await frequencyFilter.click();
        await fiveMinOption.click();
        await page.getByText('Apply').click();
        await pageObjects.syntheticsApp.waitForMonitorManagementLoadingToFinish();
        await expect(page.getByText('1-3')).toBeVisible();
      });
    });
  }
);
