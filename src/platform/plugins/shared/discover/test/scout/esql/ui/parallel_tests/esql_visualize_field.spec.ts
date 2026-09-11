/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { expect } from '@kbn/scout/ui';
import { spaceTest } from '../fixtures';

const ESQL_QUERY = 'from logstash-* | stats averageB = avg(bytes) by extension';

spaceTest.describe('Discover ES|QL visualization', { tag: '@local-stateful-classic' }, () => {
  spaceTest.beforeAll(async ({ discoverScoutSpace }) => {
    await discoverScoutSpace.setupDiscoverDefaults();
  });

  spaceTest.beforeEach(async ({ browserAuth, pageObjects }) => {
    await browserAuth.loginAsPrivilegedUser();
    await pageObjects.discover.goto({ queryMode: 'esql' });
    await pageObjects.discover.waitUntilTabIsLoaded();
  });

  spaceTest.afterAll(async ({ discoverScoutSpace }) => {
    await discoverScoutSpace.teardownDiscoverDefaults();
  });

  spaceTest(
    'renders and changes the ES|QL histogram visualization',
    async ({ page, pageObjects }) => {
      const { discover } = pageObjects;

      await discover.writeAndSubmitEsqlQuery(ESQL_QUERY);
      await expect(page.testSubj.locator('unifiedHistogramChart')).toBeVisible();
      await expect(page.testSubj.locator('xyVisChart')).toBeVisible();

      await discover.openLensEditFlyout();
      await page.testSubj.click('lensSuggestionsPanelToggleButton');
      await page.testSubj.click('lnsSuggestion-treemap');
      await expect(page.testSubj.locator('partitionVisChart')).toBeVisible();
    }
  );

  spaceTest('opens the ES|QL visualization in the Lens flyout', async ({ page, pageObjects }) => {
    const { discover } = pageObjects;

    await discover.writeAndSubmitEsqlQuery(ESQL_QUERY);
    await discover.openLensEditFlyout();

    await expect(
      page.testSubj.locator('lns-dimensionTrigger-textBased').filter({ hasText: 'averageB' })
    ).toBeVisible();
  });
});
