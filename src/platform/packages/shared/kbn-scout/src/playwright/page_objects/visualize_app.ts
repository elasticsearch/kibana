/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ScoutPage } from '..';
import { expect } from '..';

type VisType = 'lens' | 'vega' | 'metrics' | 'aggbased' | 'maps';

export class VisualizeApp {
  private readonly landingPage;
  private readonly newItemButton;
  private readonly visNewDialogGroups;
  private readonly visNewDialogTypes;
  private readonly legacyTab;
  private readonly visualizeSaveButton;
  private readonly saveModal;
  private readonly savedObjectTitleInput;
  private readonly confirmSaveButton;
  private readonly visualizationLoader;
  private readonly dashboardPicker;

  constructor(private readonly page: ScoutPage) {
    this.landingPage = this.page.testSubj.locator('visualizationLandingPage');
    this.newItemButton = this.page.testSubj.locator('newItemButton');
    this.visNewDialogGroups = this.page.testSubj.locator('visNewDialogGroups');
    this.visNewDialogTypes = this.page.testSubj.locator('visNewDialogTypes');
    this.legacyTab = this.page.testSubj.locator('groupModalLegacyTab');
    this.visualizeSaveButton = this.page.testSubj.locator('visualizeSaveButton');
    this.saveModal = this.page.testSubj.locator('savedObjectSaveModal');
    this.savedObjectTitleInput = this.page.testSubj.locator('savedObjectTitle');
    this.confirmSaveButton = this.page.testSubj.locator('confirmSaveSavedObjectButton');
    this.visualizationLoader = this.page.testSubj.locator('visualizationLoader');
    this.dashboardPicker = this.page.testSubj.locator('open-dashboard-picker');
  }

  async goto() {
    await this.page.gotoApp('visualize');
    await expect(this.landingPage).toBeVisible();
  }

  async openNewVisualizationWizard() {
    await this.newItemButton.click();
    await expect(this.visNewDialogGroups).toBeVisible();
  }

  async clickLegacyTab() {
    await this.legacyTab.click();
  }

  async clickVisType(type: VisType) {
    await this.page.testSubj.click(`visType-${type}`);
  }

  async clickAggBasedType(subType: string) {
    await this.clickLegacyTab();
    await this.clickVisType('aggbased');
    await expect(this.visNewDialogTypes).toBeVisible();
    await this.page.testSubj.click(`visType-${subType}`);
  }

  async selectDataSource(name: string) {
    await this.page.testSubj.click(`savedObjectTitle${name}`);
  }

  async waitForVisualizationLoaded() {
    await expect(this.visualizationLoader).toHaveAttribute('data-render-complete', 'true', {
      timeout: 30_000,
    });
  }

  async openSavedVisualization(title: string) {
    await this.page.testSubj.click(`visListingTitleLink-${title.split(' ').join('-')}`);
    await this.waitForVisualizationLoaded();
  }

  async openSaveModal() {
    await this.visualizeSaveButton.click();
    await expect(this.saveModal).toBeVisible();
  }

  async fillVisTitle(name: string) {
    await this.savedObjectTitleInput.fill(name);
  }

  async selectExistingDashboard(dashboardTitle: string) {
    await this.page.locator('label[for="existing-dashboard-option"]').click();
    await this.dashboardPicker.click();
    await this.page.testSubj
      .locator(`dashboard-picker-option-${dashboardTitle.split(' ').join('-')}`)
      .click();
  }

  async selectNewDashboard() {
    await this.page.locator('label[for="new-dashboard-option"]').click();
  }

  async confirmSave() {
    await this.confirmSaveButton.click();
    await expect(this.saveModal).toBeHidden();
  }

  async saveToExistingDashboard(visName: string, dashboardTitle: string) {
    await this.openSaveModal();
    await this.fillVisTitle(visName);
    await this.selectExistingDashboard(dashboardTitle);
    await this.confirmSave();
  }

  async saveToNewDashboard(visName: string) {
    await this.openSaveModal();
    await this.fillVisTitle(visName);
    await this.selectNewDashboard();
    await this.confirmSave();
  }

  async selectNoDashboard() {
    await this.page.locator('label[for="add-to-library-option"]').click();
  }

  async saveToLibrary(visName: string) {
    await this.fillVisTitle(visName);
    await this.selectNoDashboard();
    const addToLibraryCheckbox = this.page.locator('input#add-to-library-checkbox');
    await expect(addToLibraryCheckbox).toBeChecked();
    await expect(addToLibraryCheckbox).toBeDisabled();
    await this.confirmSave();
  }

  async createAggBasedVisualization(subType: string, dataSource: string) {
    await this.goto();
    await this.openNewVisualizationWizard();
    await this.clickAggBasedType(subType);
    await this.selectDataSource(dataSource);
  }

  async createVegaVisualization() {
    await this.goto();
    await this.openNewVisualizationWizard();
    await this.clickVisType('vega');
    await this.waitForVisualizationLoaded();
  }

  async createMapVisualization() {
    await this.goto();
    await this.openNewVisualizationWizard();
    await this.clickVisType('maps');
    await expect(this.page.testSubj.locator('breadcrumb first')).toHaveText('Visualize library');
  }

  async createTSVBVisualization() {
    await this.goto();
    await this.openNewVisualizationWizard();
    await this.clickLegacyTab();
    await this.clickVisType('metrics');
    await this.waitForVisualizationLoaded();
  }
}
