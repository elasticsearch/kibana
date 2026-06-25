/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import expect from '@kbn/expect';
import type { FtrProviderContext } from '../ftr_provider_context';

export default function ({ getService, getPageObjects }: FtrProviderContext) {
  const esArchiver = getService('esArchiver');
  const security = getService('security');
  const kibanaServer = getService('kibanaServer');
  const dashboardAddPanel = getService('dashboardAddPanel');
  const dashboardPanelActions = getService('dashboardPanelActions');
  const testSubjects = getService('testSubjects');
  const browser = getService('browser');
  const esql = getService('esql');

  const { dashboard, dashboardControls, discover, timePicker } = getPageObjects([
    'dashboard',
    'dashboardControls',
    'discover',
    'timePicker',
  ]);

  describe('discover esql controls', () => {
    before(async () => {
      await kibanaServer.uiSettings.replace({
        defaultIndex: 'logstash-*',
        enableESQL: true,
      });
      await timePicker.setDefaultAbsoluteRangeViaUiSettings();

      await kibanaServer.savedObjects.cleanStandardList();
      await security.testUser.setRoles(['kibana_admin', 'test_logstash_reader']);
      await kibanaServer.importExport.load(
        'src/platform/test/functional/fixtures/kbn_archiver/dashboard/current/esql_controls'
      );
      await kibanaServer.importExport.load(
        'src/platform/test/functional/fixtures/kbn_archiver/discover/session_with_control'
      );
      await esArchiver.loadIfNeeded(
        'src/platform/test/functional/fixtures/es_archiver/logstash_functional'
      );
    });

    after(async () => {
      await timePicker.resetDefaultAbsoluteRangeViaUiSettings();
    });

    describe('when adding an ES|QL panel with controls in Dashboard and exploring it in Discover', () => {
      it('should retain the controls and their state', async () => {
        // Navigate to a dashboard with an ES|QL control
        await dashboard.navigateToApp();
        await dashboard.loadSavedDashboard('ES|QL controls fixture dashboard');
        await dashboard.waitForRenderComplete();

        const controlGroupVisible = await testSubjects.exists('controls-group-wrapper');
        expect(controlGroupVisible).to.be(true);

        // Go to discover from the embeddable
        await dashboardPanelActions.clickPanelAction(
          'embeddablePanelAction-ACTION_OPEN_IN_DISCOVER'
        );

        // Verify that we are in discover
        const [, discoverHandle] = await browser.getAllWindowHandles();
        await browser.switchToWindow(discoverHandle);

        await discover.expectOnDiscover();

        // Verify that the control exists in discover
        const control = await dashboardControls.getControlElementById('esql-control-1');
        expect(control).to.be.ok();
        await discover.expectDocTableToBeLoaded();
      });
    });

    const addUnlinkedSavedSearch = async () => {
      await dashboard.navigateToApp();
      await dashboard.clickNewDashboard();

      await dashboardAddPanel.addSavedSearch('ESQL control unlink test');
      await dashboard.waitForRenderComplete();

      await dashboardPanelActions.unlinkFromLibrary('ESQL control unlink test');
      await dashboard.waitForRenderComplete();
    };

    describe('when viewing an unlinked by-value ES|QL panel in Discover', () => {
      it('should retain the controls and their state', async () => {
        await addUnlinkedSavedSearch();

        // Save dashboard and go to view mode
        await dashboard.saveDashboard('ESQL control unlink test dashboard');
        await dashboard.switchToViewMode();

        // Go to discover from the panel
        await dashboardPanelActions.clickPanelActionByTitle(
          'embeddablePanelAction-ACTION_VIEW_SAVED_SEARCH',
          'ESQL control unlink test'
        );

        // Verify that we are in discover and the control exists
        await discover.expectOnDiscover();
        expect(await dashboardControls.getControlsCount()).to.be(1);
      });
    });

    describe('when editing an unlinked by-value ES|QL panel in Discover', () => {
      it('should persist updated control selections after saving', async () => {
        await addUnlinkedSavedSearch();

        expect(await dashboardControls.getControlsCount()).to.be(1);

        const initialDashboardControlId = (await dashboardControls.getAllControlIds())[0];
        expect(
          await dashboardControls.optionsListGetSelectionsString(initialDashboardControlId)
        ).to.be('AE');

        await dashboardPanelActions.editPanelByTitle('ESQL control unlink test');
        await discover.expectOnDiscover();
        await discover.waitUntilTabIsLoaded();

        const discoverControlId = (await dashboardControls.getAllControlIds())[0];
        expect(await dashboardControls.optionsListGetSelectionsString(discoverControlId)).to.be(
          'AE'
        );

        await dashboardControls.optionsListOpenPopover(discoverControlId, true);
        await dashboardControls.optionsListPopoverSelectOption('CN');
        await dashboardControls.optionsListEnsurePopoverIsClosed(discoverControlId);
        await discover.waitUntilTabIsLoaded();

        expect(await dashboardControls.optionsListGetSelectionsString(discoverControlId)).to.be(
          'CN'
        );

        await discover.clickSaveSearchButton();
        await dashboard.waitForRenderComplete();

        expect(await dashboardPanelActions.getPanelWrapper('ESQL control unlink test')).to.be.ok();
        expect(await dashboardControls.getControlsCount()).to.be(1);

        const updatedDashboardControlId = (await dashboardControls.getAllControlIds())[0];
        expect(
          await dashboardControls.optionsListGetSelectionsString(updatedDashboardControlId)
        ).to.be('CN');
      });

      it('should discard control selection changes after cancelling', async () => {
        await addUnlinkedSavedSearch();

        expect(await dashboardControls.getControlsCount()).to.be(1);

        const initialDashboardControlId = (await dashboardControls.getAllControlIds())[0];
        expect(
          await dashboardControls.optionsListGetSelectionsString(initialDashboardControlId)
        ).to.be('AE');

        await dashboardPanelActions.editPanelByTitle('ESQL control unlink test');
        await discover.expectOnDiscover();
        await discover.waitUntilTabIsLoaded();

        const discoverControlId = (await dashboardControls.getAllControlIds())[0];
        await dashboardControls.optionsListOpenPopover(discoverControlId, true);
        await dashboardControls.optionsListPopoverSelectOption('CN');
        await dashboardControls.optionsListEnsurePopoverIsClosed(discoverControlId);
        await discover.waitUntilTabIsLoaded();

        expect(await dashboardControls.optionsListGetSelectionsString(discoverControlId)).to.be(
          'CN'
        );

        await discover.clickCancelButton();
        await dashboard.waitForRenderComplete();

        expect(await dashboardPanelActions.getPanelWrapper('ESQL control unlink test')).to.be.ok();
        expect(await dashboardControls.getControlsCount()).to.be(1);

        const unchangedDashboardControlId = (await dashboardControls.getAllControlIds())[0];
        expect(
          await dashboardControls.optionsListGetSelectionsString(unchangedDashboardControlId)
        ).to.be('AE');
      });
    });

    describe('when saving a Discover table with ES|QL controls to a dashboard', () => {
      it('should create a dashboard with the Discover table and the selected control state', async () => {
        await discover.navigateToApp();
        await discover.loadSavedSearch('ESQL control unlink test');
        await discover.waitUntilTabIsLoaded();

        expect(await dashboardControls.getControlsCount()).to.be(1);

        const discoverControlId = (await dashboardControls.getAllControlIds())[0];
        expect(await dashboardControls.optionsListGetSelectionsString(discoverControlId)).to.be(
          'AE'
        );

        await dashboardControls.optionsListOpenPopover(discoverControlId, true);
        await dashboardControls.optionsListPopoverSelectOption('CN');
        await dashboardControls.optionsListEnsurePopoverIsClosed(discoverControlId);
        await discover.waitUntilTabIsLoaded();

        expect(await dashboardControls.optionsListGetSelectionsString(discoverControlId)).to.be(
          'CN'
        );

        await discover.clickSaveDiscoverTableToDashboard('ESQL control by-value table');

        await dashboard.waitForRenderComplete();
        await dashboard.verifyNoRenderErrors();

        expect(
          await dashboardPanelActions.getPanelWrapper('ESQL control by-value table')
        ).to.be.ok();
        expect(await dashboardControls.getControlsCount()).to.be(1);

        const dashboardControlId = (await dashboardControls.getAllControlIds())[0];
        expect(await dashboardControls.optionsListGetSelectionsString(dashboardControlId)).to.be(
          'CN'
        );
      });
    });

    describe('when saving a new by-value Discover session panel back to a dashboard with matching controls', () => {
      // This is flacky and sometimes it creates a duplicate: https://github.com/elastic/kibana/issues/265636
      it.skip('should update the existing dashboard control instead of creating a duplicate', async () => {
        await addUnlinkedSavedSearch();

        expect(await dashboardControls.getControlsCount()).to.be(1);

        const initialDashboardControlId = (await dashboardControls.getAllControlIds())[0];
        expect(
          await dashboardControls.optionsListGetSelectionsString(initialDashboardControlId)
        ).to.be('AE');

        await dashboardAddPanel.clickAddDiscoverPanel();
        await discover.expectOnDiscover();
        await discover.waitUntilTabIsLoaded();
        await discover.selectTextBaseLang();
        await discover.waitUntilTabIsLoaded();

        await esql.openEsqlControlFlyout('FROM logstash-* | WHERE geo.dest == ');
        await testSubjects.setValue('esqlVariableName', '?geo_dest');
        await testSubjects.setValue('esqlControlLabel', 'Updated destination');
        await testSubjects.waitForEnabled('saveEsqlControlsFlyoutButton');
        await testSubjects.click('saveEsqlControlsFlyoutButton');

        await discover.waitUntilTabIsLoaded();

        expect(await dashboardControls.getControlsCount()).to.be(1);

        const discoverControlId = (await dashboardControls.getAllControlIds())[0];
        await dashboardControls.optionsListOpenPopover(discoverControlId, true);
        await dashboardControls.optionsListPopoverSelectOption('CN');
        await dashboardControls.optionsListEnsurePopoverIsClosed(discoverControlId);
        await discover.waitUntilTabIsLoaded();

        expect(await dashboardControls.optionsListGetSelectionsString(discoverControlId)).to.be(
          'CN'
        );

        await discover.clickSaveSearchButton();
        await dashboard.waitForRenderComplete();

        expect(await dashboardControls.getControlsCount()).to.be(1);

        const updatedDashboardControlId = (await dashboardControls.getAllControlIds())[0];
        expect(updatedDashboardControlId).to.be(initialDashboardControlId);
        expect(
          await dashboardControls.optionsListGetSelectionsString(updatedDashboardControlId)
        ).to.be('CN');
      });
    });
  });
}
