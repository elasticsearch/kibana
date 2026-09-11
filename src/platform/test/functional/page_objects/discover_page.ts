/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import expect from '@kbn/expect';
import type { WebElementWrapper } from '@kbn/ftr-common-functional-ui-services';
import { FtrService } from '../ftr_provider_context';

const DISCOVER_QUERY_MODE_KEY = 'discover.defaultQueryMode';

export class DiscoverPageObject extends FtrService {
  private readonly retry = this.ctx.getService('retry');
  private readonly testSubjects = this.ctx.getService('testSubjects');
  private readonly find = this.ctx.getService('find');
  private readonly flyout = this.ctx.getService('flyout');
  private readonly header = this.ctx.getPageObject('header');
  private readonly dataViews = this.ctx.getService('dataViews');
  private readonly unifiedFieldList = this.ctx.getPageObject('unifiedFieldList');
  private readonly browser = this.ctx.getService('browser');
  private readonly globalNav = this.ctx.getService('globalNav');
  private readonly elasticChart = this.ctx.getService('elasticChart');
  private readonly config = this.ctx.getService('config');
  private readonly appMenu = this.ctx.getPageObject('appMenu');
  private readonly dataGrid = this.ctx.getService('dataGrid');
  private readonly fieldEditor = this.ctx.getService('fieldEditor');
  private readonly queryBar = this.ctx.getService('queryBar');
  private readonly savedObjectsFinder = this.ctx.getService('savedObjectsFinder');
  private readonly toasts = this.ctx.getService('toasts');
  private readonly log = this.ctx.getService('log');
  private readonly timeToVisualize = this.ctx.getPageObject('timeToVisualize');
  private readonly common = this.ctx.getPageObject('common');
  private readonly dashboardPanelActions = this.ctx.getService('dashboardPanelActions');
  private readonly dashboard = this.ctx.getPageObject('dashboard');

  private readonly defaultFindTimeout = this.config.get('timeouts.find');

  public readonly APP_ID = 'discover';

  public async navigateToApp() {
    await this.common.navigateToApp(this.APP_ID);
  }

  /** Ensures that navigation to discover has completed */
  public async expectOnDiscover() {
    await this.retry.waitFor('discover app to be rendered', () =>
      this.testSubjects.exists('discoverSavedSearchTitle', { allowHidden: true })
    );
  }

  public async isOnDashboardsEditMode() {
    const newButton = await this.appMenu.menuItemExists('discoverNewButton');
    const openButton = await this.appMenu.menuItemExists('discoverOpenButton');

    return !newButton && !openButton;
  }

  /**
   * Whether we're in a standalone Discover session (vs. editing a session embedded in a dashboard).
   * Classic chrome tells these apart via the first breadcrumb ("Discover" vs "Dashboards"); next-project
   * chrome has no breadcrumbs, so we rely on the new/open buttons, which are hidden only while editing.
   */
  private async isStandaloneDiscoverSession(): Promise<boolean> {
    if (await this.globalNav.isNextProjectChrome()) {
      return !(await this.isOnDashboardsEditMode());
    }
    return (await this.globalNav.getFirstBreadcrumb()) === 'Discover';
  }

  public async getChartTimespan() {
    const getHistogramChartDataTimeRange = async () =>
      await this.testSubjects.getAttribute('unifiedHistogramChart', 'data-time-range');

    await this.retry.waitFor('chart timespan to finish loading', async () => {
      const timespan = await getHistogramChartDataTimeRange();
      return !timespan?.includes('Loading');
    });

    return await getHistogramChartDataTimeRange();
  }

  public async saveAsSearch(searchName: string) {
    await this.clickSaveAsSearchButton();
    // preventing an occasional flakiness when the saved object wasn't set and the form can't be submitted
    await this.retry.waitFor(`saved search title is set to ${searchName}`, async () => {
      await this.testSubjects.setValue('savedObjectTitle', searchName);
      return (await this.testSubjects.getAttribute('savedObjectTitle', 'value')) === searchName;
    });

    await this.testSubjects.click('confirmSaveSavedObjectButton');
    await this.header.waitUntilLoadingHasFinished();

    await this.retry.waitFor(`saved search was persisted with name ${searchName}`, async () => {
      const last = await this.getCurrentQueryName();

      return last === searchName;
    });
  }

  public async saveSearch(
    searchName: string,
    saveAsNew?: boolean,
    { tags = [], storeTimeRange }: { tags?: string[]; storeTimeRange?: boolean } = {}
  ) {
    const isStandaloneSession = await this.isStandaloneDiscoverSession();
    await this.clickSaveSearchButton();
    // preventing an occasional flakiness when the saved object wasn't set and the form can't be submitted
    await this.retry.waitFor(`saved search title is set to ${searchName}`, async () => {
      await this.testSubjects.setValue('savedObjectTitle', searchName);
      return (await this.testSubjects.getAttribute('savedObjectTitle', 'value')) === searchName;
    });

    if (tags.length) {
      await this.testSubjects.click('savedObjectTagSelector');
      for (const tagName of tags) {
        await this.testSubjects.click(`tagSelectorOption-${tagName.replace(' ', '_')}`);
      }
      await this.testSubjects.click('savedObjectTitle');
    }

    if (storeTimeRange !== undefined) {
      await this.retry.waitFor(`store time range switch is set`, async () => {
        await this.testSubjects.setEuiSwitch(
          'storeTimeWithSearch',
          storeTimeRange ? 'check' : 'uncheck'
        );
        return (
          (await this.testSubjects.isEuiSwitchChecked('storeTimeWithSearch')) === storeTimeRange
        );
      });
    }

    if (saveAsNew !== undefined) {
      await this.retry.waitFor(`save as new switch is set`, async () => {
        await this.testSubjects.setEuiSwitch('saveAsNewCheckbox', saveAsNew ? 'check' : 'uncheck');
        return (await this.testSubjects.isEuiSwitchChecked('saveAsNewCheckbox')) === saveAsNew;
      });
    }

    await this.testSubjects.click('confirmSaveSavedObjectButton');
    await this.header.waitUntilLoadingHasFinished();
    // LeeDr - this additional checking for the saved search name was an attempt
    // to cause this method to wait for the reloading of the page to complete so
    // that the next action wouldn't have to retry.  But it doesn't really solve
    // that issue.  But it does typically take about 3 retries to
    // complete with the expected searchName.

    if (isStandaloneSession) {
      await this.retry.waitFor(`saved search was persisted with name ${searchName}`, async () => {
        const last = await this.getCurrentQueryName();

        return last === searchName;
      });
    }
  }

