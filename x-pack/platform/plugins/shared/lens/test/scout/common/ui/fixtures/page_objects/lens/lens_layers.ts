/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ScoutPage } from '@kbn/scout';
import { WAIT_FOR_FUNCTION_TIMEOUT_MS } from './lens_editor_helpers';

/**
 * Lens editor layer tabs, per-layer data-view switching, and layer add/remove.
 */
export class LensLayers {
  // Tab `data-test-subj` values use layer ids (not numeric indices); this only ever
  // resolves to elements when there are 2+ layers (EUI hides the tab strip for one).
  private readonly layerTabsLocator;
  private readonly layerTabButtonsLocator;

  constructor(private readonly page: ScoutPage) {
    this.layerTabsLocator = this.page.testSubj.locator('^unifiedTabs_tab_');
    this.layerTabButtonsLocator = this.page.testSubj.locator('^unifiedTabs_selectTabBtn_');
  }

  /**
   * Switches the data view of a Lens layer via the layer's data view picker.
   *
   * @param dataViewTitle - title of the target data view (must already exist in the space).
   * @param layerIndex - layer to switch; defaults to the first layer.
   */
  async switchLayerIndexPattern(dataViewTitle: string, layerIndex = 0) {
    const trigger = this.getLayerIndexPatternTrigger(layerIndex);
    await trigger.click();
    const switcher = this.page.testSubj.locator('indexPattern-switcher');
    await switcher.waitFor({ state: 'visible' });
    await this.page.testSubj.typeWithDelay('indexPattern-switcher--input', dataViewTitle);
    await switcher.locator(`[data-test-subj="dataView-${dataViewTitle}"]`).click();
    await switcher.waitFor({ state: 'hidden' });
  }

  /** Returns the title of the currently selected data view for the given layer. */
  async getSelectedLayerIndexPattern(layerIndex = 0): Promise<string> {
    const trigger = this.getLayerIndexPatternTrigger(layerIndex);
    await trigger.waitFor({ state: 'visible' });
    return (await trigger.innerText()).trim();
  }

  private getLayerIndexPatternTrigger(layerIndex: number) {
    return layerIndex === 0
      ? this.page.testSubj.locator('lns_layerIndexPatternLabel')
      : this.page.testSubj.locator(`lns-layerPanel-${layerIndex} > lns_layerIndexPatternLabel`);
  }

  /**
   * Activates the layer tab at `index`. Requires the tabs row to be visible (multi-layer charts).
   * Tab `data-test-subj` values use layer ids (not numeric indices), so tabs are resolved by order.
   */
  async activateLayerTab(index: number) {
    // waitForFunction has no Scout default (unlike expect/actionTimeout).
    await this.page.waitForFunction(
      (minExclusive) =>
        document.querySelectorAll('[data-test-subj^="unifiedTabs_tab_"]').length > minExclusive,
      index,
      { timeout: WAIT_FOR_FUNCTION_TIMEOUT_MS }
    );

    const tabs = await this.layerTabsLocator.all();
    const tab = tabs[index];
    if (!tab) {
      throw new Error(`Layer tab not found at index ${index}`);
    }

    await this.activateTab(index);
  }

  /**
   * Ensures the layer tab at `index` is active, tolerating the single-layer case where the
   * tabs row isn't rendered at all (the lone layer's panel is already showing). Unlike
   * `activateLayerTab`, this is a no-op when there's no tab bar to select from, and when
   * the tab is already selected.
   */
  async ensureLayerTabIsActive(index = 0) {
    const tabs = await this.layerTabsLocator.all();
    if (tabs.length === 0) {
      return;
    }
    const tabButton = (await this.layerTabButtonsLocator.all())[index];
    if (!tabButton) {
      throw new Error(`Layer tab button not found at index ${index}`);
    }
    if ((await tabButton.getAttribute('aria-selected')) === 'true') {
      return;
    }
    await this.activateTab(index);
  }

