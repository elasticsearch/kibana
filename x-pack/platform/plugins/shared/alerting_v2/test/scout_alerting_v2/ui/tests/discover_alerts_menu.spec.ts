/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { expect } from '@kbn/scout/ui';
import { test } from '../fixtures';

const SAMPLE_DATA_SET = 'ecommerce';

/*
 * Custom-role auth (`browserAuth.loginWithCustomRole`) is not yet supported on
 * Elastic Cloud Hosted, so this suite only runs on local stateful (classic)
 * until ECH support lands.
 */
// Failing: See https://github.com/elastic/kibana/issues/274946
test.describe.skip(
  'Discover Alerts menu with alerting v2',
  {
    tag: '@local-stateful-classic',
  },
  () => {
    test.beforeAll(async ({ apiServices }) => {
      await apiServices.sampleData.install(SAMPLE_DATA_SET);
    });

    test.beforeEach(async ({ browserAuth, pageObjects }) => {
      await browserAuth.loginAsAlertingV2Viewer();
      await pageObjects.discover.goto();
      await pageObjects.discover.writeAndSubmitEsqlQuery(
        'FROM kibana_sample_data_ecommerce | LIMIT 10'
      );
      await pageObjects.discover.waitUntilSearchingHasFinished();
    });

    test.afterAll(async ({ apiServices }) => {
      await apiServices.sampleData.remove(SAMPLE_DATA_SET);
    });

    test('should show Alerts menu with the v2 ES|QL rule row and hide v1 entries', async ({
      pageObjects,
    }) => {
      await pageObjects.discoverAppMenu.openAlertsMenu();

      await expect(pageObjects.discoverAppMenu.selectorFlyout).toBeVisible();
      await expect(pageObjects.discoverAppMenu.createEsqlRuleCard).toBeVisible();

      await expect(pageObjects.discoverAppMenu.createAlertButton).toBeHidden();
      await expect(pageObjects.discoverAppMenu.manageAlertsButton).toBeHidden();
    });
  }
);