  public async saveSearchToDashboard(
    searchName: string,
    dashboardOption: 'new' | { existing: string },
    { saveAsNew, storeTimeRange }: { saveAsNew?: boolean; storeTimeRange?: boolean } = {}
  ) {
    if (saveAsNew) {
      await this.clickSaveAsSearchButton();
    } else {
      await this.clickSaveSearchButton();
    }

    await this.retry.waitFor(`saved search title is set to ${searchName}`, async () => {
      await this.testSubjects.setValue('savedObjectTitle', searchName);
      return (await this.testSubjects.getAttribute('savedObjectTitle', 'value')) === searchName;
    });

    if (storeTimeRange !== undefined) {
      await this.retry.waitFor(`store time range switch is set`, async () => {
        await this.testSubjects.setEuiSwitch(
          'storeTimeWithSearch',
          storeTimeRange ? 'check' : 'uncheck'
        );
        return (
          (await this.testSubjects.isEuiSwitchChecked('storeTimeWithSearch')) === storeTimeRange
        );
      });
    }

    if (dashboardOption === 'new') {
      await this.find.clickByCssSelector('#new-dashboard-option');
    } else {
      await this.find.clickByCssSelector('#existing-dashboard-option');
      await this.testSubjects.waitForEnabled('open-dashboard-picker');
      await this.testSubjects.click('open-dashboard-picker');
      await this.testSubjects.setValue('dashboard-picker-search', dashboardOption.existing);
      await this.testSubjects.click(
        `dashboard-picker-option-${dashboardOption.existing.replaceAll(' ', '-')}`
      );
    }

    await this.clickConfirmSavedSearch();
    await this.header.waitUntilLoadingHasFinished();
  }

  public async clickSaveDiscoverTableToDashboard(title: string, existing?: string) {
    await this.testSubjects.click('saveDiscoverTableToDashboardButton');
    await this.retry.waitFor('Save Discover session table modal', () =>
      this.testSubjects.exists('savedObjectSaveModal')
    );
    await this.inputSavedSearchTitle(title);
    if (!existing) {
      await this.find.clickByCssSelector('#new-dashboard-option');
    } else {
      await this.find.clickByCssSelector('#existing-dashboard-option');
      await this.testSubjects.waitForEnabled('open-dashboard-picker');
      await this.testSubjects.click('open-dashboard-picker');
      await this.testSubjects.click(`dashboard-picker-option-${existing}`);
    }
    await this.clickConfirmSavedSearch();
    if (await this.testSubjects.exists('appLeaveConfirmModal', { timeout: 1000 })) {
      await this.testSubjects.click('confirmModalConfirmButton');
    }
    await this.header.waitUntilLoadingHasFinished();
  }

  public async inputSavedSearchTitle(searchName: string) {
    await this.testSubjects.setValue('savedObjectTitle', searchName);
  }

  public async clickConfirmSavedSearch() {
    await this.testSubjects.click('confirmSaveSavedObjectButton');
  }

  public async openAddFilterPanel() {
    await this.testSubjects.click('addFilter');
  }

  public async closeAddFilterPanel() {
    await this.testSubjects.click('addFilter');
  }

  public async isDataGridUpdating() {
    return await this.testSubjects.exists('discoverDataGridUpdating');
  }

  public async waitUntilSearchingHasFinished() {
    await this.testSubjects.missingOrFail('loadingSpinner', {
      timeout: this.defaultFindTimeout * 10,
    });
    // does not show "Cancel" button, so we can use it to determine that searching has finished
    await this.testSubjects.missingOrFail('queryCancelButton', {
      timeout: this.defaultFindTimeout * 10,
    });
  }

  public async waitUntilTabIsLoaded() {
    await this.header.waitUntilLoadingHasFinished();
    await this.waitUntilSearchingHasFinished();
    await this.testSubjects.missingOrFail('discoverDataGridUpdating', {
      timeout: this.defaultFindTimeout * 10,
    });
  }

  /**
   * Opens a new Discover tab and runs the current query so the tab is initialized.
   * New tabs skip the initial fetch; use `unifiedTabs.createNewTab()` when the test
   * needs the uninitialized empty state.
   */
  public async createNewTabAndSearch() {
    const unifiedTabs = this.ctx.getPageObject('unifiedTabs');
    await unifiedTabs.createNewTab();
    await this.queryBar.clickQuerySubmitButton();
    await this.waitUntilTabIsLoaded();
  }

  public async getColumnHeaders() {
    return await this.dataGrid.getHeaderFields();
  }

  public async openLoadSavedSearchPanel() {
    let isOpen = await this.testSubjects.exists('loadSearchForm');
    if (isOpen) {
      return;
    }

    // We need this try loop here because previous actions in Discover like
    // saving a search cause reloading of the page and the "Open" menu item goes stale.
    await this.retry.waitFor('saved search panel is opened', async () => {
      await this.clickLoadSavedSearchButton();
      await this.header.waitUntilLoadingHasFinished();
      isOpen = await this.testSubjects.exists('loadSearchForm');
      return isOpen === true;
    });
  }

  public async closeLoadSaveSearchPanel() {
    await this.flyout.ensureClosed('loadSearchForm');
  }

  public async hasSavedSearch(searchName: string) {
    const searchLink = await this.find.byButtonText(searchName);
    return await searchLink.isDisplayed();
  }

  public async getSavedSearchTitle() {
    if (await this.testSubjects.exists('breadcrumb last')) {
      const breadcrumb = await this.testSubjects.find('breadcrumb last');
      return await breadcrumb.getVisibleText();
    }
  }

  public async loadSavedSearch(searchName: string) {
    const isStandaloneSession = await this.isStandaloneDiscoverSession();
    await this.openLoadSavedSearchPanel();
    await this.savedObjectsFinder.filterEmbeddableNames(`"${searchName.replace('-', ' ')}"`);
    await this.testSubjects.click(`savedObjectTitle${searchName.split(' ').join('-')}`);
    await this.header.waitUntilLoadingHasFinished();
    if (isStandaloneSession) {
      await this.retry.waitFor(`saved search ${searchName} is loaded`, async () => {
        const currentName = await this.getCurrentQueryName();
        return currentName === searchName;
      });
    }
  }

