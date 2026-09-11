/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { expect } from '@kbn/scout/ui';
import { spaceTest, tags } from '../fixtures';

const BREAKDOWN_LEGEND_LABELS = ['css', 'gif', 'jpg', 'php', 'png'];

spaceTest.describe('Discover ES|QL histogram breakdown', { tag: tags.deploymentAgnostic }, () => {
  spaceTest.beforeAll(async ({ discoverScoutSpace }) => {
    await discoverScoutSpace.setupDiscoverDefaults();
  });

  spaceTest.beforeEach(async ({ browserAuth }) => {
    await browserAuth.loginAsPrivilegedUser();
  });

  spaceTest.afterAll(async ({ discoverScoutSpace }) => {
    await discoverScoutSpace.teardownDiscoverDefaults();
  });

  spaceTest('choose breakdown field from dropdown', async ({ pageObjects }) => {
    const { discover } = pageObjects;
    await discover.goto({ queryMode: 'esql' });
    await discover.writeAndSubmitEsqlQuery('from logstash-*');
    await discover.waitUntilTabIsLoaded();
    await discover.chooseBreakdownField('extension');
    await discover.waitUntilTabIsLoaded();
    await expect
      .poll(() => discover.getHistogramLegendLabels())
      .toStrictEqual(BREAKDOWN_LEGEND_LABELS);
  });

  spaceTest(
    'filter from histogram legend value appends WHERE to query',
    async ({ pageObjects }) => {
      const { discover, unifiedFieldList } = pageObjects;
      await discover.goto({ queryMode: 'esql' });
      await discover.writeAndSubmitEsqlQuery('from logstash-*');
      await discover.waitUntilTabIsLoaded();
      await discover.chooseBreakdownField('extension');
      await discover.waitUntilTabIsLoaded();
      await discover.clickLegendFilter('png', '+');
      await discover.waitUntilTabIsLoaded();
      await unifiedFieldList.waitUntilSidebarHasLoaded();
      expect(await discover.getEsqlQueryValue()).toContain('| WHERE `extension` == "png"');
    }
  );

  spaceTest(
    'breakdown field is saved and restored with saved search',
    async ({ pageObjects, scoutSpace }) => {
      const { discover } = pageObjects;
      const savedSearchTitle = `esql view with breakdown ${scoutSpace.id}`;

      await discover.goto({ queryMode: 'esql' });
      await discover.writeAndSubmitEsqlQuery('from logstash-*');
      await discover.waitUntilTabIsLoaded();
      await discover.chooseBreakdownField('extension');
      await discover.waitUntilTabIsLoaded();

      await discover.saveSearch(savedSearchTitle);
      await discover.clickNewSearch();
      await discover.waitUntilTabIsLoaded();
      await expect.poll(() => discover.getHistogramLegendLabels()).toStrictEqual([]);

      await discover.loadSavedSearch(savedSearchTitle);
      await discover.waitUntilTabIsLoaded();
      await expect
        .poll(() => discover.getHistogramLegendLabels())
        .toStrictEqual(BREAKDOWN_LEGEND_LABELS);
    }
  );

  spaceTest('choose breakdown from field stats', async ({ pageObjects }) => {
    const { discover, unifiedFieldList } = pageObjects;
    await discover.goto({ queryMode: 'esql' });
    await discover.writeAndSubmitEsqlQuery('from logstash-*');
    await discover.waitUntilTabIsLoaded();
    await unifiedFieldList.clickFieldListAddBreakdownField('extension');
    await discover.waitUntilTabIsLoaded();
    await expect
      .poll(() => discover.getHistogramLegendLabels())
      .toStrictEqual(BREAKDOWN_LEGEND_LABELS);
  });
});
