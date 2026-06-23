/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/**
 * Grid Navigation tests: pagination, search, and breakdown.
 *
 * These tests use a dynamically created TSDB index (test-metrics-experience)
 * with 45 metric fields (23 gauge + 22 counter) and 30 dimensions to exercise
 * pagination, search, and breakdown scenarios.
 */

import { expect } from '@kbn/scout/ui';
import {
  spaceTest,
  testData,
  PAGINATION,
  DEFAULT_TIME_RANGE,
  DEFAULT_CONFIG,
} from '../../fixtures/metrics_experience';

const { PAGE_SIZE, TOTAL_PAGES, LAST_PAGE_CARDS } = PAGINATION;

const SEARCH_METRIC_NAME = DEFAULT_CONFIG.metrics[0].name;
const FIRST_DIMENSION = DEFAULT_CONFIG.dimensions[0].name;
const SECOND_DIMENSION = DEFAULT_CONFIG.dimensions[1].name;
const { name: FILTER_DIMENSION_NAME, values: FILTER_DIMENSION_VALUES } =
  DEFAULT_CONFIG.dimensions[0];

const SORTED_METRICS = [...DEFAULT_CONFIG.metrics].sort((a, b) => a.name.localeCompare(b.name));
const FIRST_CARD_PAGE_1 = `${SORTED_METRICS[0].name}-0`;
const FIRST_CARD_PAGE_2 = `${SORTED_METRICS[PAGE_SIZE].name}-0`;
const FIRST_CARD_LAST_PAGE = `${SORTED_METRICS[PAGE_SIZE * (TOTAL_PAGES - 1)].name}-0`;

