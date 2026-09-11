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

spaceTest.describe(
  'Discover ES|QL switching back to a data view',
  { tag: tags.deploymentAgnostic },
  () => {
    spaceTest.beforeAll(async ({ discoverScoutSpace }) => {
      await discoverScoutSpace.setupDiscoverDefaults({ loadFlightsDataView: true });
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
      'tears down the ES|QL editor and restores the classic search bar',
      async ({ page, pageObjects }) => {
        await pageObjects.discover.selectClassicMode();

        await expect(page.testSubj.locator('ESQLEditor')).toBeHidden();
        await expect(page.testSubj.locator('queryInput')).toBeVisible();
      }
    );

    spaceTest(
      'switches while a saved search has unsaved changes',
      async ({ page, pageObjects, scoutSpace }) => {
        const { discover } = pageObjects;

        await discover.saveSearch(`esql data view switch ${scoutSpace.id}`);
        // Diverge from the saved state so the switch happens with unsaved changes pending.
        await discover.writeAndSubmitEsqlQuery('from logstash-* | limit 100 | drop @timestamp');

        await discover.selectClassicMode();

        await expect(page.testSubj.locator('ESQLEditor')).toBeHidden();
        await expect(page.testSubj.locator('queryInput')).toBeVisible();
      }
    );

    spaceTest(
      'shows hit count and available data views after switching',
      async ({ page, pageObjects }) => {
        const { discover } = pageObjects;

        // Pin the query to logstash-* rather than inheriting Discover's default: the
        // observability root profile overrides that default to the logs index pattern,
        // so the hit count below would not be logstash's.
        await discover.writeAndSubmitEsqlQuery('from logstash-* | limit 10');

        await page.reload();
        await discover.waitUntilTabIsLoaded();
        // ES|QL mode survives the reload, so the switch below is a real transition.
        await expect(page.testSubj.locator('ESQLEditor')).toBeVisible();

        await discover.selectClassicMode();
        await expect(discover.getHitCountLocator()).toHaveText('14,004');

        const dataViews = await discover.getAvailableDataViewsFromSearchBar();
        expect(dataViews).toContain('logstash-*');
        expect(dataViews).toContain('kibana_sample_data_flights');

        await discover.selectDataView('kibana_sample_data_flights');
        // Assert on the locator rather than reading the label once: the switch
        // button's text lags the selection, so a single read can still return the
        // previous data view.
        await expect(discover.getSelectedDataView()).toHaveText('kibana_sample_data_flights');
      }
    );
  }
);