  public async clickNewSearchButton({ isInOverflowMenu }: { isInOverflowMenu?: boolean } = {}) {
    await this.appMenu.clickMenuItem('discoverNewButton', { isInOverflowMenu });
    await this.testSubjects.moveMouseTo('dscHideSidebarButton'); // cancel tooltips
    await this.header.waitUntilLoadingHasFinished();
  }

  public async clickSaveSearchButton() {
    await this.testSubjects.moveMouseTo('discoverSaveButton');
    await this.testSubjects.click('discoverSaveButton');
  }

  public async clickSaveAsSearchButton() {
    await this.testSubjects.moveMouseTo('discoverSaveButton-secondary-button');
    await this.testSubjects.click('discoverSaveButton-secondary-button');
    await this.retry.waitFor('popover is open', async () => {
      return Boolean(await this.testSubjects.find('discoverSaveButtonPopover'));
    });
    await this.testSubjects.moveMouseTo('interactiveSaveMenuItem');
    await this.testSubjects.click('interactiveSaveMenuItem');
  }

  public async clickCancelButton() {
    await this.testSubjects.moveMouseTo('discoverSaveButton-secondary-button');
    await this.testSubjects.click('discoverSaveButton-secondary-button');
    await this.retry.waitFor('popover is open', async () => {
      return Boolean(await this.testSubjects.find('discoverSaveButtonPopover'));
    });
    await this.testSubjects.moveMouseTo('discoverCancelButton');
    await this.testSubjects.click('discoverCancelButton');
  }

  public async clickLoadSavedSearchButton() {
    await this.appMenu.clickMenuItem('discoverOpenButton');
  }

  public async hasUnsavedChangesIndicator() {
    return await this.testSubjects.exists('split-button-notification-indicator');
  }

  public async revertUnsavedChanges() {
    await this.testSubjects.moveMouseTo('discoverSaveButton-secondary-button');
    await this.testSubjects.click('discoverSaveButton-secondary-button');
    await this.retry.waitFor('popover is open', async () => {
      return Boolean(await this.testSubjects.find('discoverSaveButtonPopover'));
    });
    await this.testSubjects.click('revertUnsavedChangesButton');
    await this.header.waitUntilLoadingHasFinished();
    await this.waitUntilSearchingHasFinished();
  }

  public async saveUnsavedChanges() {
    await this.testSubjects.moveMouseTo('discoverSaveButton');
    await this.testSubjects.click('discoverSaveButton');
    await this.retry.waitFor('modal is open', async () => {
      return Boolean(await this.testSubjects.find('confirmSaveSavedObjectButton'));
    });
    await this.testSubjects.click('confirmSaveSavedObjectButton');
    await this.header.waitUntilLoadingHasFinished();
    await this.waitUntilSearchingHasFinished();
  }

  public async closeLoadSavedSearchPanel() {
    await this.testSubjects.click('euiFlyoutCloseButton');
  }

  public async clickHistogramBar() {
    await this.elasticChart.waitForRenderComplete(undefined, 5000);
    const el = await this.elasticChart.getCanvas();

    await this.browser.getActions().move({ x: 0, y: 0, origin: el._webElement }).click().perform();
  }

  public async brushHistogram() {
    await this.elasticChart.waitForRenderComplete();
    const el = await this.elasticChart.getCanvas();

    await this.browser.dragAndDrop(
      { location: el, offset: { x: -300, y: 20 } },
      { location: el, offset: { x: -100, y: 30 } }
    );
  }

  public async getBreakdownFieldValue() {
    const breakdownButton = await this.testSubjects.find('unifiedHistogramBreakdownSelectorButton');
    const visibleText = await breakdownButton.getVisibleText();

    // The button label truncates long field names via an absolutely positioned
    // overlay, which the browser's visible-text computation renders as if it
    // were on its own line. Collapse that whitespace since it isn't visible on screen.
    return visibleText.replace(/\s+/g, ' ').trim();
  }

  public async chooseBreakdownField(field: string, value?: string) {
    await this.retry.try(async () => {
      await this.testSubjects.click('unifiedHistogramBreakdownSelectorButton');
      await this.testSubjects.existOrFail('unifiedHistogramBreakdownSelectorSelectable');
    });

    const searchInput = await this.testSubjects.find(
      'unifiedHistogramBreakdownSelectorSelectorSearch'
    );

    await searchInput.type(field, { charByChar: true });

    await this.retry.waitFor('options to be filtered', async () => {
      const isSearching = await this.testSubjects.getAttribute(
        'unifiedHistogramBreakdownSelectorSelectable',
        'data-is-searching'
      );
      return isSearching === 'false';
    });

    const optionValue = value ?? field;

    await this.find.clickDisplayedByCssSelector(
      `[data-test-subj="unifiedHistogramBreakdownSelectorSelectable"] .euiSelectableListItem[value="${optionValue}"]`
    );

    await this.testSubjects.missingOrFail('unifiedHistogramBreakdownSelectorSelectable');

    await this.retry.waitFor('the value to be selected', async () => {
      const breakdownButton = await this.testSubjects.find(
        'unifiedHistogramBreakdownSelectorButton'
      );
      return (
        (await breakdownButton.getAttribute('data-selected-value')) === optionValue ||
        (await breakdownButton.getVisibleText()) === field
      );
    });
  }

  public async clearBreakdownField() {
    await this.chooseBreakdownField('No breakdown', '__EMPTY_SELECTOR_OPTION__');
  }

  public async isLensEditFlyoutOpen() {
    return await this.testSubjects.exists('lnsChartSwitchPopover');
  }

  public async openLensEditFlyout() {
    await this.testSubjects.click('discoverQueryTotalHits'); // cancel any tooltips
    await this.testSubjects.click('unifiedHistogramEditFlyoutVisualization');
    await this.retry.waitFor('flyout', async () => {
      return await this.isLensEditFlyoutOpen();
    });
  }

  public async changeVisShape(seriesType: string) {
    await this.openLensEditFlyout();
    await this.testSubjects.click('lnsChartSwitchPopover');
    await this.testSubjects.setValue('lnsChartSwitchSearch', seriesType, {
      clearWithKeyboard: true,
    });
    await this.testSubjects.click(`lnsChartSwitchPopover_${seriesType.toLowerCase()}`);
    await this.retry.try(async () => {
      expect(await this.testSubjects.getVisibleText('lnsChartSwitchPopover')).to.be(seriesType);
    });

    await this.toasts.dismissAll();
    await this.testSubjects.scrollIntoView('applyFlyoutButton');
    await this.testSubjects.click('applyFlyoutButton');
  }

