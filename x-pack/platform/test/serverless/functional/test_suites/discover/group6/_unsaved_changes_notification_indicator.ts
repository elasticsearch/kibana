/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

// Original test (remove during Scout migration): src/platform/test/functional/apps/discover/group12/_unsaved_changes_notification_indicator.ts

import expect from '@kbn/expect';
import type { FtrProviderContext } from '../../../ftr_provider_context';

const SAVED_SEARCH_NAME = 'test saved search';
const SAVED_SEARCH_WITH_FILTERS_NAME = 'test saved search with filters';

export default function ({ getService, getPageObjects }: FtrProviderContext) {
  const esArchiver = getService('esArchiver');
  const kibanaServer = getService('kibanaServer');
  const dataGrid = getService('dataGrid');
  const filterBar = getService('filterBar');
  const PageObjects = getPageObjects([
    'common',
    'svlCommonPage',
    'discover',
    'header',
    'timePicker',
    'unifiedFieldList',
  ]);
  const dataViews = getService('dataViews');
  const security = getService('security');
  const defaultSettings = {
    defaultIndex: 'logstash-*',
  };

  describe('discover unsaved changes notification indicator', function describeIndexTests() {
    before(async () => {
      await security.testUser.setRoles(['kibana_admin', 'test_logstash_reader']);
      await esArchiver.loadIfNeeded(
        'src/platform/test/functional/fixtures/es_archiver/logstash_functional'
      );
      await kibanaServer.importExport.load(
        'src/platform/test/functional/fixtures/kbn_archiver/discover'
      );
      await PageObjects.svlCommonPage.loginWithPrivilegedRole();
    });

    after(async () => {
      await kibanaServer.importExport.unload(
        'src/platform/test/functional/fixtures/kbn_archiver/discover'
      );
      await kibanaServer.uiSettings.replace({});
      await kibanaServer.savedObjects.cleanStandardList();
    });

    beforeEach(async function () {
      await PageObjects.timePicker.setDefaultAbsoluteRangeViaUiSettings();
      await kibanaServer.uiSettings.update(defaultSettings);
      await PageObjects.common.navigateToApp('discover');
      await PageObjects.header.waitUntilLoadingHasFinished();
      await PageObjects.discover.waitUntilSearchingHasFinished();
      await dataViews.switchTo('logstash-*');
    });

    it('should not show the notification indicator initially nor after changes to a draft saved search', async () => {
      await PageObjects.discover.ensureNoUnsavedChangesIndicator();

      await PageObjects.unifiedFieldList.clickFieldListItemAdd('bytes');

      await PageObjects.header.waitUntilLoadingHasFinished();
      await PageObjects.discover.waitUntilSearchingHasFinished();

      await PageObjects.discover.ensureNoUnsavedChangesIndicator();
    });

    it('should show the notification indicator only after changes to a persisted saved search', async () => {
      await dataViews.createFromSearchBar({
        name: 'lo', // Must be anything but log/logs, since pagination is disabled for log sources
        adHoc: true,
        hasTimeField: true,
      });
      await PageObjects.discover.saveSearch(SAVED_SEARCH_NAME);
      await PageObjects.discover.waitUntilSearchingHasFinished();

      await PageObjects.discover.ensureNoUnsavedChangesIndicator();

      await PageObjects.unifiedFieldList.clickFieldListItemAdd('bytes');
      await PageObjects.header.waitUntilLoadingHasFinished();
      await PageObjects.discover.waitUntilSearchingHasFinished();

      await PageObjects.discover.ensureHasUnsavedChangesIndicator();

      await PageObjects.discover.saveUnsavedChanges();

      await PageObjects.discover.ensureNoUnsavedChangesIndicator();
    });

    it('should not show a notification indicator after loading a saved search, only after changes', async () => {
      await PageObjects.discover.loadSavedSearch(SAVED_SEARCH_NAME);
      await PageObjects.discover.waitUntilTabIsLoaded();
      await PageObjects.discover.waitUntilSearchingHasFinished();

      await PageObjects.discover.ensureNoUnsavedChangesIndicator();

      await PageObjects.discover.chooseBreakdownField('_index');
      await PageObjects.header.waitUntilLoadingHasFinished();
      await PageObjects.discover.waitUntilSearchingHasFinished();

      await PageObjects.discover.ensureHasUnsavedChangesIndicator();
    });

    it('should allow to revert changes', async () => {
      await PageObjects.discover.loadSavedSearch(SAVED_SEARCH_NAME);
      await PageObjects.discover.waitUntilTabIsLoaded();
      await PageObjects.discover.ensureNoUnsavedChangesIndicator();

      // test changes to columns
      expect(await dataGrid.getHeaderFields()).to.eql(['@timestamp', 'bytes']);
      await PageObjects.unifiedFieldList.clickFieldListItemAdd('extension');
      await PageObjects.header.waitUntilLoadingHasFinished();
      await PageObjects.discover.waitUntilSearchingHasFinished();
      expect(await dataGrid.getHeaderFields()).to.eql(['@timestamp', 'bytes', 'extension']);
      await PageObjects.discover.ensureHasUnsavedChangesIndicator();
      await PageObjects.discover.revertUnsavedChanges();
      expect(await dataGrid.getHeaderFields()).to.eql(['@timestamp', 'bytes']);
      await PageObjects.discover.ensureNoUnsavedChangesIndicator();

      // test changes to sample size
      await dataGrid.clickGridSettings();
      expect(await dataGrid.getCurrentSampleSizeValue()).to.be(500);
      await dataGrid.changeSampleSizeValue(250);
      await dataGrid.clickGridSettings();
      await PageObjects.header.waitUntilLoadingHasFinished();
      await PageObjects.discover.waitUntilSearchingHasFinished();
      await PageObjects.discover.ensureHasUnsavedChangesIndicator();
      await dataGrid.clickGridSettings();
      expect(await dataGrid.getCurrentSampleSizeValue()).to.be(250);
      await dataGrid.clickGridSettings();
      await PageObjects.discover.revertUnsavedChanges();
      await PageObjects.discover.ensureNoUnsavedChangesIndicator();
      await dataGrid.clickGridSettings();
      expect(await dataGrid.getCurrentSampleSizeValue()).to.be(500);
      await dataGrid.clickGridSettings();

      // test changes to rows per page
      await dataGrid.checkCurrentRowsPerPageToBe(100);
      await dataGrid.changeRowsPerPageTo(25);
      await PageObjects.header.waitUntilLoadingHasFinished();
      await PageObjects.discover.waitUntilSearchingHasFinished();
      await PageObjects.discover.ensureHasUnsavedChangesIndicator();
      await dataGrid.checkCurrentRowsPerPageToBe(25);
      await PageObjects.discover.revertUnsavedChanges();
      await PageObjects.discover.ensureNoUnsavedChangesIndicator();
      await dataGrid.checkCurrentRowsPerPageToBe(100);
    });

    it('should hide the notification indicator once user manually reverts changes', async () => {
      await PageObjects.discover.loadSavedSearch(SAVED_SEARCH_NAME);
      await PageObjects.discover.waitUntilTabIsLoaded();
      await PageObjects.discover.ensureNoUnsavedChangesIndicator();

      // changes to columns
      expect(await dataGrid.getHeaderFields()).to.eql(['@timestamp', 'bytes']);
      await PageObjects.unifiedFieldList.clickFieldListItemAdd('extension');
      await PageObjects.header.waitUntilLoadingHasFinished();
      await PageObjects.discover.waitUntilSearchingHasFinished();
      expect(await dataGrid.getHeaderFields()).to.eql(['@timestamp', 'bytes', 'extension']);
      await PageObjects.discover.ensureHasUnsavedChangesIndicator();
      await PageObjects.unifiedFieldList.clickFieldListItemRemove('extension');
      await PageObjects.header.waitUntilLoadingHasFinished();
      await PageObjects.discover.waitUntilSearchingHasFinished();
      expect(await dataGrid.getHeaderFields()).to.eql(['@timestamp', 'bytes']);
      await PageObjects.discover.ensureNoUnsavedChangesIndicator();

      // test changes to breakdown field
      await PageObjects.discover.chooseBreakdownField('_index');
      await PageObjects.header.waitUntilLoadingHasFinished();
      await PageObjects.discover.waitUntilSearchingHasFinished();
      await PageObjects.discover.ensureHasUnsavedChangesIndicator();
      await PageObjects.discover.clearBreakdownField();
      await PageObjects.header.waitUntilLoadingHasFinished();
      await PageObjects.discover.waitUntilSearchingHasFinished();
      await PageObjects.discover.ensureNoUnsavedChangesIndicator();
    });

    it('should not show the notification indicator after pinning the first filter but after disabling a filter', async () => {
      await filterBar.addFilter({ field: 'extension', operation: 'is', value: 'png' });
      await filterBar.addFilter({ field: 'bytes', operation: 'exists' });
      await PageObjects.discover.saveSearch(SAVED_SEARCH_WITH_FILTERS_NAME);
      await PageObjects.discover.waitUntilSearchingHasFinished();

      await PageObjects.discover.ensureNoUnsavedChangesIndicator();

      await filterBar.toggleFilterPinned('extension');
      await PageObjects.discover.waitUntilSearchingHasFinished();
      expect(await filterBar.isFilterPinned('extension')).to.be(true);

      await PageObjects.discover.ensureNoUnsavedChangesIndicator();

      await filterBar.toggleFilterNegated('bytes');
      await PageObjects.discover.waitUntilSearchingHasFinished();
      expect(await filterBar.isFilterNegated('bytes')).to.be(true);

      await PageObjects.discover.ensureHasUnsavedChangesIndicator();

      await PageObjects.discover.revertUnsavedChanges();
      await PageObjects.discover.ensureNoUnsavedChangesIndicator();

      expect(await filterBar.getFilterCount()).to.be(2);
      expect(await filterBar.isFilterPinned('extension')).to.be(false);
      expect(await filterBar.isFilterNegated('bytes')).to.be(false);
      expect(await PageObjects.discover.getHitCount()).to.be('1,373');
    });
  });
}
