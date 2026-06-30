/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import expect from '@kbn/expect';
import type { FtrProviderContext } from './ftr_provider_context';

export function SearchIndexDetailPageProvider({ getService, getPageObjects }: FtrProviderContext) {
  const testSubjects = getService('testSubjects');
  const browser = getService('browser');
  const retry = getService('retry');
  const pageObjects = getPageObjects(['appMenu']);

  const expectIndexDetailPageHeader = async function () {
    await testSubjects.existOrFail('indexDetailsContent', { timeout: 2000 });
  };
  const expectSearchIndexDetailsTabsExists = async function () {
    await testSubjects.existOrFail('indexDetailsTab-overview');
    await testSubjects.existOrFail('indexDetailsTab-mappings');
    await testSubjects.existOrFail('indexDetailsTab-settings');
  };

  return {
    expectIndexDetailPageHeader,
    expectSearchIndexDetailsTabsExists,
    async expectIndexDetailsPageIsLoaded() {
      await expectIndexDetailPageHeader();
      await expectSearchIndexDetailsTabsExists();
    },
    async expectConnectionDetails() {
      await testSubjects.existOrFail('openConnectionDetails', { timeout: 2000 });
    },
    async expectConnectionDetailsFlyoutToOpen() {
      await testSubjects.click('openConnectionDetails');
      await testSubjects.existOrFail('connectionDetailsModalBody', { timeout: 5000 });
      await testSubjects.existOrFail('connectionDetailsModalTitle', { timeout: 2000 });
    },
    async closeConnectionDetailsFlyout() {
      await testSubjects.click('euiFlyoutCloseButton');
      await testSubjects.missingOrFail('connectionDetailsModalBody', { timeout: 2000 });
    },

    async expectSizeDocCountQuickStats() {
      await testSubjects.existOrFail('indexDetailsSizeDocCount', { timeout: 2000 });
    },
    async expectSizeDocCountQuickStatsMissing() {
      await testSubjects.missingOrFail('indexDetailsSizeDocCount', { timeout: 2000 });
    },
    async expectSizeDocCountToHaveDocumentCount(count: number) {
      await testSubjects.existOrFail('indexDetailsSizeDocCount', { timeout: 2000 });
      const cardElem = await testSubjects.find('indexDetailsSizeDocCount');
      const visibleText = await cardElem.getVisibleText();
      const label = count === 1 ? 'Document' : 'Documents';
      expect(visibleText).to.contain(`${count}\n${label}`);
    },

    async expectQuickStatsToHaveIndexStatus() {
      await testSubjects.existOrFail('indexDetailsStatus');
    },
    async expectStatusDetailsToShowStatus(status: 'Open' | 'Closed') {
      await testSubjects.existOrFail('indexDetailsStatus', { timeout: 2000 });
      const statusElem = await testSubjects.find('indexDetailsStatus');
      expect(await statusElem.getVisibleText()).to.contain(status);
    },
    async expectStatusDetailsToShowHealthBadge() {
      await testSubjects.existOrFail('indexDetailsHealthBadge', { timeout: 2000 });
    },
    async expectStatusDetailsToHaveDocCount(count: number) {
      const docCountElem = await testSubjects.find('indexDetailsStatusDocCount', 2000);
      await retry.try(async () => {
        expect(await docCountElem.getVisibleText()).to.contain(`${count}`);
      });
    },

    async expectQuickStatsToHaveIndexStorage(size?: string) {
      await testSubjects.existOrFail('indexDetailsStorage');
      if (!size) return;

      const storageElem = await testSubjects.find('indexDetailsStorage');
      expect(await storageElem.getVisibleText()).to.contain(size);
    },

    async expectManageIndexButtonExists() {
      await pageObjects.appMenu.existOrFail('indexActionsContextMenuButton');
    },
    async clickManageIndexButton() {
      await pageObjects.appMenu.clickMenuItem('indexActionsContextMenuButton');
    },
    async expectManageIndexContextMenuIsShown() {
      await testSubjects.existOrFail('deleteIndexMenuButton');
    },
    async expectDeleteIndexButtonExists() {
      await testSubjects.existOrFail('deleteIndexMenuButton');
    },
    async clickDeleteIndexButton() {
      await testSubjects.click('deleteIndexMenuButton');
    },
    async clickConfirmingDeleteIndex() {
      await testSubjects.existOrFail('confirmModalConfirmButton');
      await testSubjects.click('confirmModalConfirmButton');
    },

    async expectPageLoadErrorExists() {
      await retry.tryForTime(60 * 1000, async () => {
        await testSubjects.existOrFail('indexDetailsErrorLoadingDetails');
      });

      await testSubjects.existOrFail('indexDetailsReloadDetailsButton');
    },
    async hasPageReloadButton() {
      await testSubjects.existOrFail('indexDetailsReloadDetailsButton');
    },
    async pageReloadButtonIsVisible() {
      return testSubjects.isDisplayed('indexDetailsReloadDetailsButton');
    },
    async clickPageReload() {
      await retry.tryForTime(
        60 * 1000,
        async () => {
          await testSubjects.click('indexDetailsReloadDetailsButton', 2000);
        },
        undefined,
        100
      );
    },
    async expectTabsExists() {
      await testSubjects.existOrFail('indexDetailsTab-mappings', { timeout: 2000 });
      await testSubjects.existOrFail('indexDetailsTab-overview', { timeout: 2000 });
      await testSubjects.existOrFail('indexDetailsTab-settings', { timeout: 2000 });
    },
    async changeTab(
      tab: 'indexDetailsTab-overview' | 'indexDetailsTab-mappings' | 'indexDetailsTab-settings'
    ) {
      await testSubjects.click(tab);
    },
    async expectUrlShouldChangeTo(tab: 'overview' | 'mappings' | 'settings') {
      expect(await browser.getCurrentUrl()).contain(`tab=${tab}`);
    },
    async expectMappingsComponentIsVisible() {
      await testSubjects.existOrFail('indexDetailsMappingsToggleViewButton', { timeout: 2000 });
    },
    async expectSettingsComponentIsVisible() {
      await testSubjects.existOrFail('indexDetailsSettingsEditModeSwitch', { timeout: 2000 });
    },
    async expectEditSettingsIsDisabled() {
      await testSubjects.existOrFail('indexDetailsSettingsEditModeSwitch', { timeout: 2000 });
      const isEditSettingsButtonDisabled = await testSubjects.isEnabled(
        'indexDetailsSettingsEditModeSwitch'
      );
      expect(isEditSettingsButtonDisabled).to.be(false);
      await testSubjects.moveMouseTo('indexDetailsSettingsEditModeSwitch');
      await testSubjects.existOrFail('indexDetailsSettingsEditModeSwitchToolTip');
    },
    async expectEditSettingsToBeEnabled() {
      await testSubjects.existOrFail('indexDetailsSettingsEditModeSwitch', { timeout: 2000 });
      const isEditSettingsButtonDisabled = await testSubjects.isEnabled(
        'indexDetailsSettingsEditModeSwitch'
      );
      expect(isEditSettingsButtonDisabled).to.be(true);
    },

    async openIndicesDetailFromIndexManagementIndicesListTable(indexOfRow: number) {
      const indexList = await testSubjects.findAll('indexTableIndexNameLink');
      await indexList[indexOfRow].click();
      await retry.waitFor('index details page content to show up', async () => {
        return (await testSubjects.isDisplayed('indexDetailsContent')) === true;
      });
    },

    async expectBreadcrumbsToBeAvailable(breadcrumbsName: string) {
      const breadcrumbs = await testSubjects.findAll('euiBreadcrumb');
      let isBreadcrumbShown: boolean = false;
      for (const breadcrumb of breadcrumbs) {
        if ((await breadcrumb.getVisibleText()) === breadcrumbsName) {
          isBreadcrumbShown = true;
        }
      }
      expect(isBreadcrumbShown).to.eql(true, `Breadcrumb ${breadcrumbsName} was not found`);
    },

    async clickOnBreadcrumb(breadcrumbsName: string) {
      const breadcrumbs = await testSubjects.findAll('euiBreadcrumb');
      for (const breadcrumb of breadcrumbs) {
        if ((await breadcrumb.getVisibleText()) === breadcrumbsName) {
          await breadcrumb.click();
          return;
        }
      }
    },

    async expectAddFieldToBeDisabled() {
      await testSubjects.existOrFail('indexDetailsMappingsAddField');
      const isMappingsFieldEnabled = await testSubjects.isEnabled('indexDetailsMappingsAddField');
      expect(isMappingsFieldEnabled).to.be(false);
      await testSubjects.moveMouseTo('indexDetailsMappingsAddField');
      await testSubjects.existOrFail('indexDetailsMappingsAddFieldTooltip');
    },

    async expectAddFieldToBeEnabled() {
      await testSubjects.existOrFail('indexDetailsMappingsAddField');
      const isMappingsFieldEnabled = await testSubjects.isEnabled('indexDetailsMappingsAddField');
      expect(isMappingsFieldEnabled).to.be(true);
    },

    async expectDiscoverLinkExists() {
      await testSubjects.existOrFail('discoverButtonLink', { timeout: 2000 });
    },

    async expectAddDataSectionExists() {
      await testSubjects.existOrFail('codeBlockControlsPanel', { timeout: 2000 });
    },
    async expectDataPreviewExists() {
      await retry.try(async () => {
        await testSubjects.existOrFail('search-index-documents-result', { timeout: 5000 });
      });
    },
    async expectDataPreviewNotExists() {
      await testSubjects.missingOrFail('search-index-documents-result', { timeout: 2000 });
    },
  };
}
