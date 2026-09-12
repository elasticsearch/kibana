/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { OPTIONS_LIST_CONTROL, RANGE_SLIDER_CONTROL } from '@kbn/controls-constants';
import expect from '@kbn/expect';

import type { FtrProviderContext } from '../../../../ftr_provider_context';

export default function ({ getService, getPageObjects }: FtrProviderContext) {
  const retry = getService('retry');
  const esArchiver = getService('esArchiver');
  const security = getService('security');
  const queryBar = getService('queryBar');
  const filterBar = getService('filterBar');
  const testSubjects = getService('testSubjects');
  const kibanaServer = getService('kibanaServer');
  const browser = getService('browser');
  const { dashboardControls, common, dashboard, header } = getPageObjects([
    'dashboardControls',
    'dashboard',
    'common',
    'header',
  ]);

  const DASHBOARD_NAME = 'Test Range Slider Control';

  /**
   * Purpose: Range slider smoke test
   *
   * Migration: Migrate to scout
   */
  describe('Range Slider Control', () => {
    before(async () => {
      await security.testUser.setRoles([
        'kibana_admin',
        'kibana_sample_admin',
        'test_logstash_reader',
      ]);
      // disable the invalid selection warning toast
      await browser.setLocalStorageItem('controls:showInvalidSelectionWarning', 'false');

      await esArchiver.load(
        'src/platform/test/functional/fixtures/es_archiver/kibana_sample_data_flights'
      );
      await kibanaServer.importExport.load(
        'src/platform/test/functional/fixtures/kbn_archiver/dashboard/current/kibana'
      );
      await kibanaServer.importExport.load(
        'src/platform/test/functional/fixtures/kbn_archiver/kibana_sample_data_flights_index_pattern'
      );
      await kibanaServer.uiSettings.replace({
        defaultIndex: '0bf35f60-3dc9-11e8-8660-4d65aa086b3c',
      });
      await common.setTime({
        from: 'Oct 22, 2018 @ 00:00:00.000',
        to: 'Dec 3, 2018 @ 00:00:00.000',
      });
      await dashboard.navigateToApp();
      await dashboard.preserveCrossAppState();
      await dashboard.gotoDashboardLandingPage();
      await dashboard.clickNewDashboard();
      await dashboard.saveDashboard(DASHBOARD_NAME, {
        exitFromEditMode: false,
        saveAsNew: true,
      });
    });

    after(async () => {
      await dashboardControls.clearAllControls();
      await kibanaServer.importExport.unload(
        'src/platform/test/functional/fixtures/kbn_archiver/kibana_sample_data_flights_index_pattern'
      );
      await esArchiver.unload(
        'src/platform/test/functional/fixtures/es_archiver/kibana_sample_data_flights'
      );
      await kibanaServer.uiSettings.unset('defaultIndex');
      await common.unsetTime();
      await security.testUser.restoreDefaults();
    });

    describe('create and edit', () => {
      it('can create a new range slider control from a blank state', async () => {
        await dashboardControls.createControl({
          controlType: RANGE_SLIDER_CONTROL,
          dataViewTitle: 'logstash-*',
          fieldName: 'bytes',
          additionalSettings: { step: 10 },
        });
        expect(await dashboardControls.getControlsCount()).to.be(1);
        await dashboard.clearUnsavedChanges();
      });

      it('can select a range', async () => {
        const firstId = (await dashboardControls.getAllControlIds())[0];
        await dashboardControls.rangeSliderSetLowerBound(firstId, '50');
        await dashboardControls.rangeSliderSetUpperBound(firstId, '100');
        await dashboardControls.validateRange('value', firstId, '50', '100');

        await dashboard.clearUnsavedChanges();
      });

      it('can add a second range list control with a non-default data view', async () => {
        await dashboardControls.createControl({
          controlType: RANGE_SLIDER_CONTROL,
          dataViewTitle: 'kibana_sample_data_flights',
          fieldName: 'AvgTicketPrice',
          additionalSettings: { step: 100 },
        });
        expect(await dashboardControls.getControlsCount()).to.be(2);
        const [firstId, secondId] = await dashboardControls.getAllControlIds();
        await dashboardControls.clearControlSelections(firstId);
        await dashboardControls.rangeSliderWaitForLoading(firstId);
        await dashboardControls.validateRange('placeholder', secondId, '100', '1200');

        await dashboardControls.rangeSliderSetLowerBound(secondId, '200');
        await dashboardControls.rangeSliderSetUpperBound(secondId, '1000');
        await dashboardControls.validateRange('value', secondId, '200', '1000');

        // data views should be properly propagated from the control group to the dashboard
        expect(await filterBar.getIndexPatterns()).to.be('logstash-*,kibana_sample_data_flights');
        await dashboard.clearUnsavedChanges();
      });

      it('edits title of an existing control and retains existing range selection', async () => {
        const secondId = (await dashboardControls.getAllControlIds())[1];
        const newTitle = 'Average ticket price';
        await dashboardControls.editExistingControl(secondId);
        await dashboardControls.controlsEditorVerifySupportedControlTypes({
          supportedTypes: [OPTIONS_LIST_CONTROL, RANGE_SLIDER_CONTROL],
          selectedType: RANGE_SLIDER_CONTROL,
        });
        await dashboardControls.controlEditorSetTitle(newTitle);
        await dashboardControls.controlEditorSave();
        expect(await dashboardControls.doesControlTitleExist(newTitle)).to.be(true);
        await dashboardControls.validateRange('value', secondId, '200', '1000');
        await dashboard.clearUnsavedChanges();
      });

      it('can change data view and field of range slider control and clears existing selection', async () => {
        const firstId = (await dashboardControls.getAllControlIds())[0];
        await dashboardControls.editExistingControl(firstId);

        const saveButton = await testSubjects.find('control-editor-save');
        expect(await saveButton.isEnabled()).to.be(true);
        await dashboardControls.controlsEditorSetDataView('kibana_sample_data_flights');
        expect(await saveButton.isEnabled()).to.be(false);
        await dashboardControls.controlsEditorSetfield('dayOfWeek');
        await dashboardControls.controlsEditorSetControlType(RANGE_SLIDER_CONTROL);
        await dashboardControls.controlEditorSave();
        await dashboardControls.rangeSliderWaitForLoading(firstId);
        await dashboardControls.validateRange('placeholder', firstId, '0', '6');
        await dashboardControls.validateRange('value', firstId, '', '');

        // when creating a new filter, the ability to select a data view should be removed, because the dashboard now only has one data view
        await retry.try(async () => {
          await testSubjects.click('addFilter');
          const indexPatternSelectExists = await testSubjects.exists('filterIndexPatternsSelect');
          await filterBar.ensureFieldEditorModalIsClosed();
          expect(indexPatternSelectExists).to.be(false);
        });
        await dashboard.clearUnsavedChanges();
      });

      it('can enter lower bound selection from the number field', async () => {
        const firstId = (await dashboardControls.getAllControlIds())[0];
        await dashboardControls.rangeSliderSetLowerBound(firstId, '1');
        const lowerBoundSelection = await dashboardControls.rangeSliderGetLowerBoundAttribute(
          firstId,
          'value'
        );
        expect(lowerBoundSelection).to.be('1');
      });

      it('can enter upper bound selection into the number field', async () => {
        const firstId = (await dashboardControls.getAllControlIds())[0];
        await dashboardControls.rangeSliderSetUpperBound(firstId, '2');
        const upperBoundSelection = await dashboardControls.rangeSliderGetUpperBoundAttribute(
          firstId,
          'value'
        );
        expect(upperBoundSelection).to.be('2');
        await dashboardControls.rangeSliderWaitForLoading(firstId);
      });

      it('applies filter from the first control on the second control', async () => {
        const secondId = (await dashboardControls.getAllControlIds())[1];
        await retry.try(async () => {
          await dashboardControls.rangeSliderWaitForLoading(secondId);
          await dashboardControls.validateRange('placeholder', secondId, '100', '1000');
        });
        await dashboard.clearUnsavedChanges();
      });

      it('can select a range on a defined step interval using arrow keys', async () => {
        const secondId = (await dashboardControls.getAllControlIds())[1];

        // clear out the lower bound selection
        await dashboardControls.clearControlSelections(secondId);

        await testSubjects.click(
          `range-slider-control-${secondId} > rangeSlider__lowerBoundFieldNumber`
        );

        // use arrow key to set lower bound to the next step up
        await browser.pressKeys(browser.keys.ARROW_UP, browser.keys.ARROW_UP);
        await dashboardControls.validateRange('value', secondId, '200', '');

        // use arrow key to set lower bound to the next step up
        await browser.pressKeys(browser.keys.ARROW_DOWN);
        await dashboardControls.validateRange('value', secondId, '100', '');

        await dashboardControls.rangeSliderSetUpperBound(secondId, '800');

        await testSubjects.click(
          `range-slider-control-${secondId} > rangeSlider__upperBoundFieldNumber`
        );

        // use arrow key to set upper bound to the next step up
        await browser.pressKeys(browser.keys.ARROW_UP);
        await dashboardControls.validateRange('value', secondId, '100', '900');

        // use arrow key to set upper bound to the next step up
        await browser.pressKeys(browser.keys.ARROW_DOWN);
        await dashboardControls.validateRange('value', secondId, '100', '800');

        await dashboard.clearUnsavedChanges();
      });

      it('can clear out selections by clicking the reset button', async () => {
        const firstId = (await dashboardControls.getAllControlIds())[0];
        await dashboardControls.clearControlSelections(firstId);
        await dashboardControls.rangeSliderOpenPopover(firstId);
        await dashboardControls.validateRange('value', firstId, '', '');
        await dashboardControls.rangeSliderEnsurePopoverIsClosed(firstId);
        await dashboard.clearUnsavedChanges();
      });

      it('making changes to range causes unsaved changes', async () => {
        const firstId = (await dashboardControls.getAllControlIds())[0];
        await dashboardControls.rangeSliderSetLowerBound(firstId, '2');
        await dashboardControls.rangeSliderSetUpperBound(firstId, '3');
        await dashboardControls.rangeSliderWaitForLoading(firstId);
        await dashboard.ensureHasUnsavedChangesNotification();
      });

      it('changes to range can be discarded', async () => {
        const firstId = (await dashboardControls.getAllControlIds())[0];
        await dashboardControls.validateRange('value', firstId, '2', '3');
        await dashboard.clickCancelOutOfEditMode();
        await dashboardControls.validateRange('value', firstId, '', '');
      });

      it('dashboard does not load with unsaved changes when changes are discarded', async () => {
        await dashboard.switchToEditMode();
        await retry.try(async () => {
          await dashboard.ensureMissingUnsavedChangesNotification();
        });
      });

      it('deletes an existing control', async () => {
        const firstId = (await dashboardControls.getAllControlIds())[0];
        await dashboardControls.removeExistingControl(firstId);
        expect(await dashboardControls.getControlsCount()).to.be(1);
        await dashboard.clearUnsavedChanges();
      });
    });

    describe('validation', () => {
      it('displays error message when upper bound selection is less than lower bound selection', async () => {
        const firstId = (await dashboardControls.getAllControlIds())[0];
        await dashboardControls.rangeSliderSetLowerBound(firstId, '500');
        await dashboardControls.rangeSliderSetUpperBound(firstId, '400');
      });

      it('cannot open popover when no data available', async () => {
        await dashboardControls.createControl({
          controlType: RANGE_SLIDER_CONTROL,
          dataViewTitle: 'logstash-*',
          fieldName: 'bytes',
        });
        const secondId = (await dashboardControls.getAllControlIds())[1];
        await testSubjects.click(
          `range-slider-control-${secondId} > rangeSlider__lowerBoundFieldNumber`
        ); // try to open popover
        await testSubjects.missingOrFail('rangeSlider__slider');
      });
    });

    describe('interaction', () => {
      it('Malformed query throws an error', async () => {
        await queryBar.setQuery('AvgTicketPrice <= 300 error');
        await queryBar.submitQuery();
        await header.waitUntilLoadingHasFinished();
        const firstId = (await dashboardControls.getAllControlIds())[0];
        await dashboardControls.checkForControlErrorStatus(firstId, true);
      });

      it('Can recover from malformed query error', async () => {
        await queryBar.setQuery('AvgTicketPrice <= 300');
        await queryBar.submitQuery();
        await header.waitUntilLoadingHasFinished();
        const firstId = (await dashboardControls.getAllControlIds())[0];
        await dashboardControls.checkForControlErrorStatus(firstId, false);
      });

      it('Applies dashboard query to range slider control', async () => {
        const firstId = (await dashboardControls.getAllControlIds())[0];
        await dashboardControls.rangeSliderWaitForLoading(firstId);
        await dashboardControls.validateRange('placeholder', firstId, '100', '300');
        await queryBar.setQuery('');
        await queryBar.submitQuery();
      });
    });
  });
}
