/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Scout UI test for the flyout_v2 network flyout.
 *
 * Entry path: Alerts page → alerts table source.ip cell → click the IP → the network flyout opens.
 */

import { spaceTest, tags, CUSTOM_QUERY_RULE, NETWORK_SOURCE_IP } from '@kbn/scout-security';
import { expect } from '@kbn/scout-security/ui';

spaceTest.describe(
  'Network flyout v2',
  { tag: [...tags.stateful.classic, ...tags.serverless.security.complete] },
  () => {
    let ruleName: string;

    spaceTest.beforeEach(async ({ browserAuth, apiServices, scoutSpace }) => {
      // Index a source event carrying `source.ip` and scope the rule to that index, so the alert
      // deterministically renders an IP cell (and isn't affected by other parallel-worker data).
      const { sourceIndex } = await apiServices.network.createNetworkFixture(scoutSpace.id);

      ruleName = `${CUSTOM_QUERY_RULE.name}_${scoutSpace.id}_${Date.now()}`;
      await apiServices.detectionRule.createCustomQueryRule({
        ...CUSTOM_QUERY_RULE,
        name: ruleName,
        index: [sourceIndex],
      });
      await browserAuth.loginAsPlatformEngineer();
    });

    spaceTest.afterEach(async ({ apiServices, scoutSpace }) => {
      await apiServices.detectionRule.deleteAll();
      await apiServices.detectionAlerts.deleteAll();
      await apiServices.network.cleanupNetworkFixture(scoutSpace.id);
    });

    spaceTest(
      'clicking the source.ip value in the alerts table opens the network flyout v2',
      async ({ pageObjects }) => {
        await pageObjects.alertsTablePage.navigate();
        await pageObjects.alertsTablePage.waitForRuleAlert(ruleName);

        // Click the IP value in the source.ip column.
        await pageObjects.alertsTablePage.clickNetworkIpCell(NETWORK_SOURCE_IP);

        // The network flyout opens, titled with the clicked IP.
        await pageObjects.networkFlyout.waitForNetworkFlyout();
        await expect(pageObjects.networkFlyout.title).toContainText(NETWORK_SOURCE_IP);
      }
    );
  }
);
