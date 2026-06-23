/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

// Original test (remove during Scout migration): src/platform/test/functional/apps/discover/group4/_adhoc_data_views.ts

import expect from '@kbn/expect';
import type { FtrProviderContext } from '../../../ftr_provider_context';

export default function ({ getService, getPageObjects }: FtrProviderContext) {
  const dataGrid = getService('dataGrid');
  const toasts = getService('toasts');
  const esArchiver = getService('esArchiver');
  const filterBar = getService('filterBar');
  const fieldEditor = getService('fieldEditor');
  const dashboardAddPanel = getService('dashboardAddPanel');
  const kibanaServer = getService('kibanaServer');
  const retry = getService('retry');
  const queryBar = getService('queryBar');
  const testSubjects = getService('testSubjects');
  const browser = getService('browser');
  const PageObjects = getPageObjects([
    'common',
    'svlCommonPage',
    'discover',
    'timePicker',
    'header',
    'context',
    'dashboard',
    'unifiedFieldList',
    'svlCommonNavigation',
  ]);
  const security = getService('security');
  const dataViews = getService('dataViews');

  const addSearchToDashboard = async (name: string) => {
    await dashboardAddPanel.addSavedSearch(name);
    await PageObjects.header.waitUntilLoadingHasFinished();
    await PageObjects.dashboard.waitForRenderComplete();
  };

  describe('adhoc data views', function () {
    before(async () => {
      await security.testUser.setRoles(['kibana_admin', 'test_logstash_reader']);
      await kibanaServer.importExport.load(
        'src/platform/test/functional/fixtures/kbn_archiver/discover.json'
      );
      await esArchiver.loadIfNeeded(
        'src/platform/test/functional/fixtures/es_archiver/logstash_functional'
      );
      await PageObjects.svlCommonPage.loginWithPrivilegedRole();
      await PageObjects.timePicker.setDefaultAbsoluteRangeViaUiSettings();
      await PageObjects.common.navigateToApp('discover');
    });

    after(async () => {
      await kibanaServer.savedObjects.cleanStandardList();
      await esArchiver.unload('x-pack/platform/test/fixtures/es_archives/logstash_functional');
    });

    it('should navigate back correctly from to surrounding and single views', async () => {
      await PageObjects.discover.waitUntilTabIsLoaded();

      await dataViews.createFromSearchBar({
        name: 'logstash',
        adHoc: true,
        hasTimeField: true,
      });
      const first = await PageObjects.discover.getCurrentDataViewId();

      await PageObjects.discover.addRuntimeField(
        '_bytes-runtimefield',
        `emit(doc["bytes"].value.toString())`
      );
      await PageObjects.unifiedFieldList.clickFieldListItemToggle('_bytes-runtimefield');

      const second = await PageObjects.discover.getCurrentDataViewId();
      expect(first).not.to.equal(second);

      // navigate to context view
      await dataGrid.clickRowToggle({ rowIndex: 0 });
      const [, surrDocs] = await dataGrid.getRowActions();
      await surrDocs.click();
      await PageObjects.context.waitUntilContextLoadingHasFinished();
      // TODO: Clicking breadcrumbs works differently in Serverless
      await PageObjects.svlCommonNavigation.breadcrumbs.clickBreadcrumb({ deepLinkId: 'discover' });
      await PageObjects.header.waitUntilLoadingHasFinished();

      expect(await dataViews.getSelectedName()).to.be('logstash*');

      // navigate to single doc view
      await dataGrid.clickRowToggle({ rowIndex: 0 });
      const [singleView] = await dataGrid.getRowActions();
      await singleView.click();
      await PageObjects.header.waitUntilLoadingHasFinished();

      // TODO: Clicking breadcrumbs works differently in Serverless
      await PageObjects.svlCommonNavigation.breadcrumbs.clickBreadcrumb({ deepLinkId: 'discover' });
      await PageObjects.header.waitUntilLoadingHasFinished();

      expect(await dataViews.getSelectedName()).to.be('logstash*');
    });

    it('should support query and filtering', async () => {
      await filterBar.addFilter({
        field: 'nestedField.child',
        operation: 'is',
        value: 'nestedValue',
      });

      await PageObjects.header.waitUntilLoadingHasFinished();
      await PageObjects.discover.waitUntilSearchingHasFinished();

      expect(await filterBar.hasFilter('nestedField.child', 'nestedValue')).to.be(true);
      await retry.try(async function () {
        expect(await PageObjects.discover.getHitCount()).to.be('1');
      });
      await filterBar.removeFilter('nestedField.child');

      await PageObjects.header.waitUntilLoadingHasFinished();
      await PageObjects.discover.waitUntilSearchingHasFinished();

      await queryBar.setQuery('test');
      await queryBar.submitQuery();

      await PageObjects.header.waitUntilLoadingHasFinished();
      await PageObjects.discover.waitUntilSearchingHasFinished();

      await retry.try(async () => expect(await PageObjects.discover.getHitCount()).to.be('22'));

      await queryBar.clearQuery();
      await queryBar.submitQuery();

      await PageObjects.header.waitUntilLoadingHasFinished();
      await PageObjects.discover.waitUntilSearchingHasFinished();
    });

    it('should not update data view id when saving search first time', async () => {
      const prevDataViewId = await PageObjects.discover.getCurrentDataViewId();

      await PageObjects.discover.saveSearch('logstash*-ss');
      await PageObjects.header.waitUntilLoadingHasFinished();

      const newDataViewId = await PageObjects.discover.getCurrentDataViewId();

      expect(prevDataViewId).to.equal(newDataViewId);
    });

    it('should update data view id when saving new search copy', async () => {
      const prevDataViewId = await PageObjects.discover.getCurrentDataViewId();

      await PageObjects.discover.saveSearch('logstash*-ss-new', true);
      await PageObjects.header.waitUntilLoadingHasFinished();

      const newDataViewId = await PageObjects.discover.getCurrentDataViewId();

      expect(prevDataViewId).not.to.equal(newDataViewId);
    });

    it('search results should be different after data view update', async () => {
      await PageObjects.discover.waitUntilTabIsLoaded();

      await dataViews.createFromSearchBar({
        name: 'logst',
        adHoc: true,
        hasTimeField: true,
      });
      await PageObjects.discover.waitUntilSearchingHasFinished();
      const prevDataViewId = await PageObjects.discover.getCurrentDataViewId();

      // trigger data view id update
      await PageObjects.discover.addRuntimeField(
        '_bytes-runtimefield',
        `emit(doc["bytes"].value.toString())`
      );
      await PageObjects.unifiedFieldList.waitUntilSidebarHasLoaded();
      await PageObjects.unifiedFieldList.clickFieldListItemToggle('_bytes-runtimefield');
      const newDataViewId = await PageObjects.discover.getCurrentDataViewId();
      expect(newDataViewId).not.to.equal(prevDataViewId);

      // save first search
      await PageObjects.discover.saveSearch('logst*-ss-_bytes-runtimefield');
      await PageObjects.discover.waitUntilTabIsLoaded();

      // remove field and create with the same name, but different value
      await PageObjects.unifiedFieldList.clickFieldListItemRemove('_bytes-runtimefield');
      await PageObjects.discover.removeField('_bytes-runtimefield');
      await PageObjects.discover.waitUntilTabIsLoaded();
      await PageObjects.unifiedFieldList.waitUntilSidebarHasLoaded();

      // trigger data view id update
      await PageObjects.discover.addRuntimeField(
        '_bytes-runtimefield',
        `emit((doc["bytes"].value * 2).toString())`
      );
      await PageObjects.discover.waitUntilTabIsLoaded();
      await PageObjects.unifiedFieldList.waitUntilSidebarHasLoaded();
      await PageObjects.unifiedFieldList.clickFieldListItemToggle('_bytes-runtimefield');

      // save second search
      await PageObjects.discover.saveSearch('logst*-ss-_bytes-runtimefield-updated', true);
      await PageObjects.discover.waitUntilTabIsLoaded();
      await PageObjects.unifiedFieldList.waitUntilSidebarHasLoaded();

      // open searches on dashboard
      await PageObjects.dashboard.navigateToApp();
      await filterBar.ensureFieldEditorModalIsClosed();
      await PageObjects.dashboard.gotoDashboardLandingPage();
      await PageObjects.dashboard.clickNewDashboard();
      await PageObjects.timePicker.setDefaultAbsoluteRangeViaUiSettings();

      await addSearchToDashboard('logst*-ss-_bytes-runtimefield');
      await addSearchToDashboard('logst*-ss-_bytes-runtimefield-updated');

      const [firstSearchCell, secondSearchCell] = await dataGrid.getAllCellElementsByColumnName(
        0,
        '_bytes-runtimefield'
      );
      const first = await firstSearchCell.getVisibleText();
      const second = await secondSearchCell.getVisibleText();

      expect(+second).to.equal(+first * 2);
    });

    it('should open saved search by navigation to context from embeddable', async () => {
      // navigate to context view
      await dataGrid.clickRowToggle({ rowIndex: 0 });
      const [, surrDocs] = await dataGrid.getRowActions();
      await surrDocs.click();

      // close popup
      const alert = await browser.getAlert();
      await alert?.accept();
      if (await testSubjects.exists('confirmModalConfirmButton')) {
        await testSubjects.click('confirmModalConfirmButton');
      }
      await PageObjects.context.waitUntilContextLoadingHasFinished();

      // open saved search
      // TODO: Clicking breadcrumbs works differently in Serverless
      await PageObjects.svlCommonNavigation.breadcrumbs.clickBreadcrumb({ deepLinkId: 'discover' });
      await PageObjects.header.waitUntilLoadingHasFinished();

      // TODO: Getting breadcrumbs works differently in Serverless
      const savedSearch = await PageObjects.svlCommonNavigation.breadcrumbs.getBreadcrumb({
        deepLinkId: 'discover',
      });
      const savedSearchName = await savedSearch?.getVisibleText();
      // TODO: This functionality is broken in Serverless: https://github.com/elastic/kibana/issues/163488
      expect(savedSearchName).to.be.equal('Discover');
      await PageObjects.discover.loadSavedSearch('logst*-ss-_bytes-runtimefield');

      // test the header now
      const header = await dataGrid.getHeaderFields();
      expect(header.join(' ')).to.have.string('_bytes-runtimefield');
    });

    it('should update id after data view field edit', async () => {
      await PageObjects.discover.loadSavedSearch('logst*-ss-_bytes-runtimefield');
      await PageObjects.header.waitUntilLoadingHasFinished();

      const prevDataViewId = await PageObjects.discover.getCurrentDataViewId();

      // trigger data view id update
      await dataGrid.clickEditField('_bytes-runtimefield');
      await fieldEditor.setName('_bytes-runtimefield-edited', true);
      await fieldEditor.save();
      await fieldEditor.confirmSave();
      await PageObjects.header.waitUntilLoadingHasFinished();

      const newDataViewId = await PageObjects.discover.getCurrentDataViewId();
      expect(prevDataViewId).not.to.equal(newDataViewId);
    });

    it('should notify about invalid filter reffs', async () => {
      await PageObjects.discover.waitUntilTabIsLoaded();

      await dataViews.createFromSearchBar({
        name: 'logstas',
        adHoc: true,
        hasTimeField: true,
      });

      await filterBar.addFilter({
        field: 'nestedField.child',
        operation: 'is',
        value: 'nestedValue',
      });
      await PageObjects.header.waitUntilLoadingHasFinished();

      await filterBar.addFilter({ field: 'extension', operation: 'is', value: 'jpg' });
      await PageObjects.header.waitUntilLoadingHasFinished();

      const first = await PageObjects.discover.getCurrentDataViewId();
      // trigger data view id update
      await PageObjects.discover.addRuntimeField(
        '_bytes-runtimefield',
        `emit((doc["bytes"].value * 2).toString())`
      );
      await PageObjects.header.waitUntilLoadingHasFinished();

      const second = await PageObjects.discover.getCurrentDataViewId();
      expect(first).not.equal(second);

      await toasts.dismissAll();

      await browser.goBack();
      await PageObjects.header.waitUntilLoadingHasFinished();

      await retry.waitFor('two toasts to appear', async () => {
        return (await toasts.getCount()) >= 2;
      });
      const [firstToast, secondToast] = await toasts.getAll();

      expect([await firstToast.getVisibleText(), await secondToast.getVisibleText()].sort()).to.eql(
        [
          `"${first}" is not a configured data view ID\nShowing the saved data view: "logstas*" (${second})`,
          `Different index references\nData view id references in some of the applied filters differ from the current data view.`,
        ].sort()
      );
    });
  });
}
