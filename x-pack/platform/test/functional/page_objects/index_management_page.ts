/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import expect from '@kbn/expect';
import type { FtrProviderContext } from '../ftr_provider_context';

export function IndexManagementPageProvider({ getService, getPageObjects }: FtrProviderContext) {
  const retry = getService('retry');
  const find = getService('find');
  const testSubjects = getService('testSubjects');
  const pageObjects = getPageObjects(['common', 'appMenu']);

  const browser = getService('browser');
  return {
    async sectionHeadingText() {
      return await testSubjects.getVisibleText('appHeaderTitle');
    },

    async expectToBeOnIndexManagement() {
      const headingText = await testSubjects.getVisibleText('appHeaderTitle');
      expect(headingText).to.be('Index Management');
    },

    async reloadIndices() {
      await testSubjects.click('reloadIndicesButton');
    },
    async reloadIndicesButton() {
      return await testSubjects.find('reloadIndicesButton');
    },
    async toggleHiddenIndices() {
      await testSubjects.click('checkboxToggles-includeHiddenIndices');
    },

    async clickEnrichPolicyAt(indexOfRow: number): Promise<void> {
      const policyDetailsLinks = await testSubjects.findAll('enrichPolicyDetailsLink');
      await policyDetailsLinks[indexOfRow].click();
    },

    async clickIndexTemplate(name: string): Promise<void> {
      const indexTemplateLinks = await testSubjects.findAll('templateDetailsLink');

      for (const link of indexTemplateLinks) {
        if ((await link.getVisibleText()).includes(name)) {
          await link.click();
          return;
        }
      }
    },

    async clickBulkEditDataRetention(dataStreamNames: string[]): Promise<void> {
      for (const dsName of dataStreamNames) {
        const checkbox = await testSubjects.find(`checkboxSelectRow-${dsName}`);
        if (!(await checkbox.isSelected())) {
          await checkbox.click();
        }
      }
      await testSubjects.click('dataStreamActionsPopoverButton');
      await testSubjects.click('bulkEditDataRetentionButton');
    },

    async clickIndexTemplateNameLink(name: string): Promise<void> {
      await find.clickByLinkText(name);
    },

    async clickDataStreamNameLink(name: string): Promise<void> {
      await find.clickByLinkText(name);
    },

    async clickDeleteEnrichPolicyAt(indexOfRow: number): Promise<void> {
      const deleteButons = await testSubjects.findAll('deletePolicyButton');
      await deleteButons[indexOfRow].click();
    },

    async clickExecuteEnrichPolicyAt(indexOfRow: number): Promise<void> {
      const executeButtons = await testSubjects.findAll('executePolicyButton');
      await executeButtons[indexOfRow].click();
    },

    async clickConfirmModalButton(): Promise<void> {
      await testSubjects.click('confirmModalConfirmButton');
    },

    async clickIndexDetailsTab(tabName: string): Promise<void> {
      await testSubjects.click(`indexDetailsTab-${tabName}`);
    },

    async clickIndexDetailsEditSettingsSwitch(): Promise<void> {
      await testSubjects.click('indexDetailsSettingsEditModeSwitch');
    },

    async clickIndexAt(indexOfRow: number): Promise<void> {
      const indexList = await testSubjects.findAll('indexTableIndexNameLink');
      await indexList[indexOfRow].click();
      await retry.waitFor('details page content to show up', async () => {
        return (await testSubjects.isDisplayed('indexDetailsContent')) === true;
      });
    },

    async performIndexAction(action: string) {
      await this.clickContextMenu();
      if (action === 'flush') {
        await testSubjects.click('flushIndexMenuButton');
      }
    },

    async clickContextMenu() {
      await pageObjects.appMenu.clickMenuItem('indexActionsContextMenuButton');
    },

    async getIndexList() {
      const table = await find.byCssSelector('table');
      const rows = await table.findAllByTestSubject('indexTableRow');
      return await Promise.all(
        rows.map(async (row) => {
          return {
            indexLink: await row.findByTestSubject('indexTableIndexNameLink'),
            indexName: await (
              await row.findByTestSubject('indexTableIndexNameLink')
            ).getVisibleText(),
            indexHealth: await (
              await row.findByTestSubject('indexTableCell-health')
            ).getVisibleText(),
            indexStatus: await (
              await row.findByTestSubject('indexTableCell-status')
            ).getVisibleText(),
            indexPrimary: await (
              await row.findByTestSubject('indexTableCell-primary')
            ).getVisibleText(),
            indexReplicas: await (
              await row.findByTestSubject('indexTableCell-replica')
            ).getVisibleText(),
            indexDocuments: await (
              await (await row.findByTestSubject('indexTableCell-documents')).getVisibleText()
            ).replace('documents', ''),
            indexSize: await (await row.findByTestSubject('indexTableCell-size')).getVisibleText(),
          };
        })
      );
    },

    async changeTabs(
      tab:
        | 'indicesTab'
        | 'data_streamsTab'
        | 'templatesTab'
        | 'component_templatesTab'
        | 'enrich_policiesTab'
    ) {
      await testSubjects.click(tab);
    },

    async changeMappingsEditorTab(
      tab: 'mappedFields' | 'runtimeFields' | 'dynamicTemplates' | 'advancedOptions'
    ) {
      const index = [
        'mappedFields',
        'runtimeFields',
        'dynamicTemplates',
        'advancedOptions',
      ].indexOf(tab);

      const tabs = await testSubjects.findAll('formTab');
      await tabs[index].click();
    },

    async clickNextButton() {
      await testSubjects.click('nextButton');
    },

    indexDetailsPage: {
      async openIndexDetailsPage(indexOfRow: number) {
        const indexList = await testSubjects.findAll('indexTableIndexNameLink');
        await indexList[indexOfRow].click();
        await retry.waitFor('index details page content to show up', async () => {
          return (await testSubjects.isDisplayed('indexDetailsContent')) === true;
        });
      },
      async expectIndexDetailsPageIsLoaded() {
        await testSubjects.existOrFail('indexDetailsTab-overview');
        await testSubjects.existOrFail('indexDetailsContent');
        await testSubjects.existOrFail('appHeaderBack');
      },
      async expectUrlShouldChangeTo(tabId: string) {
        const url = await browser.getCurrentUrl();
        expect(url).to.contain(`tab=${tabId}`);
      },
      async expectEditSettingsToBeEnabled() {
        await testSubjects.existOrFail('indexDetailsSettingsEditModeSwitch', { timeout: 2000 });
        await retry.waitFor('edit settings switch to be enabled', async () => {
          return (await testSubjects.isEnabled('indexDetailsSettingsEditModeSwitch')) === true;
        });
      },
      async expectIndexDetailsMappingsAddFieldToBeEnabled() {
        await testSubjects.existOrFail('indexDetailsMappingsAddField');
        await retry.waitFor('mappings add field button to be enabled', async () => {
          return (await testSubjects.isEnabled('indexDetailsMappingsAddField')) === true;
        });
      },
      async expectTabsExists() {
        await testSubjects.existOrFail('indexDetailsTab-mappings', { timeout: 2000 });
        await testSubjects.existOrFail('indexDetailsTab-overview', { timeout: 2000 });
        await testSubjects.existOrFail('indexDetailsTab-settings', { timeout: 2000 });
      },
      async changeTab(
        tab: 'indexDetailsTab-mappings' | 'indexDetailsTab-overview' | 'indexDetailsTab-settings'
      ) {
        await testSubjects.click(tab);
      },
      async expectBreadcrumbNavigationToHaveBreadcrumbName(breadcrumbName: string) {
        await testSubjects.existOrFail('euiBreadcrumb');
        expect(await testSubjects.getVisibleText('breadcrumb first')).to.contain(
          'Stack Management'
        );
        expect(await testSubjects.getVisibleText('breadcrumb last')).to.contain(breadcrumbName);
      },
    },
    async clickCreateIndexButton() {
      await testSubjects.click('createIndexButton');
    },
    async setCreateIndexName(value: string) {
      await testSubjects.existOrFail('createIndexNameFieldText');
      await testSubjects.setValue('createIndexNameFieldText', value);
    },
    async setCreateIndexMode(value: string) {
      await testSubjects.existOrFail('indexModeField');
      await testSubjects.selectValue('indexModeField', value);
    },
    async clickCreateIndexSaveButton() {
      await testSubjects.existOrFail('createIndexSaveButton');
      await testSubjects.click('createIndexSaveButton');
      // Wait for modal to close
      await testSubjects.missingOrFail('createIndexSaveButton', {
        timeout: 30_000,
      });
    },
    async expectIndexToExist(indexName: string) {
      const table = await find.byCssSelector('table');
      const rows = await table.findAllByTestSubject('indexTableRow');
      const indexNames: string[] = await Promise.all(
        rows.map(async (row) => {
          return await (await row.findByTestSubject('indexTableIndexNameLink')).getVisibleText();
        })
      );
      expect(indexNames.some((i) => i === indexName)).to.be(true);
    },

    async clickCreateIndexShowApiButton() {
      await testSubjects.existOrFail('createIndexShowApiButton');
      await testSubjects.click('createIndexShowApiButton');
    },
    async getCreateIndexShowApiButtonText() {
      return await testSubjects.getVisibleText('createIndexShowApiButton');
    },
    async getCreateIndexApiCodeBlockContent() {
      await testSubjects.existOrFail('createIndexApiCodeBlock');
      return await testSubjects.getVisibleText('createIndexApiCodeBlock');
    },
    async confirmDeleteModalIsVisible() {
      await testSubjects.existOrFail('deleteIndexMenuButton');
      await testSubjects.click('deleteIndexMenuButton');
      await testSubjects.existOrFail('confirmModalTitleText');
      const modalText: string = await testSubjects.getVisibleText('confirmModalTitleText');
      expect(modalText).to.be('Delete index');
      await testSubjects.existOrFail('confirmModalConfirmButton');
      await testSubjects.click('confirmModalConfirmButton');
      // wait for index to be deleted
      await testSubjects.missingOrFail('confirmModalConfirmButton');
    },

    async expectIndexIsDeleted(indexName: string) {
      try {
        const table = await find.byCssSelector('table');
        const rows = await table.findAllByTestSubject('indexTableRow');

        const indexNames = await Promise.all(
          rows.map(async (row) => {
            try {
              return await (
                await row.findByTestSubject('indexTableIndexNameLink')
              ).getVisibleText();
            } catch (error) {
              // If the current row is stale, it has already been removed
              if (error.name === 'StaleElementReferenceError') return undefined;
              throw error; // Rethrow unexpected errors
            }
          })
        ).then((names) => names.filter((name) => name !== undefined));

        expect(indexNames.includes(indexName)).to.be(false);
      } catch (error) {
        if (error.name === 'StaleElementReferenceError') {
          // If the table itself is stale, it means all rows have been removed
          return; // Pass the test since the table is gone
        } else {
          throw error; // Rethrow unexpected errors
        }
      }
    },
    async manageIndex(indexName: string) {
      const id = `checkboxSelectIndex-${indexName}`;
      const checkbox = await find.byCssSelector(`input[id="${id}"]`);
      if (!(await checkbox.isSelected())) {
        await find.clickByCssSelector(`input[id="${id}"]`);
      }
      await retry.waitFor('manage index to show up ', async () => {
        return (await testSubjects.isDisplayed('indexActionsContextMenuButton')) === true;
      });
      const contextMenuButton = await testSubjects.find('indexActionsContextMenuButton');
      await contextMenuButton.click();
      await retry.waitFor('manage index context menu to show ', async () => {
        return (await testSubjects.isDisplayed('indexContextMenu')) === true;
      });
    },
    async manageIndexContextMenuExists() {
      await testSubjects.existOrFail('showOverviewIndexMenuButton');
      await testSubjects.existOrFail('showSettingsIndexMenuButton');
      await testSubjects.existOrFail('showMappingsIndexMenuButton');
      await testSubjects.existOrFail('deleteIndexMenuButton');
    },
    async changeManageIndexTab(
      manageIndexTab:
        | 'showOverviewIndexMenuButton'
        | 'showSettingsIndexMenuButton'
        | 'showMappingsIndexMenuButton'
        | 'deleteIndexMenuButton'
    ) {
      await testSubjects.existOrFail(manageIndexTab);
      const manageIndexComponent = await testSubjects.find(manageIndexTab);
      await manageIndexComponent.click();
    },
    async navigateToIndexManagementTab(
      path: 'indices' | 'data_streams' | 'templates' | 'component_templates' | 'enrich_policies'
    ) {
      await pageObjects.common.navigateToApp('indexManagement', { path });
    },
  };
}
