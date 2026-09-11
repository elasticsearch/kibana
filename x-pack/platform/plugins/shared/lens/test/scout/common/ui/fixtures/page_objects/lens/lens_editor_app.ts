/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { createLazyPageObject, LensApp, type ScoutPage } from '@kbn/scout';
import { LensDatatable } from './lens_datatable';
import { LensDimensions } from './lens_dimensions';
import { LensDragDrop } from './lens_drag_drop';
import { LensFields } from './lens_fields';
import { LensLayers } from './lens_layers';
import { LensMetric } from './lens_metric';
import { LensStyle } from './lens_style';
import { LensWorkspace } from './lens_workspace';

/**
 * Lens plugin Scout page object. Extends shared `@kbn/scout` `LensApp` and composes
 * editor-only domains as nested children (e.g. `pageObjects.lens.layers`).
 */
export class LensEditorApp extends LensApp {
  /** Layer tabs, per-layer data-view switch, add/remove. */
  public readonly layers: LensLayers;
  /** Dimension triggers, format params, quick-functions / static-value tabs. */
  public readonly dimensions: LensDimensions;
  /** Style flyout, palette, gauge/heatmap, reference lines, annotations. */
  public readonly style: LensStyle;
  /** Elastic Charts metric tiles and legacy metric. */
  public readonly metric: LensMetric;
  /** Datatable cell / header reading. */
  public readonly datatable: LensDatatable;
  /** Data-panel field creation, editing, and removal. */
  public readonly fields: LensFields;
  /** Workspace chrome: navigation, apply/discard, settings, tag cloud, formula. */
  public readonly workspace: LensWorkspace;
  /**
   * Drag-and-drop / field-list helpers beyond shared `dragFieldToWorkspace`
   * (geo, extra drop types, reorder, keyboard DnD, data-panel switch).
   */
  public readonly dragDrop: LensDragDrop;
  private readonly newDashboardOption;
  private readonly existingDashboardOption;
  private readonly openDashboardPicker;

  constructor(page: ScoutPage) {
    super(page);
    this.layers = createLazyPageObject(LensLayers, page);
    this.dimensions = createLazyPageObject(LensDimensions, page, {
      closeDimensionEditorButton: this.closeDimensionEditorButton,
      closeDimensionEditor: () => this.closeDimensionEditor(),
    });
    this.style = createLazyPageObject(LensStyle, page);
    this.metric = createLazyPageObject(LensMetric, page);
    this.datatable = createLazyPageObject(LensDatatable, page);
    this.fields = createLazyPageObject(LensFields, page, {
      getFieldListPanelFieldLocator: (field: string) => this.getFieldListPanelFieldLocator(field),
    });
    this.workspace = createLazyPageObject(LensWorkspace, page, {
      closeDimensionEditorButton: this.closeDimensionEditorButton,
      waitForLensApp: () => this.waitForLensApp(),
      waitForVisualization: (chartTestSubj: string) => this.waitForVisualization(chartTestSubj),
      getFormulaModelIndex: () => this.getFormulaModelIndex(),
      getCodeEditorValue: (modelIndex: number) => this.codeEditor.getCodeEditorValue(modelIndex),
    });
    this.dragDrop = createLazyPageObject(LensDragDrop, page, {
      getFieldAttrName: (field: string) => this.getFieldAttrName(field),
      getFieldListPanelFieldLocator: (field: string) => this.getFieldListPanelFieldLocator(field),
      waitForLensDragDropToFinish: () => this.waitForLensDragDropToFinish(),
      html5DragAndDrop: (from: string, to: string) => this.html5DragAndDrop(from, to),
      waitForVisualization: (chartTestSubj: string) => this.waitForVisualization(chartTestSubj),
    });
    this.newDashboardOption = this.page.locator('#new-dashboard-option');
    this.existingDashboardOption = this.page.locator('#existing-dashboard-option');
    this.openDashboardPicker = this.page.testSubj.locator('open-dashboard-picker');
  }

  /**
   * Opens the Lens save modal and fills the title. Dismisses toasts first:
   * clicking a toast close while the modal is open is an EUI `ownFocus`
   * outside click and closes it.
   */
  private async openSaveModalWithTitle(title: string): Promise<void> {
    await this.page.components.toast().closeAll();
    await this.openSaveOptionsIfNeeded();
    await this.saveButton.click();
    await this.saveModal.waitFor({ state: 'visible' });
    await this.savedObjectTitleInput.fill(title);
  }

  /** Sets the add-to-library checkbox. Uses the input (`setChecked`) so we do not read-then-branch. */
  private async setAddToLibrary(saveToLibrary: boolean): Promise<void> {
    await this.addToLibraryCheckbox.waitFor({ state: 'attached' });
    await this.addToLibraryCheckbox.setChecked(saveToLibrary);
  }

  /**
   * Saves from the Lens editor into a new dashboard.
   * Local until shared `save()` grows `saveToLibrary`. Do not override `save()`.
   */
  async saveToNewDashboard(
    title: string,
    options?: { saveAsNew?: boolean; saveToLibrary?: boolean }
  ): Promise<void> {
    await this.openSaveModalWithTitle(title);
    // Existing-lens copies must flip this before the dashboard radios (they stay
    // disabled until save-as-new is on). The control is absent for a new vis.
    if (options?.saveAsNew) {
      await this.setEuiSwitch('saveAsNewCheckbox', true);
    }
    await this.newDashboardOption.check();
    await this.setAddToLibrary(options?.saveToLibrary ?? false);
    await this.confirmSaveButton.click();
    await this.saveModal.waitFor({ state: 'hidden' });
  }

  /**
   * Saves from the Lens editor into an existing dashboard (picker by title).
   * Local until shared `save()` grows `saveToLibrary`. Do not override `save()`.
   */
  async saveToExistingDashboard(
    title: string,
    dashboardTitle: string,
    options?: { saveAsNew?: boolean; saveToLibrary?: boolean }
  ): Promise<void> {
    await this.openSaveModalWithTitle(title);
    if (options?.saveAsNew) {
      await this.setEuiSwitch('saveAsNewCheckbox', true);
    }
    await this.existingDashboardOption.check();
    await this.openDashboardPicker.click();
    await this.page.testSubj
      .locator(`dashboard-picker-option-${dashboardTitle.split(' ').join('-')}`)
      .click();
    await this.setAddToLibrary(options?.saveToLibrary ?? false);
    await this.confirmSaveButton.click();
    await this.saveModal.waitFor({ state: 'hidden' });
  }
}
