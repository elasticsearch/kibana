/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/**
 * Tests for metrics grid pagination behavior in Discover tabs.
 *
 * Covers:
 *  1. Tab duplication preserves `currentPage` and breakdown dimension.
 *  2. Changing the breakdown via the toolbar resets `currentPage` to 1.
 *  3. Adding or removing a secondary breakdown dimension also resets
 *     `currentPage` to 1, because the fetch query depends on the full
 *     set of selected dimensions (not only the first).
 */

import { expect } from '@kbn/scout/ui';
import {
  spaceTest,
  testData,
  PAGINATION,
  DEFAULT_CONFIG,
  DEFAULT_TIME_RANGE,
} from '../../fixtures/metrics_experience';

const { PAGE_SIZE, TOTAL_PAGES } = PAGINATION;

const FIRST_DIMENSION = DEFAULT_CONFIG.dimensions[0].name;
const SECOND_DIMENSION = DEFAULT_CONFIG.dimensions[1].name;

const SORTED_METRICS = [...DEFAULT_CONFIG.metrics].sort((a, b) => a.name.localeCompare(b.name));
const FIRST_CARD_PAGE_1 = `${SORTED_METRICS[0].name}-0`;
const FIRST_CARD_LAST_PAGE = `${SORTED_METRICS[PAGE_SIZE * (TOTAL_PAGES - 1)].name}-0`;

spaceTest.describe(
  'Metrics in Discover - Tab Duplication State',
  { tag: testData.METRICS_EXPERIENCE_TAGS },
  () => {
    spaceTest.beforeAll(async ({ scoutSpace }) => {
      await scoutSpace.savedObjects.load(testData.KBN_ARCHIVE);
      await scoutSpace.uiSettings.setDefaultIndex(testData.DATA_VIEW_NAME);
      await scoutSpace.uiSettings.setDefaultTime(DEFAULT_TIME_RANGE);
    });

    spaceTest.beforeEach(async ({ browserAuth, pageObjects }) => {
      const { discover, metricsExperience } = pageObjects;
      await browserAuth.loginAsViewer();
      await discover.goto({ queryMode: 'esql' });
      await discover.writeAndSubmitEsqlQuery(testData.ESQL_QUERIES.TS);
      await expect(metricsExperience.grid).toBeVisible();
      await metricsExperience.waitForFirstCard(FIRST_CARD_PAGE_1);
    });

    spaceTest.afterAll(async ({ scoutSpace }) => {
      await scoutSpace.uiSettings.unset('defaultIndex', 'timepicker:timeDefaults');
      await scoutSpace.savedObjects.cleanStandardList();
    });

    spaceTest(
      'preserves currentPage and breakdown dimension when a tab is duplicated',
      async ({ pageObjects }) => {
        const { metricsExperience, unifiedTabs } = pageObjects;

        const originalTabTestSubj = await unifiedTabs.getActiveTabTestSubj();

        await spaceTest.step('select a breakdown and navigate to last page', async () => {
          await metricsExperience.breakdownSelector.selectDimension(FIRST_DIMENSION);
          await expect(
            metricsExperience.breakdownSelector.getToggleWithSelection(FIRST_DIMENSION)
          ).toBeVisible();

          await metricsExperience.pagination.getPageButton(TOTAL_PAGES - 1).click();
          await metricsExperience.waitForFirstCard(FIRST_CARD_LAST_PAGE);
        });

        await spaceTest.step('duplicate the active tab', async () => {
          await unifiedTabs.duplicateActiveTab();
          const newTabTestSubj = await unifiedTabs.getActiveTabTestSubj();
          expect(newTabTestSubj).not.toBe(originalTabTestSubj);
        });

        await spaceTest.step(
          'duplicated tab shows the same page and breakdown without jumping to page 1',
          async () => {
            await expect(metricsExperience.grid).toBeVisible();
            await metricsExperience.waitForFirstCard(FIRST_CARD_LAST_PAGE);
            await expect(
              metricsExperience.breakdownSelector.getToggleWithSelection(FIRST_DIMENSION)
            ).toBeVisible();
          }
        );
      }
    );

    spaceTest(
      'resets currentPage to 1 when the user changes the breakdown via the toolbar',
      async ({ pageObjects }) => {
        const { metricsExperience } = pageObjects;

        await spaceTest.step('navigate to last page', async () => {
          await metricsExperience.pagination.getPageButton(TOTAL_PAGES - 1).click();
          await metricsExperience.waitForFirstCard(FIRST_CARD_LAST_PAGE);
        });

        await spaceTest.step('switch breakdown dimension and verify page resets to 1', async () => {
          await metricsExperience.breakdownSelector.selectDimension(SECOND_DIMENSION);
          await expect(
            metricsExperience.breakdownSelector.getToggleWithSelection(SECOND_DIMENSION)
          ).toBeVisible();
          await metricsExperience.waitForFirstCard(FIRST_CARD_PAGE_1);
        });
      }
    );

    spaceTest(
      'resets currentPage to 1 when the user adds a secondary breakdown dimension',
      async ({ pageObjects }) => {
        const { metricsExperience } = pageObjects;

        await spaceTest.step('select first breakdown and navigate to last page', async () => {
          await metricsExperience.breakdownSelector.selectDimension(FIRST_DIMENSION);
          await expect(
            metricsExperience.breakdownSelector.getToggleWithSelection(FIRST_DIMENSION)
          ).toBeVisible();
          await metricsExperience.pagination.getPageButton(TOTAL_PAGES - 1).click();
          await metricsExperience.waitForFirstCard(FIRST_CARD_LAST_PAGE);
        });

        await spaceTest.step('add a secondary dimension and verify page resets to 1', async () => {
          await metricsExperience.breakdownSelector.selectDimension(SECOND_DIMENSION);
          await expect(
            metricsExperience.breakdownSelector.getToggleWithSelection(SECOND_DIMENSION)
          ).toBeVisible();
          await metricsExperience.waitForFirstCard(FIRST_CARD_PAGE_1);
        });
      }
    );

    spaceTest(
      'resets currentPage to 1 when the user removes a secondary breakdown dimension',
      async ({ pageObjects }) => {
        const { metricsExperience } = pageObjects;

        await spaceTest.step('select both dimensions and navigate to last page', async () => {
          await metricsExperience.breakdownSelector.selectDimension(FIRST_DIMENSION);
          await metricsExperience.breakdownSelector.selectDimension(SECOND_DIMENSION);
          await metricsExperience.pagination.getPageButton(TOTAL_PAGES - 1).click();
          await metricsExperience.waitForFirstCard(FIRST_CARD_LAST_PAGE);
        });

        await spaceTest.step(
          'remove the secondary dimension and verify page resets to 1',
          async () => {
            await metricsExperience.breakdownSelector.selectDimension(SECOND_DIMENSION);
            await expect(
              metricsExperience.breakdownSelector.getToggleWithSelection(SECOND_DIMENSION)
            ).toBeHidden();
            await metricsExperience.waitForFirstCard(FIRST_CARD_PAGE_1);
          }
        );
      }
    );
  }
);
