/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { expect } from '@kbn/scout/ui';
import { spaceTest, testData, resolveDataViewId } from '../../../fixtures/surrounding_docs';

const TEST_DEFAULT_CONTEXT_SIZE = 1;
const TEST_STEP_SIZE = 3;

spaceTest.describe('Discover context - date_nanos', { tag: '@local-stateful-classic' }, () => {
  let dataViewId: string;

  spaceTest.beforeAll(async ({ scoutSpace }) => {
    const imported = await scoutSpace.savedObjects.load(testData.KBN_ARCHIVE_DATE_NANOS);
    dataViewId = resolveDataViewId(imported, testData.DATE_NANOS_INDEX_PATTERN);
    await scoutSpace.uiSettings.setDefaultIndex(testData.DATE_NANOS_INDEX_PATTERN);
    await scoutSpace.uiSettings.set({
      'context:defaultSize': String(TEST_DEFAULT_CONTEXT_SIZE),
      'context:step': String(TEST_STEP_SIZE),
    });
  });

  spaceTest.beforeEach(async ({ browserAuth }) => {
    await browserAuth.loginAsViewer();
  });

  spaceTest.afterAll(async ({ scoutSpace }) => {
    await scoutSpace.uiSettings.unset('defaultIndex', 'context:defaultSize', 'context:step');
    await scoutSpace.savedObjects.cleanStandardList();
  });

  spaceTest(
    'displays predecessors - anchor - successors in right order',
    async ({ pageObjects }) => {
      await pageObjects.contextPage.navigateTo(dataViewId, 'AU_x3-TaGFA8no6Qj999Z');

      const rows = await pageObjects.discover.getDataGridRows();
      const timestamps = rows.map((row) => row[0]);
      expect(timestamps).toStrictEqual([
        'Sep 18, 2019 @ 06:50:13.000000000',
        'Sep 18, 2019 @ 06:50:12.999999999',
        'Sep 19, 2015 @ 06:50:13.000100001',
      ]);
    }
  );

  spaceTest(
    'displays correctly when predecessors and successors are loaded',
    async ({ pageObjects }) => {
      await pageObjects.contextPage.navigateTo(dataViewId, 'AU_x3-TaGFA8no6Qjisd');
      await pageObjects.contextPage.clickPredecessorLoadMoreButton();
      await pageObjects.contextPage.clickSuccessorLoadMoreButton();

      const rows = await pageObjects.discover.getDataGridRows();
      const timestamps = rows.map((row) => row[0]);
      expect(timestamps).toStrictEqual([
        'Sep 22, 2019 @ 23:50:13.253123345',
        'Sep 18, 2019 @ 06:50:13.000000104',
        'Sep 18, 2019 @ 06:50:13.000000103',
        'Sep 18, 2019 @ 06:50:13.000000102',
        'Sep 18, 2019 @ 06:50:13.000000101',
        'Sep 18, 2019 @ 06:50:13.000000001',
        'Sep 18, 2019 @ 06:50:13.000000000',
        'Sep 18, 2019 @ 06:50:12.999999999',
        'Sep 19, 2015 @ 06:50:13.000100001',
      ]);
    }
  );
});
