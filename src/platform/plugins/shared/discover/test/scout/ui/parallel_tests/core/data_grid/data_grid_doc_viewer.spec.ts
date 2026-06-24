/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/**
 * Discover data-grid cell-expand popover + row-toggle flyout behaviours.
 */

import { spaceTest, tags } from '@kbn/scout';
import { expect } from '@kbn/scout/ui';
import { testData } from '../../../fixtures/common';

const EXPECTED_FIRST_ROW_TIMESTAMP = 'Sep 22, 2015 @ 23:50:13.253';
const EXPECTED_FIRST_ROW_ID = 'AU_x3_g4GFA8no6QjkYX';

spaceTest.describe('Discover data grid - doc viewer', { tag: tags.stateful.all }, () => {
  // EUI DataGrid hides/truncates inline cellActions at narrow widths. The FTR
  // equivalent ran at 1600x1200 via `browser.setWindowSize`; match that here so
  // the doc-viewer flyout has room to render its "toggle column" actions.
  spaceTest.use({ viewport: { width: 1600, height: 1200 } });

  spaceTest.beforeAll(async ({ scoutSpace }) => {
    await scoutSpace.savedObjects.load(testData.DISCOVER_KBN_ARCHIVE);
    await scoutSpace.uiSettings.setDefaultIndex(testData.DEFAULT_DATA_VIEW);
    await scoutSpace.uiSettings.setDefaultTime(testData.DEFAULT_TIME_RANGE);
    await scoutSpace.uiSettings.set({ 'discover:rowHeightOption': 0 });
  });

  spaceTest.beforeEach(async ({ browserAuth, pageObjects }) => {
    // Privileged user is needed to save the search used by the embeddable test.
    await browserAuth.loginAsPrivilegedUser();
    await pageObjects.discover.setQueryMode('classic');
    await pageObjects.discover.goto();
    await pageObjects.dataGrid.waitUntilSearchingHasFinished();
    await pageObjects.dataGrid.waitForDocTableRendered();
  });

  spaceTest.afterAll(async ({ scoutSpace }) => {
    await scoutSpace.uiSettings.unset(
      'defaultIndex',
      'timepicker:timeDefaults',
      'discover:rowHeightOption'
    );
    await scoutSpace.savedObjects.cleanStandardList();
  });

  spaceTest('expands cell content via the cell-expand button', async ({ pageObjects }) => {
    // Sanity-check we're on the expected document so the hard-coded _id below
    // is stable
    await expect(pageObjects.dataGrid.getCell(0, '@timestamp')).toContainText(
      EXPECTED_FIRST_ROW_TIMESTAMP
    );

    await pageObjects.dataGrid.expandCell({ rowIndex: 0, columnId: '_source' });
    const popoverDoc = await pageObjects.dataGrid.readJsonFromCodeEditor<{ _id: string }>();
    expect(popoverDoc._id).toBe(EXPECTED_FIRST_ROW_ID);

    // Open the full flyout and read JSON from the source tab. Serverless O11y can
    // default to "Log overview" so Monaco is not mounted until the JSON tab is open.
    await pageObjects.dataGrid.openAndWaitForDocViewerFlyout({ rowIndex: 0 });
    await pageObjects.dataGrid.openDocViewerTab('doc_view_source');
    const flyoutDoc = await pageObjects.dataGrid.readJsonFromCodeEditor<{ _id: string }>();
    expect(flyoutDoc._id).toBe(popoverDoc._id);

    await pageObjects.dataGrid.closeDocViewerFlyout();
  });

  spaceTest(
    'expands cell content via the cell-expand button on a dashboard embeddable',
    async ({ pageObjects }) => {
      await pageObjects.discover.saveSearch('expand-cell-search');

      await pageObjects.dashboard.openNewDashboard();
      await pageObjects.dashboard.addSavedSearch('expand-cell-search');
      await pageObjects.dataGrid.waitUntilSearchingHasFinished();
      await pageObjects.dataGrid.waitForDocTableRendered();

      await expect(pageObjects.dataGrid.getCell(0, '@timestamp')).toContainText(
        EXPECTED_FIRST_ROW_TIMESTAMP
      );

      await pageObjects.dataGrid.expandCell({ rowIndex: 0, columnId: '_source' });
      const popoverDoc = await pageObjects.dataGrid.readJsonFromCodeEditor<{ _id: string }>();
      expect(popoverDoc._id).toBe(EXPECTED_FIRST_ROW_ID);

      await pageObjects.dataGrid.openAndWaitForDocViewerFlyout({ rowIndex: 0 });
      await pageObjects.dataGrid.openDocViewerTab('doc_view_source');
      const flyoutDoc = await pageObjects.dataGrid.readJsonFromCodeEditor<{ _id: string }>();
      expect(flyoutDoc._id).toBe(popoverDoc._id);
    }
  );

  spaceTest('expands a document row via the row toggle', async ({ page, pageObjects }) => {
    await pageObjects.dataGrid.openAndWaitForDocViewerFlyout({ rowIndex: 0 });
    await expect(page.testSubj.locator('docViewerRowDetailsTitle')).toBeVisible();
  });

  spaceTest('shows the detail panel row actions', async ({ pageObjects }) => {
    await pageObjects.dataGrid.openAndWaitForDocViewerFlyout({ rowIndex: 0 });

    expect(await pageObjects.dataGrid.getDocViewerRowActionCount()).toBe(2);
  });

  spaceTest(
    'paginates docs in the flyout when clicking a different row in the grid',
    async ({ page, pageObjects }) => {
      await pageObjects.dataGrid.openAndWaitForDocViewerFlyout({ rowIndex: 0 });
      await expect(page.testSubj.locator('docViewerFlyoutNavigationPage-0')).toBeVisible();

      await pageObjects.dataGrid.openAndWaitForDocViewerFlyout({ rowIndex: 1 });
      await expect(page.testSubj.locator('docViewerFlyoutNavigationPage-1')).toBeVisible();

      await pageObjects.dataGrid.closeDocViewerFlyout();
    }
  );

  spaceTest('adds and removes columns from the detail panel', async ({ pageObjects }) => {
    const fields = ['_id', '_index', 'agent'];

    await pageObjects.dataGrid.openAndWaitForDocViewerFlyout({ rowIndex: 0 });
    // The "toggle column" action is only exposed on the field-table tab.
    await pageObjects.dataGrid.openDocViewerTab('doc_view_table');
    for (const field of fields) {
      await pageObjects.dataGrid.toggleColumnInDocViewer(field);
    }
    for (const field of fields) {
      await expect(
        pageObjects.dataGrid.getColumnHeader(field),
        `column ${field} should appear in the grid after adding it from the flyout`
      ).toBeVisible();
    }

    // Calling the same toggle again removes the column.
    for (const field of fields) {
      await pageObjects.dataGrid.toggleColumnInDocViewer(field);
    }
    for (const field of fields) {
      await expect(
        pageObjects.dataGrid.getColumnHeader(field),
        `column ${field} should be removed from the grid`
      ).toBeHidden();
    }

    await pageObjects.dataGrid.closeDocViewerFlyout();
  });
});
