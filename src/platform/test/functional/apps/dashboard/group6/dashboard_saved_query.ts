/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import expect from '@kbn/expect';

import type { FtrProviderContext } from '../../../ftr_provider_context';

export default function ({ getService, getPageObjects }: FtrProviderContext) {
  const kibanaServer = getService('kibanaServer');
  const { dashboard, timePicker } = getPageObjects(['dashboard', 'timePicker']);
  const queryBar = getService('queryBar');
  const savedQueryManagementComponent = getService('savedQueryManagementComponent');
  const testSubjects = getService('testSubjects');

  describe('dashboard saved queries', function describeIndexTests() {
    before(async function () {
      await kibanaServer.savedObjects.cleanStandardList();
      await kibanaServer.importExport.load(
        'src/platform/test/functional/fixtures/kbn_archiver/dashboard/current/kibana'
      );
      await kibanaServer.uiSettings.replace({
        defaultIndex: '0bf35f60-3dc9-11e8-8660-4d65aa086b3c',
      });
      await dashboard.navigateToApp();
    });

    after(async () => {
      await kibanaServer.savedObjects.cleanStandardList();
    });

    describe('saved query management component functionality', function () {
      before(async () => {
        await dashboard.gotoDashboardLandingPage();
        await dashboard.clickNewDashboard();
      });

      it('should allow a query to be saved via the saved objects management component', async () => {
        await queryBar.setQuery('response:200');
        await queryBar.clickQuerySubmitButton();
        await testSubjects.click('showQueryBarMenu');
        await savedQueryManagementComponent.saveNewQuery(
          'OkResponse',
          '200 responses for .jpg over 24 hours',
          true,
          true
        );
        const contextMenuPanelTitleButton = await testSubjects.exists(
          'contextMenuPanelTitleButton'
        );
        if (contextMenuPanelTitleButton) {
          await testSubjects.click('contextMenuPanelTitleButton');
        }

        await savedQueryManagementComponent.savedQueryExistOrFail('OkResponse');
        await savedQueryManagementComponent.savedQueryTextExist('response:200');
      });

      it('reinstates filters and the time filter when a saved query has filters and a time filter included', async () => {
        await timePicker.setDefaultAbsoluteRange();
        await savedQueryManagementComponent.clearCurrentlyLoadedQuery();
        await savedQueryManagementComponent.loadSavedQuery('OkResponse');
        const timePickerValues = await timePicker.getTimeConfigAsAbsoluteTimes();
        expect(timePickerValues.start).to.not.eql(timePicker.defaultStartTime);
        expect(timePickerValues.end).to.not.eql(timePicker.defaultEndTime);
      });

      it('allows deleting the currently loaded saved query', async () => {
        await savedQueryManagementComponent.deleteSavedQuery('OkResponse');
        await savedQueryManagementComponent.savedQueryMissingOrFail('OkResponse');
        expect(await queryBar.getQueryString()).to.eql('');
      });
    });
  });
}
