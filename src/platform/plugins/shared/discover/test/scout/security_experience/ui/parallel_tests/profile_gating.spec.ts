/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { tags } from '@kbn/scout';
import { expect } from '@kbn/scout/ui';
import {
  spaceTest,
  setupSecurityExperience,
  teardownSecurityExperience,
  SECURITY_DATA_VIEWS,
  PUSH_FLYOUT_VIEWPORT,
} from '../fixtures';

/**
 * Sanity coverage that the Security flyout enhancement resolves in the classic solution view from
 * the security data source profile rather than relying on the security root profile.
 *
 * Stateful only — the solution view cannot be switched on serverless (it is fixed by project type).
 */
spaceTest.describe(
  'Security in Discover - Profile resolution in classic solution view',
  { tag: tags.stateful.all },
  () => {
    // Force a wide viewport so the doc viewer flyout (pushMinBreakpoint="xl") renders in push mode.
    spaceTest.use({ viewport: PUSH_FLYOUT_VIEWPORT });

    spaceTest.beforeAll(async ({ scoutSpace }) => {
      await setupSecurityExperience(scoutSpace);
    });

    spaceTest.afterAll(async ({ scoutSpace }) => {
      await teardownSecurityExperience(scoutSpace);
    });

    spaceTest(
      'enhances the alert flyout under the classic solution view',
      async ({ scoutSpace, browserAuth, pageObjects }) => {
        await scoutSpace.setSolutionView('classic');
        await browserAuth.loginAsPrivilegedUser();

        const { dataGrid, discover, docViewer, securityDiscoverFlyout } = pageObjects;
        await discover.goto({ queryMode: 'classic' });
        await discover.selectDataView(SECURITY_DATA_VIEWS.ALERTS);
        await dataGrid.waitForDocTableRendered();
        await docViewer.openAndWaitForFlyout({ rowIndex: 0 });

        await expect(securityDiscoverFlyout.docViewer).toBeVisible();
        await expect(securityDiscoverFlyout.alertTitle).toBeVisible();
        await expect(securityDiscoverFlyout.overviewTab).toBeVisible();
      }
    );
  }
);