spaceTest.describe(
  'Metrics in Discover - Grid Navigation',
  {
    tag: testData.METRICS_EXPERIENCE_TAGS,
  },
  () => {
    spaceTest.beforeAll(async ({ scoutSpace }) => {
      await scoutSpace.savedObjects.load(testData.KBN_ARCHIVE);
      await scoutSpace.uiSettings.setDefaultIndex(testData.DATA_VIEW_NAME);
      await scoutSpace.uiSettings.setDefaultTime(DEFAULT_TIME_RANGE);
    });

    spaceTest.beforeEach(async ({ browserAuth, pageObjects }) => {
      await browserAuth.loginAsViewer();
      await pageObjects.discover.goto({ queryMode: 'esql' });
    });

    spaceTest.afterAll(async ({ scoutSpace }) => {
      await scoutSpace.uiSettings.unset('defaultIndex', 'timepicker:timeDefaults');
      await scoutSpace.savedObjects.cleanStandardList();
    });

    spaceTest('should paginate through metrics', async ({ pageObjects }) => {
      await pageObjects.discover.writeAndSubmitEsqlQuery(testData.ESQL_QUERIES.TS);
      const { metricsExperience } = pageObjects;

      await spaceTest.step('pagination is visible', async () => {
        await expect(metricsExperience.grid).toBeVisible();
        await expect(metricsExperience.pagination.container).toBeVisible();
        await metricsExperience.waitForFirstCard(FIRST_CARD_PAGE_1);
        await expect(metricsExperience.cards).toHaveCount(PAGE_SIZE);
      });

      await spaceTest.step('navigate to last page and grid updates', async () => {
        await metricsExperience.pagination.getPageButton(TOTAL_PAGES - 1).click();
        await expect(metricsExperience.grid).toBeVisible();
        await metricsExperience.waitForFirstCard(FIRST_CARD_LAST_PAGE);
        await expect(metricsExperience.cards).toHaveCount(LAST_PAGE_CARDS);
      });

      await spaceTest.step('navigate using next and prev arrows', async () => {
        await metricsExperience.pagination.getPageButton(0).click();
        await expect(metricsExperience.grid).toBeVisible();
        await metricsExperience.waitForFirstCard(FIRST_CARD_PAGE_1);
        await expect(metricsExperience.cards).toHaveCount(PAGE_SIZE);

        await metricsExperience.pagination.nextButton.click();
        await expect(metricsExperience.grid).toBeVisible();
        await metricsExperience.waitForFirstCard(FIRST_CARD_PAGE_2);
        await expect(metricsExperience.cards).toHaveCount(PAGE_SIZE);

        await metricsExperience.pagination.prevButton.click();
        await expect(metricsExperience.grid).toBeVisible();
        await metricsExperience.waitForFirstCard(FIRST_CARD_PAGE_1);
        await expect(metricsExperience.cards).toHaveCount(PAGE_SIZE);
      });
    });

    spaceTest('should filter metrics using search', async ({ pageObjects }) => {
      await pageObjects.discover.writeAndSubmitEsqlQuery(testData.ESQL_QUERIES.TS);
      const { metricsExperience } = pageObjects;
      await expect(metricsExperience.grid).toBeVisible();

      await spaceTest.step('search filters results across all pages', async () => {
        await metricsExperience.searchMetric(`${SEARCH_METRIC_NAME}*`);
        await expect(metricsExperience.cards).toHaveCount(1);
      });

      await spaceTest.step('search for non-existent metric shows empty state', async () => {
        await metricsExperience.clearSearch();
        await metricsExperience.searchMetric('nonexistent_metric_xyz_123');
        await expect(metricsExperience.emptyState).toBeVisible();
      });

      await spaceTest.step('clearing search restores full grid', async () => {
        await metricsExperience.clearSearch();
        await expect(metricsExperience.emptyState).toBeHidden();
        await expect(metricsExperience.cards).toHaveCount(PAGE_SIZE);
      });

      await spaceTest.step('space-separated search matches non-contiguous name', async () => {
        await metricsExperience.searchMetric('gauge 22');
        await expect(metricsExperience.cards).toHaveCount(1);
        await metricsExperience.waitForFirstCard('gauge_22-0');
      });

      await spaceTest.step('wildcard search matches metric name pattern', async () => {
        await metricsExperience.clearSearch();
        await metricsExperience.searchMetric('*_0');
        await expect(metricsExperience.cards).toHaveCount(2);
      });

      await spaceTest.step('typo-tolerant search finds metric', async () => {
        await metricsExperience.clearSearch();
        await metricsExperience.searchMetric('gauuge_0');
        await expect(metricsExperience.cards).toHaveCount(1);
        await metricsExperience.waitForFirstCard('gauge_0-0');
      });
    });

    spaceTest(
      'should render grid with wildcard TS query and WHERE filter',
      async ({ pageObjects }) => {
        const query = `${testData.ESQL_QUERIES.TS_WILDCARD} | WHERE ${FILTER_DIMENSION_NAME} == "${FILTER_DIMENSION_VALUES[0]}"`;
        await pageObjects.discover.writeAndSubmitEsqlQuery(query);
        const { metricsExperience } = pageObjects;
        await expect(metricsExperience.grid).toBeVisible();
        await expect(metricsExperience.getCardByIndex(0)).toBeVisible();
        await expect(metricsExperience.cards).toHaveCount(PAGE_SIZE);
      }
    );

    spaceTest(
      'should update grid when selecting a breakdown dimension',
      async ({ pageObjects, page }) => {
        await pageObjects.discover.writeAndSubmitEsqlQuery(testData.ESQL_QUERIES.TS);
        const { metricsExperience } = pageObjects;
        await expect(metricsExperience.grid).toBeVisible();

        await spaceTest.step('breakdown selector dropdown has no a11y violations', async () => {
          await metricsExperience.breakdownSelector.toggleButton.click();
          await metricsExperience.breakdownSelector.selectable.waitFor({ state: 'visible' });
          // EUI known issue: https://github.com/elastic/eui/issues/9517
          // Remove this exclude once fixed upstream.
          const { violations } = await page.checkA11y({
            include: ['[data-test-subj="metricsExperienceBreakdownSelectorSelectable"]'],
            exclude: ['.euiSelectableList__list'],
          });
          expect(violations).toHaveLength(0);
          await metricsExperience.breakdownSelector.toggleButton.click();
          await metricsExperience.breakdownSelector.selectable.waitFor({ state: 'hidden' });
        });

        await spaceTest.step('select first dimension as breakdown', async () => {
          await metricsExperience.breakdownSelector.selectDimension(FIRST_DIMENSION);
          await expect(
            metricsExperience.breakdownSelector.getToggleWithSelection(FIRST_DIMENSION)
          ).toBeVisible();
          await expect(metricsExperience.grid).toBeVisible();
          await expect(metricsExperience.getCardByIndex(0)).toBeVisible();
        });

        await spaceTest.step('switch to second dimension and verify grid updates', async () => {
          await metricsExperience.breakdownSelector.selectDimension(SECOND_DIMENSION);
          await expect(
            metricsExperience.breakdownSelector.getToggleWithSelection(SECOND_DIMENSION)
          ).toBeVisible();
          await expect(metricsExperience.grid).toBeVisible();
          await expect(metricsExperience.getCardByIndex(0)).toBeVisible();
        });
      }
    );
  }
);
