/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { VisualizeConstants } from '@kbn/visualizations-common';
import { FORMATS_UI_SETTINGS } from '@kbn/field-formats-plugin/common';
import { FtrService } from '../ftr_provider_context';

// TODO: Remove & Refactor to use the TTV page objects
interface VisualizeSaveModalArgs {
  saveAsNew?: boolean;
  redirectToOrigin?: boolean;
  addToDashboard?: boolean;
  dashboardId?: string;
  description?: string;
}

type DashboardPickerOption =
  | 'add-to-library-option'
  | 'existing-dashboard-option'
  | 'new-dashboard-option';

/**
 * This page object contains the visualization type selection, the landing page,
 * and the open/save dialog functions
 */
export class VisualizePageObject extends FtrService {
  private readonly kibanaServer = this.ctx.getService('kibanaServer');
  private readonly testSubjects = this.ctx.getService('testSubjects');
  private readonly retry = this.ctx.getService('retry');
  private readonly find = this.ctx.getService('find');
  private readonly log = this.ctx.getService('log');
  private readonly globalNav = this.ctx.getService('globalNav');
  private readonly listingTable = this.ctx.getService('listingTable');
  private readonly queryBar = this.ctx.getService('queryBar');
  private readonly elasticChart = this.ctx.getService('elasticChart');
  private readonly common = this.ctx.getPageObject('common');
  private readonly header = this.ctx.getPageObject('header');
  private readonly timePicker = this.ctx.getPageObject('timePicker');
  private readonly visChart = this.ctx.getPageObject('visChart');
  private readonly toasts = this.ctx.getService('toasts');

  index = {
    LOGSTASH_TIME_BASED: 'logstash-*',
    LOGSTASH_NON_TIME_BASED: 'logstash*',
  };

  remoteEsPrefix = 'ftr-remote:';
  defaultIndexString = 'logstash-*';

  public async initTests(isLegacyChart = false) {
    await this.kibanaServer.savedObjects.clean({ types: ['visualization'] });
    await this.kibanaServer.importExport.load(
      'src/platform/test/functional/fixtures/kbn_archiver/visualize.json'
    );

    await this.kibanaServer.uiSettings.replace({
      defaultIndex: this.defaultIndexString,
      [FORMATS_UI_SETTINGS.FORMAT_BYTES_DEFAULT_PATTERN]: '0,0.[000]b',
      'visualization:visualize:legacyHeatmapChartsLibrary': isLegacyChart,
      'histogram:maxBars': 100,
      'timepicker:timeDefaults': `{ "from": "${this.timePicker.defaultStartTimeUTC}", "to": "${this.timePicker.defaultEndTimeUTC}"}`,
    });
  }

  /**
   *  Try to speed resets a bit if the Visualize library breadcrumb is available
   */
  private async clickOnVisualizeLibraryBreadcrumb() {
    // Try to navigate to the Visualize Listing page from breadcrumb if available
    const selector = '[data-test-subj="breadcrumb first"][title="Visualize library"]';
    const visualizeLibraryBreadcrumb = await this.find.existsByCssSelector(selector);
    if (visualizeLibraryBreadcrumb) {
      await this.find.clickByCssSelector(selector);
      // Lens offers a last modal before leaving the page for unsaved charts
      // so close it as quick as possible
      if (await this.testSubjects.exists('confirmModalConfirmButton')) {
        await this.testSubjects.click('confirmModalConfirmButton');
        return true;
      }
    }
  }

  public async gotoVisualizationLandingPage(
    { forceRefresh }: { forceRefresh: boolean } = { forceRefresh: false }
  ) {
    if (forceRefresh || !(await this.clickOnVisualizeLibraryBreadcrumb())) {
      await this.common.navigateToApp('visualize');
    }
  }

  public async selectVisualizationsTab() {
    await this.listingTable.selectTab(1);
  }

  public async selectAnnotationsTab() {
    await this.listingTable.selectTab(2);
  }

  public async clickNewVisualization() {
    await this.listingTable.clickNewButton();
  }

  public async clickAggBasedVisualizations() {
    await this.clickLegacyTab();
    await this.testSubjects.click('visType-aggbased');
  }

  public async goBackToGroups() {
    await this.testSubjects.click('goBackLink');
  }

  public async createVisualizationPromptButton() {
    await this.testSubjects.click('newItemButton');
  }

  public async getChartTypes() {
    const chartTypeField = await this.testSubjects.find('visNewDialogTypes');
    const $ = await chartTypeField.parseDomContent();
    return $('button')
      .toArray()
      .map((chart) => $(chart).findTestSubject('visTypeTitle').text().trim());
  }

