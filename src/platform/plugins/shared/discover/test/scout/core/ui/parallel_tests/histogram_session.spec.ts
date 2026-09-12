/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { tags, type ApiServicesFixture } from '@kbn/scout';
import { expect } from '@kbn/scout/ui';
import type { DiscoverSessionApiDataInput } from '../../../../../server/api/schema';
import { spaceTest, testData, type DiscoverScoutSpace } from '../../../common/ui/fixtures';

const createClassicSession = async (
  apiServices: ApiServicesFixture,
  discoverScoutSpace: DiscoverScoutSpace,
  title: string,
  tab: Pick<DiscoverSessionApiDataInput['tabs'][number], 'hide_chart' | 'chart_interval'> & {
    dataViewTitle?: string;
  } = {}
) => {
  const { dataViewTitle = testData.DEFAULT_DATA_VIEW, ...tabFields } = tab;
  await apiServices.discover.create(
    {
      title,
      tabs: [
        {
          id: 'main',
          label: 'Untitled',
          data_source: {
            type: 'data_view_reference',
            ref_id: discoverScoutSpace.getDataViewId(dataViewTitle),
          },
          ...tabFields,
        },
      ],
    } satisfies DiscoverSessionApiDataInput,
    discoverScoutSpace.id
  );
};

spaceTest.describe('histogram session', { tag: tags.deploymentAgnostic }, () => {
  spaceTest.beforeAll(async ({ discoverScoutSpace }) => {
    await discoverScoutSpace.setupDiscoverDefaults({ loadLongWindowDataView: true });
    await discoverScoutSpace.uiSettings.setDefaultIndex(testData.LONG_WINDOW_LOGSTASH_DATA_VIEW);
    await discoverScoutSpace.uiSettings.set({ 'dateFormat:tz': 'Europe/Berlin' });
  });

  spaceTest.beforeEach(async ({ browserAuth, pageObjects, config }) => {
    // Security serverless editor can read `logstash-*` but not `long-window-logstash-*`.
    // FTR used admin on serverless for the same reason.
    if (config.serverless && config.projectType === 'security') {
      await browserAuth.loginAsAdmin();
    } else {
      await browserAuth.loginAsPrivilegedUser();
    }
    await pageObjects.discover.goto({ queryMode: 'classic' });
    await pageObjects.discover.waitUntilSearchingHasFinished();
  });

  spaceTest.afterAll(async ({ discoverScoutSpace }) => {
    await discoverScoutSpace.uiSettings.unset('dateFormat:tz', 'timepicker:timeDefaults');
    await discoverScoutSpace.teardownDiscoverDefaults();
  });

  spaceTest(
    'persists hide/show of the histogram on a saved session',
    async ({ pageObjects, scoutSpace }) => {
      const { datePicker, discover } = pageObjects;
      const hiddenSession = `persisted hidden histogram ${scoutSpace.id}`;
      const from = 'Jan 1, 2010 @ 00:00:00.000';
      const to = 'Mar 21, 2019 @ 00:00:00.000';

      await datePicker.setAbsoluteRange({ from, to });
      await discover.waitUntilSearchingHasFinished();
      await discover.hideChart();
      await expect(discover.getHistogramChart()).toBeHidden();

      await discover.saveSearch(hiddenSession);
      await discover.clickNewSearch();
      await discover.loadSavedSearch(hiddenSession);
      await expect(discover.getHistogramChart()).toBeHidden();

      await discover.showChart();
      await expect(discover.getHistogramChart()).toBeVisible();
      await discover.saveSearch(hiddenSession);
      await discover.clickNewSearch();
      await discover.loadSavedSearch(hiddenSession);
      await expect(discover.getHistogramChart()).toBeVisible();
    }
  );

  spaceTest(
    'does not keep a hidden histogram after visiting Dashboard',
    async ({ apiServices, discoverScoutSpace, pageObjects, scoutSpace }) => {
      const { dashboard, discover } = pageObjects;
      const hiddenSession = `hidden histogram then dashboard ${scoutSpace.id}`;

      await createClassicSession(apiServices, discoverScoutSpace, hiddenSession, {
        hide_chart: true,
      });
      await discover.loadSavedSearch(hiddenSession);
      await expect(discover.getHistogramChart()).toBeHidden();
      await discover.showChart();
      await expect(discover.getHistogramChart()).toBeVisible();

      await dashboard.goto();
      await discover.goto({ queryMode: 'classic' });
      await discover.waitUntilTabIsLoaded();
      await expect(discover.getHistogramChart()).toBeVisible();

      await discover.hideChart();
      await expect(discover.getHistogramChart()).toBeHidden();
    }
  );

  spaceTest(
    'reverts breakdown, interval, and visibility on a saved session',
    async ({ apiServices, discoverScoutSpace, pageObjects, scoutSpace }) => {
      const { discover } = pageObjects;
      const stateSession = `histogram state ${scoutSpace.id}`;

      await createClassicSession(apiServices, discoverScoutSpace, stateSession, {
        dataViewTitle: testData.LONG_WINDOW_LOGSTASH_DATA_VIEW,
      });
      await discover.loadSavedSearch(stateSession);
      await discover.waitUntilSearchingHasFinished();
      await discover.chooseBreakdownField('extension.keyword');
      await discover.setChartInterval('Second');
      await expect(discover.getHistogramChart()).toHaveAttribute(
        'data-request-data',
        /"breakdownField":"extension.keyword"/
      );
      expect(
        JSON.parse((await discover.getHistogramChart().getAttribute('data-request-data')) ?? '')
      ).toMatchObject({
        timeField: '@timestamp',
        timeInterval: 's',
        breakdownField: 'extension.keyword',
      });
      await discover.hideChart();
      await discover.revertUnsavedChanges();
      await expect(discover.getHistogramChart()).not.toHaveAttribute(
        'data-request-data',
        /"breakdownField"/
      );
      const requestData = JSON.parse(
        (await discover.getHistogramChart().getAttribute('data-request-data')) ?? ''
      );
      expect(requestData).toMatchObject({
        timeField: '@timestamp',
        timeInterval: 'auto',
      });
      expect(requestData.breakdownField).toBeUndefined();
    }
  );

  spaceTest(
    'persists the chart interval on a saved session',
    async ({ pageObjects, scoutSpace }) => {
      const { datePicker, discover } = pageObjects;
      const intervalSession = `with chart interval ${scoutSpace.id}`;

      await discover.showChart();
      await datePicker.setAbsoluteRange(testData.DEFAULT_TIME_RANGE_DISPLAY);
      await discover.waitUntilSearchingHasFinished();
      await discover.setChartInterval('Second');
      await discover.saveSearch(intervalSession);
      await discover.clickNewSearch();
      expect(await discover.getChartInterval()).toBe('auto');
      await discover.loadSavedSearch(intervalSession);
      expect(await discover.getChartInterval()).toBe('s');
    }
  );

  spaceTest(
    'clears the chart interval on a saved session',
    async ({ apiServices, discoverScoutSpace, pageObjects, scoutSpace }) => {
      const { discover } = pageObjects;
      const clearedIntervalSession = `with chart interval then cleared ${scoutSpace.id}`;

      await createClassicSession(apiServices, discoverScoutSpace, clearedIntervalSession, {
        chart_interval: 'm',
      });

      await discover.loadSavedSearch(clearedIntervalSession);
      expect(await discover.getChartInterval()).toBe('m');
      await discover.setChartInterval('Auto');
      await discover.saveSearch(clearedIntervalSession);
      await discover.clickNewSearch();
      await discover.loadSavedSearch(clearedIntervalSession);
      expect(await discover.getChartInterval()).toBe('auto');
    }
  );
});
