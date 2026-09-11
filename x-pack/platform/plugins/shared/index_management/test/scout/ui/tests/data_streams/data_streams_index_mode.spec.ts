/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { EsClient, ScoutPage } from '@kbn/scout';
import { tags } from '@kbn/scout';
import { expect } from '@kbn/scout/ui';
import { test } from '../../fixtures';
import type { IndexManagement } from '../../fixtures/page_objects/index_management_page';
import { setCodeEditorValueWhenReady } from '../../lib/code_editor';
import { deleteDataStream } from '../../lib/data_streams';

const INDEX_MODE = {
  STANDARD: 'Standard',
  LOGSDB: 'LogsDB',
  TIME_SERIES: 'Time series',
} as const;

const TEST_DS_NAME = 'test-ds';
const TEMPLATE_NAME = `index_template_${TEST_DS_NAME}`;

const setIndexModeTemplate = async (page: ScoutPage, esClient: EsClient, settings: object) => {
  await esClient.indices.putIndexTemplate({
    name: TEMPLATE_NAME,
    index_patterns: [TEST_DS_NAME],
    data_stream: {},
    template: { settings },
  });
  await esClient.indices.createDataStream({ name: TEST_DS_NAME });
  await page.testSubj.locator('reloadButton').click();
};

const openTemplateEditor = async (
  page: ScoutPage,
  pageObjects: { indexManagement: IndexManagement }
) => {
  await pageObjects.indexManagement.changeTabs('templatesTab');
  await pageObjects.indexManagement.clickTemplateDetailsLink(TEMPLATE_NAME);
  await page.testSubj.locator('manageTemplateButton').click();
  await page.testSubj.locator('editIndexTemplateButton').click();
};

const templateIndexMode = (page: ScoutPage) => page.testSubj.locator('indexModeField');

const dataStreamIndexMode = (page: ScoutPage) => page.testSubj.locator('indexModeDetail');

const changeIndexMode = async (page: ScoutPage, indexModeSelector: string) => {
  await page.testSubj.locator('indexModeField').click();
  await page.testSubj.locator(indexModeSelector).click();
};

const reviewStepIndexMode = (page: ScoutPage) => page.testSubj.locator('indexModeValue');

const rolloverAndOpenDataStream = async (
  esClient: EsClient,
  pageObjects: { indexManagement: IndexManagement }
) => {
  await esClient.indices.rollover({ alias: TEST_DS_NAME });
  await pageObjects.indexManagement.changeTabs('data_streamsTab');
  await pageObjects.indexManagement.clickDataStreamNameLink(TEST_DS_NAME);
};

