/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/**
 * Discover data-grid document-viewer navigation and field actions.
 */

import { expect } from '@kbn/scout/ui';
import { spaceTest } from '@kbn/scout';
import { testData } from '../../../fixtures/common';

spaceTest.describe(
  'Discover data grid - document navigation',
  { tag: '@local-stateful-classic' },
  () => {
    spaceTest.use({ viewport: { width: 1600, height: 1200 } });

    spaceTest.beforeAll(async ({ scoutSpace }) => {
      await scoutSpace.savedObjects.load(testData.DISCOVER_KBN_ARCHIVE);
      await scoutSpace.uiSettings.setDefaultIndex(testData.DEFAULT_DATA_VIEW);
      await scoutSpace.uiSettings.setDefaultTime(testData.DEFAULT_TIME_RANGE);
    });

    spaceTest.beforeEach(async ({ browserAuth, pageObjects }) => {
      await browserAuth.loginAsViewer();
      await pageObjects.discover.setQueryMode('classic');
      await pageObjects.discover.goto();
      await pageObjects.dataGrid.waitUntilSearchingHasFinished();
      await pageObjects.dataGrid.waitForDocTableRendered();
    });

    spaceTest.afterAll(async ({ scoutSpace }) => {
      await scoutSpace.uiSettings.unset('defaultIndex', 'timepicker:timeDefaults');
      await scoutSpace.savedObjects.cleanStandardList();
    });

    spaceTest(
      'opens the single-document view from the selected row',
      async ({ page, pageObjects }) => {
        await pageObjects.dataGrid.openAndWaitForDocViewerFlyout({ rowIndex: 0 });
        await page.testSubj.locator('docViewerFlyout').getByLabel('View single document').click();

        const docHit = page.testSubj.locator('doc-hit');
        await docHit.waitFor();
        await expect(docHit).toBeVisible();
      }
    );

    spaceTest(
      'creates an exists filter from the selected document flyout',
      async ({ pageObjects }) => {
        await pageObjects.dataGrid.openAndWaitForDocViewerFlyout({ rowIndex: 0 });
        await pageObjects.dataGrid.clickFieldActionInDocViewer(
          '@timestamp',
          'addExistsFilterButton'
        );
        await pageObjects.dataGrid.waitUntilSearchingHasFinished();

        expect(
          await pageObjects.filterBar.hasFilter({
            field: '@timestamp',
            value: 'exists',
            enabled: true,
            pinned: false,
            negated: false,
          })
        ).toBe(true);
      }
    );
  }
);
