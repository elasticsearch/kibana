/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Scout UI test for the flyout_v2 rule flyout.
 *
 * Entry path: Alerts page → alerts table "Rule" column → click the rule name → the v2 rule
 * flyout opens.
 */

import { spaceTest, tags, CUSTOM_QUERY_RULE } from '@kbn/scout-security';
import { expect } from '@kbn/scout-security/ui';

spaceTest.describe(
  'Rule flyout v2',
  { tag: [...tags.stateful.classic, ...tags.serverless.security.complete] },
  () => {
    let ruleName: string;

    spaceTest.beforeEach(async ({ browserAuth, apiServices, scoutSpace }) => {
      ruleName = `${CUSTOM_QUERY_RULE.name}_${scoutSpace.id}_${Date.now()}`;
      await apiServices.detectionRule.createCustomQueryRule({
        ...CUSTOM_QUERY_RULE,
        name: ruleName,
        index: ['auditbeat-*'],
      });
      await browserAuth.loginAsPlatformEngineer();
    });

    spaceTest.afterEach(async ({ apiServices }) => {
      await apiServices.detectionRule.deleteAll();
      await apiServices.detectionAlerts.deleteAll();
    });

    spaceTest(
      'rule name in the alerts table opens the rule flyout v2, whose header link opens the rule page in a new tab',
      async ({ pageObjects, page }) => {
        await pageObjects.alertsTablePage.navigate();
        await pageObjects.alertsTablePage.waitForRuleAlert(ruleName);

        await spaceTest.step('clicking the rule name opens the v2 rule flyout', async () => {
          // Click the rule name link in the "Rule" column.
          await pageObjects.alertsTablePage.clickRuleName(ruleName);

          // The v2 rule flyout opens, titled with the rule name.
          await expect(pageObjects.ruleFlyout.title).toBeVisible({
            timeout: 15_000,
          });
          await expect(pageObjects.ruleFlyout.title).toContainText(ruleName);
        });

        await spaceTest.step('header link opens the correct rule page in a new tab', async () => {
          const headerLink = pageObjects.ruleFlyout.titleLink;
          await expect(headerLink).toBeVisible();

          // Read the rule id from the header link's href to build the expected destination URL.
          // (Link presence and the target="_blank" attribute are already covered at the component
          // level in rule/main/header.test.tsx; here we only need the href to assert navigation.)
          const href = await headerLink.getAttribute('href');
          const ruleId = href?.match(/security\/rules\/id\/([^/?#]+)/)?.[1];

          // Clicking it opens a new browser tab navigated to that rule's details page.
          const newTabPromise = page.context().waitForEvent('page');
          await headerLink.click();
          const newTab = await newTabPromise;
          await newTab.waitForLoadState('domcontentloaded');
          expect(newTab.url()).toContain(`security/rules/id/${ruleId}`);
        });
      }
    );
  }
);
