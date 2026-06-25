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
  const testSubjects = getService('testSubjects');
  const dashboardAddPanel = getService('dashboardAddPanel');
  const deployment = getService('deployment');
  const dashboardPanelActions = getService('dashboardPanelActions');
  const { dashboardLinks, dashboard, common, header } = getPageObjects([
    'dashboardLinks',
    'dashboard',
    'common',
    'header',
  ]);

  async function createSomeLinks() {
    await dashboardLinks.addExternalLink(
      `${deployment.getHostPort()}/app/foo`,
      true,
      true,
      'Link to new tab'
    );
    await dashboardLinks.addExternalLink(`${deployment.getHostPort()}/app/bar`, false, true);

    await dashboardLinks.addDashboardLink(DASHBOARD_NAME);
    await dashboardLinks.addDashboardLink('links 001');
  }

  async function openLinksPanelEditor() {
    await dashboardAddPanel.openAddPanelFlyout();
    await dashboardAddPanel.clickAddNewPanelFromUIActionLink('Links');
    await dashboardLinks.expectPanelEditorFlyoutIsOpen();
    await testSubjects.missingOrFail('dashboardAddPanel');
  }

  const DASHBOARD_NAME = 'Test Links panel';
  const LINKS_PANEL_NAME = 'Some links';

  // Failing: See https://github.com/elastic/kibana/issues/274890
  describe.skip('links panel create and edit', () => {
    describe('creation', () => {
      before(async () => {
        await dashboard.navigateToApp();
        await dashboard.preserveCrossAppState();
        await dashboard.gotoDashboardLandingPage();
        await dashboard.clickNewDashboard();
        await dashboard.saveDashboard(DASHBOARD_NAME, {
          exitFromEditMode: false,
          saveAsNew: true,
        });
        await dashboard.loadDashboardInEditMode(DASHBOARD_NAME);
      });

      it('can not add an external link that violates externalLinks.policy', async () => {
        await openLinksPanelEditor();

        await dashboardLinks.setExternalUrlInput('https://danger.example.com');
        expect(await testSubjects.exists('links--linkDestination--error')).to.be(true);
        await dashboardLinks.clickLinkEditorCloseButton();
        await dashboardLinks.clickPanelEditorCloseButton();
      });

      it('can create a new by-reference links panel', async () => {
        await openLinksPanelEditor();

        await createSomeLinks();
        await dashboardLinks.toggleSaveByReference(true);
        await dashboardLinks.clickPanelEditorSaveButton();

        await testSubjects.exists('savedObjectSaveModal');
        await testSubjects.setValue('savedObjectTitle', LINKS_PANEL_NAME);
        await testSubjects.click('confirmSaveSavedObjectButton');
        await common.waitForSaveModalToClose();
        await testSubjects.exists('addObjectToDashboardSuccess');
        await testSubjects.existOrFail('links--component');
        await dashboardPanelActions.expectLinkedToLibrary(LINKS_PANEL_NAME);

        expect(await dashboardLinks.getNumberOfLinksInPanel()).to.equal(4);
        await dashboard.clickDiscardChanges();
      });

      it('does not close the flyout when the user cancels the save as modal', async () => {
        await openLinksPanelEditor();
        await createSomeLinks();
        await dashboardLinks.toggleSaveByReference(true);
        await dashboardLinks.clickPanelEditorSaveButton();

        await testSubjects.exists('savedObjectSaveModal');
        await testSubjects.click('saveCancelButton');
        await testSubjects.existOrFail('links--panelEditor--flyout');
        await dashboardLinks.clickPanelEditorCloseButton();
      });

      describe('by-value links panel', () => {
        it('can create a new by-value links panel', async () => {
          await openLinksPanelEditor();
          await dashboardLinks.setLayout('horizontal');
          await createSomeLinks();
          await dashboardLinks.toggleSaveByReference(false);
          await dashboardLinks.clickPanelEditorSaveButton();
          await testSubjects.exists('addObjectToDashboardSuccess');
          await testSubjects.existOrFail('links--component');
          await dashboardPanelActions.expectNotLinkedToLibrary();

          expect(await dashboardLinks.getNumberOfLinksInPanel()).to.equal(4);
        });

        it('can save by-value links panel to the library', async () => {
          /** Navigate away to test non-extensible input */
          await dashboard.gotoDashboardLandingPage();
          await dashboard.clickUnsavedChangesContinueEditing(DASHBOARD_NAME);

          await dashboard.waitForRenderComplete();
          await dashboardPanelActions.saveToLibrary('Some more links');
        });

        it('can unlink a panel from the library', async () => {
          await dashboardPanelActions.unlinkFromLibrary('Some more links');
        });

        after(async () => {
          await dashboard.clickDiscardChanges();
        });
      });
    });

    describe('editing', () => {
      it('can reorder links in an existing panel', async () => {
        await dashboard.loadDashboardInEditMode('links 001');

        await dashboardPanelActions.clickEdit();
        await dashboardLinks.expectPanelEditorFlyoutIsOpen();

        // Move the third link up one step
        await dashboardLinks.reorderLinks(3, 1, true);

        await dashboardLinks.clickPanelEditorSaveButton();
        await header.waitUntilLoadingHasFinished();

        // The second link in the component should be the link we moved
        const listGroup = await testSubjects.find('links--component--listGroup');
        const listItem = await listGroup.findByCssSelector(`li:nth-child(2)`);
        expect(await listItem.getVisibleText()).to.equal('links 003 - external');
      });

      it('can edit link in existing panel', async () => {
        await dashboard.loadDashboardInEditMode('links 001');

        await dashboardPanelActions.clickEdit();
        await dashboardLinks.expectPanelEditorFlyoutIsOpen();

        await dashboardLinks.editLinkByIndex(5);
        await testSubjects.exists('links--linkEditor--flyout');
        await testSubjects.setValue('links--linkEditor--linkLabel--input', 'to be deleted');
        await dashboardLinks.clickLinksEditorSaveButton();
        await dashboardLinks.clickPanelEditorSaveButton();

        await header.waitUntilLoadingHasFinished();
        const link = await testSubjects.find('dashboardLink--links 005');
        expect(await link.getVisibleText()).to.equal('to be deleted');
      });

      it('can delete link from existing panel', async () => {
        await dashboard.loadDashboardInEditMode('links 001');

        await dashboardPanelActions.clickEdit();
        await dashboardLinks.expectPanelEditorFlyoutIsOpen();

        await dashboardLinks.deleteLinkByIndex(5);
        await dashboardLinks.clickPanelEditorSaveButton();

        await header.waitUntilLoadingHasFinished();
        expect(await dashboardLinks.getNumberOfLinksInPanel()).to.equal(4);
      });
    });
  });
}
