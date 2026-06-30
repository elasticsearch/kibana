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
          await discover.openSidebar();
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
  }
);
