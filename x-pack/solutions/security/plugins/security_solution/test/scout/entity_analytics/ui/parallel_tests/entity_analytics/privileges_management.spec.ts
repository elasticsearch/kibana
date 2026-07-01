/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { spaceTest, tags } from '@kbn/scout-security';
import type { KibanaRole } from '@kbn/scout-security';
import { expect } from '@kbn/scout-security/ui';

const NO_RISK_ENGINE_PRIVILEGES_ROLE: KibanaRole = {
  elasticsearch: {
    cluster: [],
    indices: [],
  },
  kibana: [
    {
      base: [],
      feature: {
        siemV5: ['read'],
        securitySolutionRulesV2: ['read'],
      },
      spaces: ['*'],
    },
  ],
};

spaceTest.describe(
  'Entity analytics management page - Privileges',
  { tag: [...tags.stateful.classic] },
  () => {
    spaceTest.afterEach(async ({ apiServices }) => {
      await apiServices.entityAnalytics.deleteEntityStoreEngines();
    });

    spaceTest(
      'should not show the privileges callout for superuser',
      async ({ pageObjects, browserAuth }) => {
        const managementPage = pageObjects.entityAnalyticsManagementPage;

        await browserAuth.loginAsAdmin();
        await managementPage.navigate();

        await expect(managementPage.statusLoading).toBeHidden({ timeout: 30000 });
        await expect(managementPage.riskEnginePrivilegesCallout).toBeHidden();
      }
    );

    spaceTest(
      'should show privileges callout and disable switch for user without risk engine privileges',
      async ({ pageObjects, browserAuth }) => {
        const managementPage = pageObjects.entityAnalyticsManagementPage;

        await browserAuth.loginWithCustomRole(NO_RISK_ENGINE_PRIVILEGES_ROLE);
        await managementPage.navigate();

        await expect(managementPage.statusLoading).toBeHidden({ timeout: 30000 });

        await expect(managementPage.riskEnginePrivilegesCallout).toBeVisible({ timeout: 15000 });
        await expect(managementPage.riskEnginePrivilegesCallout).toContainText(
          'Missing read, write privileges for the risk-score.risk-score-* index'
        );
        await expect(managementPage.riskEnginePrivilegesCallout).toContainText(
          'manage_index_templates'
        );
        await expect(managementPage.riskEnginePrivilegesCallout).toContainText('manage_transform');

        await expect(managementPage.riskEnginePreviewPrivilegesCallout).toBeVisible();
        await expect(managementPage.entityAnalyticsSwitch).toBeDisabled();
      }
    );
  }
);