  public async getCurrentVisTitle() {
    await this.toasts.dismissAll();
    await this.openLensEditFlyout();
    const seriesType = await this.testSubjects.getVisibleText('lnsChartSwitchPopover');
    await this.testSubjects.click('cancelFlyoutButton');
    return seriesType;
  }

  public async chooseLensSuggestion(suggestionType: string) {
    await this.testSubjects.click('discoverQueryTotalHits'); // cancel any tooltips which might hide the edit button
    await this.testSubjects.click('unifiedHistogramEditFlyoutVisualization');
    await this.retry.waitFor('flyout', async () => {
      return await this.testSubjects.exists('lensSuggestionsPanelToggleButton');
    });
    await this.testSubjects.click('lensSuggestionsPanelToggleButton');

    const suggestionTestSubj = `lnsSuggestion-${suggestionType}`;
    await this.retry.waitFor('suggestion option', async () => {
      return await this.testSubjects.exists(suggestionTestSubj);
    });
    await this.testSubjects.click(suggestionTestSubj);
    await this.retry.waitFor('suggestion option to get selected', async () => {
      return (
        (await (
          await this.testSubjects.find(`${suggestionTestSubj} > lnsSuggestion`)
        ).getAttribute('aria-current')) === 'true'
      );
    });

    await this.testSubjects.scrollIntoView('applyFlyoutButton');
    await this.testSubjects.click('applyFlyoutButton');
  }

  public async getVisContextSuggestionType() {
    return await this.testSubjects.getAttribute('unifiedHistogramChart', 'data-suggestion-type');
  }

  public async getHistogramLegendList() {
    const unifiedHistogram = await this.testSubjects.find('unifiedHistogramChart');
    const list = await unifiedHistogram.findAllByClassName('echLegendItem__label');
    return Promise.all(list.map((elem: WebElementWrapper) => elem.getVisibleText()));
  }

  public async clickLegendFilter(field: string, type: '+' | '-') {
    const filterType = type === '+' ? 'filterIn' : 'filterOut';
    await this.testSubjects.click(`legend-${field}`);
    await this.testSubjects.click(`legend-${field}-${filterType}`);
  }

  public async getCurrentQueryName() {
    return await this.globalNav.getLastBreadcrumb();
  }

  public async isChartVisible() {
    return await this.testSubjects.exists('unifiedHistogramChart');
  }

  public async isTableVisible() {
    return await this.testSubjects.exists('discoverDocTable');
  }

  public async toggleChartVisibility() {
    if (await this.isChartVisible()) {
      await this.testSubjects.click('dscHideHistogramButton');
    } else {
      await this.testSubjects.click('dscShowHistogramButton');
    }
    await this.header.waitUntilLoadingHasFinished();
  }

  public async openHistogramPanel() {
    await this.testSubjects.click('dscShowHistogramButton');
    await this.header.waitUntilLoadingHasFinished();
  }

  public async closeHistogramPanel() {
    await this.testSubjects.click('dscHideHistogramButton');
    await this.header.waitUntilLoadingHasFinished();
  }

  public async openTablePanel() {
    await this.testSubjects.click('dscShowTableButton');
    await this.waitUntilTabIsLoaded();
  }

  public async closeTablePanel() {
    await this.testSubjects.click('dscHideTableButton');
    await this.waitUntilTabIsLoaded();
  }

  public async getHistogramHeight() {
    const histogram = await this.testSubjects.find('unifiedHistogramResizablePanelFixed');
    return (await histogram.getSize()).height;
  }

  public async resizeHistogramBy(distance: number) {
    const resizeButton = await this.testSubjects.find('unifiedHistogramResizableButton');
    await this.browser.dragAndDrop({ location: resizeButton }, { location: { x: 0, y: distance } });
  }

  public async getChartInterval() {
    const button = await this.testSubjects.find('unifiedHistogramTimeIntervalSelectorButton');
    return await button.getAttribute('data-selected-value');
  }

  public async getChartIntervalWarningIcon() {
    await this.header.waitUntilLoadingHasFinished();
    return await this.find.existsByCssSelector(
      '[data-test-subj="unifiedHistogramRendered"] .euiToolTipAnchor'
    );
  }

  public async setChartInterval(intervalTitle: string) {
    await this.retry.try(async () => {
      await this.testSubjects.click('unifiedHistogramTimeIntervalSelectorButton');
      await this.testSubjects.existOrFail('unifiedHistogramTimeIntervalSelectorSelectable');
    });

    const option = await this.find.byCssSelector(
      `[data-test-subj="unifiedHistogramTimeIntervalSelectorSelectable"] .euiSelectableListItem[title="${intervalTitle}"]`
    );
    await option.click();
    return await this.header.waitUntilLoadingHasFinished();
  }

  public async getHitCount({ isPartial }: { isPartial?: boolean } = {}) {
    await this.header.waitUntilLoadingHasFinished();
    return await this.testSubjects.getVisibleText(
      isPartial ? 'discoverQueryHitsPartial' : 'discoverQueryHits'
    );
  }

  public async getHitCountInt() {
    return parseInt(await this.getHitCount(), 10);
  }

  public async getSavedSearchDocumentCount() {
    return await this.testSubjects.getVisibleText('savedSearchTotalDocuments');
  }

  public async getAllSavedSearchDocumentCount() {
    return await this.testSubjects.getVisibleTextAll('savedSearchTotalDocuments');
  }

  public async getDocHeader() {
    const docHeader = await this.dataGrid.getHeaders();
    return docHeader.join();
  }

  public async getDocTableRows() {
    await this.header.waitUntilLoadingHasFinished();
    return await this.dataGrid.getBodyRows();
  }

  public async getDocTableIndex(index: number, visibleText = false) {
    const row = await this.dataGrid.getRow({ rowIndex: index - 1 });
    const result = await Promise.all(
      row.map(async (cell) => {
        if (visibleText) {
          return await cell.getVisibleText();
        } else {
          const textContent = await cell.getAttribute('textContent');
          return textContent?.trim();
        }
      })
    );
    // Remove control columns
    return result.slice(await this.dataGrid.getControlColumnsCount()).join(' ');
  }

