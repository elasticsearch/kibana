/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { test, tags } from '@kbn/scout-security';
import type { ScoutPage } from '@kbn/scout-security';
import { expect } from '@kbn/scout-security/ui';
import { ENTITY_STORE_ROUTES, FF_ENABLE_ENTITY_STORE_V2 } from '../../../../common';

const TIMEOUT = 120_000;
const INSTALL_GRACE = 2_000;

const isStatusResponse = (url: string) => url.includes(ENTITY_STORE_ROUTES.public.STATUS);
const isInstallRequest = (url: string, method: string) =>
  url.includes(ENTITY_STORE_ROUTES.public.INSTALL) && method === 'POST';
const isTimeoutError = (error: unknown) => error instanceof Error && error.name === 'TimeoutError';

/**
 * Waits a grace window for the auto-install hook's /install POST and throws if it is made. No POST
 * means waitForRequest rejects with a TimeoutError, the expected outcome; anything else re-throws.
 */
const throwOnInstallRequest = (page: ScoutPage) =>
  page
    .waitForRequest((req) => isInstallRequest(req.url(), req.method()), { timeout: INSTALL_GRACE })
    .then(
      () => {
        throw new Error('the auto-install hook must not POST /install');
      },
      (error) => {
        if (!isTimeoutError(error)) throw error;
      }
    );

/**
 * Serial chain in the default space (the only space where auto-install runs). Each run starts on a
 * fresh cluster, so the store begins not_installed; tests inherit state: running -> stopped -> uninstalled.
 * Network responses are awaited only to time the toggle assertions, never asserted on.
 */
test.describe.serial(
  'Entity Store auto-install',
  { tag: [...tags.stateful.classic, ...tags.serverless.security.complete] },
  () => {
    test.beforeAll(async ({ kbnClient }) => {
      await kbnClient.uiSettings.update({ [FF_ENABLE_ENTITY_STORE_V2]: true });
    });

    test.beforeEach(async ({ browserAuth }) => {
      await browserAuth.loginAsAdmin();
    });

    test('auto-installs the entity store when visiting a Security page', async ({
      page,
      pageObjects,
    }) => {
      const managementPage = pageObjects.entityAnalyticsManagementPage;

      const installed = page.waitForResponse(
        (res) => isInstallRequest(res.url(), res.request().method()),
        { timeout: TIMEOUT }
      );
      await managementPage.navigate();
      await installed;
      await expect(managementPage.entityAnalyticsSwitch).toBeChecked({ timeout: TIMEOUT });
    });

    test('does not auto-install after stopping', async ({ page, pageObjects }) => {
      const managementPage = pageObjects.entityAnalyticsManagementPage;
      const toggle = managementPage.entityAnalyticsSwitch;

      // The store is installed from the previous test, so the toggle loads checked.
      await test.step('stop the store via the toggle', async () => {
        await managementPage.navigate();
        await managementPage.toggleEntityAnalytics();
        await expect(toggle).not.toBeChecked({ timeout: TIMEOUT });
      });

      await test.step('reloading the page (a fresh app mount) does not re-install the store', async () => {
        const statusLoaded = page.waitForResponse((res) => isStatusResponse(res.url()), {
          timeout: TIMEOUT,
        });
        await page.reload();
        await statusLoaded;
        await throwOnInstallRequest(page);
        await expect(toggle).not.toBeChecked();
      });
    });

    test('does not auto-install after uninstalling', async ({ page, pageObjects }) => {
      const managementPage = pageObjects.entityAnalyticsManagementPage;
      const toggle = managementPage.entityAnalyticsSwitch;

      // The store is stopped from the previous test, so the toggle loads unchecked.
      await test.step('start the store via the toggle', async () => {
        await managementPage.navigate();
        await managementPage.toggleEntityAnalytics();
        await expect(toggle).toBeChecked({ timeout: TIMEOUT });
      });

      await test.step('uninstall by clearing entity data', async () => {
        await managementPage.clearEntityData();
        await expect(toggle).not.toBeChecked({ timeout: TIMEOUT });
      });

      await test.step('reloading the page (a fresh app mount) does not re-install the store', async () => {
        const statusLoaded = page.waitForResponse((res) => isStatusResponse(res.url()), {
          timeout: TIMEOUT,
        });
        await page.reload();
        await statusLoaded;
        await throwOnInstallRequest(page);
        await expect(toggle).not.toBeChecked();
      });
    });
  }
);
