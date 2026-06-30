/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import expect from '@kbn/expect';
import type { FtrProviderContext } from '../../../ftr_provider_context';

export default function ({ getService, getPageObjects }: FtrProviderContext) {
  const listingTable = getService('listingTable');
  const testSubjects = getService('testSubjects');
  const retry = getService('retry');
  const esArchiver = getService('esArchiver');
  const dashboardAddPanel = getService('dashboardAddPanel');
  const dashboardPanelActions = getService('dashboardPanelActions');
  const { tagManagement, header, dashboard, visualize, lens } = getPageObjects([
    'tagManagement',
    'header',
    'dashboard',
    'visualize',
    'lens',
  ]);

  const lensTag = 'extreme-lens-tag';
  const lensTitle = 'lens tag test';

  describe('lens tagging', () => {
    before(async () => {
      await esArchiver.loadIfNeeded(
        'x-pack/platform/test/fixtures/es_archives/logstash_functional'
      );
      await dashboard.navigateToApp();
      await dashboard.preserveCrossAppState();
      await dashboard.clickNewDashboard();
    });

    it('adds a new tag to a Lens visualization', async () => {
      // create lens
      await dashboardAddPanel.clickAddLensPanel();
      await lens.configureDimension({
        dimension: 'lnsXY_xDimensionPanel > lns-empty-dimension',
        operation: 'date_histogram',
        field: '@timestamp',
      });
      await lens.configureDimension({
        dimension: 'lnsXY_yDimensionPanel > lns-empty-dimension',
        operation: 'average',
        field: 'bytes',
      });

      await lens.configureDimension({
        dimension: 'lnsXY_splitDimensionPanel > lns-empty-dimension',
        operation: 'terms',
        field: 'ip',
      });

      await header.waitUntilLoadingHasFinished();
      await testSubjects.click('lnsApp_saveButton');

      await visualize.setSaveModalValues(lensTitle, {
        saveAsNew: false,
        redirectToOrigin: true,
      });
      await testSubjects.click('savedObjectTagSelector');
      await testSubjects.click(`tagSelectorOption-action__create`);

      expect(await tagManagement.tagModal.isOpened()).to.be(true);

      await tagManagement.tagModal.fillForm(
        {
          name: lensTag,
          color: '#FFCC33',
          description: '',
        },
        {
          submit: true,
          clearWithKeyboard: true,
        }
      );

      expect(await tagManagement.tagModal.isOpened()).to.be(false);
      await testSubjects.click('confirmSaveSavedObjectButton');
      await retry.waitForWithTimeout('Save modal to disappear', 1000, () =>
        testSubjects
          .missingOrFail('confirmSaveSavedObjectButton')
          .then(() => true)
          .catch(() => false)
      );
    });

    it('retains its saved object tags after save and return', async () => {
      await dashboardPanelActions.navigateToEditorFromFlyout();
      await lens.saveAndReturn();
      await header.waitUntilLoadingHasFinished();

      await visualize.gotoVisualizationLandingPage();
      await listingTable.waitUntilTableIsLoaded();

      await listingTable.selectFilterTags(lensTag);
      const itemNames = await listingTable.getAllItemsNames();
      expect(itemNames).to.contain(lensTitle);
    });
  });
}
