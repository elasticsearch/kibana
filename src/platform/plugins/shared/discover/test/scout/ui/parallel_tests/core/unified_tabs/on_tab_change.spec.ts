/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { PageObjects } from '@kbn/scout';
import { expect } from '@kbn/scout/ui';
import { spaceTest, testData } from '../../../fixtures/common';

const DOC_VIEWER_TABLE_TAB_ID = 'doc_view_table';
const DOC_VIEWER_JSON_TAB_ID = 'doc_view_source';

const FLIGHTS_TIME_RANGE_DISPLAY = {
  from: 'Apr 10, 2018 @ 00:00:00.000',
  to: 'Nov 15, 2018 @ 00:00:00.000',
};

const FLIGHTS_TIME_RANGE = {
  start: '2018-04-10T00:00:00.000Z',
  end: '2018-11-15T00:00:00.000Z',
};

const LOGSTASH_TIME_RANGE = {
  start: testData.DEFAULT_TIME_RANGE.from,
  end: testData.DEFAULT_TIME_RANGE.to,
};

const QUERY_WITH_TIME_FIELD =
  'FROM kibana_sample_data_flights | WHERE timestamp >= ?_tstart AND timestamp <= ?_tend | LIMIT 50';
const QUERY_WITHOUT_TIME_FIELD = 'FROM kibana_sample_data_flights';
const DEFAULT_ESQL_QUERY = 'FROM logstash-*';

const expectDisabledAllTimeState = async (
  pageObjects: PageObjects,
  expected: 'enabled' | 'disabled'
) => {
  const { datePicker } = pageObjects;

  await expect(datePicker.getTimePickerControl()).toBeVisible();

  if (expected === 'disabled') {
    await expect(datePicker.getDisabledDatePickerIndicator()).toBeAttached();
  } else {
    await expect(datePicker.getDisabledDatePickerIndicator()).toBeHidden();
  }
};

const expectCurrentEsqlTabState = async (
  pageObjects: PageObjects,
  {
    disabledAllTime,
    query,
    hitCount,
    timeRange,
  }: {
    disabledAllTime: 'enabled' | 'disabled';
    query: string;
    hitCount: number;
    timeRange?: { start: string; end: string };
  }
) => {
  const { datePicker, discover } = pageObjects;

  await expectDisabledAllTimeState(pageObjects, disabledAllTime);
  expect(await discover.getEsqlQueryValue()).toBe(query);
  expect(await discover.getHitCountInt()).toBe(hitCount);

  if (timeRange) {
    expect(await datePicker.getTimeConfig()).toStrictEqual(timeRange);
  }
};

