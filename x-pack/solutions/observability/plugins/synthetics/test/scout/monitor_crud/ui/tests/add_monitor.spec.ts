/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { tags } from '@kbn/scout-oblt';
import { expect } from '@kbn/scout-oblt/ui';
import { test } from '../../../common/ui/fixtures';
import { FormMonitorType, monitorConfigurations } from '../../../common/ui/fixtures/constants';

test.describe('AddMonitor', { tag: tags.stateful.classic }, () => {
  let locationLabel: string;
  let configs: ReturnType<typeof monitorConfigurations>;

  test.beforeAll(async ({ syntheticsServices }) => {
    await syntheticsServices.enable();
    await syntheticsServices.deleteMonitors();
    const location = await syntheticsServices.ensurePrivateLocationExists();
    locationLabel = location.label;
    configs = monitorConfigurations(locationLabel);
  });

  test.afterEach(async ({ syntheticsServices }) => {
    await syntheticsServices.deleteMonitors();
  });

  const monitorTypesToTest = [
    FormMonitorType.HTTP,
    FormMonitorType.TCP,
    FormMonitorType.ICMP,
    FormMonitorType.MULTISTEP,
    `${FormMonitorType.MULTISTEP}__recorder` as const,
    FormMonitorType.API,
  ] as const;

  for (const monitorType of monitorTypesToTest) {
    test(`creates, edits, and deletes ${monitorType} monitor`, async ({
      pageObjects,
      page,
      browserAuth,
    }) => {
      const config = configs[monitorType];
      const monitorName = config.monitorConfig.name;

      await test.step('setup: login and navigate', async () => {
        await browserAuth.loginAsPrivilegedUser();
        await pageObjects.syntheticsApp.navigateToAddMonitor();
        await pageObjects.syntheticsApp.ensureIsOnMonitorConfigPage();
      });

      await test.step(`create ${monitorType} monitor`, async () => {
        await pageObjects.syntheticsApp.createMonitor({
          monitorConfig: config.monitorConfig,
          monitorType: config.monitorType,
        });
        await pageObjects.syntheticsApp.confirmAndSave();
      });

      await test.step('view monitor details in management UI', async () => {
        await expect(page.testSubj.locator('syntheticsMonitorDetailsLinkLink')).toHaveText(
          config.monitorListDetails.name
        );
        await expect(
          page.testSubj.locator('syntheticsMonitorListLocations').locator('a')
        ).toHaveText(config.monitorListDetails.location);
        await expect(
          page.testSubj.locator('syntheticsMonitorListFrequency').locator('.euiText')
        ).toHaveText(config.monitorListDetails.schedule);
      });

      await test.step(`edit ${monitorType} monitor`, async () => {
        await pageObjects.syntheticsApp.navigateToEditMonitor(monitorName);
        await expect(
          page.testSubj.locator('syntheticsMonitorInspectShowFlyoutExampleButton')
        ).toBeVisible();
        await expect(page.getByText(locationLabel)).toBeVisible();
        await pageObjects.syntheticsApp.findEditMonitorConfiguration(config.monitorEditDetails);
        await page.testSubj.click('syntheticsMonitorConfigSubmitButton');
        await expect(page.getByText('Monitor updated successfully.')).toBeVisible({
          timeout: 20_000,
        });
      });

      await test.step('cannot save monitor with the same name', async () => {
        await pageObjects.syntheticsApp.navigateToAddMonitor();
        await pageObjects.syntheticsApp.createMonitor({
          monitorConfig: config.monitorConfig,
          monitorType: config.monitorType,
        });
        await expect(page.getByText('Monitor name already exists')).toBeVisible();
        await page.testSubj.click('syntheticsMonitorConfigSubmitButton');
        await page.click('text=Cancel');
      });

      await test.step('delete monitor', async () => {
        await pageObjects.syntheticsApp.navigateToMonitorManagement();
        await pageObjects.syntheticsApp.deleteMonitor(monitorName);
        await expect(page.testSubj.locator('syntheticsGettingStartedPage')).toBeVisible();
      });
    });
  }
});