test.describe('Data streams index mode', { tag: tags.deploymentAgnostic }, () => {
  test.beforeEach(async ({ browserAuth, pageObjects }) => {
    await browserAuth.loginAsIndexManagementUser();
    await pageObjects.indexManagement.navigateToIndexManagementTab('data_streams');
  });

  test.afterEach(async ({ esClient }) => {
    await deleteDataStream(esClient, TEST_DS_NAME, TEMPLATE_NAME);
    await deleteDataStream(esClient, 'test-logsdb', 'logsdb_index_template');
  });

  test('shows standard index mode in the details flyout', async ({
    page,
    esClient,
    pageObjects,
  }) => {
    await setIndexModeTemplate(page, esClient, {});
    await pageObjects.indexManagement.clickDataStreamNameLink(TEST_DS_NAME);

    await expect(dataStreamIndexMode(page)).toHaveText(INDEX_MODE.STANDARD);
  });

  test('shows logsdb index mode in the details flyout', async ({ page, esClient, pageObjects }) => {
    await esClient.indices.putIndexTemplate({
      name: 'logsdb_index_template',
      index_patterns: ['test-logsdb'],
      data_stream: {},
      template: { settings: { mode: 'logsdb' } },
    });
    await esClient.indices.createDataStream({ name: 'test-logsdb' });
    await page.testSubj.locator('reloadButton').click();

    await pageObjects.indexManagement.clickDataStreamNameLink('test-logsdb');

    await expect(dataStreamIndexMode(page)).toHaveText(INDEX_MODE.LOGSDB);
  });

  test('allows to upgrade data stream from standard to logsdb index mode', async ({
    page,
    esClient,
    pageObjects,
  }) => {
    test.setTimeout(120_000);
    await setIndexModeTemplate(page, esClient, { mode: 'standard' });
    await pageObjects.indexManagement.clickDataStreamNameLink(TEST_DS_NAME);
    await expect(dataStreamIndexMode(page)).toHaveText(INDEX_MODE.STANDARD);
    await page.testSubj.locator('closeDetailsButton').click();

    await openTemplateEditor(page, pageObjects);
    await expect(templateIndexMode(page)).toContainText(INDEX_MODE.STANDARD);

    await changeIndexMode(page, 'index_mode_logsdb');
    await page.testSubj.locator('formWizardStep-5').click();
    await expect(reviewStepIndexMode(page)).toHaveText(INDEX_MODE.LOGSDB);

    await pageObjects.indexManagement.clickNextButton();
    await expect(reviewStepIndexMode(page)).toHaveText(INDEX_MODE.LOGSDB);
    await page.testSubj.locator('closeDetailsButton').click();

    await rolloverAndOpenDataStream(esClient, pageObjects);
    await expect(dataStreamIndexMode(page)).toHaveText(INDEX_MODE.LOGSDB);
  });

  test('allows to downgrade data stream from logsdb to standard index mode', async ({
    page,
    esClient,
    pageObjects,
  }) => {
    test.setTimeout(120_000);
    await setIndexModeTemplate(page, esClient, { mode: 'logsdb' });
    await pageObjects.indexManagement.clickDataStreamNameLink(TEST_DS_NAME);
    await expect(dataStreamIndexMode(page)).toHaveText(INDEX_MODE.LOGSDB);
    await page.testSubj.locator('closeDetailsButton').click();

    await openTemplateEditor(page, pageObjects);
    await expect(templateIndexMode(page)).toContainText(INDEX_MODE.LOGSDB);

    await changeIndexMode(page, 'index_mode_standard');
    await page.testSubj.locator('formWizardStep-5').click();
    await expect(reviewStepIndexMode(page)).toHaveText(INDEX_MODE.STANDARD);

    await pageObjects.indexManagement.clickNextButton();
    await expect(reviewStepIndexMode(page)).toHaveText(INDEX_MODE.STANDARD);
    await page.testSubj.locator('closeDetailsButton').click();

    await rolloverAndOpenDataStream(esClient, pageObjects);
    await expect(dataStreamIndexMode(page)).toHaveText(INDEX_MODE.STANDARD);
  });

  test('allows to upgrade data stream from time series to logsdb index mode', async ({
    page,
    esClient,
    pageObjects,
  }) => {
    test.setTimeout(120_000);
    await setIndexModeTemplate(page, esClient, { mode: 'time_series', routing_path: 'test' });

    await openTemplateEditor(page, pageObjects);
    await expect(templateIndexMode(page)).toContainText(INDEX_MODE.TIME_SERIES);

    await changeIndexMode(page, 'index_mode_logsdb');

    // The time series settings (`routing_path`) live in the Index settings step and are invalid for
    // logsdb, so clear them.
    await page.testSubj.locator('formWizardStep-2').click();
    await setCodeEditorValueWhenReady(page, '{}');
    await page.testSubj.locator('formWizardStep-5').click();
    await expect(reviewStepIndexMode(page)).toHaveText(INDEX_MODE.LOGSDB);

    await pageObjects.indexManagement.clickNextButton();
    await expect(reviewStepIndexMode(page)).toHaveText(INDEX_MODE.LOGSDB);
    await page.testSubj.locator('closeDetailsButton').click();

    await rolloverAndOpenDataStream(esClient, pageObjects);
    await expect(dataStreamIndexMode(page)).toHaveText(INDEX_MODE.LOGSDB);
  });

  test('allows to downgrade data stream from logsdb to time series index mode', async ({
    page,
    esClient,
    pageObjects,
  }) => {
    test.setTimeout(120_000);
    await setIndexModeTemplate(page, esClient, { mode: 'logsdb' });
    await pageObjects.indexManagement.clickDataStreamNameLink(TEST_DS_NAME);
    await expect(dataStreamIndexMode(page)).toHaveText(INDEX_MODE.LOGSDB);
    await page.testSubj.locator('closeDetailsButton').click();

    await openTemplateEditor(page, pageObjects);
    await expect(templateIndexMode(page)).toContainText(INDEX_MODE.LOGSDB);

    await changeIndexMode(page, 'index_mode_time_series');

    // Time series mode requires a routing path, which only the Index settings step can provide.
    await page.testSubj.locator('formWizardStep-2').click();
    await setCodeEditorValueWhenReady(
      page,
      JSON.stringify({ index: { mode: 'time_series', routing_path: 'test' } })
    );
    await page.testSubj.locator('formWizardStep-5').click();
    await expect(reviewStepIndexMode(page)).toHaveText(INDEX_MODE.TIME_SERIES);

    await pageObjects.indexManagement.clickNextButton();
    await expect(reviewStepIndexMode(page)).toHaveText(INDEX_MODE.TIME_SERIES);
    await page.testSubj.locator('closeDetailsButton').click();

    await rolloverAndOpenDataStream(esClient, pageObjects);
    await expect(dataStreamIndexMode(page)).toHaveText(INDEX_MODE.TIME_SERIES);
  });
});