spaceTest.describe('Discover tabs - on tab change', { tag: '@local-stateful-classic' }, () => {
  spaceTest.beforeAll(async ({ discoverScoutSpace }) => {
    await discoverScoutSpace.setupDiscoverDefaults({ loadFlightsDataView: true });
  });

  spaceTest.beforeEach(async ({ browserAuth, pageObjects }) => {
    await browserAuth.loginAsPrivilegedUser();
    await pageObjects.discover.goto({ queryMode: 'classic' });
    await pageObjects.discover.waitUntilTabIsLoaded();
  });

  spaceTest.afterAll(async ({ discoverScoutSpace }) => {
    await discoverScoutSpace.teardownDiscoverDefaults();
  });

  spaceTest(
    'should maintain separate DocViewer state for different tabs and retain it while switching tabs',
    async ({ pageObjects }) => {
      const { dataGrid, discover, unifiedTabs } = pageObjects;

      await spaceTest.step('tab 0: open DocViewer and switch to JSON tab', async () => {
        await dataGrid.openAndWaitForDocViewerFlyout({ rowIndex: 0 });
        await expect(dataGrid.getDocViewer()).toBeVisible();

        await dataGrid.openDocViewerTab(DOC_VIEWER_JSON_TAB_ID);
        await expect(dataGrid.getDocViewerTab(DOC_VIEWER_JSON_TAB_ID)).toHaveAttribute(
          'aria-selected',
          'true'
        );
      });

      await spaceTest.step('tab 1: open DocViewer and keep the default Table tab', async () => {
        await unifiedTabs.createNewTab();
        await discover.waitUntilTabIsLoaded();

        await expect(dataGrid.getDocViewer()).toBeHidden();
        await dataGrid.openAndWaitForDocViewerFlyout({ rowIndex: 1 });
        await expect(dataGrid.getDocViewer()).toBeVisible();

        await dataGrid.openDocViewerTab(DOC_VIEWER_TABLE_TAB_ID);
        await expect(dataGrid.getDocViewerTab(DOC_VIEWER_TABLE_TAB_ID)).toHaveAttribute(
          'aria-selected',
          'true'
        );
      });

      await spaceTest.step('switching tabs restores each DocViewer selected tab', async () => {
        await unifiedTabs.selectTab(0);
        await discover.waitUntilTabIsLoaded();
        await expect(dataGrid.getDocViewer()).toBeVisible();
        await expect(dataGrid.getDocViewerTab(DOC_VIEWER_JSON_TAB_ID)).toHaveAttribute(
          'aria-selected',
          'true'
        );

        await unifiedTabs.selectTab(1);
        await discover.waitUntilTabIsLoaded();
        await expect(dataGrid.getDocViewer()).toBeVisible();
        await expect(dataGrid.getDocViewerTab(DOC_VIEWER_TABLE_TAB_ID)).toHaveAttribute(
          'aria-selected',
          'true'
        );
      });
    }
  );

  spaceTest('should close the Lens edit flyout on tab change', async ({ pageObjects }) => {
    const { discover, unifiedTabs } = pageObjects;

    await spaceTest.step('open a Lens edit flyout in an ES|QL tab', async () => {
      await discover.selectTextBaseLang();
      await discover.waitUntilTabIsLoaded();
      await unifiedTabs.createNewTab();
      await discover.waitUntilTabIsLoaded();

      await discover.openLensEditFlyout();
      await expect(discover.getLensEditFlyout()).toBeVisible();
    });

    await spaceTest.step('switching tabs closes the Lens edit flyout', async () => {
      await unifiedTabs.selectTab(0);
      await discover.waitUntilTabIsLoaded();
      await expect(discover.getLensEditFlyout()).toBeHidden();
    });

    await spaceTest.step('creating a new tab closes the Lens edit flyout', async () => {
      await discover.openLensEditFlyout();
      await expect(discover.getLensEditFlyout()).toBeVisible();

      await unifiedTabs.createNewTab();
      await discover.waitUntilTabIsLoaded();
      await expect(discover.getLensEditFlyout()).toBeHidden();
    });
  });

  spaceTest('should detect time field change in ES|QL query correctly', async ({ pageObjects }) => {
    const { datePicker, discover, unifiedTabs } = pageObjects;

    await spaceTest.step('tab 0: start in ES|QL mode with the default logstash query', async () => {
      await discover.selectTextBaseLang();
      await discover.waitUntilTabIsLoaded();
      await expectCurrentEsqlTabState(pageObjects, {
        disabledAllTime: 'enabled',
        query: DEFAULT_ESQL_QUERY,
        hitCount: 1_000,
        timeRange: LOGSTASH_TIME_RANGE,
      });
    });

    await spaceTest.step('tab 1: run a flights query with explicit time-field params', async () => {
      await unifiedTabs.createNewTab();
      await discover.waitUntilTabIsLoaded();
      await expectDisabledAllTimeState(pageObjects, 'enabled');

      await datePicker.setAbsoluteRange(FLIGHTS_TIME_RANGE_DISPLAY);
      await discover.waitUntilTabIsLoaded();
      await discover.writeAndSubmitEsqlQuery(QUERY_WITH_TIME_FIELD);
      await expectCurrentEsqlTabState(pageObjects, {
        disabledAllTime: 'enabled',
        query: QUERY_WITH_TIME_FIELD,
        hitCount: 50,
        timeRange: FLIGHTS_TIME_RANGE,
      });
    });

    await spaceTest.step('tab 2: run a flights query without a time field', async () => {
      await unifiedTabs.createNewTab();
      await discover.waitUntilTabIsLoaded();
      await expectDisabledAllTimeState(pageObjects, 'enabled');

      await discover.writeAndSubmitEsqlQuery(QUERY_WITHOUT_TIME_FIELD);
      await expectCurrentEsqlTabState(pageObjects, {
        disabledAllTime: 'disabled',
        query: QUERY_WITHOUT_TIME_FIELD,
        hitCount: 1_000,
      });
    });

    await spaceTest.step('switching tabs restores each ES|QL time-field state', async () => {
      await unifiedTabs.selectTab(0);
      await discover.waitUntilTabIsLoaded();
      await expectCurrentEsqlTabState(pageObjects, {
        disabledAllTime: 'enabled',
        query: DEFAULT_ESQL_QUERY,
        hitCount: 1_000,
        timeRange: LOGSTASH_TIME_RANGE,
      });

      await unifiedTabs.selectTab(1);
      await discover.waitUntilTabIsLoaded();
      await expectCurrentEsqlTabState(pageObjects, {
        disabledAllTime: 'enabled',
        query: QUERY_WITH_TIME_FIELD,
        hitCount: 50,
        timeRange: FLIGHTS_TIME_RANGE,
      });

      await unifiedTabs.selectTab(2);
      await discover.waitUntilTabIsLoaded();
      await expectCurrentEsqlTabState(pageObjects, {
        disabledAllTime: 'disabled',
        query: QUERY_WITHOUT_TIME_FIELD,
        hitCount: 1_000,
      });
    });

    await spaceTest.step('tab 2: adding time-field params re-enables the time picker', async () => {
      await discover.writeAndSubmitEsqlQuery(QUERY_WITH_TIME_FIELD);
      await expectCurrentEsqlTabState(pageObjects, {
        disabledAllTime: 'enabled',
        query: QUERY_WITH_TIME_FIELD,
        hitCount: 50,
        timeRange: FLIGHTS_TIME_RANGE,
      });
    });
  });
});