  public async getDocTableField(index: number, cellIdx: number = -1) {
    const usedDefaultCellIdx = await this.dataGrid.getControlColumnsCount();
    const usedCellIdx = cellIdx === -1 ? usedDefaultCellIdx : cellIdx;

    await this.testSubjects.click('dataGridFullScreenButton');
    const row = await this.dataGrid.getRow({ rowIndex: index - 1 });
    const result = await Promise.all(row.map(async (cell) => (await cell.getVisibleText()).trim()));
    await this.testSubjects.click('dataGridFullScreenButton');
    return result[usedCellIdx];
  }

  public isShowingDocViewer() {
    return this.dataGrid.isShowingDocViewer();
  }

  public clickDocViewerTab(id: string) {
    return this.dataGrid.clickDocViewerTab(id);
  }

  public async isInEsqlMode() {
    return await this.find.byClassName('monaco-editor');
  }

  public async isInClassicMode() {
    return await this.testSubjects.existOrFail('discover-dataView-switch-link');
  }

  public async expectDocTableToBeLoaded() {
    await this.retry.waitFor('doc table to finish rendering', async () => {
      const renderComplete = await this.testSubjects.getAttribute(
        'discoverDocTable',
        'data-table-loaded'
      );
      return renderComplete === 'true';
    });
  }

  public async findFieldByNameOrValueInDocViewer(name: string) {
    await this.retry.waitForWithTimeout('field search input value', 5000, async () => {
      const fieldSearch = await this.testSubjects.find('unifiedDocViewerFieldsSearchInput');
      await fieldSearch.clearValue();
      await fieldSearch.type(name);
      return (await fieldSearch.getAttribute('value')) === name;
    });
  }

  public async openFilterByFieldTypeInDocViewer() {
    await this.testSubjects.click('unifiedDocViewerFieldsTableFieldTypeFilterToggle');
    await this.testSubjects.existOrFail('unifiedDocViewerFieldsTableFieldTypeFilterOptions');
  }

  public async closeFilterByFieldTypeInDocViewer() {
    await this.testSubjects.click('unifiedDocViewerFieldsTableFieldTypeFilterToggle');

    await this.retry.waitFor('doc viewer filter closed', async () => {
      return !(await this.testSubjects.exists('unifiedDocViewerFieldsTableFieldTypeFilterOptions'));
    });
  }

  public async getMarks() {
    const table = await this.dataGrid.getTable();
    const marks = await table.findAllByTagName('mark');
    return await Promise.all(marks.map((mark) => mark.getVisibleText()));
  }

  public async openSidebar() {
    await this.testSubjects.click('dscShowSidebarButton');

    await this.retry.waitFor('sidebar to appear', async () => {
      return await this.isSidebarPanelOpen();
    });
  }

  public async closeSidebar() {
    await this.retry.tryForTime(2 * 1000, async () => {
      await this.testSubjects.click('dscHideSidebarButton');
      await this.testSubjects.missingOrFail('fieldList');
    });
  }

  public async isSidebarPanelOpen() {
    return await this.testSubjects.exists('fieldList');
  }

  public async getSidebarWidth() {
    const sidebar = await this.testSubjects.find('discover-sidebar');
    return (await sidebar.getSize()).width;
  }

  public async resizeSidebarBy(distance: number) {
    const resizeButton = await this.testSubjects.find('discoverLayoutResizableButton');
    await this.browser.dragAndDrop({ location: resizeButton }, { location: { x: distance, y: 0 } });
  }

  public async editField(field: string) {
    await this.retry.try(async () => {
      await this.unifiedFieldList.pressEnterFieldListItemToggle(field);
      await this.testSubjects.pressEnter(`discoverFieldListPanelEdit-${field}`);
      await this.find.byClassName('indexPatternFieldEditor__form');
    });
  }

  public async removeField(field: string) {
    await this.unifiedFieldList.pressEnterFieldListItemToggle(field);
    await this.testSubjects.pressEnter(`discoverFieldListPanelDelete-${field}`);
    await this.retry.waitFor('modal to open', async () => {
      return await this.testSubjects.exists('runtimeFieldDeleteConfirmModal');
    });
    await this.fieldEditor.confirmDelete();
  }

  public async clickIndexPatternActions() {
    await this.retry.try(async () => {
      await this.testSubjects.click('discover-dataView-switch-link');
    });
  }

  public async hasNoResults() {
    return await this.testSubjects.exists('discoverNoResults');
  }

  public async hasNoResultsTimepicker() {
    return await this.testSubjects.exists('discoverNoResultsTimefilter');
  }

  public async showsErrorCallout() {
    await this.retry.try(async () => {
      await this.testSubjects.existOrFail('discoverErrorCalloutTitle');
    });
  }

  public getDiscoverErrorMessage() {
    return this.testSubjects.getVisibleText('discoverErrorCalloutMessage');
  }

  public async expandTimeRangeAsSuggestedInNoResultsMessage() {
    await this.retry.waitFor('the button before pressing it', async () => {
      return await this.testSubjects.exists('discoverNoResultsViewAllMatches');
    });
    await this.retry.waitForWithTimeout('view all matches to load', 60000, async () => {
      try {
        // We need to manually click the button since testSubjects.click will
        // use a retry, but we want this to throw if the click fails since it
        // means the button disappeared before we could click it
        const button = await this.testSubjects.find('discoverNoResultsViewAllMatches', 1000);
        // Don't click the button if it's disabled since it means the previous
        // click succeeded and the request is still loading
        if (await button.isEnabled()) {
          await button.click();
        }
      } catch {
        // We could get an exception here if the button isn't found or isn't in
        // the DOM by the time we try to click it, so just ignore it and move on
      }
      await this.waitUntilSearchingHasFinished();
      await this.header.waitUntilLoadingHasFinished();
      return !(await this.testSubjects.exists('discoverNoResultsViewAllMatches'));
    });
  }

  public async clickFieldSort(field: string, text = 'Sort New-Old') {
    return await this.dataGrid.clickDocSortAsc(field, text);
  }

  public async selectIndexPattern(
    indexPattern: string,
    waitUntilLoadingHasFinished: boolean = true
  ) {
    await this.dataViews.switchTo(indexPattern);
    if (waitUntilLoadingHasFinished) {
      await this.header.waitUntilLoadingHasFinished();
    }
  }

