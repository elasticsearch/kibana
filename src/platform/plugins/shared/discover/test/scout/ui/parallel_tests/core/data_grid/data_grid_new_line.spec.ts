/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/**
 * Newline rendering in data-grid cells across document and explicit columns.
 */

import type { Locator } from '@kbn/scout';
import { expect } from '@kbn/scout/ui';
import { spaceTest } from '@kbn/scout';
import { testData } from '../../../fixtures/common';

const NEWLINE_INDEX = 'newline';
const VALUE_WITH_NEW_LINES = "Newline!\nHere's a newline.\nHere's a newline again.";
const VALUE_WITHOUT_NEW_LINES = VALUE_WITH_NEW_LINES.replaceAll('\n', ' ');

const whiteSpaceOf = (locator: Locator) =>
  locator.evaluate((el) => window.getComputedStyle(el).whiteSpace);

spaceTest.describe(
  'Discover data grid new line support',
  { tag: '@local-stateful-classic' },
  () => {
    spaceTest.beforeAll(async ({ scoutSpace, apiServices, esClient }) => {
      await esClient.indices.delete({ index: NEWLINE_INDEX, ignore_unavailable: true });
      await esClient.index({
        index: NEWLINE_INDEX,
        document: {
          message: VALUE_WITH_NEW_LINES,
        },
        refresh: true,
      });

      await scoutSpace.savedObjects.load(testData.DISCOVER_KBN_ARCHIVE);
      await scoutSpace.uiSettings.setDefaultIndex(testData.DEFAULT_DATA_VIEW);
      await scoutSpace.uiSettings.setDefaultTime(testData.DEFAULT_TIME_RANGE);

      // Persisted data view (no time field) over the suite-local newline fixture.
      // Mirrors the FTR ad-hoc data view, but set up via the API so it doesn't
      // depend on the data-view-creation UI.
      await apiServices.dataViews.create({
        title: NEWLINE_INDEX,
        name: NEWLINE_INDEX,
        spaceId: scoutSpace.id,
      });
    });

    spaceTest.beforeEach(async ({ page, browserAuth, pageObjects }) => {
      await page.setViewportSize({ width: 1200, height: 2000 });
      await browserAuth.loginAsViewer();
      await pageObjects.discover.setQueryMode('classic');
      await pageObjects.discover.goto();
      await pageObjects.dataGrid.waitUntilSearchingHasFinished();
      await pageObjects.discover.selectDataView(NEWLINE_INDEX);
      await pageObjects.dataGrid.waitUntilSearchingHasFinished();
      await pageObjects.dataGrid.waitForDocTableRendered();
    });

    spaceTest.afterAll(async ({ scoutSpace, esClient }) => {
      await esClient.indices.delete({ index: NEWLINE_INDEX, ignore_unavailable: true });
      await scoutSpace.uiSettings.unset('defaultIndex', 'timepicker:timeDefaults');
      await scoutSpace.savedObjects.cleanStandardList();
    });

    spaceTest('does not show new lines for the Document column', async ({ pageObjects }) => {
      const description = pageObjects.dataGrid.getDocumentColumnFieldValue(0, 'message');

      await expect(description).toBeVisible();
      await expect(description).toHaveText(VALUE_WITHOUT_NEW_LINES);
      expect(await whiteSpaceOf(description)).toBe('normal');
    });

    spaceTest(
      'shows new lines for the "message" column except for the single-line row height',
      async ({ page, pageObjects }) => {
        await pageObjects.dataGrid.addFieldFromSidebar('message');
        await pageObjects.dataGrid.waitUntilSearchingHasFinished();

        const messageValue = () =>
          pageObjects.dataGrid.getCell(0, 'message').locator('.unifiedDataTable__cellValue');

        // Default (Custom) row height preserves newlines.
        await expect(messageValue()).toBeVisible();
        await expect.poll(async () => messageValue().innerText()).toBe(VALUE_WITH_NEW_LINES);
        expect(await whiteSpaceOf(messageValue())).toBe('pre-wrap');

        // Auto row height still preserves newlines.
        await pageObjects.dataGrid.openGridDisplaySettings();
        expect(await pageObjects.dataGrid.getCurrentRowHeight()).toBe('Custom');
        await pageObjects.dataGrid.setRowHeight('Auto');
        await pageObjects.dataGrid.openGridDisplaySettings();

        await expect.poll(async () => messageValue().innerText()).toBe(VALUE_WITH_NEW_LINES);
        expect(await whiteSpaceOf(messageValue())).toBe('pre-wrap');

        // Single-line (Custom = 1 line) row height collapses newlines.
        await pageObjects.dataGrid.openGridDisplaySettings();
        expect(await pageObjects.dataGrid.getCurrentRowHeight()).toBe('Auto');
        await pageObjects.dataGrid.setRowHeight('Custom');

        await spaceTest.step('set custom row height to one line', async () => {
          const input = page.testSubj.locator('unifiedDataTableRowHeightSettings_lineCountNumber');
          await expect(input).toBeVisible();
          await input.fill('1');
        });

        await pageObjects.dataGrid.openGridDisplaySettings();

        await expect.poll(async () => messageValue().innerText()).toBe(VALUE_WITHOUT_NEW_LINES);
        expect(await whiteSpaceOf(messageValue())).toBe('nowrap');
      }
    );
  }
);
