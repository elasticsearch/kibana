/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { Journey } from '@kbn/journeys';
import { subj } from '@kbn/test-subj-selector';

const DATA_VIEW_NAME = 'Kibana Sample Data Logs (TSDB)';

export const journey = new Journey({
  kbnArchives: ['src/platform/test/functional/fixtures/kbn_archiver/kibana_sample_data_logs_tsdb'],
  esArchives: ['src/platform/test/functional/fixtures/es_archiver/kibana_sample_data_logs_tsdb'],
})
  .step('Go to Data Visualizer', async ({ page, kbnUrl, kibanaPage }) => {
    await page.goto(kbnUrl.get(`app/ml/datavisualizer`));
    await kibanaPage.waitForHeader();
    await page.waitForSelector(subj('mlDataVisualizerCardIndexData'));
    await page.waitForSelector(subj('globalLoadingIndicator-hidden'));
  })
  .step('Go to Index data visualizer', async ({ page }) => {
    const createButtons = page.locator(subj('mlDataVisualizerSelectIndexButton'));
    await createButtons.first().click();
    await page.waitForSelector(subj('mlDataSourceSelectorButton'));
  })
  .step('Go to Data View selection', async ({ page, kibanaPage }) => {
    await page.click(subj('mlDataSourceSelectorButton'));
    await page.waitForSelector(subj('indexPattern-switcher'));
    await page.locator(subj('indexPattern-switcher--input')).fill(DATA_VIEW_NAME);
    await page
      .locator(subj('indexPattern-switcher'))
      .locator(subj(`dataView-${DATA_VIEW_NAME}`))
      .click();
    await page.waitForSelector(subj('dataVisualizerIndexPage'), { timeout: 60000 });
    await page.click(subj('mlDatePickerButtonUseFullData'));
    await kibanaPage.waitForHeader();
    await page.waitForSelector(subj('dataVisualizerTable-loaded'), { timeout: 60000 });
    await page.waitForSelector(subj('globalLoadingIndicator-hidden'), { timeout: 60000 });
  });
