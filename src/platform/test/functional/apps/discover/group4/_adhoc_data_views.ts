/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

// Serverless test (remove during Scout migration): x-pack/platform/test/serverless/functional/test_suites/discover/group4/_adhoc_data_views.ts

import expect from '@kbn/expect';
import type { FtrProviderContext } from '../ftr_provider_context';

export default function ({ getService, getPageObjects }: FtrProviderContext) {
  const dataGrid = getService('dataGrid');
  const toasts = getService('toasts');
  const filterBar = getService('filterBar');
  const fieldEditor = getService('fieldEditor');
  const dashboardAddPanel = getService('dashboardAddPanel');
  const kibanaServer = getService('kibanaServer');
  const retry = getService('retry');
  const queryBar = getService('queryBar');
  const testSubjects = getService('testSubjects');
  const browser = getService('browser');
  const { common, discover, timePicker, header, context, dashboard, unifiedFieldList } =
    getPageObjects([
      'common',
      'discover',
      'timePicker',
      'header',
      'context',
      'dashboard',
      'unifiedFieldList',
    ]);
  const find = getService('find');
  const security = getService('security');
  const dataViews = getService('dataViews');

  const addSearchToDashboard = async (name: string) => {
    await dashboardAddPanel.addSavedSearch(name);
    await header.waitUntilLoadingHasFinished();
    await dashboard.waitForRenderComplete();
  };

  describe('adhoc data views', function () {
    before(async () => {
      await security.testUser.setRoles(['kibana_admin', 'test_logstash_reader']);
      await kibanaServer.importExport.load(
        'src/platform/test/functional/fixtures/kbn_archiver/discover.json'
      );

      await timePicker.setDefaultAbsoluteRangeViaUiSettings();
      await common.navigateToApp('discover');
    });

    after(async () => {
      await kibanaServer.savedObjects.cleanStandardList();
    });

    it('should navigate back correctly from to surrounding and single views', async () => {
      await dataViews.createFromSearchBar({
        name: 'logstash',
        adHoc: true,
        hasTimeField: true,
      });
      await discover.waitUntilSearchingHasFinished();
      const first = await discover.getCurrentDataViewId();

      await discover.addRuntimeField('_bytes-runtimefield', `emit(doc["bytes"].value.toString())`);
      await unifiedFieldList.clickFieldListItemToggle('_bytes-runtimefield');

      const second = await discover.getCurrentDataViewId();
      expect(first).not.to.equal(second);

      // navigate to context view
      await dataGrid.clickRowToggle({ rowIndex: 0 });
      const [, surrDocs] = await dataGrid.getRowActions();
      await surrDocs.click();
      await context.waitUntilContextLoadingHasFinished();

      await testSubjects.click('~breadcrumb & ~first');
      await header.waitUntilLoadingHasFinished();

      expect(await dataViews.getSelectedName()).to.be('logstash*');

      // navigate to single doc view
      await dataGrid.clickRowToggle({ rowIndex: 0 });
      const [singleView] = await dataGrid.getRowActions();
      await singleView.click();
      await header.waitUntilLoadingHasFinished();

      await testSubjects.click('~breadcrumb & ~first');
      await header.waitUntilLoadingHasFinished();

      expect(await dataViews.getSelectedName()).to.be('logstash*');
    });

    it('should support query and filtering', async () => {
      await filterBar.addFilter({
        field: 'nestedField.child',
        operation: 'is',
        value: 'nestedValue',
      });

      await header.waitUntilLoadingHasFinished();
      await discover.waitUntilSearchingHasFinished();

      expect(await filterBar.hasFilter('nestedField.child', 'nestedValue')).to.be(true);
      await retry.try(async function () {
        expect(await discover.getHitCount()).to.be('1');
      });
      await filterBar.removeFilter('nestedField.child');

      await header.waitUntilLoadingHasFinished();
      await discover.waitUntilSearchingHasFinished();

      await queryBar.setQuery('test');
      await queryBar.submitQuery();

      await header.waitUntilLoadingHasFinished();
      await discover.waitUntilSearchingHasFinished();

      await retry.try(async () => expect(await discover.getHitCount()).to.be('22'));

      await queryBar.clearQuery();
      await queryBar.submitQuery();

      await header.waitUntilLoadingHasFinished();
      await discover.waitUntilSearchingHasFinished();
    });

    it('should not update data view id when saving search first time', async () => {
      const prevDataViewId = await discover.getCurrentDataViewId();

      await discover.saveSearch('logstash*-ss');
      await header.waitUntilLoadingHasFinished();

      const newDataViewId = await discover.getCurrentDataViewId();

      expect(prevDataViewId).to.equal(newDataViewId);
    });

    it('should update data view id when saving new search copy', async () => {
      const prevDataViewId = await discover.getCurrentDataViewId();

      await discover.saveSearch('logstash*-ss-new', true);
      await header.waitUntilLoadingHasFinished();

      const newDataViewId = await discover.getCurrentDataViewId();

      expect(prevDataViewId).not.to.equal(newDataViewId);
    });

    it('search results should be different after data view update', async () => {
      await dataViews.createFromSearchBar({
        name: 'logst',
        adHoc: true,
        hasTimeField: true,
      });
      await discover.waitUntilSearchingHasFinished();
      const prevDataViewId = await discover.getCurrentDataViewId();

      // trigger data view id update
      await discover.addRuntimeField('_bytes-runtimefield', `emit(doc["bytes"].value.toString())`);
      await unifiedFieldList.waitUntilSidebarHasLoaded();
      await unifiedFieldList.clickFieldListItemToggle('_bytes-runtimefield');
      const newDataViewId = await discover.getCurrentDataViewId();
      expect(newDataViewId).not.to.equal(prevDataViewId);

      // save first search
      await discover.saveSearch('logst*-ss-_bytes-runtimefield');
      await discover.waitUntilTabIsLoaded();

      // remove field and create with the same name, but different value
      await unifiedFieldList.clickFieldListItemRemove('_bytes-runtimefield');
      await discover.removeField('_bytes-runtimefield');
      await discover.waitUntilTabIsLoaded();
      await unifiedFieldList.waitUntilSidebarHasLoaded();

      // trigger data view id update
      await discover.addRuntimeField(
        '_bytes-runtimefield',
        `emit((doc["bytes"].value * 2).toString())`
      );
      await discover.waitUntilTabIsLoaded();
      await unifiedFieldList.waitUntilSidebarHasLoaded();
      await unifiedFieldList.clickFieldListItemToggle('_bytes-runtimefield');

      // save second search
      await discover.saveSearch('logst*-ss-_bytes-runtimefield-updated', true);
      await discover.waitUntilTabIsLoaded();
      await unifiedFieldList.waitUntilSidebarHasLoaded();

      // open searches on dashboard
      await dashboard.navigateToApp();
      await filterBar.ensureFieldEditorModalIsClosed();
      await dashboard.gotoDashboardLandingPage();
      await dashboard.clickNewDashboard();
      await timePicker.setDefaultAbsoluteRangeViaUiSettings();

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
      await context.waitUntilContextLoadingHasFinished();

      // open saved search
      await testSubjects.click('~breadcrumb & ~first');
      await header.waitUntilLoadingHasFinished();

      const savedSearch = await find.byCssSelector(`[data-test-subj="breadcrumb last"]`);
      const savedSearchName = await savedSearch.getVisibleText();
      expect(savedSearchName).to.be.equal('logst*-ss-_bytes-runtimefield');

      // test the header now
      const headerFields = await dataGrid.getHeaderFields();
      expect(headerFields.join(' ')).to.have.string('_bytes-runtimefield');
    });

    it('should update id after data view field edit', async () => {
      await discover.loadSavedSearch('logst*-ss-_bytes-runtimefield');
      await header.waitUntilLoadingHasFinished();

      const prevDataViewId = await discover.getCurrentDataViewId();

      // trigger data view id update
      await dataGrid.clickEditField('_bytes-runtimefield');
      await fieldEditor.setName('_bytes-runtimefield-edited', true);
      await fieldEditor.save();
      await fieldEditor.confirmSave();
      await header.waitUntilLoadingHasFinished();

      const newDataViewId = await discover.getCurrentDataViewId();
      expect(prevDataViewId).not.to.equal(newDataViewId);
    });

    it('should notify about invalid filter reffs', async () => {
      await dataViews.createFromSearchBar({
        name: 'logstas',
        adHoc: true,
        hasTimeField: true,
      });
      await discover.waitUntilSearchingHasFinished();
      await filterBar.addFilter({
        field: 'nestedField.child',
        operation: 'is',
        value: 'nestedValue',
      });
      await header.waitUntilLoadingHasFinished();

      await filterBar.addFilter({ field: 'extension', operation: 'is', value: 'jpg' });
      await header.waitUntilLoadingHasFinished();

      const first = await discover.getCurrentDataViewId();
      // trigger data view id update
      await discover.addRuntimeField(
        '_bytes-runtimefield',
        `emit((doc["bytes"].value * 2).toString())`
      );
      await header.waitUntilLoadingHasFinished();

      const second = await discover.getCurrentDataViewId();
      expect(first).not.equal(second);

      await toasts.dismissAll();

      await browser.goBack();
      await header.waitUntilLoadingHasFinished();

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
