/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { spaceTest, tags } from '@kbn/scout-security';
import type { KibanaRole } from '@kbn/scout-security';
import { expect } from '@kbn/scout-security/ui';

const DASHBOARD_VIEWER_ROLE: KibanaRole = {
  elasticsearch: {
    cluster: [],
    indices: [],
  },
  kibana: [
    {
      base: [],
      feature: {
        dashboard_v2: ['read'],
        discover_v2: ['read'],
      },
      spaces: ['*'],
    },
  ],
};

spaceTest.describe(
  'serverless security dashboard-only landing',
  { tag: [...tags.serverless.security.complete] },
  () => {
    spaceTest(
      'redirects a dashboard-only user from Get started to dashboards',
      async ({ page, browserAuth }) => {
        await browserAuth.loginWithCustomRole(DASHBOARD_VIEWER_ROLE);
        await page.gotoApp('security/get_started');
        // URL is the acceptance signal. Listing chrome/empty-state locators vary
        // when other Scout suites leave dashboards in the shared space.
        await expect(page).toHaveURL(/\/app\/dashboards/);
      }
    );

    spaceTest('keeps a privileged user on Get started', async ({ page, browserAuth }) => {
      await browserAuth.loginAsPrivilegedUser();
      await page.gotoApp('security/get_started');
      await page.waitForURL(/\/app\/security\/get_started/);
      await expect(page.testSubj.locator('onboarding-hub-page')).toBeVisible();
    });
  }
);