  public async getVisibleVisTypes() {
    const chartTypeField = await this.testSubjects.find('visNewDialogGroups');
    const $ = await chartTypeField.parseDomContent();
    const promotedVisTypes: string[] = [];
    $('button')
      .toArray()
      .forEach((chart) => {
        const title = $(chart).findTestSubject('visTypeTitle').text().trim();
        if (title) {
          promotedVisTypes.push(title);
        }
      });
    return promotedVisTypes.sort();
  }

  public async waitForVisualizationSelectPage() {
    await this.retry.try(async () => {
      const visualizeSelectTypePage = await this.testSubjects.find('visNewDialogTypes');
      if (!(await visualizeSelectTypePage.isDisplayed())) {
        throw new Error('wait for visualization select page');
      }
    });
  }

  public async clickRefresh(isLegacyChart = false) {
    if ((await this.visChart.isNewChartsLibraryEnabled()) || !isLegacyChart) {
      await this.elasticChart.setNewChartUiDebugFlag();
    }
    await this.queryBar.clickQuerySubmitButton();
  }

  public async waitForGroupsSelectPage() {
    await this.retry.try(async () => {
      const visualizeSelectGroupStep = await this.testSubjects.find('visNewDialogGroups');
      if (!(await visualizeSelectGroupStep.isDisplayed())) {
        throw new Error('wait for vis groups select step');
      }
    });
  }

  /**
   * Navigation now happens without URL refresh by default
   * so a new "forceRefresh" option has been passed in order to
   * address those scenarios where a full refresh is required (i.e. changing default settings)
   */
  public async navigateToNewVisualization(
    options: { forceRefresh: boolean } = { forceRefresh: false }
  ) {
    await this.gotoVisualizationLandingPage(options);
    await this.header.waitUntilLoadingHasFinished();
    await this.clickNewVisualization();
    await this.waitForGroupsSelectPage();
  }

  public async navigateToNewAggBasedVisualization() {
    await this.gotoVisualizationLandingPage();
    await this.header.waitUntilLoadingHasFinished();
    await this.clickNewVisualization();
    await this.clickAggBasedVisualizations();
    await this.waitForVisualizationSelectPage();
  }

  public async navigateToLensFromAnotherVisualization() {
    await this.testSubjects.click('visualizeEditInLensButton');
  }

  public async hasNavigateToLensButton() {
    return await this.testSubjects.exists('visualizeEditInLensButton');
  }

  public async hasVisType(type: string) {
    return await this.testSubjects.exists(`visType-${type}`);
  }

  public async clickVisType(type: string) {
    // checking for the existence of the control gives the UI more time to bind a click handler
    // see https://github.com/elastic/kibana/issues/89958
    if (!(await this.hasVisType(type))) {
      throw new Error(`The '${type}' visualization type does not exist (visType-${type})`);
    }
    await this.testSubjects.click(`visType-${type}`);
    await this.header.waitUntilLoadingHasFinished();
  }

  public async clickAreaChart() {
    await this.clickVisType('area');
  }

  public async clickDataTable() {
    await this.clickVisType('table');
  }

  public async clickLineChart() {
    await this.clickVisType('line');
  }

  public async clickLegacyTab() {
    await this.testSubjects.click('groupModalLegacyTab');
  }

  public async clickMetric() {
    await this.clickVisType('metric');
  }

  public async clickGauge() {
    await this.clickVisType('gauge');
  }

  public async clickGoal() {
    await this.clickVisType('goal');
  }

  public async clickPieChart() {
    await this.clickVisType('pie');
  }

  public async clickTimelion() {
    await this.clickVisType('timelion');
  }

  public async clickTagCloud() {
    await this.clickVisType('tagcloud');
  }

  public async clickVega() {
    await this.clickVisType('vega');
  }

  public async clickVisualBuilder() {
    await this.clickLegacyTab();
    await this.clickVisType('metrics');
  }

  public async clickVerticalBarChart() {
    await this.clickVisType('histogram');
  }

  public async clickHeatmapChart() {
    await this.clickVisType('heatmap');
  }

  public async clickInputControlVis() {
    await this.clickVisType('input_control_vis');
  }

  public async clickLensWidget() {
    await this.clickVisType('lens');
  }

  public async clickMapsApp() {
    await this.clickVisType('maps');
  }

  public async hasMapsApp() {
    return await this.hasVisType('maps');
  }

  public async createSimpleTSVBViz(vizName: string) {
    await this.gotoVisualizationLandingPage();
    await this.navigateToNewVisualization();
    await this.clickVisualBuilder();
    await this.saveVisualization(vizName);
  }

