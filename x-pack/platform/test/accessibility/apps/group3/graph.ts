/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FtrProviderContext } from '../../ftr_provider_context';

export default function ({ getService, getPageObjects }: FtrProviderContext) {
  const a11y = getService('a11y');
  const testSubjects = getService('testSubjects');
  const retry = getService('retry');
  const browser = getService('browser');
  const { common, header, home } = getPageObjects(['common', 'header', 'home']);

  describe('Graph app a11y tests', () => {
    before(async () => {
      await common.navigateToUrl('home', '/tutorial_directory/sampleData', {
        useActualUrl: true,
      });
      await header.waitUntilLoadingHasFinished();
      await home.addSampleDataSet('flights');
      await common.navigateToApp('graph');
    });

    after(async () => {
      await common.navigateToUrl('home', '/tutorial_directory/sampleData', {
        useActualUrl: true,
      });
      await header.waitUntilLoadingHasFinished();
      await home.removeSampleDataSet('flights');
    });

    it('Graph listing page', async function () {
      await a11y.testAppSnapshot();
    });

    it('Edit Graph page', async function () {
      await testSubjects.click('content-list-table-item-link');
      await a11y.testAppSnapshot();
    });

    it('Syntax options panel', async function () {
      await testSubjects.click('switchQueryLanguageButton');
      await a11y.testAppSnapshot();
      await browser.pressKeys(browser.keys.ESCAPE);
    });

    it('Add fields panel', async function () {
      await testSubjects.click('graph-add-field-button');
      await retry.waitFor(
        'Add fields panel is visible',
        async () => await testSubjects.exists('graph-add-field-button')
      );
      await a11y.testAppSnapshot();
      await browser.pressKeys(browser.keys.ESCAPE);
    });

    it('Graph save panel', async function () {
      await testSubjects.click('graphSaveButton');
      await a11y.testAppSnapshot();
      await testSubjects.click('saveCancelButton');
    });

    it('Graph settings - advanced settings tab', async function () {
      await testSubjects.click('graphSettingsButton');
      await a11y.testAppSnapshot();
    });

    it('Graph settings - block list tab', async function () {
      await testSubjects.click('blocklist');
      await a11y.testAppSnapshot();
    });

    it('Graph settings - drilldowns tab', async function () {
      await testSubjects.click('drillDowns');
      await a11y.testAppSnapshot();
      await browser.pressKeys(browser.keys.ESCAPE);
    });

    it('Graph settings drilldown tab - add new drilldown', async function () {
      await testSubjects.click('graphSettingsButton');
      await testSubjects.click('drillDowns');
      await testSubjects.click('graphAddNewTemplate');
      await a11y.testAppSnapshot();
      await browser.pressKeys(browser.keys.ESCAPE);
    });

    it('Create new graph page', async function () {
      await testSubjects.click('graphNewButton');
      await testSubjects.click('confirmModalConfirmButton');
      await a11y.testAppSnapshot();
    });
  });
}