  public async getIndexPatterns() {
    await this.testSubjects.click('discover-dataView-switch-link');
    const indexPatternSwitcher = await this.testSubjects.find('indexPattern-switcher');
    const li = await indexPatternSwitcher.findAllByTagName('li');
    const items = await Promise.all(li.map((lis) => lis.getVisibleText()));
    await this.testSubjects.click('discover-dataView-switch-link');
    return items;
  }

  public async selectTextBaseLang() {
    // First check if the button is directly visible
    if (await this.testSubjects.exists('select-text-based-language-btn')) {
      await this.testSubjects.click('select-text-based-language-btn');
      await this.header.waitUntilLoadingHasFinished();
      await this.waitUntilSearchingHasFinished();
      return;
    }

    // If not visible, try the overflow menu
    if (await this.testSubjects.exists('app-menu-overflow-button')) {
      await this.retry.try(async () => {
        try {
          await this.testSubjects.moveMouseTo('kbnQueryBar');
        } catch {
          // Ignore if query bar is not present
        }
        await this.testSubjects.click('app-menu-overflow-button');
      });

      if (await this.testSubjects.exists('select-text-based-language-btn')) {
        await this.testSubjects.click('select-text-based-language-btn');
        await this.header.waitUntilLoadingHasFinished();
        await this.waitUntilSearchingHasFinished();
      }

      // Close the popover if open
      if (await this.testSubjects.exists('app-menu-popover')) {
        await this.testSubjects.click('app-menu-overflow-button');
      }
    }
  }

  private async clickSelectedTabMenuItem(menuItemTestSubj: string) {
    const tabElements = await this.find.allByCssSelector('[data-test-subj^="unifiedTabs_tab_"]');
    for (const tabElement of tabElements) {
      const tabRoleElement = await tabElement.findByCssSelector('[role="tab"]');
      if ((await tabRoleElement.getAttribute('aria-selected')) === 'true') {
        const menuButton = await tabElement.findByCssSelector(
          '[data-test-subj^="unifiedTabs_tabMenuBtn_"]'
        );
        await menuButton.click();
        await this.retry.waitFor('tab menu to open', async () => {
          return await this.testSubjects.exists(menuItemTestSubj);
        });
        await this.testSubjects.click(menuItemTestSubj);
        return;
      }
    }
  }

  public async openInspectorFromTabMenu() {
    const isOpen = await this.testSubjects.exists('inspectorPanel');
    if (isOpen) return;

    await this.clickSelectedTabMenuItem('unifiedTabs_tabMenuItem_inspect');
    await this.retry.waitFor('inspector panel to open', async () => {
      return await this.testSubjects.exists('inspectorPanel');
    });
  }

  public async selectDataViewMode() {
    await this.clickSelectedTabMenuItem('unifiedTabs_tabMenuItem_switchToClassic');
    await this.header.waitUntilLoadingHasFinished();
    await this.waitUntilSearchingHasFinished();
  }

  public async removeHeaderColumn(name: string) {
    await this.dataGrid.clickRemoveColumn(name);
  }

  public async waitForChartLoadingComplete(renderCount: number) {
    await this.elasticChart.waitForRenderingCount(renderCount, 'unifiedHistogramChart');
  }

  public async waitForDocTableLoadingComplete() {
    await this.testSubjects.waitForAttributeToChange(
      'discoverDocTable',
      'data-table-loaded',
      'true'
    );
  }
  public async getNrOfFetches() {
    const el = await this.find.byCssSelector('[data-fetch-counter]');
    const nr = await el.getAttribute('data-fetch-counter');
    return Number(nr);
  }

  /**
   * Check if Discover app is currently rendered on the screen.
   */
  public async isDiscoverAppOnScreen(): Promise<boolean> {
    const result = await this.find.allByCssSelector('.dscPage');
    return result.length === 1;
  }

  /**
   * Wait until Discover app is rendered on the screen.
   */
  public async waitForDiscoverAppOnScreen() {
    await this.retry.waitFor('Discover app on screen', async () => {
      return await this.isDiscoverAppOnScreen();
    });
  }

  public async showAllFilterActions() {
    await this.testSubjects.click('showFilterActions');
  }

  public async clickSavedQueriesPopOver() {
    await this.testSubjects.click('showQueryBarMenu');
  }

  public async clickCurrentSavedQuery() {
    await this.queryBar.setQuery('Cancelled : true');
    await this.queryBar.clickQuerySubmitButton();
    await this.testSubjects.click('showQueryBarMenu');
    await this.testSubjects.click('saved-query-management-save-button');
  }

  public async setSaveQueryFormTitle(savedQueryName: string) {
    await this.testSubjects.setValue('saveQueryFormTitle', savedQueryName);
  }

  public async toggleIncludeFilters() {
    await this.testSubjects.click('saveQueryFormIncludeFiltersOption');
  }

  public async saveCurrentSavedQuery() {
    await this.testSubjects.existOrFail('savedQueryFormSaveButton');
    await this.retry.try(async () => {
      if (await this.testSubjects.exists('savedQueryFormSaveButton')) {
        await this.testSubjects.click('savedQueryFormSaveButton');
      }
      await this.testSubjects.missingOrFail('queryBarMenuPanel');
    });
  }

  public async deleteSavedQuery() {
    await this.testSubjects.click('delete-saved-query-button');
  }

  public async confirmDeletionOfSavedQuery() {
    await this.testSubjects.click('confirmModalConfirmButton');
  }

  public async clearSavedQuery() {
    await this.testSubjects.click('saved-query-management-clear-button');
  }

  public async assertHitCount(expectedHitCount: string) {
    await this.retry.tryForTime(2 * 1000, async () => {
      // Close side bar to ensure Discover hit count shows
      // edge case for when browser width is small
      await this.closeSidebar();
      const hitCount = await this.getHitCount();
      expect(hitCount).to.eql(
        expectedHitCount,
        `Expected Discover hit count to be ${expectedHitCount} but got ${hitCount}.`
      );
    });
  }

  public async assertViewModeToggleNotExists() {
    await this.testSubjects.missingOrFail('dscViewModeToggleButton', { timeout: 2 * 1000 });
  }

  public async assertViewModeToggleExists() {
    await this.testSubjects.existOrFail('dscViewModeToggleButton', { timeout: 2 * 1000 });
  }

  public async assertFieldStatsTableNotExists() {
    await this.testSubjects.missingOrFail('dscFieldStatsEmbeddedContent', { timeout: 2 * 1000 });
  }

