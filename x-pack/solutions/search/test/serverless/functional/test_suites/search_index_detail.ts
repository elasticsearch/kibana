/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import type { FtrProviderContext } from '../ftr_provider_context';
import { testHasEmbeddedConsole } from './embedded_console';

const archivedBooksIndex = 'x-pack/solutions/search/test/functional_search/fixtures/search-books';
const archiveEmptyIndex =
  'x-pack/solutions/search/test/functional_search/fixtures/search-empty-index';
const archiveDenseVectorIndex =
  'x-pack/solutions/search/test/functional_search/fixtures/search-national-parks';

export default function ({ getPageObjects, getService }: FtrProviderContext) {
  const pageObjects = getPageObjects([
    'svlCommonPage',
    'embeddedConsole',
    'searchIndexDetailsPage',
    'svlApiKeys',
    'header',
    'common',
    'indexManagement',
  ]);
  const svlSearchNavigation = getService('svlSearchNavigation');
  const esArchiver = getService('esArchiver');

  const esDeleteAllIndices = getService('esDeleteAllIndices');

  const indexWithDataName = 'search-books';
  const indexWithoutDataName = 'search-empty-index';
  const indexWithDenseVectorName = 'search-national-parks';
  const indexDoesNotExistName = 'search-not-found';

  const createIndices = async () => {
    await esArchiver.load(archivedBooksIndex);
    await esArchiver.load(archiveDenseVectorIndex);
    await esArchiver.load(archiveEmptyIndex);
  };
  const deleteIndices = async () => {
    await esArchiver.unload(archivedBooksIndex);
    await esArchiver.unload(archiveDenseVectorIndex);
    await esArchiver.unload(archiveEmptyIndex);
    await esDeleteAllIndices([indexDoesNotExistName]);
  };

  describe('index details page - search solution', function () {
    // fails on MKI, see https://github.com/elastic/kibana/issues/233476
    this.tags(['failsOnMKI']);

    before(async () => {
      await createIndices();
      await esDeleteAllIndices([indexDoesNotExistName]);
    });

    after(async () => {
      await deleteIndices();
    });
    describe('developer', function () {
      before(async () => {
        await pageObjects.svlCommonPage.loginWithRole('developer');
        await pageObjects.svlApiKeys.deleteAPIKeys();
      });
      describe('search index details page', () => {
        before(async () => {
          await svlSearchNavigation.navigateToIndexDetailPage(indexWithoutDataName);
        });
        it('can load index detail page', async () => {
          await pageObjects.searchIndexDetailsPage.expectIndexDetailPageHeader();
          await pageObjects.searchIndexDetailsPage.expectSearchIndexDetailsTabsExists();
        });
        it('should have embedded dev console', async () => {
          await testHasEmbeddedConsole(pageObjects);
        });

        it('should have breadcrumb navigation', async () => {
          await pageObjects.searchIndexDetailsPage.clickOnBreadcrumb('Indices');
          await pageObjects.indexManagement.expectToBeOnIndexManagement();
          await svlSearchNavigation.navigateToIndexDetailPage(indexWithoutDataName);
        });

        it('should have connection details button', async () => {
          await pageObjects.searchIndexDetailsPage.expectConnectionDetails();
        });
        it('should open connection details flyout', async () => {
          await pageObjects.searchIndexDetailsPage.expectConnectionDetailsFlyoutToOpen();
          await pageObjects.searchIndexDetailsPage.closeConnectionDetailsFlyout();
        });

        it('should have quick stats', async () => {
          await pageObjects.searchIndexDetailsPage.expectSizeDocCountQuickStats();
        });

        it('should have add data section', async () => {
          await pageObjects.searchIndexDetailsPage.expectAddDataSectionExists();
        });
        it('should not show data preview for empty index', async () => {
          await pageObjects.searchIndexDetailsPage.expectDataPreviewNotExists();
        });

        describe('With data', () => {
          before(async () => {
            await svlSearchNavigation.navigateToIndexDetailPage(indexWithDataName);
          });
          it('should have documents in quick stats', async () => {
            await pageObjects.searchIndexDetailsPage.expectSizeDocCountToHaveDocumentCount(46);
          });
          it('should show data preview', async () => {
            await pageObjects.searchIndexDetailsPage.expectDataPreviewExists();
          });
          it('should have overview, mappings, and settings tabs', async () => {
            await pageObjects.searchIndexDetailsPage.expectTabsExists();
          });
          it('should be able to change tabs to mappings and mappings is shown', async () => {
            await pageObjects.searchIndexDetailsPage.changeTab('indexDetailsTab-mappings');
            await pageObjects.searchIndexDetailsPage.expectUrlShouldChangeTo('mappings');
            await pageObjects.searchIndexDetailsPage.expectMappingsComponentIsVisible();
          });
          it('should be able to change tabs to settings and settings is shown', async () => {
            await pageObjects.searchIndexDetailsPage.changeTab('indexDetailsTab-settings');
            await pageObjects.searchIndexDetailsPage.expectUrlShouldChangeTo('settings');
            await pageObjects.searchIndexDetailsPage.expectSettingsComponentIsVisible();
          });
        });

        describe('has index actions enabled', () => {
          beforeEach(async () => {
            await svlSearchNavigation.navigateToIndexDetailPage(indexWithDataName);
          });

          it('add field button is enabled', async () => {
            await pageObjects.searchIndexDetailsPage.changeTab('indexDetailsTab-mappings');
            await pageObjects.searchIndexDetailsPage.expectAddFieldToBeEnabled();
          });
          it('edit settings button is enabled', async () => {
            await pageObjects.searchIndexDetailsPage.changeTab('indexDetailsTab-settings');
            await pageObjects.searchIndexDetailsPage.expectEditSettingsToBeEnabled();
          });
          it('delete index button exists', async () => {
            await pageObjects.searchIndexDetailsPage.expectManageIndexButtonExists();
            await pageObjects.searchIndexDetailsPage.clickManageIndexButton();
            await pageObjects.searchIndexDetailsPage.expectManageIndexContextMenuIsShown();
            await pageObjects.searchIndexDetailsPage.expectDeleteIndexButtonExists();
          });
        });

        describe('page loading error', () => {
          before(async () => {
            await pageObjects.common.navigateToApp('indexManagement', {
              path: 'indices/index_details',
              search: `indexName=${indexDoesNotExistName}`,
              shouldLoginIfPrompted: false,
            });
          });
          it('has page load error section', async () => {
            await pageObjects.searchIndexDetailsPage.expectPageLoadErrorExists();
          });
        });
        describe('Index manage menu', () => {
          before(async () => {
            await svlSearchNavigation.navigateToIndexDetailPage(indexWithDenseVectorName);
          });
          it('shows action menu in manage index popover', async () => {
            await pageObjects.searchIndexDetailsPage.expectManageIndexButtonExists();
            await pageObjects.searchIndexDetailsPage.clickManageIndexButton();
            await pageObjects.searchIndexDetailsPage.expectManageIndexContextMenuIsShown();
          });
          it('should delete index', async () => {
            await pageObjects.searchIndexDetailsPage.expectDeleteIndexButtonExists();
            await pageObjects.searchIndexDetailsPage.clickDeleteIndexButton();
            await pageObjects.searchIndexDetailsPage.clickConfirmingDeleteIndex();
          });
        });
      });
      describe('index management index list page', () => {
        beforeEach(async () => {
          await pageObjects.common.navigateToApp('indexManagement');
          // Navigate to the indices tab
          await pageObjects.indexManagement.changeTabs('indicesTab');
          await pageObjects.header.waitUntilLoadingHasFinished();
        });
        describe('manage index action', () => {
          beforeEach(async () => {
            await pageObjects.indexManagement.manageIndex(indexWithoutDataName);
            await pageObjects.indexManagement.manageIndexContextMenuExists();
          });
          it('navigates to overview tab', async () => {
            await pageObjects.indexManagement.changeManageIndexTab('showOverviewIndexMenuButton');
            await pageObjects.searchIndexDetailsPage.expectIndexDetailPageHeader();
            await pageObjects.searchIndexDetailsPage.expectUrlShouldChangeTo('overview');
          });

          it('navigates to settings tab', async () => {
            await pageObjects.indexManagement.changeManageIndexTab('showSettingsIndexMenuButton');
            await pageObjects.searchIndexDetailsPage.expectIndexDetailPageHeader();
            await pageObjects.searchIndexDetailsPage.expectUrlShouldChangeTo('settings');
          });
          it('navigates to mappings tab', async () => {
            await pageObjects.indexManagement.changeManageIndexTab('showMappingsIndexMenuButton');
            await pageObjects.searchIndexDetailsPage.expectIndexDetailPageHeader();
            await pageObjects.searchIndexDetailsPage.expectUrlShouldChangeTo('mappings');
          });
        });
      });
    });

    // TODO: Fix this test to accurately test the viewer role once it's decided what the viewer role should be able to see.
    describe.skip('viewer', function () {
      describe('search index details page', function () {
        before(async () => {
          await pageObjects.svlCommonPage.loginAsViewer();
        });
        beforeEach(async () => {
          await svlSearchNavigation.navigateToIndexDetailPage(indexWithDataName);
        });
        it('add field button is disabled', async () => {
          await pageObjects.searchIndexDetailsPage.changeTab('indexDetailsTab-mappings');
          await pageObjects.searchIndexDetailsPage.expectAddFieldToBeDisabled();
        });
        it('edit settings button is disabled', async () => {
          await pageObjects.searchIndexDetailsPage.changeTab('indexDetailsTab-settings');
          await pageObjects.searchIndexDetailsPage.expectEditSettingsIsDisabled();
        });
        it('show no privileges to create api key', async () => {
          await pageObjects.svlApiKeys.expectAPIKeyNoPrivileges();
        });
      });
    });
  });
}
