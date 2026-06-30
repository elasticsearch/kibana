/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { expect } from '@kbn/scout/ui';
import { tags } from '@kbn/scout';
import type { KibanaRole } from '@kbn/scout';
import { NAV_CUSTOMIZATION_STORAGE_KEY } from '../../../../common';
import { test } from '../fixtures';

// Internal-route headers required by Kibana for non-public APIs.
const INTERNAL_HEADERS = {
  'kbn-xsrf': 'scout',
  'x-elastic-internal-origin': 'kibana',
} as const;

/**
 * Scenario A — User with full Kibana access to a custom es-solution space.
 *
 * In a project-nav (es-solution) space the "Customize navigation" link is visible in the
 * user menu and the modal opens when clicked.
 */

const SPACE_A = {
  id: 'nav-customization-space-a',
  name: 'Nav Customization Space A',
  disabledFeatures: [] as string[],
};

// Minimal (read-only) privileges in SPACE_A:
// - discover/dashboard `read` so those nav items are visible and SAML login
//   activates a user profile, so the "Customize navigation" link renders.
// - `applyAutomaticReadPrivilegeGrants` grants every read privilege write access
//   to the `user-storage` / `user-storage-global` saved object types, so even
//   this read-only user can persist navigation customizations.
// - No ES index privileges are needed because the test stays on the home app.
const MINIMAL_NAV_ROLE: KibanaRole = {
  elasticsearch: { cluster: [] },
  kibana: [
    {
      base: [],
      feature: { discover: ['read'], dashboard: ['read'] },
      spaces: [SPACE_A.id],
    },
  ],
};

test.describe(
  'Scenario A — Customize navigation link is visible in an es-solution space',
  { tag: tags.stateful.classic },
  () => {
    test.beforeAll(async ({ apiServices }) => {
      // Delete first so a leftover space from an interrupted prior run (whose
      // afterAll never executed) doesn't fail creation with a 409 conflict.
      await apiServices.spaces.delete(SPACE_A.id).catch(() => {});
      await apiServices.spaces.create(SPACE_A);
      await apiServices.spaces.setSolutionView({ id: SPACE_A.id, solution: 'es' });
    });

    test.beforeEach(async ({ page }) => {
      await page.addInitScript(() => {
        window.localStorage.setItem('home:welcome:show', 'false');
      });
    });

    // Reset the per-user navigation customization after each test so saved
    // moves/hidden items don't leak between tests. userStorage records are keyed
    // by the logged-in user's profile id, so the delete must reuse the browser
    // session's cookie via `page.request` rather than a superuser kbnClient. The
    // customization key is space-scoped.
    test.afterEach(async ({ page, kbnUrl }) => {
      await page.request.delete(
        kbnUrl.get(`s/${SPACE_A.id}/internal/user_storage/${NAV_CUSTOMIZATION_STORAGE_KEY}`),
        { headers: INTERNAL_HEADERS }
      );
    });

    test.afterAll(async ({ apiServices }) => {
      await apiServices.spaces.delete(SPACE_A.id).catch(() => {});
    });

    test('persists navigation customizations across reloads for a read-only user', async ({
      browserAuth,
      pageObjects,
      kbnUrl,
      page,
    }) => {
      const nav = pageObjects.navigation;

      await browserAuth.loginWithCustomRole(MINIMAL_NAV_ROLE);
      await page.goto(kbnUrl.app('home', { space: SPACE_A.id }));
      await page.testSubj.locator('kbnChromeNav-primaryNavigation').waitFor({ state: 'visible' });

      // Hide Discover and save — applyCustomization awaits the PUT response
      // before returning, so the customization is persisted before we reload.
      await nav.openCustomizeNavModal();
      await nav.toggleItemVisibility('discover');
      await nav.applyCustomization();

      // Reload and re-assert. The discover link should remain hidden from the
      // primary nav, confirming the customization was persisted server-side.
      await page.reload();
      const primaryNav = page.testSubj.locator('kbnChromeNav-primaryNavigation');
      await primaryNav.waitFor({ state: 'visible' });

      // Discover is no longer in the primary nav.
      await expect(primaryNav.locator('[data-test-subj~="nav-item-id-discover"]')).toBeHidden();

      // Dashboards remains visible in the primary nav after the reload.
      const dashboardsItem = primaryNav.locator('[data-test-subj~="nav-item-id-dashboards"]');
      await expect(dashboardsItem).toBeVisible();
    });
  }
);