  /**
   * Opens the view mode selector dropdown and selects the option with the given test subject
   * (one of `dscViewModeDocumentOption`, `dscViewModePatternAnalysisOption`, `dscViewModeFieldStatsOption`).
   */
  public async selectViewMode(optionTestSubject: string) {
    await this.retry.try(async () => {
      await this.testSubjects.click('dscViewModeToggleButton');
      await this.testSubjects.existOrFail('dscViewModeToggleSelectable');
    });
    await this.testSubjects.clickWhenNotDisabledWithoutRetry(optionTestSubject);
  }

  public async clickViewModeFieldStatsButton() {
    await this.retry.tryForTime(2 * 1000, async () => {
      await this.selectViewMode('dscViewModeFieldStatsOption');
      await this.testSubjects.existOrFail('dscFieldStatsEmbeddedContent');
    });
  }

  /**
   * Validates if data view references in the URL are equal.
   */
  public async validateDataViewReffsEquality() {
    const currentUrl = await this.browser.getCurrentUrl();
    const matches = currentUrl.matchAll(/dataViewId:[^,]*/g);
    const indexes = [];
    for (const matchEntry of matches) {
      const [index] = matchEntry;
      indexes.push(decodeURIComponent(index).replace('dataViewId:', '').replaceAll("'", ''));
    }

    const first = indexes[0];
    if (first) {
      const allEqual = indexes.every((val) => val === first);
      if (allEqual) {
        return { valid: true, result: first };
      } else {
        return {
          valid: false,
          message:
            'Discover URL state contains different index references. They should be all the same.',
        };
      }
    }
    return { valid: false, message: "Discover URL state doesn't contain an index reference." };
  }

  public async getCurrentDataViewId() {
    const validationResult = await this.validateDataViewReffsEquality();
    if (validationResult.valid) {
      return validationResult.result!;
    } else {
      throw new Error(validationResult.message);
    }
  }

  public async addRuntimeField(name: string, script: string, type?: string, popularity?: number) {
    await this.dataViews.clickAddFieldFromSearchBar();
    await this.fieldEditor.setName(name);
    if (type) {
      await this.fieldEditor.setFieldType(type);
    }
    await this.fieldEditor.enableValue();
    await this.fieldEditor.typeScript(script);
    if (popularity) {
      await this.fieldEditor.setPopularity(popularity);
    }
    await this.fieldEditor.save();
    await this.fieldEditor.waitUntilClosed();
    await this.header.waitUntilLoadingHasFinished();
  }

  private async waitForDropToFinish() {
    await this.find.waitForDeletedByCssSelector('.domDragDrop-isActiveGroup');
    await this.header.waitUntilLoadingHasFinished();
    await this.waitUntilSearchingHasFinished();
  }

  /**
   * Drags field to add as a column
   *
   * @param fieldName
   * */
  public async dragFieldToTable(fieldName: string) {
    await this.unifiedFieldList.waitUntilSidebarHasLoaded();

    const from = `dscFieldListPanelField-${fieldName}`;
    await this.find.existsByCssSelector(from);
    await this.browser.html5DragAndDrop(
      this.testSubjects.getCssSelector(from),
      this.testSubjects.getCssSelector('dscMainContent')
    );
    await this.waitForDropToFinish();
  }

  /**
   * Drags field with keyboard actions to add as a column
   *
   * @param fieldName
   * */
  public async dragFieldWithKeyboardToTable(fieldName: string) {
    const field = await this.find.byCssSelector(
      `[data-attr-field="${fieldName}"] [data-test-subj="domDragDrop-keyboardHandler"]`
    );
    await field.focus();
    await this.retry.try(async () => {
      await this.browser.pressKeys(this.browser.keys.ENTER);
      await this.find.byCssSelector('.domDroppable--active'); // checks if we're in dnd mode and there's any drop target active
    });
    await this.browser.pressKeys(this.browser.keys.RIGHT);
    await this.browser.pressKeys(this.browser.keys.ENTER);
    await this.waitForDropToFinish();
  }

  /**
   * Saves the Discover chart to a new dashboard
   * It doesn't save to library
   * @param title
   */
  public async saveHistogramToDashboard(title: string) {
    await this.timeToVisualize.setSaveModalValues(title, {
      saveAsNew: true,
      redirectToOrigin: false,
      addToDashboard: 'new',
      saveToLibrary: false,
    });

    await this.testSubjects.click('confirmSaveSavedObjectButton');
    await this.testSubjects.missingOrFail('confirmSaveSavedObjectButton');
  }

  public async isShowingCascadeLayout() {
    return await this.retry.try(async () => {
      const [exists1, exists2] = await Promise.all([
        this.testSubjects.exists('data-cascade'),
        this.testSubjects.exists('discoverEnableCascadeLayoutSwitch'),
      ]);
      return exists1 && exists2;
    });
  }

  public async getCascadeLayoutVisibleRowIds() {
    const container = await this.testSubjects.find('dataCascadeScrollContainer');
    const ids = await this.browser.execute(
      `
      const container = arguments[0];
      const containerRect = container.getBoundingClientRect();
      const rows = container.querySelectorAll('[data-row-type="root"]');
      const visibleIds = [];
      for (let i = 0; i < rows.length; i++) {
        const rowRect = rows[i].getBoundingClientRect();
        if (rowRect.top >= containerRect.bottom) break;
        if (rowRect.bottom > containerRect.top) {
          visibleIds.push(rows[i].id || '');
        }
      }
      return visibleIds;
      `,
      container._webElement
    );

    if (!Array.isArray(ids)) {
      throw new Error(`Expected cascade row ids to be an array but got ${typeof ids}`);
    }

    return ids as string[];
  }

  public async isCascadeLayoutRowExpanded(rowId: string) {
    return await this.retry.try(async () => {
      const row = await this.find.byCssSelector(`[id="${rowId}"]`);
      return ((await row.getAttribute('aria-expanded')) ?? 'false') === 'true';
    });
  }

