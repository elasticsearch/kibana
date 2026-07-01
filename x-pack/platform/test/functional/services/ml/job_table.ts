/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import expect from '@kbn/expect';
import type { ProvidedType } from '@kbn/test';
import type { WebElementWrapper } from '@kbn/ftr-common-functional-ui-services';
import type { TimeRangeType } from '@kbn/ml-plugin/public/application/components/custom_urls/custom_url_editor/constants';
import {
  TIME_RANGE_TYPE,
  URL_TYPE,
} from '@kbn/ml-plugin/public/application/components/custom_urls/custom_url_editor/constants';
import type { FtrProviderContext } from '../../ftr_provider_context';
import type { MlCommonUI } from './common_ui';
import type { MlCustomUrls } from './custom_urls';

export type MlADJobTable = ProvidedType<typeof MachineLearningJobTableProvider>;

export interface DiscoverUrlConfig {
  label: string;
  indexPattern: string;
  queryEntityFieldNames: string[];
  timeRange: TimeRangeType;
  timeRangeInterval?: string;
}

export interface DashboardUrlConfig {
  label: string;
  dashboardName: string;
  queryEntityFieldNames: string[];
  timeRange: TimeRangeType;
  timeRangeInterval?: string;
}

export interface OtherUrlConfig {
  label: string;
  url: string;
}

