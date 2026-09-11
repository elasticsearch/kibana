/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { FtrProviderContext } from '../../../ftr_provider_context';

export default function ({ getService, getPageObjects }: FtrProviderContext) {
  const { dashboard, header } = getPageObjects(['dashboard', 'header']);
  const listingTable = getService('listingTable');
  const testSubjects = getService('testSubjects');
  const dashboardAddPanel = getService('dashboardAddPanel');
  const esArchiver = getService('esArchiver');

  describe('dashboard save', function describeIndexTests() {
    this.tags('includeFirefox');
    const dashboardName = 'Dashboard Save Test';
    const dashboardNameEnterKey = 'Dashboard Save Test with Enter Key';

    before(async function () {
      await esArchiver.loadIfNeeded(
        'src/platform/test/functional/fixtures/es_archiver/logstash_functional'
      );
      await dashboard.initTests();
    });

    describe('create new', () => {
      // A failing test in this stateful suite can leave a save modal open, whose backdrop mask
      // intercepts every click and wedges each downstream test until it times out. Reset to a
      // clean state on failure so one test's failure can't cascade into the rest of the suite.
      afterEach(async function () {
        if (this.currentTest?.isFailed()) {
          await dashboard.navigateToApp();
        }
      });

      it('warns on duplicate name for new dashboard', async function () {
        await dashboard.clickNewDashboard();
        await dashboard.saveDashboard(dashboardName);

        await dashboard.expectDuplicateTitleWarningDisplayed({ displayed: false });

        await dashboard.gotoDashboardLandingPage();
        await dashboard.clickNewDashboard();
        await dashboard.enterDashboardSaveModalApplyUpdatesAndClickSave(dashboardName, {
          waitDialogIsClosed: false,
        });
        await dashboard.expectDuplicateTitleWarningDisplayed({ displayed: true });
      });

      it('does not save on reject confirmation', async function () {
        await dashboard.cancelSave();
        await dashboard.gotoDashboardLandingPage();

        await listingTable.searchAndExpectItemsCount('dashboard', dashboardName, 1);
      });

      it('Saves on confirm duplicate title warning', async function () {
        await dashboard.gotoDashboardLandingPage();
        await dashboard.clickNewDashboard();
        await dashboard.enterDashboardSaveModalApplyUpdatesAndClickSave(dashboardName, {
          waitDialogIsClosed: false,
        });

        await dashboard.ensureDuplicateTitleCallout();
        await dashboard.clickSave();

        // This is important since saving a new dashboard will cause a refresh of the page. We have to
        // wait till it finishes reloading or it might reload the url after simulating the
        // dashboard landing page click.
        await header.waitUntilLoadingHasFinished();

        // after saving a new dashboard, the app state must be removed
        await await dashboard.expectAppStateRemovedFromURL();

        await dashboard.gotoDashboardLandingPage();

        await listingTable.searchAndExpectItemsCount('dashboard', dashboardName, 2);
      });

      it('Saves new Dashboard using the Enter key', async function () {
        await dashboard.gotoDashboardLandingPage();
        await dashboard.clickNewDashboard();
        await dashboard.enterDashboardTitleAndPressEnter(dashboardNameEnterKey);

        // This is important since saving a new dashboard will cause a refresh of the page. We have to
        // wait till it finishes reloading or it might reload the url after simulating the
        // dashboard landing page click.
        await header.waitUntilLoadingHasFinished();
        await dashboard.gotoDashboardLandingPage();

        await listingTable.searchAndExpectItemsCount('dashboard', dashboardNameEnterKey, 1);
      });
    });

    describe('quick save', () => {
      it('Does not show quick save menu item on a new dashboard', async function () {
        await dashboard.gotoDashboardLandingPage();
        await dashboard.clickNewDashboard();
        await dashboard.expectMissingQuickSaveOption();
      });

      it('Does not show dashboard save modal when on quick save', async function () {
        await dashboard.gotoDashboardLandingPage();
        await dashboard.clickNewDashboard();
        await dashboard.saveDashboard('test quick save');

        await dashboard.switchToEditMode();
        await dashboard.expectExistsQuickSaveOption();
        await dashboardAddPanel.clickAddCollapsibleSection();
        await dashboard.ensureHasUnsavedChangesNotification({ retry: true });
        await dashboard.clickQuickSave();

        await testSubjects.existOrFail('saveDashboardSuccess');
        await testSubjects.missingOrFail('savedObjectSaveModal');
      });

      it('Stays in edit mode after performing a quick save', async function () {
        await header.waitUntilLoadingHasFinished();
        await testSubjects.existOrFail('dashboardQuickSaveMenuItem');
      });
    });

    describe('duplication (edit mode)', () => {
      it('Warns you when you Save as New Dashboard, and the title is a duplicate', async function () {
        await dashboard.switchToEditMode();
        await dashboard.enterDashboardSaveModalApplyUpdatesAndClickSave(dashboardName, {
          waitDialogIsClosed: false,
        });

        await dashboard.expectDuplicateTitleWarningDisplayed({ displayed: true });

        await dashboard.cancelSave();
      });

      it('Does not warn when only the prefix matches', async function () {
        await dashboard.switchToEditMode();
        await dashboard.enterDashboardSaveModalApplyUpdatesAndClickSave(`${dashboardName} copy`, {
          waitDialogIsClosed: false,
        });
        await dashboard.expectDuplicateTitleWarningDisplayed({ displayed: false });
      });
    });

    describe('flyout settings', () => {
      const dashboardNameFlyout = 'Dashboard Save Test with Flyout';

      it('Does not warn when you save an existing dashboard with the title it already has', async function () {
        await dashboard.gotoDashboardLandingPage();
        await dashboard.clickNewDashboard();
        await dashboard.enterDashboardTitleAndPressEnter(dashboardNameFlyout);

        // This is important since saving a new dashboard will cause a refresh of the page. We have to
        // wait till it finishes reloading or it might reload the url after simulating the
        // dashboard landing page click.
        await header.waitUntilLoadingHasFinished();

        await dashboard.switchToEditMode();
        await dashboard.modifySettings({ title: dashboardNameFlyout });
      });
    });
  });
}
