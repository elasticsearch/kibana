/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { expect } from '@kbn/scout/ui';
import { spaceTest, testData, DEFAULT_TIME_RANGE } from '../../fixtures/metrics_experience';

const { SHARED_DIMENSION, PARTIAL_DIMENSION, FULL_METRIC, ONLY_METRIC } =
  testData.PARTIAL_DIMENSION_SCENARIO;

spaceTest.describe(
  'Metrics in Discover - Breakdown by dimension',
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

    spaceTest(
      'should propagate field list breakdown selection to toolbar selector',
      async ({ pageObjects }) => {
        const { discover, metricsExperience } = pageObjects;
        const breakdownField = testData.METRICS_DIMENSION_FIELDS.DEFAULT_BREAKDOWN;

        await discover.writeAndSubmitEsqlQuery(testData.ESQL_QUERIES.TS);
        await expect(metricsExperience.grid).toBeVisible();

        await spaceTest.step('set breakdown by dimension from field list', async () => {
          await discover.addBreakdownFieldFromSidebar(breakdownField);
        });

        await spaceTest.step('show selected breakdown in toolbar selector', async () => {
          await expect(
            metricsExperience.breakdownSelector.getToggleWithSelection(breakdownField)
          ).toBeVisible();
        });

        await spaceTest.step('keep metrics grid rendered after selecting breakdown', async () => {
          await expect(metricsExperience.grid).toBeVisible();
        });
      }
    );

    // A metric must hide when it does not declare every selected dimension,
    // even if its documents carry a value for that field.
    spaceTest(
      'hides metrics that do not declare every selected dimension',
      async ({ pageObjects }) => {
        const { discover, metricsExperience } = pageObjects;
        const fullMetricTitle = metricsExperience.grid.getByText(FULL_METRIC, { exact: true });
        const onlyMetricTitle = metricsExperience.grid.getByText(ONLY_METRIC, { exact: true });

        await discover.writeAndSubmitEsqlQuery(testData.ESQL_QUERIES.TS_PARTIAL);
        await expect(metricsExperience.grid).toBeVisible();

        await spaceTest.step('both metrics render before any dimension filter', async () => {
          await expect(fullMetricTitle).toBeVisible();
          await expect(onlyMetricTitle).toBeVisible();
        });

        await spaceTest.step('select the shared and the partial dimension', async () => {
          await metricsExperience.breakdownSelector.selectDimension(SHARED_DIMENSION);
          await metricsExperience.breakdownSelector.selectDimension(PARTIAL_DIMENSION);
        });

        await spaceTest.step('only the metric that declares both dimensions remains', async () => {
          await expect(fullMetricTitle).toBeVisible();
          await expect(onlyMetricTitle).toHaveCount(0);
          await expect(metricsExperience.cards).toHaveCount(1);
        });
      }
    );
  }
);
