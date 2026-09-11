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

spaceTest.describe('Discover ES|QL dashboard', { tag: '@local-stateful-classic' }, () => {
  spaceTest.beforeAll(async ({ discoverScoutSpace }) => {
    await discoverScoutSpace.setupDiscoverDefaults();
  });

  spaceTest.beforeEach(async ({ browserAuth }) => {
    await browserAuth.loginAsPrivilegedUser();
  });

  spaceTest.afterAll(async ({ discoverScoutSpace }) => {
    await discoverScoutSpace.teardownDiscoverDefaults();
  });

  spaceTest(
    'saves a Discover ES|QL visualization to a new dashboard',
    async ({ page, pageObjects }) => {
      const { dashboard, discover } = pageObjects;
      const visualizationTitle = 'Discover ES|QL chart';

      await discover.goto({ queryMode: 'esql' });
      await discover.waitUntilTabIsLoaded();
      await discover.writeAndSubmitEsqlQuery(ESQL_QUERY);
      await expect(page.testSubj.locator('xyVisChart')).toBeVisible();

      await discover.saveVisualizationToNewDashboard(visualizationTitle);
      await dashboard.waitForRenderComplete();
      await expect(
        page.testSubj.locator(`embeddablePanelHeading-${visualizationTitle.replace(/\s/g, '')}`)
      ).toBeVisible();
    }
  );

  spaceTest(
    'changes dimensions in the Discover ES|QL Lens flyout',
    async ({ context, pageObjects, page }) => {
      const { discover, lens } = pageObjects;

      await context.addInitScript(() => {
        (window as unknown as { _echDebugStateFlag?: boolean })._echDebugStateFlag = true;
      });

      await discover.goto({ queryMode: 'esql' });
      await discover.waitUntilTabIsLoaded();
      await discover.writeAndSubmitEsqlQuery(ESQL_QUERY);
      await discover.openLensEditFlyout();

      await lens.removeDimension('lnsXY_xDimensionPanel');
      await lens.configureTextBasedDimension({
        dimension: 'lnsXY_splitDimensionPanel > lns-empty-dimension',
        field: 'extension',
      });

      await expect
        .poll(async () => (await page.locator('[data-ech-series-name]').allTextContents()).sort())
        .toStrictEqual(['css', 'gif', 'jpg', 'php', 'png']);
    }
  );
});
