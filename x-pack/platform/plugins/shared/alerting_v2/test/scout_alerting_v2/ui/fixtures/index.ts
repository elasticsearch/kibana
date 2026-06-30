/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { test as baseTest } from '@kbn/scout';
import type { BrowserAuthFixture, ScoutTestFixtures, ScoutWorkerFixtures } from '@kbn/scout';
import { extendPageObjects, type AlertingPageObjects } from './page_objects';
import { buildAlertingApiServices, type AlertingApiServicesFixture } from '../../api/fixtures';
import { ALL_ROLE, NO_ACCESS_ROLE, READ_ROLE } from '../../common/roles';

export interface AlertingBrowserAuthFixture extends BrowserAuthFixture {
  loginAsAlertingV2Editor: () => Promise<void>;
  loginAsAlertingV2Viewer: () => Promise<void>;
  loginAsUserWithoutAlertingV2Access: () => Promise<void>;
}

export interface AlertingTestFixtures extends ScoutTestFixtures {
  browserAuth: AlertingBrowserAuthFixture;
  pageObjects: AlertingPageObjects;
}

export interface UiWorkerFixtures extends ScoutWorkerFixtures {
  apiServices: AlertingApiServicesFixture;
}

export const test = baseTest.extend<
  {
    browserAuth: AlertingBrowserAuthFixture;
    pageObjects: AlertingPageObjects;
  },
  { apiServices: AlertingApiServicesFixture }
>({
  browserAuth: async (
    { browserAuth }: { browserAuth: BrowserAuthFixture },
    use: (extendedBrowserAuth: AlertingBrowserAuthFixture) => Promise<void>
  ) => {
    await use({
      ...browserAuth,
      loginAsAlertingV2Editor: () => browserAuth.loginWithCustomRole(ALL_ROLE),
      loginAsAlertingV2Viewer: () => browserAuth.loginWithCustomRole(READ_ROLE),
      loginAsUserWithoutAlertingV2Access: () => browserAuth.loginWithCustomRole(NO_ACCESS_ROLE),
    });
  },
  pageObjects: async ({ pageObjects, page, kbnUrl }, use) => {
    await use(extendPageObjects(pageObjects, page, kbnUrl));
  },
  apiServices: [
    async (
      { apiServices, esClient, kbnClient, log },
      use: (extendedApiServices: AlertingApiServicesFixture) => Promise<void>
    ) => {
      const extendedApiServices: AlertingApiServicesFixture = {
        ...apiServices,
        alertingV2: buildAlertingApiServices({ esClient, kbnClient, log }),
      };
      await use(extendedApiServices);
    },
    { scope: 'worker' },
  ],
});

export {
  ALL_ROLE,
  NO_ACCESS_ROLE,
  READ_ROLE,
  ALERTING_V2_RULES_ALL_ROLE,
  ALERTING_V2_RULES_READ_ROLE,
  ALERTING_V2_ALERTS_ALL_ROLE,
  ALERTING_V2_ALERTS_READ_ROLE,
  ALERTING_V2_ACTION_POLICIES_ALL_ROLE,
  ALERTING_V2_ACTION_POLICIES_READ_ROLE,
  ALERTING_V2_ACTION_POLICIES_ALL_AND_RULES_READ_ROLE,
} from '../../common/roles';
export { buildCreateRuleData } from '../../common/builders';
export * as testData from '../../common/constants';