  public async clickNewSearch(indexPattern = this.index.LOGSTASH_TIME_BASED) {
    await this.testSubjects.click(`savedObjectTitle${indexPattern.split(' ').join('-')}`);
    await this.header.waitUntilLoadingHasFinished();
  }

  public async selectVisSourceIfRequired() {
    this.log.debug('selectVisSourceIfRequired');
    const selectPage = await this.testSubjects.findAll('visualizeSelectSearch');
    if (selectPage.length) {
      this.log.debug('a search is required for this visualization');
      await this.clickNewSearch();
    }
  }

  /**
   * Deletes all existing visualizations
   */
  public async deleteAllVisualizations() {
    await this.retry.try(async () => {
      await this.listingTable.checkListingSelectAllCheckbox();
      await this.listingTable.clickDeleteSelected();
      await this.common.clickConfirmOnModal();
      await this.testSubjects.find('newItemButton');
    });
  }

  public async isBetaInfoShown() {
    return await this.testSubjects.exists('betaVisInfo');
  }

  public async getBetaTypeLinks() {
    return await this.find.allByCssSelector('[data-vis-stage="beta"]');
  }

  public async getExperimentalTypeLinks() {
    return await this.find.allByCssSelector('[data-vis-stage="experimental"]');
  }

  public async isExperimentalInfoShown() {
    return await this.testSubjects.exists('experimentalVisInfo');
  }

  public async getExperimentalInfo() {
    return await this.testSubjects.find('experimentalVisInfo');
  }

  public async getSideEditorExists() {
    return await this.find.existsByCssSelector('.visEditor__collapsibleSidebar');
  }

  public async clickSavedSearch(savedSearchName: string) {
    await this.testSubjects.click(`savedObjectTitle${savedSearchName.split(' ').join('-')}`);
    await this.header.waitUntilLoadingHasFinished();
  }

  public async clickUnlinkSavedSearch() {
    await this.testSubjects.click('showUnlinkSavedSearchPopover');
    await this.testSubjects.click('unlinkSavedSearch');
    await this.header.waitUntilLoadingHasFinished();
  }

  public async ensureSavePanelOpen() {
    this.log.debug('ensureSavePanelOpen');
    await this.header.waitUntilLoadingHasFinished();
    const isOpen = await this.testSubjects.exists('savedObjectSaveModal', { timeout: 5000 });
    if (!isOpen) {
      await this.testSubjects.click('visualizeSaveButton');
    }
  }

  public async clickLoadSavedVisButton() {
    await this.testSubjects.click('breadcrumb first');
  }

  public async loadSavedVisualization(vizName: string, { navigateToVisualize = true } = {}) {
    if (navigateToVisualize) {
      await this.clickLoadSavedVisButton();
    }
    await this.listingTable.searchForItemWithName(vizName);
    await this.openSavedVisualization(vizName);
  }

  public async openSavedVisualization(vizName: string) {
    await this.retry.try(async () => {
      await this.listingTable.clickItemLink('visualize', vizName);
      await this.notOnLandingPageOrFail();
    });
    await this.header.waitUntilLoadingHasFinished();
  }

  public async waitForVisualizationSavedToastGone() {
    await this.testSubjects.waitForDeleted('saveVisualizationSuccess');
  }

  public async clickLandingPageBreadcrumbLink() {
    this.log.debug('clickLandingPageBreadcrumbLink');
    await this.find.clickByCssSelector(`a[href="#${VisualizeConstants.LANDING_PAGE_PATH}"]`);
  }

  /**
   * Returns true if already on the landing page (that page doesn't have a link to itself).
   * @returns {Promise<boolean>}
   */
  public async onLandingPage() {
    this.log.debug(`VisualizePage.onLandingPage`);
    return await this.testSubjects.exists('visualizationLandingPage');
  }

  public async notOnLandingPageOrFail() {
    this.log.debug(`VisualizePage.notOnLandingPageOrFail`);
    return await this.testSubjects.missingOrFail('visualizationLandingPage');
  }

  public async gotoLandingPage() {
    this.log.debug('VisualizePage.gotoLandingPage');
    const onPage = await this.onLandingPage();
    if (!onPage) {
      await this.retry.try(async () => {
        await this.clickLandingPageBreadcrumbLink();
        const onLandingPage = await this.onLandingPage();
        if (!onLandingPage) {
          throw new Error('Not on the landing page.');
        }
      });
    }
  }

