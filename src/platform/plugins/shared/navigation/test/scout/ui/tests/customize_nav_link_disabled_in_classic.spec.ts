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
import { test } from '../fixtures';

/**
 * Scenario B — Default space (classic navigation mode).
 *
 * The "Customize navigation" link only appears in spaces whose solution view is set to
 * 'es', 'oblt', or 'security' (project navigation mode). In the default space, which uses
 * classic navigation, the nav plugin never registers the link — so it must be absent from
 * the user menu.
 */

test.describe(
  'Scenario B — Customize navigation link is hidden in the default (classic) space',
  { tag: tags.stateful.classic },
  () => {
    test.beforeEach(async ({ page }) => {
      await page.addInitScript(() => {
        window.localStorage.setItem('home:welcome:show', 'false');
      });
    });

    test('hides the "Customize navigation" link in the user menu', async ({
      browserAuth,
      pageObjects,
      page,
    }) => {
      // The link's visibility is gated by the space's solution view (classic vs
      // project nav), not by the user's role, so a viewer covers this behavior and
      // also catches regressions where the link wrongly appears for non-admins.
      await browserAuth.loginAsViewer();

      await page.gotoApp('home');
      await page.testSubj.locator('headerGlobalNav').waitFor({ state: 'visible' });

      await pageObjects.navigation.openUserMenu();

      await expect(pageObjects.navigation.getCustomizeNavLink()).toBeHidden();
    });
  }
);
