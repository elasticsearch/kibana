/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FtrProviderContext } from '../../ftr_provider_context';

export function MachineLearningJobSourceSelectionProvider({ getService }: FtrProviderContext) {
  const browser = getService('browser');
  const testSubjects = getService('testSubjects');
  const retry = getService('retry');
  const flyout = getService('flyout');

  return {
    async assertSourceListContainsEntry(sourceName: string) {
      await testSubjects.existOrFail(`savedObjectTitle${sourceName}`);
    },

    async filterSourceSelection(sourceName: string) {
      await testSubjects.setValue('savedObjectFinderSearchInput', sourceName, {
        clearWithKeyboard: true,
      });
      await this.assertSourceListContainsEntry(sourceName);
    },

    // Legacy method for anomaly detection and analytics jobs that still use the old page-based picker
    async selectSource(sourceName: string, nextPageSubj: string) {
      await this.filterSourceSelection(sourceName);
      await retry.tryForTime(30 * 1000, async () => {
        await testSubjects.clickWhenNotDisabledWithoutRetry(`savedObjectTitle${sourceName}`);
        await testSubjects.existOrFail(nextPageSubj, { timeout: 10 * 1000 });
      });
    },

    // Selects a data view via the inline DataViewPicker (MlDataSourcePicker)
    async selectDataView(name: string, nextPageSubj: string) {
      await retry.tryForTime(3 * 60 * 1000, async () => {
        await testSubjects.click('mlDataSourceSelectorButton');
        await testSubjects.existOrFail('indexPattern-switcher', { timeout: 10 * 1000 });
        await testSubjects.setValue('indexPattern-switcher--input', name);
        const indexPatternSwitcher = await testSubjects.find('indexPattern-switcher', 500);
        await (
          await indexPatternSwitcher.findByCssSelector(`[data-test-subj="dataView-${name}"]`)
        ).click();
        // Wait for picker to close, confirming selection was made
        await testSubjects.missingOrFail('indexPattern-switcher', { timeout: 10 * 1000 });
      });
      // Wait for URL to update with the selected data view, confirming navigation completed
      await retry.tryForTime(10 * 1000, async () => {
        const url = await browser.getCurrentUrl();
        if (!url.includes('index=')) {
          throw new Error(`Expected URL to contain 'index=' but got: ${url}`);
        }
      });
      await testSubjects.existOrFail(nextPageSubj, { timeout: 30 * 1000 });
    },

    // Selects a saved search via the "Open Discover session" flyout (MlOpenSessionFlyout)
    async selectSavedSearch(name: string, nextPageSubj: string) {
      await retry.tryForTime(3 * 60 * 1000, async () => {
        await flyout.ensureClosed('loadSearchForm');

        await testSubjects.click('mlOpenDiscoverSessionButton');
        await testSubjects.existOrFail('loadSearchForm', { timeout: 10 * 1000 });
        await testSubjects.existOrFail('savedObjectFinderSearchInput', { timeout: 30 * 1000 });
        await testSubjects.setValue('savedObjectFinderSearchInput', name, {
          clearWithKeyboard: true,
        });
        await testSubjects.clickWhenNotDisabledWithoutRetry(`savedObjectTitle${name}`);
        // Wait for flyout to close, confirming selection was made
        await testSubjects.missingOrFail('loadSearchForm', { timeout: 10 * 1000 });
      });
      // Wait for URL to update with savedSearchId, confirming navigation completed
      await retry.tryForTime(10 * 1000, async () => {
        const url = await browser.getCurrentUrl();
        if (!url.includes('savedSearchId')) {
          throw new Error(`Expected URL to contain 'savedSearchId' but got: ${url}`);
        }
      });
      await testSubjects.existOrFail(nextPageSubj, { timeout: 30 * 1000 });
    },

    async selectSourceForAnomalyDetectionJob(sourceName: string) {
      await this.selectSource(sourceName, 'mlPageJobTypeSelection');
    },

    async selectSourceForAnalyticsJob(sourceName: string) {
      await this.selectSource(sourceName, 'mlAnalyticsCreationContainer');
    },

    async selectSourceForDataDrift(sourceName: string, isSavedSearch = false) {
      if (isSavedSearch) {
        await this.selectSavedSearch(sourceName, 'mlPageDataDrift');
      } else {
        await this.selectDataView(sourceName, 'mlPageDataDrift');
      }
    },

    async selectSourceForIndexBasedDataVisualizer(sourceName: string, isSavedSearch = false) {
      if (isSavedSearch) {
        await this.selectSavedSearch(sourceName, 'dataVisualizerIndexPage');
      } else {
        await this.selectDataView(sourceName, 'dataVisualizerIndexPage');
      }
    },

    async selectSourceForLogRateAnalysis(sourceName: string) {
      await this.selectDataView(sourceName, 'aiopsLogRateAnalysisPage');
    },

    async selectSourceForChangePointDetection(sourceName: string) {
      await this.selectDataView(sourceName, 'aiopsChangePointDetectionPage');
    },

    async selectSourceForLogPatternAnalysisDetection(sourceName: string) {
      await this.selectDataView(sourceName, 'aiopsLogPatternAnalysisPage');
    },
  };
}