  public async toggleCascadeLayoutRow(rowId: string) {
    const isTargetRowExpanded = await this.isCascadeLayoutRowExpanded(rowId);
    await this.retry.try(async () => {
      const toggleButtons = await this.testSubjects.findAll(`toggle-row-${rowId}-button`);
      const targetButton = toggleButtons[0];

      if (!targetButton) {
        throw new Error(`Toggle button for row ${rowId} not found`);
      }

      await targetButton.click();
    });

    if (isTargetRowExpanded) {
      await this.retry.waitFor('row to be collapsed', async () => {
        return !(await this.isCascadeLayoutRowExpanded(rowId));
      });
      // State persistence is throttled
      await this.common.sleep(500);
    } else {
      await this.retry.waitFor('row to be expanded', async () => {
        return await this.isCascadeLayoutRowExpanded(rowId);
      });
      await this.waitForDocTableLoadingComplete();
    }
  }

  public async getCascadeLayoutScrollTop(): Promise<number> {
    const el = await this.testSubjects.find('dataCascadeScrollContainer');
    const scrollTop = await this.browser.execute('return arguments[0].scrollTop;', el._webElement);

    if (typeof scrollTop !== 'number') {
      throw new Error(`Expected cascade scrollTop to be a number but got ${typeof scrollTop}`);
    }

    return scrollTop;
  }

  public async scrollCascadeLayoutBy(delta: number): Promise<void> {
    const el = await this.testSubjects.find('dataCascadeScrollContainer');
    await this.browser.execute('arguments[0].scrollTop += arguments[1];', el._webElement, delta);
  }

  private resetRequestCount = -1;

  public async expectRequestCount(endpointRegexp: RegExp, requestCount: number) {
    await this.retry.tryWithRetries(
      `expect the request to match count ${requestCount}`,
      async () => {
        if (requestCount === this.resetRequestCount) {
          await this.browser.execute(async () => {
            performance.clearResourceTimings();
          });
        }
        await this.header.waitUntilLoadingHasFinished();
        await this.waitUntilSearchingHasFinished();
        await this.elasticChart.canvasExists();
        const requests = await this.browser.execute(() =>
          performance
            .getEntries()
            .filter((entry: any) => ['fetch', 'xmlhttprequest'].includes(entry.initiatorType))
        );
        const result = requests.filter((entry) => endpointRegexp.test(entry.name));
        const count = result.length;
        if (requestCount === this.resetRequestCount) {
          expect(count).to.be(0);
        } else {
          if (count !== requestCount) {
            this.log.warning('Request count differs:', result);
          }
          expect(count).to.be(requestCount);
        }
      },
      { retryCount: 5, retryDelay: 500 }
    );
  }

  public async expectFieldsForWildcardRequestCount(expectedCount: number, cb: Function) {
    const endpointRegExp = new RegExp('/internal/data_views/_fields_for_wildcard');
    await this.expectRequestCount(endpointRegExp, this.resetRequestCount);
    await cb();
    await this.expectRequestCount(endpointRegExp, expectedCount);
  }

  public async expectSearchRequestCount(
    type: 'ese' | 'esql',
    expectedCount: number,
    cb?: Function
  ) {
    const searchType = type === 'esql' ? `${type}_async` : type;
    const endpointRegExp = new RegExp(`/internal/search/${searchType}$`);
    if (cb) {
      await this.expectRequestCount(endpointRegExp, this.resetRequestCount);
      await cb();
    }
    await this.expectRequestCount(endpointRegExp, expectedCount);
  }

  public async ensureHasUnsavedChangesIndicator() {
    await this.testSubjects.existOrFail('split-button-notification-indicator');
  }

  public async ensureNoUnsavedChangesIndicator() {
    await this.testSubjects.missingOrFail('split-button-notification-indicator');
  }

  public resetQueryMode() {
    return this.browser.removeLocalStorageItem(DISCOVER_QUERY_MODE_KEY);
  }

  public async getQueryMode() {
    const storedValue = await this.browser.getLocalStorageItem(DISCOVER_QUERY_MODE_KEY);
    if (storedValue == null) return null;
    try {
      return JSON.parse(storedValue)?.currentMode ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Seeds the persisted query mode in localStorage. Discover ignores `currentMode`
   * unless `defaultMode` matches the resolved default (the `discover.isEsqlDefault`
   * flag), so `defaultMode` defaults to `'classic'` to match today's default. When
   * the flag is flipped to make ES|QL the default, update `defaultMode` or the seed
   * is ignored.
   */
  public setQueryMode(currentMode: string, defaultMode: string = 'classic') {
    return this.browser.setLocalStorageItem(
      DISCOVER_QUERY_MODE_KEY,
      JSON.stringify({ currentMode, defaultMode })
    );
  }

  /** Discover Embeddable helper methods   */

  public async editEmbeddableInDiscover() {
    await this.dashboardPanelActions.clickEdit();
    await this.header.waitUntilLoadingHasFinished();
    await this.testSubjects.click('discoverEmbeddableInlineEditEditInDiscoverLink');
    await this.waitForDiscoverAppOnScreen();
    await this.header.waitUntilLoadingHasFinished();
  }

  public async enterInlineEditing() {
    const isAlreadyActive = await this.testSubjects.exists(
      'discoverEmbeddableInlineEditSelectTabAction'
    );
    if (!isAlreadyActive) {
      await this.dashboardPanelActions.clickPanelAction('embeddablePanelAction-editPanel');
      await this.header.waitUntilLoadingHasFinished();
    }
  }

  public async selectTabFromPopover(tabLabel: string) {
    await this.testSubjects.click('discoverEmbeddableInlineEditSelectTabAction');
    const popover = await this.testSubjects.find('discoverEmbeddableInlineEditSelectTabPopover');
    await this.find.clickByButtonText(tabLabel, popover);
    await this.header.waitUntilLoadingHasFinished();
    await this.dashboard.waitForRenderComplete();
  }

  public async selectEmbeddableTab(tabLabel: string) {
    await this.retry.try(async () => {
      await this.enterInlineEditing();
      await this.selectTabFromPopover(tabLabel);

      await this.testSubjects.click('discoverEmbeddableInlineEditApplyButton');
      await this.header.waitUntilLoadingHasFinished();
      await this.dashboard.waitForRenderComplete();
    });
  }

  /**
   * Returns the ID of the first tab in the Discover session
   * @returns The ID of the first tab in the Discover session
   */
  public async getFirstTabId() {
    const tabEls = await this.testSubjects.findAll('*unifiedTabs_tab_');
    return (await tabEls[0].getAttribute('data-test-subj'))?.replace('unifiedTabs_tab_', '');
  }

  /** Discover Embeddable helper methods end   */
}
