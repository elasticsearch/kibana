/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { expect } from '@kbn/scout/ui';
import { spaceTest, testData } from '../fixtures';

const INSPECTOR_PAGE_SIZE = 10;

spaceTest.describe('Lens inspector pagination', { tag: '@local-stateful-classic' }, () => {
  spaceTest.beforeAll(async ({ scoutSpace, apiServices }) => {
    await scoutSpace.uiSettings.set({
      defaultIndex: testData.DATA_VIEW_ID.LOGSTASH,
      'dateFormat:tz': 'UTC',
      'timepicker:timeDefaults': JSON.stringify({
        from: testData.LOGSTASH_IN_RANGE_DATES.from,
        to: testData.LOGSTASH_IN_RANGE_DATES.to,
      }),
    });

    await apiServices.dataViews.create({
      title: testData.DATA_VIEW_ID.LOGSTASH,
      name: `scout-inspector-pagination-dv-${Date.now()}`,
      timeFieldName: '@timestamp',
      spaceId: scoutSpace.id,
    });
  });

  spaceTest.afterAll(async ({ scoutSpace }) => {
    await scoutSpace.uiSettings.unset('defaultIndex', 'dateFormat:tz', 'timepicker:timeDefaults');
    await scoutSpace.savedObjects.cleanStandardList();
  });

  spaceTest(
    'should allow switching between inspector table pages',
    async ({ browserAuth, pageObjects }) => {
      const { lens, inspector } = pageObjects;

      await browserAuth.loginAsPrivilegedUser();
      await lens.workspace.openFullEditor();

      await lens.configureDimension({
        dimension: 'lnsXY_xDimensionPanel > lns-empty-dimension',
        operation: 'date_histogram',
        field: '@timestamp',
        keepOpen: true,
      });

      // Bar charts default "Include empty rows" off; keep the empty buckets so this
      // pagination check still has two full pages of rows to page through.
      await lens.dimensions.enableIncludeEmptyRows();
      await lens.closeDimensionEditor();

      await lens.configureDimension({
        dimension: 'lnsXY_yDimensionPanel > lns-empty-dimension',
        operation: 'average',
        field: 'bytes',
      });

      await lens.configureDimension({
        dimension: 'lnsXY_splitDimensionPanel > lns-empty-dimension',
        operation: 'terms',
        field: 'geo.dest',
      });

      await lens.workspace.clickAppMenuItem('lnsApp_inspectButton');
      await inspector.panel.waitFor({ state: 'visible' });
      await inspector.setTablePageSize(INSPECTOR_PAGE_SIZE);

      // Wait for the resized page to land — getTableData snapshots the DOM immediately.
      await expect
        .poll(async () => (await inspector.getTableData()).length)
        .toBe(INSPECTOR_PAGE_SIZE);
      const pageOneRows = await inspector.getTableData();

      await inspector.goToTablePage(1);
      await expect.poll(async () => await inspector.getTableData()).not.toStrictEqual(pageOneRows);
      const pageTwoRows = await inspector.getTableData();
      expect(pageTwoRows).toHaveLength(INSPECTOR_PAGE_SIZE);
    }
  );
});