  public async saveVisualization(vizName: string, saveModalArgs: VisualizeSaveModalArgs = {}) {
    await this.ensureSavePanelOpen();

    await this.setSaveModalValues(vizName, saveModalArgs);
    this.log.debug('Click Save Visualization button');

    await this.testSubjects.click('confirmSaveSavedObjectButton');

    // Confirm that the Visualization has actually been saved
    await this.testSubjects.existOrFail('saveVisualizationSuccess');
    const message = await this.toasts.getTitleAndDismiss();
    await this.header.waitUntilLoadingHasFinished();
    await this.common.waitForSaveModalToClose();

    return message;
  }

  public async setSaveModalValues(
    vizName: string,
    {
      saveAsNew,
      redirectToOrigin,
      addToDashboard,
      dashboardId,
      description,
    }: VisualizeSaveModalArgs = {}
  ) {
    await this.testSubjects.setValue('savedObjectTitle', vizName);

    if (description) {
      await this.testSubjects.setValue('savedObjectDescription', description);
    }

    const saveAsNewCheckboxExists = await this.testSubjects.exists('saveAsNewCheckbox');
    if (saveAsNewCheckboxExists) {
      const state = saveAsNew ? 'check' : 'uncheck';
      this.log.debug('save as new checkbox exists. Setting its state to', state);
      await this.testSubjects.setEuiSwitch('saveAsNewCheckbox', state);
    }

    const redirectToOriginCheckboxExists = await this.testSubjects.exists(
      'returnToOriginModeSwitch'
    );
    if (redirectToOriginCheckboxExists) {
      const state = redirectToOrigin ? 'check' : 'uncheck';
      this.log.debug('redirect to origin checkbox exists. Setting its state to', state);
      await this.testSubjects.setEuiSwitch('returnToOriginModeSwitch', state);
    }

    const dashboardSelectorExists = await this.testSubjects.exists('add-to-dashboard-options');
    if (dashboardSelectorExists) {
      let option: DashboardPickerOption = 'add-to-library-option';
      if (addToDashboard) {
        option = dashboardId ? 'existing-dashboard-option' : 'new-dashboard-option';
      }
      this.log.debug('save modal dashboard selector, choosing option:', option);
      const dashboardSelector = await this.testSubjects.find('add-to-dashboard-options');
      const label = await dashboardSelector.findByCssSelector(`label[for="${option}"]`);
      await label.click();

      if (dashboardId) {
        // TODO - selecting an existing dashboard
      }
    }
  }

  public async saveVisualizationExpectSuccess(
    vizName: string,
    { saveAsNew, redirectToOrigin, addToDashboard, dashboardId }: VisualizeSaveModalArgs = {}
  ) {
    const saveMessage = await this.saveVisualization(vizName, {
      saveAsNew,
      redirectToOrigin,
      addToDashboard,
      dashboardId,
    });
    if (!saveMessage) {
      throw new Error(
        `Expected saveVisualization to respond with the saveMessage from the toast, got ${saveMessage}`
      );
    }
  }

  public async saveVisualizationExpectSuccessAndBreadcrumb(
    vizName: string,
    { saveAsNew = false, redirectToOrigin = false } = {}
  ) {
    await this.saveVisualizationExpectSuccess(vizName, { saveAsNew, redirectToOrigin });
    await this.retry.waitFor(
      'last breadcrumb to have new vis name',
      async () => (await this.globalNav.getLastBreadcrumb()) === vizName
    );
  }

  public async saveVisualizationAndReturn() {
    await this.header.waitUntilLoadingHasFinished();
    await this.testSubjects.existOrFail('visualizesaveAndReturnButton');
    await this.testSubjects.click('visualizesaveAndReturnButton');
  }

  public async linkedToOriginatingApp() {
    await this.header.waitUntilLoadingHasFinished();
    await this.testSubjects.existOrFail('visualizesaveAndReturnButton');
  }

  public async notLinkedToOriginatingApp() {
    await this.header.waitUntilLoadingHasFinished();
    await this.testSubjects.missingOrFail('visualizesaveAndReturnButton');
  }

  public async cancelAndReturn(showConfirmModal: boolean) {
    await this.header.waitUntilLoadingHasFinished();
    await this.testSubjects.existOrFail('visualizeCancelAndReturnButton');
    await this.testSubjects.click('visualizeCancelAndReturnButton');
    if (showConfirmModal) {
      await this.retry.waitFor(
        'confirm modal to show',
        async () => await this.testSubjects.exists('appLeaveConfirmModal')
      );
      await this.testSubjects.exists('confirmModalConfirmButton');
      await this.testSubjects.click('confirmModalConfirmButton');
    }
  }
}