  private async activateTab(index: number) {
    const tabButton = (await this.layerTabButtonsLocator.all())[index];
    if (!tabButton) {
      throw new Error(`Layer tab button not found at index ${index}`);
    }
    // Layer actions overlap the tab control when they appear on hover. Clicking the label follows
    // the existing Unified Tabs/FTR locator pattern without relying on pointer coordinates.
    await tabButton.locator('[data-test-subj="fullText"]').click();
    await this.page.testSubj.locator(`lns-layerPanel-${index}`).waitFor({ state: 'visible' });
  }

  /**
   * Opens the layer-actions popover for the layer at `index` and clicks the given action
   * (e.g. `lnsXY_annotationLayer_saveToLibrary`).
   */
  async performLayerAction(testSubject: string, layerIndex = 0) {
    await this.hoverLayerTab(layerIndex);
    // The layer actions mount after the hover, so wait for the popover trigger to render
    // instead of clicking straight away.
    const splitButton = this.page.testSubj.locator(`lnsLayerSplitButton--${layerIndex}`);
    await splitButton.waitFor({ state: 'visible' });
    await splitButton.click();
    await this.page.testSubj.click(testSubject);
  }

  /**
   * Duplicates the layer at `index` via the layer-actions clone control (FTR `duplicateLayer`).
   * Returns once a new layer tab is present.
   */
  async duplicateLayer(index = 0) {
    const tabsBefore = await this.getLayerCount();
    await this.hoverLayerTab(index);

    const splitButton = this.page.testSubj.locator(`lnsLayerSplitButton--${index}`);
    const cloneButton = this.page.testSubj.locator(`lnsLayerClone--${index}`);
    await splitButton.or(cloneButton).waitFor({ state: 'visible' });
    if (await splitButton.isVisible()) {
      await splitButton.click();
    }
    await cloneButton.click();

    await this.page.waitForFunction(
      (before) => {
        const tabs = document.querySelectorAll('[data-test-subj^="unifiedTabs_tab_"]').length;
        const count = tabs === 0 ? 1 : tabs;
        return count > before;
      },
      tabsBefore,
      { timeout: WAIT_FOR_FUNCTION_TIMEOUT_MS }
    );
  }

  /**
   * Switches the XY stacking subtype for the layer at `layerIndex`
   * Caller must have a chart that exposes lnsStackingOptionsButton` (e.g. bar/area).
   * Returns once the overlay is gone and the stacking trigger label matches `subType`.
   */
  async switchToVisualizationSubtype(subType: string, layerIndex = 0) {
    const stackingButton = this.page.testSubj.locator(
      `lns-layerPanel-${layerIndex} > lnsStackingOptionsButton`
    );
    await stackingButton.waitFor({ state: 'visible' });
    await stackingButton.click();
    const option = this.page.testSubj.locator(`lnsStackingOptionsButton${subType}`);
    await option.click();
    await option.waitFor({ state: 'hidden' });
    // exact: true — "Stacked" is a substring of "Unstacked"
    await stackingButton.getByText(subType, { exact: true }).waitFor({ state: 'visible' });
  }

  /**
   * Hovers the layer tab at `index` when the tabs row is rendered (hidden for a single layer).
   * Throws if tabs exist but `index` is out of range — a wrong index must not silently no-op.
   */
  private async hoverLayerTab(index: number) {
    const tabs = await this.layerTabsLocator.all();
    if (tabs.length === 0) {
      return;
    }
    const tab = tabs[index];
    if (!tab) {
      throw new Error(`Layer tab not found at index ${index}`);
    }
    await tab.hover();
  }

  /** Returns the number of layers in the Lens editor (unified-tabs row is hidden for a single layer). */
  async getLayerCount(): Promise<number> {
    const tabs = await this.layerTabsLocator.count();
    return tabs === 0 ? 1 : tabs;
  }

