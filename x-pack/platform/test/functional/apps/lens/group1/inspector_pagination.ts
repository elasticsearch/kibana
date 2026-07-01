/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { NULL_LABEL } from '@kbn/field-formats-common';
import type { FtrProviderContext } from '../../../ftr_provider_context';

export default function ({ getService, getPageObjects }: FtrProviderContext) {
  const { visualize, lens, timePicker } = getPageObjects(['visualize', 'lens', 'timePicker']);
  const testSubjects = getService('testSubjects');
  const inspector = getService('inspector');

  describe('Inspector', () => {
    it('should allow switch between table page', async () => {
      await visualize.navigateToNewVisualization();
      await visualize.clickVisType('lens');
      await timePicker.setDefaultAbsoluteRange();

      await lens.configureDimension({
        dimension: 'lnsXY_xDimensionPanel > lns-empty-dimension',
        operation: 'date_histogram',
        field: '@timestamp',
        keepOpen: true,
      });
      // Bar charts default "Include empty rows" off; keep the empty buckets so this
      // pagination check still has two full pages of rows to page through.
      await testSubjects.setEuiSwitch('indexPattern-include-empty-rows', 'check');
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

      await inspector.open('lnsApp_inspectButton');
      await inspector.setTablePageSize(10);

      await inspector.expectTableData([
        ['BT', '2015-09-19 06:00', NULL_LABEL],
        ['BT', '2015-09-19 09:00', NULL_LABEL],
        ['BT', '2015-09-19 12:00', NULL_LABEL],
        ['BT', '2015-09-19 15:00', NULL_LABEL],
        ['BT', '2015-09-19 18:00', NULL_LABEL],
        ['BT', '2015-09-19 21:00', NULL_LABEL],
        ['BT', '2015-09-20 00:00', NULL_LABEL],
        ['BT', '2015-09-20 03:00', NULL_LABEL],
        ['BT', '2015-09-20 06:00', NULL_LABEL],
        ['BT', '2015-09-20 09:00', NULL_LABEL],
      ]);
      await testSubjects.click('pagination-button-1');
      await inspector.expectTableData([
        ['BT', '2015-09-20 12:00', NULL_LABEL],
        ['BT', '2015-09-20 15:00', NULL_LABEL],
        ['BT', '2015-09-20 18:00', NULL_LABEL],
        ['BT', '2015-09-20 21:00', NULL_LABEL],
        ['BT', '2015-09-21 00:00', NULL_LABEL],
        ['BT', '2015-09-21 03:00', NULL_LABEL],
        ['BT', '2015-09-21 06:00', NULL_LABEL],
        ['BT', '2015-09-21 09:00', NULL_LABEL],
        ['BT', '2015-09-21 12:00', NULL_LABEL],
        ['BT', '2015-09-21 15:00', NULL_LABEL],
      ]);
    });
  });
}
