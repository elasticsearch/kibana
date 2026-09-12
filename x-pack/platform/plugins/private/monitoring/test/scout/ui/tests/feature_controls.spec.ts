/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

// Stack Monitoring feature controls (UI-only spec).
//
// Coverage gap vs. FTR (`monitoring_security.ts`): the
// `monitoring_user alone → forbidden` and `monitoring_user + kibana_admin →
// enable denied` cases are NOT migrated. They require granting the
// `reserved_monitoring` ES application privilege, which Scout's
// `setCustomRole` API cannot provision (the `enable denied` case was already
// `skipCloud` in FTR for the same reason).

import { tags } from '@kbn/scout';
import { expect } from '@kbn/scout/ui';
import { test, CUSTOM_ROLES } from '../fixtures';

const ENABLED_SPACE_ID = 'monitoring_fc_ui_enabled_space';
const DISABLED_SPACE_ID = 'monitoring_fc_ui_disabled_space';

test.describe('Stack Monitoring feature controls', { tag: tags.stateful.classic }, () => {
  test.beforeAll(async ({ apiServices }) => {
    await apiServices.spaces.create({ id: ENABLED_SPACE_ID, disabledFeatures: [] });
    await apiServices.spaces.create({
      id: DISABLED_SPACE_ID,
      disabledFeatures: ['monitoring'],
    });
  });

  test.afterAll(async ({ apiServices }) => {
    await apiServices.spaces.delete(ENABLED_SPACE_ID);
    await apiServices.spaces.delete(DISABLED_SPACE_ID);
  });

  test('monitoringAppContainer renders in the default space', async ({
    browserAuth,
    page,
    kbnUrl,
  }) => {
    await browserAuth.loginAsAdmin();
    await page.goto(kbnUrl.app('monitoring'));

    await expect(page.testSubj.locator('monitoringAppContainer')).toBeVisible();
  });

  test('monitoringAppContainer renders in a space where monitoring is enabled', async ({
    browserAuth,
    page,
    kbnUrl,
  }) => {
    await browserAuth.loginAsAdmin();
    await page.goto(kbnUrl.app('monitoring', { space: ENABLED_SPACE_ID }));

    await expect(page.testSubj.locator('monitoringAppContainer')).toBeVisible();
  });

  test('navigating to /app/monitoring returns 404 in a space where monitoring is disabled', async ({
    browserAuth,
    page,
    kbnUrl,
  }) => {
    await browserAuth.loginAsAdmin();

    // Server responds with a raw 404 JSON body (not the SPA "app not found").
    const response = await page.goto(kbnUrl.app('monitoring', { space: DISABLED_SPACE_ID }));

    expect(response?.status()).toBe(404);
    const bodyText = await page.evaluate(() => document.body.innerText);
    expect(JSON.parse(bodyText)).toStrictEqual({
      statusCode: 404,
      error: 'Not Found',
      message: 'Not Found',
    });
  });

  test('Kibana base:all user does NOT see the Stack Monitoring sidebar link', async ({
    browserAuth,
    samlAuth,
    pageObjects,
  }) => {
    await samlAuth.setCustomRole(CUSTOM_ROLES.global_all_kibana_only);
    await browserAuth.loginAs(samlAuth.customRoleName);
    await pageObjects.home.goto();

    const navLinks = await pageObjects.collapsibleNav.getNavLinks();
    expect(navLinks).not.toContain('Stack Monitoring');
  });
});