  /**
   * Adds a visualization layer of the given type (opens the layer-type menu).
   * Caller must use a chart that shows `lnsLayerAddButton-{layerType}` after Add.
   *
   * Annotation layers open a second menu to pick between a new annotation group and one
   * saved in the annotation library; pass `annotationFromLibraryTitle` for the latter.
   */
  async createLayer(
    layerType: 'data' | 'referenceLine' | 'annotations',
    annotationFromLibraryTitle?: string,
    options: {
      /**
       * ES|QL charts hide the annotation library, so the annotations menu item adds the
       * layer directly instead of opening the "Select annotation method" submenu.
       * The caller must state which flow to expect: auto-detecting the submenu would
       * be a timing race (a slow render could show it after the check concluded).
       * Defaults to the DSL submenu flow, keeping existing call sites unchanged.
       */
      annotationsAddDirectly?: boolean;
    } = {}
  ) {
    const tabsBefore = await this.getLayerCount();
    await this.page.testSubj.click('lnsLayerAddButton');
    await this.page.testSubj.click(`lnsLayerAddButton-${layerType}`);
    if (layerType === 'annotations' && !options.annotationsAddDirectly) {
      if (annotationFromLibraryTitle) {
        await this.page.testSubj.click('lnsAnnotationLayer_addFromLibrary');
        await this.page.testSubj.click(
          `savedObjectTitle${annotationFromLibraryTitle.split(' ').join('-')}`
        );
      } else {
        await this.page.testSubj.click('lnsAnnotationLayer_new');
      }
    }
    await this.page.waitForFunction(
      (before) => {
        const tabs = document.querySelectorAll('[data-test-subj^="unifiedTabs_tab_"]').length;
        const count = tabs === 0 ? 1 : tabs;
        return count > before;
      },
      tabsBefore,
      { timeout: WAIT_FOR_FUNCTION_TIMEOUT_MS }
    );
  }

  /**
   * Removes the layer at `index` (FTR `removeLayer`). With a single layer this clears the viz
   * instead of dropping a tab. Returns once the removal is reflected in the config panel, so
   * callers can read the layer count / build a new chart right after.
   *
   * Lens shows `lnsLayerRemoveModal` for clear/delete unless the user previously checked
   * "Don't ask me again". Default `confirm: true` matches a fresh browser context; pass
   * `confirm: false` only when that skip preference is already set.
   */
  async removeLayer(index = 0, options: { confirm?: boolean } = { confirm: true }) {
    const tabsBefore = await this.layerTabsLocator.count();
    await this.hoverLayerTab(index);

    const splitButton = this.page.testSubj.locator(`lnsLayerSplitButton--${index}`);
    const removeButton = this.page.testSubj.locator(`lnsLayerRemove--${index}`);
    // Layers with more than one action (e.g. an annotation layer that can also be saved to the
    // library) hide the remove action behind a split-button popover; single-action layers expose
    // it directly. Exactly one of the two renders, so wait for whichever appears rather than
    // racing the layer actions still mounting after the hover.
    await splitButton.or(removeButton).waitFor({ state: 'visible' });
    if (await splitButton.isVisible()) {
      await splitButton.click();
    }
    await removeButton.click();

    if (options.confirm !== false) {
      const removeModal = this.page.testSubj.locator('lnsLayerRemoveModal');
      await removeModal.waitFor({ state: 'visible' });
      await this.page.testSubj.click('lnsLayerRemoveConfirmButton');
      await removeModal.waitFor({ state: 'hidden' });
    }

    if (tabsBefore > 0) {
      // waitForFunction has no Scout default (unlike expect/actionTimeout).
      await this.page.waitForFunction(
        (before) =>
          document.querySelectorAll('[data-test-subj^="unifiedTabs_tab_"]').length < before,
        tabsBefore,
        { timeout: WAIT_FOR_FUNCTION_TIMEOUT_MS }
      );
    } else {
      // Clearing the only layer keeps its (now empty) panel, so wait for its dimensions to go.
      await this.page.testSubj.waitForSelector(`lns-layerPanel-${index} > lns-dimensionTrigger`, {
        state: 'detached',
      });
    }
  }
}
