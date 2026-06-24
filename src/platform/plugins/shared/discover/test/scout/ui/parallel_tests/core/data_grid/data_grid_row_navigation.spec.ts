/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/**
 * Doc-viewer navigation between rows that share an ID across different indices.
 */

import type { ScoutPage } from '@kbn/scout';
import { expect } from '@kbn/scout/ui';
import { spaceTest } from '@kbn/scout';

const TIME_RANGE = {
  from: '2015-09-21T09:00:00.000Z',
  to: '2015-09-21T10:00:00.000Z',
};

const getDocViewerFieldValue = async (page: ScoutPage, fieldName: string): Promise<string> => {
  const flyout = page.testSubj.locator('docViewerFlyout');
  await flyout.waitFor({ state: 'visible' });

  return flyout.locator(`[data-test-subj="tableDocViewRow-${fieldName}-value"]`).innerText();
};

const getIndexNames = (spaceId: string) => ({
  dataViewTitle: `similar_index*_${spaceId}`,
  firstIndex: `similar_index_${spaceId}`,
  secondIndex: `similar_index_two_${spaceId}`,
});

const goToNextDocViewerDocument = async (page: ScoutPage) => {
  const navigation = page.testSubj.locator('docViewerFlyoutNavigation');
  await navigation.waitFor({ state: 'visible' });
  await navigation.locator('[data-test-subj="pagination-button-next"]').click();
};

spaceTest.describe('Discover data grid row navigation', { tag: '@local-stateful-classic' }, () => {
  spaceTest.beforeAll(async ({ scoutSpace, apiServices, esClient }) => {
    const { dataViewTitle, firstIndex, secondIndex } = getIndexNames(scoutSpace.id);

    await esClient.indices.delete({
      index: [firstIndex, secondIndex],
      ignore_unavailable: true,
    });

    await esClient.index({
      index: firstIndex,
      id: '1',
      document: {
        username: 'Dmitry',
        '@timestamp': '2015-09-21T09:30:23.000Z',
        message: 'hello',
      },
      refresh: true,
    });

    await esClient.index({
      index: secondIndex,
      id: '1',
      document: {
        username: 'Dmitry',
        '@timestamp': '2015-09-21T09:30:23.000Z',
        message: 'hello',
      },
      refresh: true,
    });

    const { data: dataView } = await apiServices.dataViews.create({
      title: dataViewTitle,
      name: dataViewTitle,
      timeFieldName: '@timestamp',
      spaceId: scoutSpace.id,
    });

    await scoutSpace.uiSettings.set({
      defaultIndex: dataView.id,
    });
    await scoutSpace.uiSettings.setDefaultTime(TIME_RANGE);
  });

  spaceTest.beforeEach(async ({ browserAuth, pageObjects }) => {
    await browserAuth.loginAsPrivilegedUser();
    await pageObjects.discover.setQueryMode('classic');
    await pageObjects.discover.goto();
    await pageObjects.dataGrid.waitUntilSearchingHasFinished();
    await pageObjects.dataGrid.waitForDocTableRendered();
  });

  spaceTest.afterAll(async ({ scoutSpace, esClient }) => {
    const { firstIndex, secondIndex } = getIndexNames(scoutSpace.id);

    await esClient.indices.delete({
      index: [firstIndex, secondIndex],
      ignore_unavailable: true,
    });
    await scoutSpace.uiSettings.unset('defaultIndex', 'timepicker:timeDefaults');
    await scoutSpace.savedObjects.cleanStandardList();
  });

  spaceTest(
    'navigates through rows with the same document id but different indices',
    async ({ page, pageObjects, scoutSpace }) => {
      const { firstIndex, secondIndex } = getIndexNames(scoutSpace.id);
      const { dataGrid } = pageObjects;

      await spaceTest.step('open the first row in the document viewer', async () => {
        await dataGrid.openAndWaitForDocViewerFlyout({ rowIndex: 0 });
        await expect.poll(() => getDocViewerFieldValue(page, '_index')).toBe(firstIndex);
      });

      await spaceTest.step('navigate to the next row in the document viewer', async () => {
        await goToNextDocViewerDocument(page);
        await expect.poll(() => getDocViewerFieldValue(page, '_index')).toBe(secondIndex);
      });
    }
  );
});