export enum QuickFilterButtonTypes {
  Opened = 'Opened',
  Closed = 'Closed',
  Started = 'Started',
  Stopped = 'Stopped',
}
export function MachineLearningJobTableProvider(
  { getPageObject, getService }: FtrProviderContext,
  mlCommonUI: MlCommonUI,
  customUrls: MlCustomUrls
) {
  const headerPage = getPageObject('header');
  const testSubjects = getService('testSubjects');
  const retry = getService('retry');

  return {
    async selectAllJobs(): Promise<void> {
      await testSubjects.click('checkboxSelectAll');
    },

    async assertJobsInTable(expectedJobIds: string[]) {
      const sortedExpectedIds = expectedJobIds.sort();
      const sortedActualJobIds = (await this.parseJobTable()).map((row) => row.id).sort();
      expect(sortedActualJobIds).to.eql(
        sortedExpectedIds,
        `Expected jobs in table to be [${sortedExpectedIds}], got [${sortedActualJobIds}]`
      );
    },

    async filterByState(quickFilterButton: QuickFilterButtonTypes): Promise<void> {
      const searchBar: WebElementWrapper = await testSubjects.find('mlJobListSearchBar');
      const quickFilter: WebElementWrapper = await searchBar.findByCssSelector(
        `span[data-text="${quickFilterButton}"]`
      );
      await quickFilter.click();

      const searchBarButtons = await searchBar.findAllByTagName('button');
      let pressedBttnText: string = '';
      for await (const button of searchBarButtons)
        if ((await button.getAttribute('aria-pressed')) === 'true')
          pressedBttnText = await button.getVisibleText();

      expect(pressedBttnText).to.eql(
        quickFilterButton,
        `Expected visible text of pressed quick filter button to equal [${quickFilterButton}], but got [${pressedBttnText}]`
      );
    },

    async parseJobTable(
      tableEnvironment: 'mlAnomalyDetection' | 'stackMgmtJobList' = 'mlAnomalyDetection'
    ) {
      const table = await testSubjects.find('~mlJobListTable');
      const $ = await table.parseDomContent();
      const rows = [];

      for (const tr of $.findTestSubjects('~mlJobListRow').toArray()) {
        const $tr = $(tr);

        const $jobGroups = $tr.findTestSubject('mlJobListRowGroups').findTestSubjects('mlJobGroup');
        const jobGroups = [];
        for (const el of $jobGroups.toArray()) {
          // collect this group in our array
          jobGroups.push($(el).text().trim());
        }

        const rowObject: {
          id: string;
          description: string;
          jobGroups: string[];
          recordCount: string;
          memoryStatus: string;
          datafeedState: string;
          latestTimestamp?: string;
          spaces?: string[];
        } = {
          id: $tr.findTestSubject('mlModelsTableColumnIdValueId').text().trim(),
          description: $tr
            .findTestSubject('mlJobListRowDescription')
            .text()
            .replace(/(&nbsp;$)/g, '')
            .trim(),
          jobGroups,
          recordCount: $tr
            .findTestSubject('mlJobListColumnRecordCount')
            .find('.euiTableCellContent')
            .text()
            .trim(),
          memoryStatus: $tr
            .findTestSubject('mlJobListColumnMemoryStatus')
            .find('.euiTableCellContent')
            .text()
            .trim(),
          datafeedState: $tr
            .findTestSubject('mlJobListColumnDatafeedState')
            .find('.euiTableCellContent')
            .text()
            .trim(),
        };

        if (tableEnvironment === 'mlAnomalyDetection') {
          const latestTimestamp = $tr
            .findTestSubject('mlJobListColumnLatestTimestamp')
            .find('.euiTableCellContent')
            .text()
            .trim();

          rowObject.latestTimestamp = latestTimestamp;
        }

        if (tableEnvironment === 'stackMgmtJobList') {
          const $spaces = $tr
            .findTestSubject('mlTableColumnSpaces')
            .find('.euiTableCellContent')
            .find('.euiAvatar--space');
          const spaces = [];
          for (const el of $spaces.toArray()) {
            // extract the space id from data-test-subj and add to list
            spaces.push($(el).attr('data-test-subj').replace('space-avatar-', ''));
          }

          rowObject.spaces = spaces;
        }

        rows.push(rowObject);
      }

      return rows;
    },

    // TODO: Mv this fn over too
    async parseJobCounts(jobId: string) {
      return await this.withDetailsOpen(jobId, async () => {
        // click counts tab
        await testSubjects.click(this.detailsSelector(jobId, 'mlJobListTab-counts'));

        const countsTable = await testSubjects.find(
          this.detailsSelector(jobId, 'mlJobDetails-counts > mlJobRowDetailsSection-counts')
        );
        const modelSizeStatsTable = await testSubjects.find(
          this.detailsSelector(jobId, 'mlJobDetails-counts > mlJobRowDetailsSection-modelSizeStats')
        );

        // parse a table by reading each row
        async function parseTable(el: typeof countsTable) {
          const $ = await el.parseDomContent();
          const vars: Record<string, string> = {};

          for (const row of $('tr').toArray()) {
            const [name, value] = $(row).find('td').toArray();

            vars[$(name).text().trim()] = $(value).text().trim();
          }

          return vars;
        }

        return {
          counts: await parseTable(countsTable),
          modelSizeStats: await parseTable(modelSizeStatsTable),
        };
      });
    },

    rowSelector(jobId: string, subSelector?: string) {
      const row = `~mlJobListTable > ~row-${jobId}`;
      return !subSelector ? row : `${row} > ${subSelector}`;
    },

    detailsSelector(jobId: string, subSelector?: string) {
      const row = `~mlJobListTable > ~details-${jobId}`;
      return !subSelector ? row : `${row} > ${subSelector}`;
    },

    async withDetailsOpen<T>(jobId: string, block: () => Promise<T>): Promise<T> {
      await this.ensureDetailsOpen(jobId);
      try {
        return await block();
      } finally {
        await this.ensureDetailsClosed(jobId);
      }
    },

    async ensureDetailsOpen(jobId: string) {
      await retry.tryForTime(10000, async () => {
        if (!(await testSubjects.exists(this.detailsSelector(jobId)))) {
          await testSubjects.click(this.rowSelector(jobId, 'mlJobListRowDetailsToggle'));
          await testSubjects.existOrFail(this.detailsSelector(jobId), { timeout: 1000 });
        }
      });
    },

    async ensureDetailsClosed(jobId: string) {
      await retry.tryForTime(10000, async () => {
        if (await testSubjects.exists(this.detailsSelector(jobId))) {
          await testSubjects.click(this.rowSelector(jobId, 'mlJobListRowDetailsToggle'));
          await testSubjects.missingOrFail(this.detailsSelector(jobId), { timeout: 1000 });
        }
      });
    },

    async waitForRefreshButtonLoaded(buttonTestSubj: string) {
      await testSubjects.existOrFail(`~${buttonTestSubj}`, { timeout: 10 * 1000 });
      await testSubjects.existOrFail(`${buttonTestSubj} loaded`, { timeout: 30 * 1000 });
    },

    async refreshJobList(
      tableEnvironment: 'mlAnomalyDetection' | 'stackMgmtJobList' = 'mlAnomalyDetection'
    ) {
      const testSubjStr =
        tableEnvironment === 'mlAnomalyDetection'
          ? 'mlDatePickerRefreshPageButton'
          : 'mlDatePickerRefreshPageButton';

      await this.waitForRefreshButtonLoaded(testSubjStr);
      await testSubjects.click(`~${testSubjStr}`);
      await this.waitForRefreshButtonLoaded(testSubjStr);
      await this.waitForJobsToLoad();
    },

    async waitForJobsToLoad() {
      await testSubjects.existOrFail('~mlJobListTable', { timeout: 60 * 1000 });
      await testSubjects.existOrFail('mlJobListTable loaded', { timeout: 30 * 1000 });
    },

    async filterWithSearchString(
      filter: string,
      expectedRowCount: number = 1,
      tableEnvironment: 'mlAnomalyDetection' | 'stackMgmtJobList' = 'mlAnomalyDetection'
    ) {
      await this.waitForJobsToLoad();
      await this.refreshJobList(tableEnvironment);
      const searchBar = await testSubjects.find('mlJobListSearchBar');
      const searchBarInput = await searchBar.findByTagName('input');
      await searchBarInput.clearValueWithKeyboard();
      await searchBarInput.type(filter);

      const rows = await this.parseJobTable();
      const filteredRows = rows.filter((row) => row.id === filter);
      expect(filteredRows).to.have.length(
        expectedRowCount,
        `Filtered AD job table should have ${expectedRowCount} row(s) for filter '${filter}' (got matching items '${JSON.stringify(
          filteredRows
        )}')`
      );
    },

    async assertJobRowFields(jobId: string, expectedRow: object) {
      await retry.tryForTime(5000, async () => {
        await this.refreshJobList();
        const rows = await this.parseJobTable();
        const jobRow = rows.filter((row) => row.id === jobId)[0];
        expect(jobRow).to.eql(
          expectedRow,
          `Expected job row to be '${JSON.stringify(expectedRow)}' (got '${JSON.stringify(
            jobRow
          )}')`
        );
      });
    },

    async assertJobRowJobId(jobId: string) {
      await retry.tryForTime(5000, async () => {
        await this.refreshJobList();
        const rows = await this.parseJobTable();
        const jobRowMatch = rows.find((row) => row.id === jobId);
        expect(jobRowMatch).to.not.eql(undefined, `Expected row with job ID ${jobId} to exist`);
      });
    },

    async assertJobActionSingleMetricViewerButtonEnabled(jobId: string, expectedValue: boolean) {
      const isEnabled = await testSubjects.isEnabled(
        this.rowSelector(jobId, 'mlOpenJobsInSingleMetricViewerButton')
      );
      expect(isEnabled).to.eql(
        expectedValue,
        `Expected "open in single metric viewer" job action button for AD job '${jobId}' to be '${
          expectedValue ? 'enabled' : 'disabled'
        }' (got '${isEnabled ? 'enabled' : 'disabled'}')`
      );
    },

    async assertJobActionAnomalyExplorerButtonEnabled(jobId: string, expectedValue: boolean) {
      const isEnabled = await testSubjects.isEnabled(
        this.rowSelector(jobId, 'mlOpenJobsInAnomalyExplorerButton')
      );
      expect(isEnabled).to.eql(
        expectedValue,
        `Expected "open in anomaly explorer" job action button for AD job '${jobId}' to be '${
          expectedValue ? 'enabled' : 'disabled'
        }' (got '${isEnabled ? 'enabled' : 'disabled'}')`
      );
    },

    async assertJobActionsMenuButtonEnabled(jobId: string, expectedValue: boolean) {
      const isEnabled = await testSubjects.isEnabled(
        this.rowSelector(jobId, 'euiCollapsedItemActionsButton')
      );
      expect(isEnabled).to.eql(
        expectedValue,
        `Expected actions menu button for AD job '${jobId}' to be '${
          expectedValue ? 'enabled' : 'disabled'
        }' (got '${isEnabled ? 'enabled' : 'disabled'}')`
      );
    },

    async assertJobActionStartDatafeedButtonEnabled(jobId: string, expectedValue: boolean) {
      await this.ensureJobActionsMenuOpen(jobId);
      const isEnabled = await testSubjects.isEnabled('mlActionButtonStartDatafeed');
      expect(isEnabled).to.eql(
        expectedValue,
        `Expected "start datafeed" action button for AD job '${jobId}' to be '${
          expectedValue ? 'enabled' : 'disabled'
        }' (got '${isEnabled ? 'enabled' : 'disabled'}')`
      );
    },

    async assertJobActionResetJobButtonEnabled(jobId: string, expectedValue: boolean) {
      await this.ensureJobActionsMenuOpen(jobId);
      const isEnabled = await testSubjects.isEnabled('mlActionButtonResetJob');
      expect(isEnabled).to.eql(
        expectedValue,
        `Expected "reset job" action button for AD job '${jobId}' to be '${
          expectedValue ? 'enabled' : 'disabled'
        }' (got '${isEnabled ? 'enabled' : 'disabled'}')`
      );
    },

    async assertJobActionCloneJobButtonEnabled(jobId: string, expectedValue: boolean) {
      await this.ensureJobActionsMenuOpen(jobId);
      const isEnabled = await testSubjects.isEnabled('mlActionButtonCloneJob');
      expect(isEnabled).to.eql(
        expectedValue,
        `Expected "clone job" action button for AD job '${jobId}' to be '${
          expectedValue ? 'enabled' : 'disabled'
        }' (got '${isEnabled ? 'enabled' : 'disabled'}')`
      );
    },

    async assertJobActionViewDatafeedCountsButtonEnabled(jobId: string, expectedValue: boolean) {
      await this.ensureJobActionsMenuOpen(jobId);
      const isEnabled = await testSubjects.isEnabled('mlActionButtonViewDatafeedChart');
      expect(isEnabled).to.eql(
        expectedValue,
        `Expected "view datafeed counts" action button for AD job '${jobId}' to be '${
          expectedValue ? 'enabled' : 'disabled'
        }' (got '${isEnabled ? 'enabled' : 'disabled'}')`
      );
    },

    async assertJobActionEditJobButtonEnabled(jobId: string, expectedValue: boolean) {
      await this.ensureJobActionsMenuOpen(jobId);
      const isEnabled = await testSubjects.isEnabled('mlActionButtonEditJob');
      expect(isEnabled).to.eql(
        expectedValue,
        `Expected "edit job" action button for AD job '${jobId}' to be '${
          expectedValue ? 'enabled' : 'disabled'
        }' (got '${isEnabled ? 'enabled' : 'disabled'}')`
      );
    },

    async assertJobActionDeleteJobButtonEnabled(jobId: string, expectedValue: boolean) {
      await this.ensureJobActionsMenuOpen(jobId);
      const isEnabled = await testSubjects.isEnabled('mlActionButtonDeleteJob');
      expect(isEnabled).to.eql(
        expectedValue,
        `Expected "delete job" action button for AD job '${jobId}' to be '${
          expectedValue ? 'enabled' : 'disabled'
        }' (got '${isEnabled ? 'enabled' : 'disabled'}')`
      );
    },

    async ensureJobActionsMenuOpen(jobId: string) {
      await retry.tryForTime(30 * 1000, async () => {
        if (!(await testSubjects.exists('mlActionButtonDeleteJob'))) {
          await testSubjects.click(this.rowSelector(jobId, 'euiCollapsedItemActionsButton'));
          await testSubjects.existOrFail('mlActionButtonDeleteJob', { timeout: 5000 });
        }
      });
    },

    async clickCloneJobAction(jobId: string) {
      await this.ensureJobActionsMenuOpen(jobId);
      await testSubjects.click('mlActionButtonCloneJob');
      await testSubjects.existOrFail('~mlPageJobWizard');
    },

    async clickCloneJobActionWhenNoDataViewExists(jobId: string) {
      await this.ensureJobActionsMenuOpen(jobId);
      await testSubjects.click('mlActionButtonCloneJob');
      await this.assertNoDataViewForCloneJobWarningToastExist();
    },

    async assertNoDataViewForCloneJobWarningToastExist() {
      await testSubjects.existOrFail('mlCloneJobNoDataViewExistsWarningToast', { timeout: 5000 });
    },

    async clickEditJobAction(jobId: string) {
      await this.ensureJobActionsMenuOpen(jobId);
      await testSubjects.click('mlActionButtonEditJob');
      await testSubjects.existOrFail('mlJobEditFlyout');
    },

    async clickDeleteJobAction(jobId: string) {
      await this.ensureJobActionsMenuOpen(jobId);
      await testSubjects.click('mlActionButtonDeleteJob');
      await testSubjects.existOrFail('mlDeleteJobConfirmModal');
    },

    async confirmDeleteJobModal() {
      await testSubjects.click('mlDeleteJobConfirmModal > mlDeleteJobConfirmModalButton');
      await testSubjects.missingOrFail('mlDeleteJobConfirmModal', { timeout: 30 * 1000 });
    },

    async clickDeleteAnnotationsInDeleteJobModal(checked: boolean) {
      await testSubjects.setEuiSwitch(
        'mlDeleteJobConfirmModal > mlDeleteJobConfirmModalDeleteAnnotationsSwitch',
        checked ? 'check' : 'uncheck'
      );
      const isChecked = await testSubjects.isEuiSwitchChecked(
        'mlDeleteJobConfirmModal > mlDeleteJobConfirmModalDeleteAnnotationsSwitch'
      );

      expect(isChecked).to.eql(checked, `Expected delete annotations switch to be ${checked}`);
    },

    async clickOpenJobInSingleMetricViewerButton(jobId: string) {
      await testSubjects.click(this.rowSelector(jobId, 'mlOpenJobsInSingleMetricViewerButton'));
      await testSubjects.existOrFail('~mlPageSingleMetricViewer');
    },

    async clickOpenJobInAnomalyExplorerButton(jobId: string) {
      await testSubjects.click(this.rowSelector(jobId, 'mlOpenJobsInAnomalyExplorerButton'));
      await testSubjects.existOrFail('~mlPageAnomalyExplorer');
    },

    async isJobRowSelected(jobId: string): Promise<boolean> {
      return await testSubjects.isChecked(this.rowSelector(jobId, `checkboxSelectRow-${jobId}`));
    },

    async assertJobRowSelected(jobId: string, expectedValue: boolean) {
      const isSelected = await this.isJobRowSelected(jobId);
      expect(isSelected).to.eql(
        expectedValue,
        `Expected job row for AD job '${jobId}' to be '${
          expectedValue ? 'selected' : 'deselected'
        }' (got '${isSelected ? 'selected' : 'deselected'}')`
      );
    },

    async selectJobRow(jobId: string) {
      if ((await this.isJobRowSelected(jobId)) === false) {
        await testSubjects.click(this.rowSelector(jobId, `checkboxSelectRow-${jobId}`));
      }

      await this.assertJobRowSelected(jobId, true);
      await this.assertMultiSelectActionsAreaActive();
    },

    async deselectJobRow(jobId: string) {
      if ((await this.isJobRowSelected(jobId)) === true) {
        await testSubjects.click(this.rowSelector(jobId, `checkboxSelectRow-${jobId}`));
      }

      await this.assertJobRowSelected(jobId, false);
      await this.assertMultiSelectActionsAreaInactive();
    },

    async assertMultiSelectActionsAreaActive() {
      await testSubjects.existOrFail('mlADJobListMultiSelectActionsArea active');
    },

    async assertMultiSelectActionsAreaInactive() {
      await testSubjects.existOrFail('mlADJobListMultiSelectActionsArea inactive', {
        allowHidden: true,
      });
    },

    async assertMultiSelectActionSingleMetricViewerButtonEnabled(expectedValue: boolean) {
      const isEnabled = await testSubjects.isEnabled(
        '~mlADJobListMultiSelectActionsArea > mlOpenJobsInSingleMetricViewerButton'
      );
      expect(isEnabled).to.eql(
        expectedValue,
        `Expected AD jobs multi select "open in single metric viewer" action button to be '${
          expectedValue ? 'enabled' : 'disabled'
        }' (got '${isEnabled ? 'enabled' : 'disabled'}')`
      );
    },

    async assertMultiSelectActionAnomalyExplorerButtonEnabled(expectedValue: boolean) {
      const isEnabled = await testSubjects.isEnabled(
        '~mlADJobListMultiSelectActionsArea > mlOpenJobsInAnomalyExplorerButton'
      );
      expect(isEnabled).to.eql(
        expectedValue,
        `Expected AD jobs multi select "open in anomaly explorer" action button to be '${
          expectedValue ? 'enabled' : 'disabled'
        }' (got '${isEnabled ? 'enabled' : 'disabled'}')`
      );
    },

    async assertMultiSelectActionEditJobGroupsButtonEnabled(expectedValue: boolean) {
      const isEnabled = await testSubjects.isEnabled(
        '~mlADJobListMultiSelectActionsArea > mlADJobListMultiSelectEditJobGroupsButton'
      );
      expect(isEnabled).to.eql(
        expectedValue,
        `Expected AD jobs multi select "edit job groups" action button to be '${
          expectedValue ? 'enabled' : 'disabled'
        }' (got '${isEnabled ? 'enabled' : 'disabled'}')`
      );
    },

    async assertMultiSelectManagementActionsButtonEnabled(expectedValue: boolean) {
      const isEnabled = await testSubjects.isEnabled(
        '~mlADJobListMultiSelectActionsArea > mlADJobListMultiSelectManagementActionsButton'
      );
      expect(isEnabled).to.eql(
        expectedValue,
        `Expected AD jobs multi select "management actions" button to be '${
          expectedValue ? 'enabled' : 'disabled'
        }' (got '${isEnabled ? 'enabled' : 'disabled'}')`
      );
    },

    async assertMultiSelectStartDatafeedActionButtonEnabled(expectedValue: boolean) {
      await this.ensureMultiSelectManagementActionsMenuOpen();
      const isEnabled = await testSubjects.isEnabled(
        'mlADJobListMultiSelectStartDatafeedActionButton'
      );
      expect(isEnabled).to.eql(
        expectedValue,
        `Expected AD jobs multi select "management actions" button to be '${
          expectedValue ? 'enabled' : 'disabled'
        }' (got '${isEnabled ? 'enabled' : 'disabled'}')`
      );
    },

    async assertMultiSelectDeleteJobActionButtonEnabled(expectedValue: boolean) {
      await this.ensureMultiSelectManagementActionsMenuOpen();
      const isEnabled = await testSubjects.isEnabled('mlADJobListMultiSelectDeleteJobActionButton');
      expect(isEnabled).to.eql(
        expectedValue,
        `Expected AD jobs multi select "management actions" button to be '${
          expectedValue ? 'enabled' : 'disabled'
        }' (got '${isEnabled ? 'enabled' : 'disabled'}')`
      );
    },

    async ensureMultiSelectManagementActionsMenuOpen() {
      await retry.tryForTime(30 * 1000, async () => {
        if (!(await testSubjects.exists('mlADJobListMultiSelectDeleteJobActionButton'))) {
          await testSubjects.click('mlADJobListMultiSelectManagementActionsButton');
          await testSubjects.existOrFail('mlADJobListMultiSelectDeleteJobActionButton', {
            timeout: 5000,
          });
        }
      });
    },

    async openEditCustomUrlsForJobTab(jobId: string) {
      await this.clickEditJobAction(jobId);
      // click Custom URLs tab
      await testSubjects.click('mlEditJobFlyout-customUrls');
      await this.ensureEditCustomUrlTabOpen();
      await headerPage.waitUntilLoadingHasFinished();
    },

    async ensureEditCustomUrlTabOpen() {
      await testSubjects.existOrFail('mlJobOpenCustomUrlFormButton', { timeout: 5000 });
    },

    async closeEditJobFlyout() {
      if (await testSubjects.exists('mlEditJobFlyoutCloseButton')) {
        await testSubjects.click('mlEditJobFlyoutCloseButton');
        await testSubjects.missingOrFail('mlJobEditFlyout');
      }
    },

    async saveEditJobFlyoutChanges() {
      await testSubjects.click('mlEditJobFlyoutSaveButton');
      await testSubjects.missingOrFail('mlJobEditFlyout', { timeout: 5000 });
    },

    async clickOpenCustomUrlEditor() {
      await this.ensureEditCustomUrlTabOpen();
      await testSubjects.click('mlJobOpenCustomUrlFormButton');
      await testSubjects.existOrFail('mlJobCustomUrlForm');
    },

    async getExistingCustomUrlCount(): Promise<number> {
      const existingCustomUrls = await testSubjects.findAll('mlJobEditCustomUrlItemLabel');
      return existingCustomUrls.length;
    },

    async saveCustomUrl(expectedLabel: string, expectedIndex: number, expectedValue?: string) {
      await retry.tryForTime(5000, async () => {
        await testSubjects.click('mlJobAddCustomUrl');
        await customUrls.assertCustomUrlLabel(expectedIndex, expectedLabel);
      });

      if (expectedValue !== undefined) {
        await customUrls.assertCustomUrlUrlValue(expectedIndex, expectedValue);
      }
    },

    async fillInDiscoverUrlForm(customUrl: DiscoverUrlConfig) {
      await this.clickOpenCustomUrlEditor();
      await customUrls.setCustomUrlLabel(customUrl.label);
      await mlCommonUI.selectRadioGroupValue(
        `mlJobCustomUrlLinkToTypeInput`,
        URL_TYPE.KIBANA_DISCOVER
      );
      await mlCommonUI.selectSelectValueByVisibleText(
        'mlJobCustomUrlDiscoverIndexPatternInput',
        customUrl.indexPattern
      );
      await customUrls.setCustomUrlQueryEntityFieldNames(customUrl.queryEntityFieldNames);
      await mlCommonUI.selectSelectValueByVisibleText(
        'mlJobCustomUrlTimeRangeInput',
        customUrl.timeRange
      );
      if (customUrl.timeRange === TIME_RANGE_TYPE.INTERVAL) {
        await customUrls.setCustomUrlTimeRangeInterval(customUrl.timeRangeInterval!);
      }
    },

    async fillInDashboardUrlForm(customUrl: DashboardUrlConfig) {
      await this.clickOpenCustomUrlEditor();
      await customUrls.setCustomUrlLabel(customUrl.label);
      await mlCommonUI.selectRadioGroupValue(
        `mlJobCustomUrlLinkToTypeInput`,
        URL_TYPE.KIBANA_DASHBOARD
      );
      await mlCommonUI.selectSelectValueByVisibleText(
        'mlJobCustomUrlDashboardNameInput',
        customUrl.dashboardName
      );
      await customUrls.setCustomUrlQueryEntityFieldNames(customUrl.queryEntityFieldNames);
      await mlCommonUI.selectSelectValueByVisibleText(
        'mlJobCustomUrlTimeRangeInput',
        customUrl.timeRange
      );
      if (customUrl.timeRange === TIME_RANGE_TYPE.INTERVAL) {
        await customUrls.setCustomUrlTimeRangeInterval(customUrl.timeRangeInterval!);
      }
    },

    async fillInOtherUrlForm(customUrl: OtherUrlConfig) {
      await this.clickOpenCustomUrlEditor();
      await customUrls.setCustomUrlLabel(customUrl.label);
      await mlCommonUI.selectRadioGroupValue(`mlJobCustomUrlLinkToTypeInput`, URL_TYPE.OTHER);
      await customUrls.setCustomUrlOtherTypeUrl(customUrl.url);
    },

    async addDiscoverCustomUrl(jobId: string, customUrl: DiscoverUrlConfig) {
      await retry.tryForTime(30 * 1000, async () => {
        await this.closeEditJobFlyout();
        await this.openEditCustomUrlsForJobTab(jobId);
        const existingCustomUrlCount = await this.getExistingCustomUrlCount();

        await this.fillInDiscoverUrlForm(customUrl);
        await this.saveCustomUrl(customUrl.label, existingCustomUrlCount);
      });

      // Save the job
      await this.saveEditJobFlyoutChanges();
    },

    async addDashboardCustomUrl(
      jobId: string,
      customUrl: DashboardUrlConfig,
      expectedResult: { index: number; url: string }
    ) {
      await retry.tryForTime(30 * 1000, async () => {
        await this.closeEditJobFlyout();
        await this.openEditCustomUrlsForJobTab(jobId);
        await this.fillInDashboardUrlForm(customUrl);
        await this.saveCustomUrl(customUrl.label, expectedResult.index, expectedResult.url);
      });

      // Save the job
      await this.saveEditJobFlyoutChanges();
    },

    async addOtherTypeCustomUrl(jobId: string, customUrl: OtherUrlConfig) {
      await retry.tryForTime(30 * 1000, async () => {
        await this.closeEditJobFlyout();
        await this.openEditCustomUrlsForJobTab(jobId);
        const existingCustomUrlCount = await this.getExistingCustomUrlCount();

        await this.fillInOtherUrlForm(customUrl);
        await this.saveCustomUrl(customUrl.label, existingCustomUrlCount);
      });

      // Save the job
      await this.saveEditJobFlyoutChanges();
    },

    async editCustomUrl(
      jobId: string,
      indexInList: number,
      customUrl: { label: string; url: string }
    ) {
      await this.openEditCustomUrlsForJobTab(jobId);
      await customUrls.editCustomUrlLabel(indexInList, customUrl.label);
      await customUrls.editCustomUrlUrlValue(indexInList, customUrl.url);

      // Save the edit
      await this.saveEditJobFlyoutChanges();
    },

    async deleteCustomUrl(jobId: string, indexInList: number) {
      await this.openEditCustomUrlsForJobTab(jobId);
      const beforeCustomUrls = await testSubjects.findAll('mlJobEditCustomUrlItemLabel');
      await customUrls.deleteCustomUrl(indexInList);

      // Save the edit and check the custom URL has been deleted.
      await testSubjects.click('mlEditJobFlyoutSaveButton');
      await this.openEditCustomUrlsForJobTab(jobId);
      await customUrls.assertCustomUrlsLength(beforeCustomUrls.length - 1);
      await this.closeEditJobFlyout();
    },

    async openTestCustomUrl(jobId: string, indexInList: number) {
      await this.openEditCustomUrlsForJobTab(jobId);
      await customUrls.clickTestCustomUrl(indexInList);
    },

    async testDiscoverCustomUrlAction(expectedHitCountFormatted: string) {
      await customUrls.assertDiscoverCustomUrlAction(expectedHitCountFormatted);
    },

    async testDashboardCustomUrlAction(expectedPanelCount: number) {
      await customUrls.assertDashboardCustomUrlAction(expectedPanelCount);
    },

    async testOtherTypeCustomUrlAction(jobId: string, indexInList: number, expectedUrl: string) {
      // Can't test the contents of the external page, so just check the expected URL.
      await this.openEditCustomUrlsForJobTab(jobId);
      await customUrls.assertCustomUrlUrlValue(indexInList, expectedUrl);
      await this.closeEditJobFlyout();
    },

    async assertJobListMultiSelectionText(expectedMsg: string): Promise<void> {
      const visibleText = await testSubjects.getVisibleText('~mlADJobListMultiSelectActionsArea');
      expect(visibleText).to.be(expectedMsg);
    },
  };
}
