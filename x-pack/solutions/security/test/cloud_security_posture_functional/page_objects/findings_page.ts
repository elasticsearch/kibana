/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import expect from '@kbn/expect';
import { ELASTIC_HTTP_VERSION_HEADER } from '@kbn/core-http-common';
import { CDR_LATEST_NATIVE_MISCONFIGURATIONS_INDEX_ALIAS } from '@kbn/cloud-security-posture-common';
import type { FtrProviderContext } from '../ftr_provider_context';

// Defined in CSP plugin
export const VULNERABILITIES_INDEX_DEFAULT_NS =
  'logs-cloud_security_posture.vulnerabilities-default';
export const CDR_LATEST_NATIVE_VULNERABILITIES_INDEX_PATTERN =
  'logs-cloud_security_posture.vulnerabilities_latest-default';

export function FindingsPageProvider({ getService, getPageObjects }: FtrProviderContext) {
  const testSubjects = getService('testSubjects');
  const PageObjects = getPageObjects(['common', 'header']);
  const retry = getService('retry');
  const es = getService('es');
  const supertest = getService('supertest');
  const log = getService('log');

  /**
   * required before indexing findings
   */
  const waitForPluginInitialized = (): Promise<void> =>
    retry.try(async () => {
      log.debug('Check CSP plugin is initialized');
      const response = await supertest
        .get('/internal/cloud_security_posture/status?check=init')
        .set(ELASTIC_HTTP_VERSION_HEADER, '1')
        .expect(200);
      expect(response.body).to.eql({ isPluginInitialized: true });
      log.debug('CSP plugin is initialized');
    });

  const deleteByQuery = async (index: string) => {
    await es.deleteByQuery({
      index,
      query: {
        match_all: {},
      },
      ignore_unavailable: true,
      refresh: true,
    });
  };

  const insertOperation = (index: string, findingsMock: Array<Record<string, unknown>>) => {
    return findingsMock.flatMap((doc) => [{ index: { _index: index } }, doc]);
  };

  const index = {
    remove: () => Promise.all([deleteByQuery(CDR_LATEST_NATIVE_MISCONFIGURATIONS_INDEX_ALIAS)]),
    add: async (findingsMock: Array<Record<string, unknown>>) => {
      await es.bulk({
        refresh: true,
        operations: [
          ...insertOperation(CDR_LATEST_NATIVE_MISCONFIGURATIONS_INDEX_ALIAS, findingsMock),
        ],
      });
    },
  };

  const vulnerabilitiesIndex = {
    remove: () =>
      Promise.all([
        deleteByQuery(VULNERABILITIES_INDEX_DEFAULT_NS),
        deleteByQuery(CDR_LATEST_NATIVE_VULNERABILITIES_INDEX_PATTERN),
      ]),
    add: async (findingsMock: Array<Record<string, unknown>>) => {
      await es.bulk({
        refresh: true,
        operations: [
          ...insertOperation(VULNERABILITIES_INDEX_DEFAULT_NS, findingsMock),
          ...insertOperation(CDR_LATEST_NATIVE_VULNERABILITIES_INDEX_PATTERN, findingsMock),
        ],
      });
    },
  };

  const detectionRuleApi = {
    remove: async () => {
      await supertest
        .post('/api/detection_engine/rules/_bulk_action?dry_run=false')
        .set('kbn-xsrf', 'true')
        .set(ELASTIC_HTTP_VERSION_HEADER, '2023-10-31')
        .send({
          action: 'delete',
          query: '',
        })
        .expect(200);
    },
  };

  const distributionBar = {
    filterBy: async (type: 'passed' | 'failed') =>
      testSubjects.click(type === 'failed' ? 'distribution_bar_failed' : 'distribution_bar_passed'),
  };

  const createNotInstalledObject = (notInstalledSubject: string) => ({
    getElement() {
      return testSubjects.find(notInstalledSubject, 15 * 1000);
    },

    async navigateToAction(actionTestSubject: string) {
      return await retry.try(async () => {
        await testSubjects.click(actionTestSubject);
        await PageObjects.header.waitUntilLoadingHasFinished();

        const result = await testSubjects.exists('createPackagePolicy_pageTitle');

        if (!result) {
          throw new Error('Integration installation page not found');
        }
      });
    },
  });

  const createDataTableObject = (tableTestSubject: string) => ({
    getElement() {
      return testSubjects.find(tableTestSubject);
    },

    async getHeaders() {
      const element = await this.getElement();
      return await element.findAllByCssSelector('.euiDataGridHeader');
    },

    async getColumnIndex(columnName: string) {
      const element = await this.getElement();
      const columnIndexAttr = await (
        await element.findByCssSelector(`[data-gridcell-column-id="${columnName}"]`)
      ).getAttribute('data-gridcell-column-index');
      expect(columnIndexAttr).to.not.be(null);
      const columnIndex = parseInt(columnIndexAttr ?? '-1', 10);
      expect(columnIndex).to.be.greaterThan(-1);
      return columnIndex;
    },

    async getColumnHeaderCell(columnName: string) {
      const headers = await this.getHeaders();
      const headerIndexes = await Promise.all(headers.map((header) => header.getVisibleText()));
      const columnIndex = headerIndexes.findIndex((i) => i === columnName);
      return headers[columnIndex];
    },

    async getRowsCount() {
      const element = await this.getElement();
      const rows = await element.findAllByCssSelector('.euiDataGridRow');
      return rows.length;
    },

    async getFindingsCount(type: 'passed' | 'failed') {
      const element = await this.getElement();
      const items = await element.findAllByCssSelector(`span[data-test-subj="${type}_finding"]`);
      return items.length;
    },

    async getRowIndexForValue(columnName: string, value: string) {
      const values = await this.getColumnValues(columnName);
      const rowIndex = values.indexOf(value);
      expect(rowIndex).to.be.greaterThan(-1);
      return rowIndex;
    },

    async getFilterElementButton(rowIndex: number, columnIndex: number | string, negated = false) {
      const tableElement = await this.getElement();
      const button = negated ? 'filterOutButton' : 'filterForButton';
      const selector = `[data-gridcell-row-index="${rowIndex}"][data-gridcell-column-index="${columnIndex}"] button[data-test-subj="${button}"]`;
      return tableElement.findByCssSelector(selector);
    },

    async addCellFilter(columnName: string, cellValue: string, negated = false) {
      const columnIndex = await this.getColumnIndex(columnName);
      const rowIndex = await this.getRowIndexForValue(columnName, cellValue);
      const filterElement = await this.getFilterElementButton(rowIndex, columnIndex, negated);
      await filterElement.click();
    },

    async getColumnValues(columnName: string) {
      const tableElement = await this.getElement();
      const selector = `.euiDataGridRowCell[data-gridcell-column-id="${columnName}"]`;
      const columnCells = await tableElement.findAllByCssSelector(selector);

      return await Promise.all(columnCells.map((cell) => cell.getVisibleText()));
    },

    async hasColumnValue(columnName: string, value: string) {
      const values = await this.getColumnValues(columnName);
      return values.includes(value);
    },

    async toggleColumnSort(columnName: string, direction: 'asc' | 'desc') {
      const currentSorting = await testSubjects.find('dataGridColumnSortingButton');
      const currentSortingText = await currentSorting.getVisibleText();
      await currentSorting.click();

      if (currentSortingText !== 'Sort fields') {
        const clearSortButton = await testSubjects.find('dataGridColumnSortingClearButton');
        await clearSortButton.click();
      }

      const selectSortFieldButton = await testSubjects.find('dataGridColumnSortingSelectionButton');
      await selectSortFieldButton.click();

      const sortField = await testSubjects.find(
        `dataGridColumnSortingPopoverColumnSelection-${columnName}`
      );
      await sortField.click();

      const sortDirection = await testSubjects.find(
        `euiDataGridColumnSorting-sortColumn-${columnName}-${direction}`
      );
      await sortDirection.click();
      await currentSorting.click();
    },

    async openFlyoutAt(rowIndex: number) {
      const table = await this.getElement();
      const flyoutButton = await table.findAllByTestSubject('docTableExpandToggleColumn');
      await flyoutButton[rowIndex].click();
    },

    async toggleEditDataViewFieldsOption(columnId: string) {
      const element = await this.getElement();
      const column = await element.findByCssSelector(`[data-gridcell-column-id="${columnId}"]`);
      const button = await column.findByCssSelector('.euiDataGridHeaderCell__button');
      return await button.click();
    },
  });

  const navigateToLatestFindingsPage = async (space?: string) => {
    const options = space
      ? {
          basePath: `/s/${space}`,
          shouldUseHashForSubUrl: false,
        }
      : {
          shouldUseHashForSubUrl: false,
        };

    await PageObjects.common.navigateToUrl(
      'securitySolution', // Defined in Security Solution plugin
      'cloud_security_posture/findings/configurations',
      options
    );
  };

  const navigateToLatestVulnerabilitiesPage = async (space?: string) => {
    const options = space
      ? {
          basePath: `/s/${space}`,
          shouldUseHashForSubUrl: false,
        }
      : {
          shouldUseHashForSubUrl: false,
        };
    await PageObjects.common.navigateToUrl(
      'securitySolution', // Defined in Security Solution plugin
      'cloud_security_posture/findings/vulnerabilities',
      options
    );
  };

  const navigateToMisconfigurations = async (space?: string) => {
    const options = space
      ? {
          basePath: `/s/${space}`,
          shouldUseHashForSubUrl: false,
        }
      : {
          shouldUseHashForSubUrl: false,
        };

    await PageObjects.common.navigateToUrl(
      'securitySolution', // Defined in Security Solution plugin
      'cloud_security_posture/findings/configurations',
      options
    );
  };

  const latestFindingsTable = createDataTableObject('latest_findings_table');
  const latestVulnerabilitiesTable = createDataTableObject('latest_vulnerabilities_table');

  const notInstalledVulnerabilities = createNotInstalledObject('cnvm-integration-not-installed');
  const notInstalledCSP = createNotInstalledObject('cloud_posture_page_package_not_installed');
  const thirdPartyIntegrationsNoVulnerabilitiesFindingsPrompt = createNotInstalledObject(
    '3p-integrations-no-vulnerabilities-findings-prompt'
  );

  const vulnerabilityDataGrid = {
    getVulnerabilityTable: async () => testSubjects.find('euiDataGrid'),
  };

  const createFlyoutObject = (tableTestSubject: string) => ({
    async getElement() {
      return await testSubjects.find(tableTestSubject);
    },
    async clickTakeActionButton() {
      const element = await this.getElement();
      const button = await element.findByCssSelector('[data-test-subj="csp:take_action"] button');
      await button.click();
      return button;
    },
    async clickTakeActionCreateRuleButton() {
      await this.clickTakeActionButton();
      const button = await testSubjects.find('csp:create_rule');
      await button.click();
      return button;
    },
    async getVisibleText(testSubj: string) {
      const element = await this.getElement();
      return await (await element.findByTestSubject(testSubj)).getVisibleText();
    },
  });

  const misconfigurationsFlyout = createFlyoutObject('rightSection');

  const groupSelector = (testSubj = 'group-selector-dropdown') => ({
    async getElement() {
      return await testSubjects.find(testSubj);
    },
    async setValue(value: string) {
      const contextMenu = await testSubjects.find('groupByContextMenu');
      const menuItems = await contextMenu.findAllByCssSelector('button.euiContextMenuItem');
      const menuItemsOptions = await Promise.all(menuItems.map((item) => item.getVisibleText()));
      const menuItemValueIndex = menuItemsOptions.findIndex((item) => item === value);
      await menuItems[menuItemValueIndex].click();
      return await testSubjects.missingOrFail('is-loading-grouping-table', { timeout: 5000 });
    },
    async openDropDown() {
      const element = await this.getElement();
      await element.click();
    },
  });

  const findingsGrouping = async (testSubj = 'cloudSecurityGrouping') => ({
    async getElement() {
      return await testSubjects.find(testSubj);
    },
    async getGroupCount() {
      const element = await this.getElement();
      const groupCount = await element.findByTestSubject('group-count');
      return await groupCount.getVisibleText();
    },
    async getUnitCount() {
      const element = await this.getElement();
      const unitCount = await element.findByTestSubject('unit-count');
      return await unitCount.getVisibleText();
    },
    async getRowAtIndex(rowIndex: number) {
      const element = await this.getElement();
      const row = await element.findAllByTestSubject('grouping-accordion');
      return await row[rowIndex];
    },
  });
  const isLatestFindingsTableThere = async () => {
    const table = await testSubjects.findAll('docTable');
    return table.length > 0;
  };

  const getUnprivilegedPrompt = async () => {
    return await testSubjects.find('status-api-unprivileged');
  };

  return {
    navigateToLatestFindingsPage,
    navigateToLatestVulnerabilitiesPage,
    navigateToMisconfigurations,
    latestFindingsTable,
    latestVulnerabilitiesTable,
    notInstalledVulnerabilities,
    notInstalledCSP,
    thirdPartyIntegrationsNoVulnerabilitiesFindingsPrompt,
    index,
    vulnerabilitiesIndex,
    waitForPluginInitialized,
    distributionBar,
    vulnerabilityDataGrid,
    misconfigurationsFlyout,
    detectionRuleApi,
    groupSelector,
    findingsGrouping,
    createDataTableObject,
    isLatestFindingsTableThere,
    getUnprivilegedPrompt,
  };
}
