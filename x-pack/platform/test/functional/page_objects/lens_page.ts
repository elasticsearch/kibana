/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import chroma from 'chroma-js';
import expect from '@kbn/expect';
import { setTimeout as setTimeoutAsync } from 'timers/promises';
import type { FittingFunction, XYCurveType } from '@kbn/lens-plugin/public';
import type { DebugState } from '@elastic/charts';
import type { WebElementWrapper } from '@kbn/ftr-common-functional-ui-services';
import type { FtrProviderContext } from '../ftr_provider_context';
import { logWrapper } from './log_wrapper';

declare global {
  interface Window {
    /**
     * Debug setting to test CSV download
     */
    ELASTIC_LENS_CSV_DOWNLOAD_DEBUG?: boolean;
    ELASTIC_LENS_CSV_CONTENT?: Record<string, { content: string; type: string }>;
  }
}

const ECH_BADGE_SELECTOR = '.echBadge__content';

export function LensPageProvider({ getService, getPageObjects }: FtrProviderContext) {
  const log = getService('log');
  const findService = getService('find');
  const testSubjects = getService('testSubjects');
  const retry = getService('retry');
  const elasticChart = getService('elasticChart');
  const find = getService('find');
  const comboBox = getService('comboBox');
  const browser = getService('browser');
  const dashboardAddPanel = getService('dashboardAddPanel');
  const queryBar = getService('queryBar');
  const dataViews = getService('dataViews');

  const { common, header, timePicker, dashboard, timeToVisualize, unifiedSearch, share, exports } =
    getPageObjects([
      'common',
      'header',
      'timePicker',
      'dashboard',
      'timeToVisualize',
      'unifiedSearch',
      'share',
      'exports',
    ]);

  return logWrapper('lensPage', log, {
    /**
     * Clicks the index pattern filters toggle.
     */
    async toggleIndexPatternFiltersPopover() {
      await testSubjects.click('lnsIndexPatternFieldTypeFilterToggle');
    },

    async findAllFields() {
      const fields = await testSubjects.findAll('lnsFieldListPanelField');
      return await Promise.all(fields.map((field) => field.getVisibleText()));
    },

    async isLensPageOrFail() {
      return await testSubjects.existOrFail('lnsApp', { timeout: 10000 });
    },

    /**
     * Navigate directly to the editor for a saved Lens visualization by id and
     * wait for the rendered chart to settle. Prefer this over going through
     * the visualize listing page (search + click) when the saved object id is
     * known (e.g. fixture-loaded visualizations).
     *
     * @param id - the saved object id of the Lens visualization
     * @param visDataTestSubj - the chart container `data-test-subj`.
     *   example: `xyVisChart` (line/bar/area), `partitionVisChart`
     *   (pie/treemap/donut), `mtrVis` (new metric), `legacyMtrVis` (legacy
     *   metric), `heatmapChart`, `lnsVisualizationContainer` (datatable).
     */
    async openEditor(id: string, visDataTestSubj: string) {
      await common.navigateToApp('lens', { hash: `#/edit/${id}` });
      await this.waitForVisualization(visDataTestSubj);
    },

    /**
     * Navigate directly to a new Lens editor, skipping the visualize
     * listing page and the visualization-type selection modal. Prefer this
     * over `visualize.navigateToNewVisualization() + visualize.clickVisType('lens')`
     * when the test builds a chart from scratch.
     */
    async openNewEditor() {
      await common.navigateToApp('lens');
      await testSubjects.existOrFail('lnsApp', { timeout: 10000 });
    },

    /**
     * Move the date filter to the specified time range, defaults to
     * a range that has data in our dataset.
     */
    async goToTimeRange(fromTime?: string, toTime?: string) {
      const from = fromTime || timePicker.defaultStartTime;
      const to = toTime || timePicker.defaultEndTime;
      await retry.try(async () => {
        await timePicker.ensureHiddenNoDataPopover();
        await timePicker.setAbsoluteRange(from, to);
        // give some time for the update button tooltip to close
        await common.sleep(500);
      });
    },

    /**
     * Wait for the specified element to have text that passes the specified test.
     *
     * @param selector - the element selector
     * @param test - the test function to run on the element's text
     */
    async assertExpectedText(selector: string, test: (value?: string) => boolean) {
      let actualText: string | undefined;

      await retry.waitForWithTimeout('assertExpectedText', 5000, async () => {
        actualText = await find.byCssSelector(selector).then((el) => el.getVisibleText());
        return test(actualText);
      });

      if (!test(actualText)) {
        throw new Error(`"${actualText}" did not match expectation.`);
      }
    },

    /**
     * Asserts that the specified element has the expected inner text.
     *
     * @param selector - the element selector
     * @param expectedText - the expected text
     */
    assertExactText(selector: string, expectedText: string) {
      return this.assertExpectedText(selector, (value) => value === expectedText);
    },

    /**
     * Clicks a visualize list item's title (visualize app or dashboard Visualizations tab).
     *
     * @param title - the title of the list item to be clicked
     */
    clickVisualizeListItemTitle(title: string) {
      return retry.try(async () => {
        const link = (await testSubjects.exists(`visualizationListingListingTitleLink-${title}`))
          ? `visualizationListingListingTitleLink-${title}`
          : (await testSubjects.exists(`visListingTitleLink-${title}`))
          ? `visListingTitleLink-${title}`
          : `visualizationListingTitleLink-${title}`;
        await testSubjects.click(link);
        await this.isLensPageOrFail();
      });
    },

    async selectOptionFromComboBox(testTargetId: string, name: string | string[]) {
      const target = await testSubjects.find(testTargetId, 1000);
      await comboBox.openOptionsList(target);
      const names = Array.isArray(name) ? name : [name];
      for (const option of names) {
        await comboBox.setElement(target, option);
      }
    },

    async configureQueryAnnotation(opts: {
      queryString: string;
      timeField: string;
      textDecoration?: { type: 'none' | 'name' | 'field'; textField?: string };
      extraFields?: string[];
    }) {
      // type * in the query editor
      const queryInput = await testSubjects.find('annotation-query-based-query-input');
      await queryInput.type(opts.queryString);
      await testSubjects.click('indexPattern-filters-existingFilterTrigger');
      await this.selectOptionFromComboBox(
        'lnsXY-annotation-query-based-field-picker',
        opts.timeField
      );
      if (opts.textDecoration) {
        await testSubjects.click(`lnsXY_textVisibility_${opts.textDecoration.type}`);
        if (opts.textDecoration.textField) {
          await this.selectOptionFromComboBox(
            'lnsXY-annotation-query-based-text-decoration-field-picker',
            opts.textDecoration.textField
          );
        }
      }
      if (opts.extraFields) {
        for (const field of opts.extraFields) {
          await this.addFieldToTooltip(field);
        }
      }
    },

    async addFieldToTooltip(fieldName: string) {
      const lastIndex = (
        await find.allByCssSelector('[data-test-subj^="lnsXY-annotation-tooltip-field-picker"]')
      ).length;
      await retry.try(async () => {
        await testSubjects.click('lnsXY-annotation-tooltip-add_field');
        await this.selectOptionFromComboBox(
          `lnsXY-annotation-tooltip-field-picker--${lastIndex}`,
          fieldName
        );
      });
    },

    /**
     * Changes the specified dimension to the specified operation and optionally the field.
     *
     * @param opts.dimension - the selector of the dimension being changed
     * @param opts.operation - the desired operation ID for the dimension
     * @param opts.field - the desired field for the dimension
     * @param layerIndex - the index of the layer
     */
    async configureDimension(opts: {
      dimension: string;
      operation: string;
      field?: string;
      isPreviousIncompatible?: boolean;
      keepOpen?: boolean;
      palette?: { mode: 'legacy' | 'colorMapping'; id: string };
      formula?: string;
      disableEmptyRows?: boolean;
    }) {
      await retry.try(async () => {
        if (
          !(await testSubjects.exists('lns-indexPattern-dimensionContainerClose', {
            timeout: 1000,
          }))
        ) {
          await testSubjects.click(opts.dimension);
        }
        await testSubjects.existOrFail('lns-indexPattern-dimensionContainerClose', {
          timeout: 1000,
        });
      });

      if (opts.operation === 'formula') {
        await this.switchToFormula();
      } else {
        await this.selectOperation(opts.operation, opts.isPreviousIncompatible);
      }
      if (opts.field) {
        await this.selectOptionFromComboBox('indexPattern-dimension-field', opts.field);
      }

      if (opts.formula) {
        // Formula takes time to open
        await common.sleep(500);
        await this.typeFormula(opts.formula);
      }

      if (opts.palette) {
        await this.setPalette(opts.palette.id, opts.palette.mode === 'legacy');
      }

      if (opts.disableEmptyRows) {
        await testSubjects.setEuiSwitch('indexPattern-include-empty-rows', 'uncheck');
      }

      if (!opts.keepOpen) {
        await this.closeDimensionEditor();
      }
    },

    /**
     * Changes the specified dimension to the specified operation and (optinally) field.
     *
     * @param opts.dimension - the selector of the dimension being changed
     * @param opts.operation - the desired operation ID for the dimension
     * @param opts.field - the desired field for the dimension
     * @param layerIndex - the index of the layer
     */
    async configureReference(opts: {
      operation?: string;
      field?: string;
      isPreviousIncompatible?: boolean;
    }) {
      if (opts.operation) {
        await this.selectOptionFromComboBox(
          'indexPattern-subFunction-selection-row',
          opts.operation
        );
      }

      if (opts.field) {
        await this.selectOptionFromComboBox(
          'indexPattern-reference-field-selection-row',
          opts.field
        );
      }
    },

    /**
     * Drags field to workspace
     *
     * @param field  - the desired field for the dimension
     * */
    async dragFieldToWorkspace(field: string, visualizationTestSubj?: string) {
      const from = `lnsFieldListPanelField-${field}`;
      await find.existsByCssSelector(from);
      await browser.html5DragAndDrop(
        testSubjects.getCssSelector(from),
        testSubjects.getCssSelector('lnsWorkspace')
      );
      await this.waitForLensDragDropToFinish();
      await this.waitForVisualization(visualizationTestSubj);
    },

    /**
     * Drags field to geo field workspace
     *
     * @param field  - the desired geo_point or geo_shape field
     * */
    async dragFieldToGeoFieldWorkspace(field: string) {
      const from = `lnsFieldListPanelField-${field}`;
      await find.existsByCssSelector(from);
      await browser.html5DragAndDrop(
        testSubjects.getCssSelector(from),
        testSubjects.getCssSelector('lnsGeoFieldWorkspace')
      );
      await this.waitForLensDragDropToFinish();
      await header.waitUntilLoadingHasFinished();
    },

    /**
     * Drags field to workspace
     *
     * @param field  - the desired field for the dimension
     * */
    async clickField(field: string) {
      await testSubjects.click(`lnsFieldListPanelField-${field}`);
    },

    async editField(field: string) {
      await retry.try(async () => {
        await testSubjects.click(`fieldPopoverHeader_editField-${field}`);
        await testSubjects.missingOrFail(`fieldPopoverHeader_editField-${field}`);
      });
    },

    async removeField(field: string) {
      await retry.try(async () => {
        await testSubjects.click(`fieldPopoverHeader_deleteField-${field}`);
        await testSubjects.missingOrFail(`fieldPopoverHeader_deleteField-${field}`);
      });
    },

    async searchField(name: string) {
      await testSubjects.setValue('lnsIndexPatternFieldSearch', name, {
        clearWithKeyboard: true,
        typeCharByChar: true,
      });
    },

    async waitForField(field: string) {
      await testSubjects.existOrFail(`lnsFieldListPanelField-${field}`);
    },

    async waitForMissingField(field: string) {
      await testSubjects.missingOrFail(`lnsFieldListPanelField-${field}`);
    },

    async waitForMissingDataViewWarning() {
      await retry.try(async () => {
        await testSubjects.existOrFail(`missing-refs-failure`);
      });
    },

    async waitForMissingDataViewWarningDisappear() {
      await retry.try(async () => {
        await testSubjects.missingOrFail(`missing-refs-failure`);
      });
    },

    async waitForEmptyWorkspace() {
      await retry.try(async () => {
        await testSubjects.existOrFail(`workspace-drag-drop-prompt`);
      });
    },

    async waitForWorkspaceWithApplyChangesPrompt() {
      await retry.try(async () => {
        await testSubjects.existOrFail(`workspace-apply-changes-prompt`);
      });
    },

    async waitForDatatableVisualization() {
      await retry.try(async () => {
        await testSubjects.existOrFail(`lnsVisualizationContainer`);
      });
    },

    async waitForFieldMissing(field: string) {
      await retry.try(async () => {
        await testSubjects.missingOrFail(`lnsFieldListPanelField-${field}`);
      });
    },

    async pressMetaKey(metaKey: 'shift' | 'alt' | 'ctrl') {
      const metaToAction = {
        shift: 'duplicate',
        alt: 'swap',
        ctrl: 'combine',
      };
      const waitTime = 1000;
      log.debug(`Wait ${waitTime}ms for the extra dop options to show up`);
      await setTimeoutAsync(waitTime);
      const browserKey =
        metaKey === 'shift'
          ? browser.keys.SHIFT
          : metaKey === 'alt'
          ? browser.keys.ALT
          : browser.keys.COMMAND;
      log.debug(`Press ${metaKey} with keyboard`);
      await retry.try(async () => {
        await browser.pressKeys(browserKey);
        await find.byCssSelector(
          `.domDroppable__extraTarget > [data-test-subj="domDragDrop-dropTarget-${metaToAction[metaKey]}"].domDroppable--hover`
        );
      });
    },

    /**
     * Copies field to chosen destination that is defined by distance of `steps`
     * (right arrow presses) from it
     *
     * @param fieldName  - the desired field for the dimension
     * @param steps - number of steps user has to press right
     * @param reverse - defines the direction of going through drops
     * */
    async dragFieldWithKeyboard(
      fieldName: string,
      steps = 1,
      reverse = false,
      metaKey?: 'shift' | 'alt' | 'ctrl'
    ) {
      const field = await find.byCssSelector(
        `[data-attr-field="${fieldName}"] [data-test-subj="lnsDragDrop-keyboardHandler"]`
      );
      await field.focus();
      await retry.try(async () => {
        await browser.pressKeys(browser.keys.ENTER);
        await testSubjects.exists('.domDroppable--active'); // checks if we're in dnd mode and there's any drop target active
      });
      for (let i = 0; i < steps; i++) {
        await browser.pressKeys(reverse ? browser.keys.LEFT : browser.keys.RIGHT);
      }
      if (metaKey) {
        await this.pressMetaKey(metaKey);
      }
      await browser.pressKeys(browser.keys.ENTER);
      await this.waitForLensDragDropToFinish();

      await header.waitUntilLoadingHasFinished();
    },

    /**
     * Selects draggable element and moves it by number of `steps`
     *
     * @param group  - the group of the element
     * @param index  - the index of the element in the group
     * @param steps - number of steps of presses right or left
     * @param reverse - defines the direction of going through drops
     * */
    async dimensionKeyboardDragDrop(
      group: string,
      index = 0,
      steps = 1,
      reverse = false,
      metaKey?: 'shift' | 'alt' | 'ctrl'
    ) {
      const elements = await find.allByCssSelector(
        `[data-test-subj="${group}"] [data-test-subj="lnsDragDrop-keyboardHandler"]`
      );
      const el = elements[index];
      await el.focus();
      await browser.pressKeys(browser.keys.ENTER);
      for (let i = 0; i < steps; i++) {
        // This needs to be slowed down to avoid flakiness
        await common.sleep(200);
        await browser.pressKeys(reverse ? browser.keys.LEFT : browser.keys.RIGHT);
      }
      if (metaKey) {
        await this.pressMetaKey(metaKey);
      }

      await common.sleep(200);
      await browser.pressKeys(browser.keys.ENTER);

      await this.waitForLensDragDropToFinish();
      await header.waitUntilLoadingHasFinished();
    },
    /**
     * Selects draggable element and reorders it by number of `steps`
     *
     * @param group  - the group of the element
     * @param index  - the index of the element in the group
     * @param steps - number of steps of presses right or left
     * @param reverse - defines the direction of going through drops
     * */
    async dimensionKeyboardReorder(group: string, index = 0, steps = 1, reverse = false) {
      const elements = await find.allByCssSelector(
        `[data-test-subj="${group}"]  [data-test-subj="lnsDragDrop-keyboardHandler"]`
      );
      const el = elements[index];
      await el.focus();
      await browser.pressKeys(browser.keys.ENTER);
      for (let i = 0; i < steps; i++) {
        // This needs to be slowed down to avoid flakiness
        await common.sleep(200);
        await browser.pressKeys(reverse ? browser.keys.ARROW_UP : browser.keys.ARROW_DOWN);
      }

      await common.sleep(200);
      await browser.pressKeys(browser.keys.ENTER);

      await this.waitForLensDragDropToFinish();
      await header.waitUntilLoadingHasFinished();
    },

    async waitForLensDragDropToFinish() {
      await find.waitForDeletedByCssSelector('.domDragDrop-isActiveGroup');
    },

    /**
     * Drags field to dimension trigger
     *
     * @param field  - the desired field for the dimension
     * @param dimension - the selector of the dimension being changed
     * */
    async dragFieldToDimensionTrigger(field: string, dimension: string) {
      const from = `lnsFieldListPanelField-${field}`;
      await find.existsByCssSelector(from);
      await browser.html5DragAndDrop(
        testSubjects.getCssSelector(from),
        testSubjects.getCssSelector(dimension)
      );
      await this.waitForLensDragDropToFinish();
      await header.waitUntilLoadingHasFinished();
    },

    /**
     * Drags from a dimension to another dimension trigger
     *
     * @param from - the selector of the dimension being moved
     * @param to - the selector of the dimension being dropped to
     * */
    async dragDimensionToDimension({ from, to }: { from: string; to: string }) {
      await find.existsByCssSelector(from);
      await find.existsByCssSelector(to);
      await browser.html5DragAndDrop(
        testSubjects.getCssSelector(from),
        testSubjects.getCssSelector(to)
      );
      await this.waitForLensDragDropToFinish();
      await header.waitUntilLoadingHasFinished();
    },

    /**
     * Reorder elements within the group
     *
     * @param startIndex - the index of dragging element starting from 1
     * @param endIndex - the index of drop starting from 1
     * */
    async reorderDimensions(dimension: string, startIndex: number, endIndex: number) {
      const dragging = `[data-test-subj='${dimension}']:nth-of-type(${startIndex}) .domDraggable`;
      const dropping = `[data-test-subj='${dimension}']:nth-of-type(${endIndex}) [data-test-subj='lnsDragDrop-reorderableDropLayer'`;
      await find.existsByCssSelector(dragging);
      await browser.html5DragAndDrop(dragging, dropping);
      await this.waitForLensDragDropToFinish();
      await header.waitUntilLoadingHasFinished();
    },

    async assertPalette(paletteId: string, isLegacy: boolean) {
      await retry.try(async () => {
        await testSubjects.click('lns_colorEditing_trigger');
        // open the palette picker
        if (isLegacy) {
          await testSubjects.click('lns-palettePicker');
        } else {
          await testSubjects.click('kbnColoring_ColorMapping_PalettePicker');
        }
        const currentPalette = await (
          await find.byCssSelector('[role=option][aria-selected=true]')
        ).getAttribute('id');
        // close the palette picker
        if (isLegacy) {
          await testSubjects.click('lns-palettePicker');
        } else {
          await testSubjects.click('kbnColoring_ColorMapping_PalettePicker');
        }
        expect(currentPalette).to.equal(paletteId);
        await this.closePaletteEditor();
      });
    },

    async toggleToolbarPopover(buttonTestSub: string) {
      await testSubjects.click(buttonTestSub);
    },

    /**
     * Open the specified dimension.
     *
     * @param dimension - the selector of the dimension panel to open
     * @param layerIndex - the index of the layer
     */
    async openDimensionEditor(dimension: string, layerIndex = 0, dimensionIndex = 0) {
      await retry.try(async () => {
        const dimensionEditor = (
          await testSubjects.findAll(`lns-layerPanel-${layerIndex} > ${dimension}`, 1000)
        )[dimensionIndex];
        await dimensionEditor.click();
      });
    },

    /**
     * Perform the specified layer action
     */
    async performLayerAction(testSubject: string, layerIndex = 0) {
      await retry.try(async () => {
        // Hover over the tab to make the layer actions button visible
        const tabs = await find.allByCssSelector('[data-test-subj^="unifiedTabs_tab_"]', 1000);
        if (tabs[layerIndex]) {
          await tabs[layerIndex].moveMouseTo();
        }
        await testSubjects.click(`lnsLayerSplitButton--${layerIndex}`);
        await testSubjects.click(testSubject);
      });
    },

    async isDimensionEditorOpen() {
      return await testSubjects.exists('lns-indexPattern-dimensionContainerBack');
    },

    // closes the dimension editor flyout
    async closeDimensionEditor() {
      await retry.try(async () => {
        await browser.execute(() => {
          const btn = document.querySelector(
            '[data-test-subj="lns-indexPattern-dimensionContainerClose"]'
          ) as HTMLElement;
          if (btn) btn.click();
        });
        await testSubjects.missingOrFail('lns-indexPattern-dimensionContainerClose');
      });
    },

    async selectOperation(operation: string, isPreviousIncompatible: boolean = false) {
      const operationSelector = isPreviousIncompatible
        ? `lns-indexPatternDimension-${operation} incompatible`
        : `lns-indexPatternDimension-${operation}`;
      async function getAriaPressed() {
        const operationSelectorContainer = await testSubjects.find(operationSelector);
        await testSubjects.click(operationSelector);
        const ariaPressed = await operationSelectorContainer.getAttribute('aria-pressed');
        return ariaPressed;
      }

      // adding retry here as it seems that there is a flakiness of the operation click
      // it seems that the aria-pressed attribute is updated to true when the button is clicked
      await retry.waitFor('aria pressed to be true', async () => {
        const ariaPressedStatus = await getAriaPressed();
        return ariaPressedStatus === 'true';
      });
    },

    async enableTimeShift() {
      await testSubjects.click('indexPattern-advanced-accordion');
    },

    async setTimeShift(shift: string) {
      await comboBox.setCustom('indexPattern-dimension-time-shift', shift);
    },

    async enableFilter() {
      await testSubjects.click('indexPattern-advanced-accordion');
      await retry.try(async () => {
        await testSubjects.click('indexPattern-filters-existingFilterTrigger');
      });
    },

    async setFilterBy(queryString: string) {
      await this.typeFilter(queryString);
      await retry.try(async () => {
        await testSubjects.click('indexPattern-filters-existingFilterTrigger');
      });
    },

    async typeFilter(queryString: string) {
      const queryInput = await testSubjects.find('indexPattern-filters-queryStringInput');
      await queryInput.type(queryString);
    },

    async hasFixAction() {
      return await testSubjects.exists('errorFixAction');
    },

    async useFixAction() {
      await testSubjects.click('errorFixAction');
      await this.waitForVisualization();
    },

    async dragRangeInput(testId: string, steps: number = 1, direction: 'left' | 'right' = 'right') {
      const inputEl = await testSubjects.find(testId);
      await inputEl.focus();
      const browserKey = direction === 'left' ? browser.keys.LEFT : browser.keys.RIGHT;
      while (steps--) {
        await browser.pressKeys(browserKey);
      }
    },

    async getRangeInputValue(testId: string) {
      return (await testSubjects.find(testId)).getAttribute('value');
    },

    async isTopLevelAggregation() {
      return await testSubjects.isEuiSwitchChecked('indexPattern-nesting-switch');
    },
    /**
     * Cen remove the dimension matching a specific test subject?
     */
    async canRemoveDimension(dimensionTestSubj: string) {
      await testSubjects.moveMouseTo(`${dimensionTestSubj} > indexPattern-dimension-remove`);
      return await testSubjects.isDisplayed(`${dimensionTestSubj} > indexPattern-dimension-remove`);
    },
    /**
     * Removes the dimension matching a specific test subject
     */
    async removeDimension(dimensionTestSubj: string) {
      await testSubjects.moveMouseTo(`${dimensionTestSubj} > indexPattern-dimension-remove`);
      await testSubjects.click(`${dimensionTestSubj} > indexPattern-dimension-remove`);
    },
    /**
     * adds new filter to filters agg
     */
    async addFilterToAgg(queryString: string) {
      await testSubjects.click('lns-newBucket-add');
      await this.typeFilter(queryString);
      // Problem here is that after typing in the queryInput a dropdown will fetch the server
      // with suggestions and show up. Depending on the cursor position and some other factors
      // pressing Enter at this point may lead to auto-complete the queryInput with random stuff from the
      // dropdown which was not intended originally.
      // To close the Filter popover we need to move to the label input and then press Enter:
      // solution is to press Tab 3 tims (first Tab will close the dropdown) instead of Enter to avoid
      // race condition with the dropdown
      await common.pressTabKey();
      await common.pressTabKey();
      await common.pressTabKey();
      // Now it is safe to press Enter as we're in the label input
      await common.pressEnterKey();
      await common.sleep(1000); // give time for debounced components to rerender
    },

    /**
     * Add new term to Top values/terms agg
     * @param opts field to add
     */
    async addTermToAgg(field: string) {
      const lastIndex = (
        await find.allByCssSelector('[data-test-subj^="indexPattern-dimension-field"]')
      ).length;
      await retry.try(async () => {
        await testSubjects.click('indexPattern-terms-add-field');
        await this.selectOptionFromComboBox(`indexPattern-dimension-field-${lastIndex}`, field);
      });
    },
    async getNumericFieldReady(testSubj: string) {
      const numericInput = await find.byCssSelector(
        `input[data-test-subj="${testSubj}"][type='number']`
      );
      await numericInput.click();
      await numericInput.clearValue();
      return numericInput;
    },

    async setTermsNumberOfValues(value: number) {
      const valuesInput = await this.getNumericFieldReady('indexPattern-terms-values');
      await valuesInput.type(`${value}`);
      await common.sleep(500);
    },

    async checkTermsAreNotAvailableToAgg(fields: string[]) {
      const lastIndex = (
        await find.allByCssSelector('[data-test-subj^="indexPattern-dimension-field"]')
      ).length;
      await retry.waitFor('check for field combobox existance', async () => {
        await testSubjects.click('indexPattern-terms-add-field');
        const comboboxExists = await testSubjects.exists(
          `indexPattern-dimension-field-${lastIndex}`
        );
        return comboboxExists === true;
      });
      // count the number of defined terms
      const target = await testSubjects.find(`indexPattern-dimension-field-${lastIndex}`);
      for (const field of fields) {
        await comboBox.setCustom(`indexPattern-dimension-field-${lastIndex}`, field);
        await comboBox.openOptionsList(target);
        await testSubjects.missingOrFail(`lns-fieldOption-${field}`);
      }
    },
    async saveModal(
      title: string,
      saveAsNew?: boolean,
      redirectToOrigin?: boolean,
      saveToLibrary?: boolean,
      addToDashboard?: 'new' | 'existing' | null,
      dashboardId?: string,
      description?: string
    ) {
      await timeToVisualize.setSaveModalValues(title, {
        saveAsNew,
        redirectToOrigin,
        addToDashboard: addToDashboard ? addToDashboard : null,
        dashboardId,
        saveToLibrary,
        description,
      });

      await testSubjects.click('confirmSaveSavedObjectButton');
      await retry.waitForWithTimeout('Save modal to disappear', 5000, () =>
        testSubjects
          .missingOrFail('confirmSaveSavedObjectButton')
          .then(() => true)
          .catch(() => false)
      );
    },

    /**
     * Save the current Lens visualization.
     */
    async save(
      title: string,
      saveAsNew?: boolean,
      redirectToOrigin?: boolean,
      saveToLibrary?: boolean,
      addToDashboard?: 'new' | 'existing' | null,
      dashboardId?: string,
      description?: string
    ) {
      await header.waitUntilLoadingHasFinished();
      await testSubjects.click('lnsApp_saveButton');

      await this.saveModal(
        title,
        saveAsNew,
        redirectToOrigin,
        saveToLibrary,
        addToDashboard,
        dashboardId,
        description
      );
    },

    async saveAndReturn() {
      await testSubjects.click('lnsApp_saveAndReturnButton');
    },

    async replaceInDashboard() {
      await testSubjects.click('lnsApp_replaceInDashboardButton');
    },

    async expectSaveAndReturnButtonDisabled() {
      const button = await testSubjects.find('lnsApp_saveAndReturnButton', 10000);
      const disabledAttr = await button.getAttribute('disabled');
      expect(disabledAttr).to.be('true');
    },

    async editDimensionLabel(label: string) {
      await testSubjects.setValue('name-input', label, { clearWithKeyboard: true });
    },
    async editDimensionFormat(format: string, options?: { decimals?: number; prefix?: string }) {
      await this.selectOptionFromComboBox('indexPattern-dimension-format', format);
      if (options?.decimals != null) {
        await testSubjects.setValue('indexPattern-dimension-formatDecimals', `${options.decimals}`);
        // press tab key to remove the range popover of the EUI field
        await common.pressTabKey();
      }
      if (options?.prefix != null) {
        await testSubjects.setValue('indexPattern-dimension-formatSuffix', options.prefix);
      }
    },
    async editDimensionColor(color: string) {
      const colorPickerInput = await testSubjects.find('~indexPattern-dimension-colorPicker');
      await colorPickerInput.type(color);
      await common.sleep(1000); // give time for debounced components to rerender
    },
    async hasStyleToolbarButton() {
      return find.existsByCssSelector('button[data-test-subj="style"]');
    },
    async hasLegendToolbarButton() {
      return find.existsByCssSelector('button[data-test-subj="legend"]');
    },
    async openStyleSettingsFlyout() {
      // Close dimension editor flyout
      if (await this.isDimensionEditorOpen()) {
        await this.closeDimensionEditor();
      }

      await find.clickByCssSelector('button[data-test-subj="style"]');
      await retry.try(async () => {
        await find.byCssSelector('#lnsDimensionContainerTitle');
      });
    },

    async openLegendSettingsFlyout() {
      // Close dimension editor flyout
      if (await this.isDimensionEditorOpen()) {
        await this.closeDimensionEditor();
      }

      if (await this.hasLegendToolbarButton()) {
        const button = await find.byCssSelector('button[data-test-subj="legend"]');
        await button.click();
      }
    },
    async closeFlyoutWithBackButton() {
      await retry.try(async () => {
        if (await testSubjects.exists('lns-indexPattern-dimensionContainerBack')) {
          await testSubjects.click('lns-indexPattern-dimensionContainerBack');
          await testSubjects.missingOrFail('lns-indexPattern-dimensionContainerBack');
        }
      });
    },

    async retrySetValue(
      input: string,
      value: string,
      options = {
        clearWithKeyboard: true,
        typeCharByChar: true,
      } as Record<string, boolean>
    ) {
      await retry.try(async () => {
        await testSubjects.setValue(input, value, options);
        expect(await (await testSubjects.find(input)).getAttribute('value')).to.eql(value);
      });
    },
    async setCurvedLines(option: XYCurveType) {
      await testSubjects.click('lnsCurveStyleSelect');
      const optionSelector = await find.byCssSelector(`#${option}`);
      await optionSelector.click();
    },
    async editMissingValues(option: FittingFunction) {
      await testSubjects.click('lnsMissingValuesSelect');
      const optionSelector = await find.byCssSelector(`#${option}`);
      await optionSelector.click();
    },

    getTitle() {
      return testSubjects.getAttribute('lns_ChartTitle', 'innerText');
    },

    async getFiltersAggLabels() {
      const labels = [];
      const filters = await testSubjects.findAll('indexPattern-filters-existingFilterContainer');
      for (let i = 0; i < filters.length; i++) {
        labels.push(await filters[i].getVisibleText());
      }
      log.debug(`Found ${labels.length} filters on current page`);
      return labels;
    },

    /**
     * Uses the Lens visualization switcher to switch visualizations.
     *
     * @param subVisualizationId - the ID of the sub-visualization to switch to, such as
     * lnsDatatable or bar
     */
    async switchToVisualization(subVisualizationId: string, searchTerm?: string, layerIndex = 0) {
      await this.openChartSwitchPopover(layerIndex);
      await this.waitForSearchInputValue(subVisualizationId, searchTerm);
      await testSubjects.click(`lnsChartSwitchPopover_${subVisualizationId}`);
      await header.waitUntilLoadingHasFinished();
    },
    async waitForSearchInputValue(subVisualizationId: string, searchTerm?: string) {
      await retry.try(async () => {
        await this.searchOnChartSwitch(subVisualizationId, searchTerm);
        await common.sleep(1000); // give time for the value to be typed
        const searchInputValue = await testSubjects.getAttribute('lnsChartSwitchSearch', 'value');
        const queryTerm = searchTerm ?? subVisualizationId.substring(subVisualizationId.length - 3);
        if (searchInputValue !== queryTerm) {
          throw new Error('Search input value is not the expected value');
        }
      });
    },

    async switchToVisualizationSubtype(subType: string, layerIndex: number = 0) {
      if (!(await testSubjects.exists(`lns-layerPanel-${layerIndex} > lnsStackingOptionsButton`))) {
        throw new Error('No subtype available for the current visualization');
      }
      await testSubjects.click(`lns-layerPanel-${layerIndex} > lnsStackingOptionsButton`);
      await testSubjects.click(`lnsStackingOptionsButton${subType}`);
    },

    async getChartTypeFromChartSwitcher() {
      const chartSwitcher = await testSubjects.find('lnsChartSwitchPopover');
      return await chartSwitcher.getVisibleText();
    },

    async openChartSwitchPopover(layerIndex = 0) {
      await this.ensureLayerTabIsActive(layerIndex);

      if (await testSubjects.exists('lnsChartSwitchList', { timeout: 200 })) {
        return;
      }
      await retry.try(async () => {
        const allChartSwitches = await testSubjects.findAll('lnsChartSwitchPopover');
        expect(allChartSwitches.length).to.be(1);
        await allChartSwitches[0].click();
        await testSubjects.existOrFail('lnsChartSwitchList', { timeout: 5000 });
      });
    },

    async changeAxisSide(newSide: string) {
      await testSubjects.click(`lnsXY_axisSide_groups_${newSide}`);
    },

    async getSelectedAxisSide() {
      return retry.try(async () => {
        const axisSideGroups = await find.allByCssSelector(
          `[data-test-subj^="lnsXY_axisSide_groups_"]`
        );
        for (const axisSideGroup of axisSideGroups) {
          const ariaPressed = await axisSideGroup.getAttribute('aria-pressed');
          const isSelected = ariaPressed === 'true';
          if (isSelected) {
            const text = await axisSideGroup.getVisibleText();
            if (!text) {
              throw new Error('Axis side button text not yet rendered');
            }
            return text;
          }
        }
        throw new Error('No axis side button is selected');
      });
    },

    async getDonutHoleSize() {
      await this.openStyleSettingsFlyout();

      const comboboxOptions = await comboBox.getComboBoxSelectedOptions('lnsEmptySizeRatioOption');
      return comboboxOptions[0];
    },

    async setDonutHoleSize(value: string) {
      await this.openStyleSettingsFlyout();
      await comboBox.set('lnsEmptySizeRatioOption', value);
      await this.closeFlyoutWithBackButton();
    },

    async setGaugeShape(value: string) {
      await this.openStyleSettingsFlyout();
      await comboBox.set('lnsToolbarGaugeAngleType > comboBoxInput', value);
      await this.closeFlyoutWithBackButton();
    },

    async setGaugeOrientation(value: 'horizontal' | 'vertical') {
      await this.openStyleSettingsFlyout();
      await testSubjects.click(`lns_gaugeOrientation_${value}Bullet`);
      await this.closeFlyoutWithBackButton();
    },

    async getSelectedBarOrientationSetting() {
      await retry.waitFor('visual options are displayed', async () => {
        await this.openStyleSettingsFlyout();
        return await testSubjects.exists('lns_barOrientation');
      });
      const orientationButtons = await find.allByCssSelector(
        `[data-test-subj^="lns_barOrientation_"]`
      );
      for (const button of orientationButtons) {
        const ariaPressed = await button.getAttribute('aria-pressed');
        const isSelected = ariaPressed === 'true';
        if (isSelected) {
          return button?.getVisibleText();
        }
      }
    },

    async getGaugeOrientationSetting() {
      const orientationButtons = await find.allByCssSelector(
        `[data-test-subj^="lns_gaugeOrientation_"]`
      );
      for (const button of orientationButtons) {
        const ariaPressed = await button.getAttribute('aria-pressed');
        const isSelected = ariaPressed === 'true';
        if (isSelected) {
          return button?.getVisibleText();
        }
      }
    },

    /** Counts the visible warnings in the config panel */
    async getWorkspaceErrorCount() {
      const workspaceErrorsExists = await testSubjects.exists('lnsWorkspaceErrors');
      if (!workspaceErrorsExists) {
        return 0;
      }

      const paginationControlExists = await testSubjects.exists(
        'lnsWorkspaceErrorsPaginationControl'
      );
      if (!paginationControlExists) {
        // pagination control only displayed when there are multiple errors
        return 1;
      }

      const paginationControl = await testSubjects.find('lnsWorkspaceErrorsPaginationControl');
      const paginationItems = await paginationControl.findAllByCssSelector('.euiPagination__item');
      return paginationItems.length;
    },

    async searchOnChartSwitch(subVisualizationId: string, searchTerm?: string) {
      // Because the new chart switcher is now a virtualized list, the process needs some help
      // So either pass a search string or pick the last 3 letters from the id (3 because pie
      // is the smallest chart name) and use them to search
      const queryTerm = searchTerm ?? subVisualizationId.substring(subVisualizationId.length - 3);
      return await testSubjects.setValue('lnsChartSwitchSearch', queryTerm, {
        clearWithKeyboard: true,
      });
    },

    /**
     * Checks a specific subvisualization in the chart switcher for a "data loss" indicator
     *
     * @param subVisualizationId - the ID of the sub-visualization to switch to, such as
     * lnsDatatable or bar
     */
    async hasChartSwitchWarning(subVisualizationId: string, searchTerm?: string) {
      await this.openChartSwitchPopover();
      await this.searchOnChartSwitch(subVisualizationId, searchTerm);
      const element = await testSubjects.find(`lnsChartSwitchPopover_${subVisualizationId}`);
      return await testSubjects.descendantExists(
        `lnsChartSwitchPopoverAlert_${subVisualizationId}`,
        element
      );
    },

    /**
     * Returns the layer vis type from chart switch label
     */
    async getLayerType() {
      const switchPopovers = await find.allByCssSelector(
        `[data-test-subj^="lnsChartSwitchPopover"]`
      );
      expect(switchPopovers.length).to.be(1);
      return await switchPopovers[0].getVisibleText();
    },

    /**
     * Adds a new layer to the chart, fails if the chart does not support new layers
     */
    async createLayer(
      layerType: 'data' | 'referenceLine' | 'annotations' = 'data',
      annotationFromLibraryTitle?: string,
      seriesType = 'bar'
    ) {
      await testSubjects.click('lnsLayerAddButton');
      const tabs = await find.allByCssSelector('[data-test-subj^="unifiedTabs_tab_"]', 1000);
      const layerCount = tabs.length;

      await retry.waitFor('check for layer type support', async () => {
        const fasterChecks = await Promise.all([
          (await find.allByCssSelector(`[data-test-subj^="lns-layerPanel-"]`, 1000)).length >
            layerCount,
          testSubjects.exists(`lnsLayerAddButton-${layerType}`),
        ]);
        return fasterChecks.filter(Boolean).length > 0;
      });

      if (await testSubjects.exists(`lnsLayerAddButton-${layerType}`)) {
        await testSubjects.click(`lnsLayerAddButton-${layerType}`);
        if (layerType === 'data') {
          await testSubjects.click(`lnsXY_seriesType-${seriesType}`);
        }
        if (layerType === 'annotations') {
          if (!annotationFromLibraryTitle) {
            await testSubjects.click('lnsAnnotationLayer_new');
          } else {
            await testSubjects.click('lnsAnnotationLayer_addFromLibrary');
            await testSubjects.click(
              `savedObjectTitle${annotationFromLibraryTitle.split(' ').join('-')}`
            );
          }
        }
      }
    },

    async duplicateLayer(index: number = 0) {
      await retry.try(async () => {
        // Hover over the tab to make the layer actions button visible
        const tabs = await find.allByCssSelector('[data-test-subj^="unifiedTabs_tab_"]', 1000);
        if (tabs[index]) {
          await tabs[index].moveMouseTo();
        }
        if (await testSubjects.exists(`lnsLayerSplitButton--${index}`)) {
          await testSubjects.click(`lnsLayerSplitButton--${index}`);
        }
        await testSubjects.click(`lnsLayerClone--${index}`);
      });
    },

    /**
     * Changes the index pattern in the data panel
     */
    async switchDataPanelIndexPattern(dataViewTitle: string) {
      await unifiedSearch.switchDataView('lns-dataView-switch-link', dataViewTitle);
      await header.waitUntilLoadingHasFinished();
    },

    /**
     * Changes the index pattern for the first layer
     */
    async switchFirstLayerIndexPattern(dataViewTitle: string) {
      await unifiedSearch.switchDataView('lns_layerIndexPatternLabel', dataViewTitle);
      await header.waitUntilLoadingHasFinished();
    },

    /**
     * Returns the current index pattern of the first layer
     */
    async getFirstLayerIndexPattern() {
      return await unifiedSearch.getSelectedDataView('lns_layerIndexPatternLabel');
    },

    async linkedToOriginatingApp() {
      await header.waitUntilLoadingHasFinished();
      await testSubjects.existOrFail('lnsApp_saveAndReturnButton');
    },

    async notLinkedToOriginatingApp() {
      await header.waitUntilLoadingHasFinished();
      await testSubjects.missingOrFail('lnsApp_saveAndReturnButton');
    },

    /**
     * Gets label of dimension trigger in dimension panel
     *
     * @param dimension - the selector of the dimension
     * @param index - the index of the dimension trigger in group
     */
    async getDimensionTriggerText(dimension: string, index = 0, isTextBased: boolean = false) {
      const dimensionTexts = await this.getDimensionTriggersTexts(dimension, isTextBased);
      return dimensionTexts[index];
    },
    /**
     * Gets label of all dimension triggers in an element
     *
     * @param dimension - the selector of the dimension
     */
    async getDimensionTriggersTexts(dimension: string, isTextBased: boolean = false) {
      return retry.try(async () => {
        const dimensionElements = await testSubjects.findAll(
          `${dimension} > lns-dimensionTrigger${isTextBased ? '-textBased' : ''}`
        );
        const dimensionTexts = await Promise.all(
          await dimensionElements.map(async (el) => await el.getVisibleText())
        );
        return dimensionTexts;
      });
    },

    async isShowingNoResults() {
      return (
        (await (await testSubjects.find('lnsWorkspace')).getVisibleText()) === 'No results found'
      );
    },

    async getCurrentChartDebugState(visType: string): Promise<DebugState> {
      await this.waitForVisualization(visType);
      return (await elasticChart.getChartDebugData('lnsWorkspace'))!;
    },

    /**
     * Gets text of the specified datatable header cell
     *
     * @param index - index of th element in datatable
     * @param addRowNumberColumn - when true, increments the column number to ignore row number column
     */
    async getDatatableHeaderText(index = 0, addRowNumberColumn?: boolean) {
      const el = await this.getDatatableHeader(index, addRowNumberColumn);
      return el.getVisibleText();
    },

    async getCurrentChartDebugStateForVizType(visType: string) {
      await this.waitForVisualization(visType);
      return await elasticChart.getChartDebugData(visType);
    },

    /**
     * Gets text of the specified datatable cell
     *
     * @param rowIndex - index of row of the cell
     * @param colIndex - index of column of the cell
     * @param addRowNumberColumn - when true, increments the column number to ignore row number column
     */
    async getDatatableCellText(rowIndex = 0, colIndex = 0, addRowNumberColumn?: boolean) {
      const el = await this.getDatatableCell(rowIndex, colIndex, addRowNumberColumn);
      return el.getVisibleText();
    },

    async getStylesFromCell(el: WebElementWrapper) {
      const styleString = (await el.getAttribute('style')) ?? '';
      return styleString.split(';').reduce<Record<string, string>>((memo, cssLine) => {
        const [prop, value] = cssLine.split(':');
        if (prop && value) {
          memo[prop.trim()] = value.trim();
        }
        return memo;
      }, {});
    },

    async getDatatableCellStyle(rowIndex = 0, colIndex = 0) {
      const el = await this.getDatatableCell(rowIndex, colIndex);
      return this.getStylesFromCell(el);
    },

    async getDatatableCellSpanStyle(rowIndex = 0, colIndex = 0) {
      const el = await (await this.getDatatableCell(rowIndex, colIndex)).findByCssSelector('span');
      const styleString = (await el.getAttribute('style')) ?? '';
      return styleString.split(';').reduce<Record<string, string>>((memo, cssLine) => {
        const [prop, value] = cssLine.split(':');
        if (prop && value) {
          memo[prop.trim()] = value.trim();
        }
        return memo;
      }, {});
    },

    async getCountOfDatatableColumns() {
      const table = await find.byCssSelector('.euiDataGrid');
      const $ = await table.parseDomContent();
      return (await $('.euiDataGridHeaderCell__content')).length;
    },

    async getDatatableHeader(index = 0, addRowNumberColumn: boolean = true) {
      log.debug(`All headers ${await testSubjects.getVisibleText('dataGridHeader')}`);
      return find.byCssSelector(
        `[data-test-subj="lnsDataTable"] [data-test-subj="dataGridHeader"] [role=columnheader]:nth-child(${
          index + 1 + (addRowNumberColumn ? 1 : 0)
        })`
      );
    },

    async getDatatableCell(rowIndex = 0, colIndex = 0, addRowNumberColumn: boolean = true) {
      return await find.byCssSelector(
        `[data-test-subj="lnsDataTable"] [data-test-subj="dataGridRowCell"][data-gridcell-column-index="${
          colIndex + (addRowNumberColumn ? 1 : 0)
        }"][data-gridcell-visible-row-index="${rowIndex}"]`
      );
    },

    async getDatatableCellsByColumn(colIndex = 1) {
      return await find.allByCssSelector(
        `[data-test-subj="lnsDataTable"] [data-test-subj="dataGridRowCell"][data-gridcell-column-index="${colIndex}"]`
      );
    },

    async isDatatableHeaderSorted(index = 1) {
      return find.existsByCssSelector(
        `[data-test-subj="lnsDataTable"] [data-test-subj="dataGridHeader"] [role=columnheader]:nth-child(${
          index + 1
        }) [data-test-subj^="dataGridHeaderCellSortingIcon"]`
      );
    },

    async changeTableSortingBy(colIndex = 0, direction: 'ascending' | 'descending') {
      const el = await this.getDatatableHeader(colIndex);
      await el.moveMouseTo({ xOffset: 0, yOffset: -16 }); // Prevent the first data row's cell actions from overlapping/intercepting the header click
      const popoverToggle = await el.findByClassName('euiDataGridHeaderCell__button');
      await popoverToggle.click();
      const buttonEl = await find.byCssSelector(
        `[data-test-subj^="dataGridHeaderCellActionGroup"] [title="Sort ${direction}"]`
      );
      return buttonEl.click();
    },

    async setTableSummaryRowFunction(
      summaryFunction: 'none' | 'sum' | 'avg' | 'count' | 'min' | 'max'
    ) {
      await testSubjects.click('lnsDatatable_summaryrow_function');
      await testSubjects.click('lns-datatable-summary-' + summaryFunction);
    },

    async setTableSummaryRowLabel(newLabel: string) {
      await testSubjects.setValue('lnsDatatable_summaryrow_label', newLabel, {
        clearWithKeyboard: true,
        typeCharByChar: true,
      });
    },

    async setTableDynamicColoring(coloringType: 'none' | 'cell' | 'text' | 'badge') {
      const label = coloringType.charAt(0).toUpperCase() + coloringType.slice(1);
      await this.selectOptionFromComboBox('lnsDatatable_dynamicColoring_groups', label);
    },

    async openPalettePanel() {
      await retry.try(async () => {
        await testSubjects.click(`lns_colorEditing_trigger`);
        // wait for the UI to settle
        await common.sleep(100);
        await testSubjects.existOrFail('lns-palettePanelFlyout', {
          timeout: 2500,
        });
      });
    },

    async closePalettePanel() {
      await testSubjects.click('lns-indexPattern-SettingWithSiblingFlyoutBack');
    },

    // different picker from the next one
    async changePaletteTo(paletteName: string) {
      await testSubjects.click(`lnsPalettePanel_dynamicColoring_palette_picker`);
      await testSubjects.click(`${paletteName}-palette`);
    },

    async setPalette(paletteId: string, isLegacy: boolean) {
      await testSubjects.click('lns_colorEditing_trigger');
      // This action needs to be slowed WAY down, otherwise it will not correctly set the palette
      await common.sleep(200);
      await testSubjects.setEuiSwitch(
        'lns_colorMappingOrLegacyPalette_switch',
        isLegacy ? 'check' : 'uncheck'
      );

      await common.sleep(200);

      if (isLegacy) {
        await testSubjects.click('lns-palettePicker');
        await find.clickByCssSelector(`#${paletteId}`);
      } else {
        await testSubjects.click('kbnColoring_ColorMapping_PalettePicker');
        await testSubjects.click(`kbnColoring_ColorMapping_Palette-${paletteId}`);
      }
      await common.sleep(200);

      await this.closePaletteEditor();
    },

    async closePaletteEditor() {
      await retry.try(async () => {
        await testSubjects.click('lns-indexPattern-SettingWithSiblingFlyoutBack');
        await testSubjects.missingOrFail('lns-indexPattern-SettingWithSiblingFlyoutBack');
      });
    },

    async openColorStopPopup(index = 0) {
      const stopEls = await testSubjects.findAll('euiColorStopThumb');
      if (stopEls[index]) {
        await stopEls[index].click();
      }
    },

    async setColorStopValue(value: number | string) {
      await testSubjects.setValue(
        'lnsPalettePanel_dynamicColoring_progression_custom_stops_value',
        String(value)
      );
    },

    async openLayerContextMenu(index: number = 0) {
      // Hover over the tab to make the layer actions button visible
      const tabs = await find.allByCssSelector('[data-test-subj^="unifiedTabs_tab_"]', 1000);
      if (tabs[index]) {
        await tabs[index].moveMouseTo();
      }
      await testSubjects.click(`lnsLayerSplitButton--${index}`);
    },

    async toggleColumnVisibility(dimension: string, no = 1) {
      await this.openDimensionEditor(dimension);
      const id = 'lns-table-column-hidden';
      await common.sleep(500);
      const isChecked = await testSubjects.isEuiSwitchChecked(id);
      log.debug(`switch status before the toggle = ${isChecked}`);
      await testSubjects.setEuiSwitch(id, isChecked ? 'uncheck' : 'check');
      await common.sleep(500);
      const isChecked2 = await testSubjects.isEuiSwitchChecked(id);
      log.debug(`switch status after the toggle = ${isChecked2}`);
      await this.closeDimensionEditor();
      await common.sleep(500);
      await header.waitUntilLoadingHasFinished();
    },

    async clickTableCellAction(rowIndex = 0, colIndex = 0, actionTestSub: string) {
      const el = await this.getDatatableCell(rowIndex, colIndex);
      await el.focus();
      const action = await el.findByTestSubject(actionTestSub);
      return action.click();
    },

    /**
     * Asserts that metric has expected title and count
     *
     * @param title - expected title
     * @param count - expected count of metric
     */
    async assertLegacyMetric(title: string, count: string) {
      await this.assertExactText('[data-test-subj="metric_label"]', title);
      await this.assertExactText('[data-test-subj="metric_value"]', count);
    },

    async clickLegacyMetric() {
      await testSubjects.click('metric_label');
    },

    async setLegacyMetricDynamicColoring(coloringType: 'none' | 'labels' | 'background') {
      await testSubjects.click('lnsLegacyMetric_dynamicColoring_groups_' + coloringType);
    },

    async getLegacyMetricStyle() {
      const el = await testSubjects.find('metric_value');
      const styleString = (await el.getAttribute('style')) ?? '';
      return styleString.split(';').reduce<Record<string, string>>((memo, cssLine) => {
        const [prop, value] = cssLine.split(':');
        if (prop && value) {
          memo[prop.trim()] = value.trim();
        }
        return memo;
      }, {});
    },

    async assertMissingValues(option: string) {
      await this.assertExactText('[data-test-subj="lnsMissingValuesSelect"]', option);
    },
    async assertColor(color: string) {
      // TODO: target dimensionTrigger color element after merging https://github.com/elastic/kibana/pull/76871
      await testSubjects.getAttribute('~indexPattern-dimension-colorPicker', color);
    },
    async getMetricTiles() {
      return findService.allByCssSelector('[data-test-subj="mtrVis"] .echChart li');
    },

    async getMetricElementIfExists(
      selector: string,
      container: WebElementWrapper,
      timeout?: number
    ) {
      return (await findService.descendantExistsByCssSelector(selector, container, timeout))
        ? await container.findByCssSelector(selector)
        : undefined;
    },

    async getMetricDatum(tile: WebElementWrapper) {
      // using getAttribute('innerText') because getVisibleText() fails when the text overflows the metric panel.
      // The reported "visible" text is somewhat inaccurate and just report the full innerText of just the visible DOM elements.
      // In the case of Metric, suffixes that are on a sub-element are not considered visible.
      return {
        title: await (await this.getMetricElementIfExists('h2', tile))?.getAttribute('innerText'),
        subtitle: await (
          await this.getMetricElementIfExists('.echMetricText__subtitle', tile)
        )?.getAttribute('innerText'),
        extraText: await (
          await this.getMetricElementIfExists('.echMetricText__extraBlock', tile)
        )?.getAttribute('innerText'),
        value: await (
          await this.getMetricElementIfExists('.echMetricText__valueBlock', tile)
        )?.getAttribute('innerText'),
        color: await (
          await this.getMetricElementIfExists('.echMetric', tile)
        )?.getComputedStyle('background-color'),
        trendlineColor: await (
          await this.getMetricElementIfExists('.echSingleMetricSparkline__svg > rect', tile, 500)
        )?.getAttribute('fill'),
        showingTrendline: Boolean(
          await this.getMetricElementIfExists('.echSingleMetricSparkline', tile, 500)
        ),
      };
    },

    async hoverOverDimensionButton(index = 0) {
      const dimensionButton = (await testSubjects.findAll('lns-dimensionTrigger'))[index];
      await dimensionButton.moveMouseTo();
    },

    async getMetricVisualizationData() {
      const tiles = await this.getMetricTiles();
      const showingBar = Boolean(await findService.existsByCssSelector('.echSingleMetricProgress'));

      const metricDataPromises = [];
      for (const tile of tiles) {
        metricDataPromises.push(this.getMetricDatum(tile));
      }
      const metricData = await Promise.all(metricDataPromises);
      return metricData.map((d) => ({ ...d, showingBar }));
    },

    /**
     * Creates and saves a lens visualization from a dashboard
     *
     * @param title - title for the new lens. If left undefined, the panel will be created by value
     * @param redirectToOrigin - whether to redirect back to the dashboard after saving the panel
     * @param ignoreTimeFilter - whether time range has to be changed
     */
    async createAndAddLensFromDashboard({
      title,
      redirectToOrigin,
      ignoreTimeFilter,
      useAdHocDataView,
    }: {
      title?: string;
      redirectToOrigin?: boolean;
      ignoreTimeFilter?: boolean;
      useAdHocDataView?: boolean;
    }) {
      log.debug(`createAndAddLens${title}`);
      const inViewMode = await dashboard.getIsInViewMode();
      if (inViewMode) {
        await dashboard.switchToEditMode();
      }
      await dashboardAddPanel.clickAddLensPanel();

      if (!ignoreTimeFilter) {
        await this.goToTimeRange();
      }

      if (useAdHocDataView) {
        await dataViews.createFromSearchBar({ name: '*stash*', adHoc: true });
      }

      await this.configureDimension({
        dimension: 'lnsXY_yDimensionPanel > lns-empty-dimension',
        operation: 'average',
        field: 'bytes',
      });
      await this.configureDimension({
        dimension: 'lnsXY_xDimensionPanel > lns-empty-dimension',
        operation: 'date_histogram',
        field: '@timestamp',
      });

      await this.configureDimension({
        dimension: 'lnsXY_splitDimensionPanel > lns-empty-dimension',
        operation: 'terms',
        field: 'ip',
      });
      if (title) {
        await this.save(title, false, redirectToOrigin);
      } else {
        await this.saveAndReturn();
      }
    },

    /**
     * Asserts that the focused element is a field with a specified text
     *
     * @param name - the element visible text
     */
    async assertFocusedField(name: string) {
      const input = await find.activeElement();
      const fieldPopover = await input.findByXpath('./..');
      const focusedElementText = await fieldPopover.getVisibleText();
      expect(focusedElementText).to.eql(name);
      const dataTestSubj = await fieldPopover.getAttribute('data-test-subj');
      expect(dataTestSubj).to.eql('lnsFieldListPanelField');
    },

    /**
     * Asserts that the focused element is a dimension with with a specified text
     *
     * @param name - the element visible text
     */
    async assertFocusedDimension(name: string) {
      const input = await find.activeElement();
      const fieldAncestor = await input.findByXpath('./../..');
      const focusedElementText = await fieldAncestor.getVisibleText();
      expect(focusedElementText).to.eql(name);
    },

    async waitForVisualization(visDataTestSubj?: string) {
      async function getRenderingCount() {
        const visualizationContainer = await testSubjects.find(
          visDataTestSubj || 'lnsVisualizationContainer'
        );
        const renderingCount = await visualizationContainer.getAttribute('data-rendering-count');
        return Number(renderingCount);
      }
      await header.waitUntilLoadingHasFinished();
      await retry.waitFor('rendering count to stabilize', async () => {
        const firstCount = await getRenderingCount();

        await common.sleep(1000);

        const secondCount = await getRenderingCount();

        return firstCount === secondCount;
      });
    },

    async switchToTextBasedLanguage(language: string) {
      await testSubjects.click('lns-dataView-switch-link');
      await unifiedSearch.selectTextBasedLanguage(language);
    },

    async configureTextBasedLanguagesDimension(opts: {
      dimension: string;
      field: string;
      keepOpen?: boolean;
    }) {
      await retry.try(async () => {
        if (!(await testSubjects.exists('lns-indexPattern-dimensionContainerClose'))) {
          await testSubjects.click(opts.dimension);
        }
        await testSubjects.existOrFail('lns-indexPattern-dimensionContainerClose');
      });

      await this.selectOptionFromComboBox('text-based-dimension-field', opts.field);

      if (!opts.keepOpen) {
        await this.closeDimensionEditor();
        await testSubjects.click('applyFlyoutButton');
      }
    },

    /** resets visualization/layer or removes a layer */
    async removeLayer(index: number = 0) {
      await retry.try(async () => {
        // Hover over the tab to make the layer actions button visible
        const tabs = await find.allByCssSelector('[data-test-subj^="unifiedTabs_tab_"]', 1000);
        if (tabs[index]) {
          await tabs[index].moveMouseTo();
        }
        if (await testSubjects.exists(`lnsLayerSplitButton--${index}`)) {
          await testSubjects.click(`lnsLayerSplitButton--${index}`);
        }
        await testSubjects.click(`lnsLayerRemove--${index}`);
        if (await testSubjects.exists('lnsLayerRemoveModal')) {
          await testSubjects.exists('lnsLayerRemoveConfirmButton');
          await testSubjects.click('lnsLayerRemoveConfirmButton');
        }
      });
    },

    async ensureLayerTabIsActive(index: number = 0) {
      const tabs = await find.allByCssSelector('[data-test-subj^="unifiedTabs_tab_"]', 1000);

      if (tabs[index]) {
        // Check if the tab is already active
        const isActive = await tabs[index].getAttribute('aria-selected');
        if (isActive === 'true') {
          await testSubjects.exists(`lns-layerPanel-${index}`);
          return;
        }

        // Scroll tabs into view by clicking scroll buttons if needed.
        // The tab may be hidden behind the scroll navigation buttons.
        // Note: scroll buttons only exist when there are enough tabs to overflow.
        // We try scrolling right first for higher indices, left for lower indices.
        let scrollAttempts = 0;
        const maxScrollAttempts = 10;

        await retry.try(async () => {
          // Try clicking the tab - if it fails due to scroll button overlap, scroll and retry
          try {
            await tabs[index].click();
          } catch (e) {
            if (e instanceof Error && e.message.includes('element click intercepted')) {
              scrollAttempts++;
              if (scrollAttempts > maxScrollAttempts) {
                throw e; // Give up after max attempts
              }

              // Determine scroll direction based on tab index
              // Lower indices are on the left, higher indices are on the right
              const scrollRightBtnExists = await testSubjects.exists(
                'unifiedTabs_tabsBar_scrollRightBtn',
                { timeout: 500 }
              );
              const scrollLeftBtnExists = await testSubjects.exists(
                'unifiedTabs_tabsBar_scrollLeftBtn',
                { timeout: 500 }
              );

              // Try scrolling in the appropriate direction
              if (index >= tabs.length / 2 && scrollRightBtnExists) {
                // Tab is in the right half, try scrolling right
                await testSubjects.click('unifiedTabs_tabsBar_scrollRightBtn');
              } else if (scrollLeftBtnExists) {
                // Tab is in the left half, try scrolling left
                await testSubjects.click('unifiedTabs_tabsBar_scrollLeftBtn');
              } else if (scrollRightBtnExists) {
                // Fallback to scrolling right if left isn't available
                await testSubjects.click('unifiedTabs_tabsBar_scrollRightBtn');
              }

              throw e; // Rethrow to retry
            }
            throw e;
          }
        });

        // Wait for the layer panel to render
        await retry.waitFor('layer panel to be visible', async () => {
          return await testSubjects.exists(`lns-layerPanel-${index}`, { timeout: 1000 });
        });
      }
    },

    async ensureLayerTabWithNameIsActive(name: string) {
      const tabs = await find.allByCssSelector('[data-test-subj^="unifiedTabs_tab_"]', 1000);
      for (let i = 0; i < tabs.length; i++) {
        const tabText = await tabs[i].getVisibleText();
        if (tabText === name) {
          // Check if the tab is already active
          const isActive = await tabs[i].getAttribute('aria-selected');
          if (isActive === 'true') {
            await testSubjects.exists(`lns-layerPanel-${i}`);
            return;
          }

          // Click to make it active
          await tabs[i].click();

          // Wait for the layer panel to render
          await retry.waitFor('layer panel to be visible', async () => {
            return await testSubjects.exists(`lns-layerPanel-${i}`, { timeout: 1000 });
          });
          return;
        }
      }
      throw new Error(`Layer tab with name "${name}" not found`);
    },

    async assertLayerCount(expectedCount: number) {
      // Inside the tab content there should be one panel
      const layerPanels = await find.allByCssSelector('[data-test-subj^="lns-layerPanel-"]', 1000);
      expect(layerPanels.length).to.eql(1);

      const tabs = await find.allByCssSelector('[data-test-subj^="unifiedTabs_tab_"]', 1000);

      // tabs will hidden if there's just one layer
      if (expectedCount <= 1) {
        expect(tabs.length).to.eql(0);
        return;
      }

      expect(tabs.length).to.eql(expectedCount);
    },

    /**
     * Starts dragging @param dragging, drags over @param draggedOver and drops it into @dropTarget
     */
    async dragEnterDrop(dragging: string, draggedOver: string, dropTarget: string) {
      await browser.execute(
        `
          function createEvent(typeOfEvent) {
            const event = document.createEvent("CustomEvent");
            event.initCustomEvent(typeOfEvent, true, true, null);
            event.dataTransfer = {
                data: {},
                setData: function(key, value) {
                    this.data[key] = value;
                },
                getData: function(key) {
                    return this.data[key];
                }
            };
            return event;
          }
          function dispatchEvent(element, event, transferData) {
            if (transferData !== undefined) {
                event.dataTransfer = transferData;
            }
            if (element.dispatchEvent) {
                element.dispatchEvent(event);
            } else if (element.fireEvent) {
                element.fireEvent("on" + event.type, event);
            }
          }

          const origin = document.querySelector(arguments[0]);
          const dragStartEvent = createEvent('dragstart');
          dispatchEvent(origin, dragStartEvent);

          setTimeout(() => {
            const target = document.querySelector(arguments[1]);
            const dragenter = createEvent('dragenter');
            const dragover = createEvent('dragover');
            dispatchEvent(target, dragenter, dragStartEvent.dataTransfer);
            dispatchEvent(target, dragover, dragStartEvent.dataTransfer);
            setTimeout(() => {
              const target = document.querySelector(arguments[2]);
              const dropEvent = createEvent('drop');
              dispatchEvent(target, dropEvent, dragStartEvent.dataTransfer);
              const dragEndEvent = createEvent('dragend');
              dispatchEvent(origin, dragEndEvent, dropEvent.dataTransfer);
            }, 200)
          }, 200);
      `,
        dragging,
        draggedOver,
        dropTarget
      );
      await setTimeoutAsync(150);
    },

    /**
     * Drags from a dimension to another dimension trigger to extra drop type
     *
     * @param from - the selector of the dimension being moved
     * @param to - the selector of the main drop type of dimension being dropped to
     * @param type - extra drop type
     * */
    async dragFieldToExtraDropType(
      field: string,
      to: string,
      type: 'duplicate' | 'swap' | 'combine',
      visDataTestSubj?: string | undefined
    ) {
      const from = `lnsFieldListPanelField-${field}`;
      await this.dragEnterDrop(
        testSubjects.getCssSelector(from),
        testSubjects.getCssSelector(`${to} > lnsDragDrop-domDroppable`),
        testSubjects.getCssSelector(`${to} > domDragDrop-dropTarget-${type}`)
      );
      await this.waitForVisualization(visDataTestSubj);
    },

    /**
     * Drags from a dimension to another dimension trigger to extra drop type
     *
     * @param from - the selector of the dimension being moved
     * @param to - the selector of the main drop type of dimension being dropped to
     * @param type - extra drop type
     * */
    async dragDimensionToExtraDropType(
      from: string,
      to: string,
      type: 'duplicate' | 'swap' | 'combine',
      visDataTestSubj?: string | undefined
    ) {
      await this.dragEnterDrop(
        testSubjects.getCssSelector(from),
        testSubjects.getCssSelector(`${to} > lnsDragDrop-domDroppable`),
        testSubjects.getCssSelector(`${to} > domDragDrop-dropTarget-${type}`)
      );
      await this.waitForVisualization(visDataTestSubj);
    },

    async switchToQuickFunctions() {
      await testSubjects.click('lens-dimensionTabs-quickFunctions');
    },

    async switchToFormula() {
      await testSubjects.click('lens-dimensionTabs-formula');
    },

    async switchToStaticValue() {
      await testSubjects.click('lens-dimensionTabs-static_value');
    },

    async toggleFullscreen() {
      await testSubjects.click('lnsFormula-fullscreen');
    },

    async goToListingPageViaBreadcrumbs() {
      await retry.try(async () => {
        await testSubjects.click('breadcrumb first');
        if (await testSubjects.exists('appLeaveConfirmModal')) {
          await testSubjects.exists('confirmModalConfirmButton');
          await testSubjects.click('confirmModalConfirmButton');
        }
        await retry.waitFor('dashboard visualizations list to load', async () => {
          const url = await browser.getCurrentUrl();
          return url.includes('#/list/visualizations');
        });
      });
    },

    async typeFormula(formula: string) {
      await find.byCssSelector('.monaco-editor');
      await find.clickByCssSelectorWhenNotDisabledWithoutRetry('.monaco-editor');
      const input = await find.activeElement();
      await input.clearValueWithKeyboard({ charByChar: true });
      await input.type(formula);
      // Debounce time for formula
      await common.sleep(300);
    },

    async expectFormulaText(formula: string) {
      const element = await find.byCssSelector('.monaco-editor');
      expect(await element.getVisibleText()).to.equal(formula);
    },

    async filterLegend(value: string) {
      await testSubjects.click(`legend-${value}`);
      const filterIn = await testSubjects.find(`legend-${value}-filterIn`);
      await filterIn.click();
    },

    hasEmptySizeRatioButtonGroup() {
      return testSubjects.exists('lnsEmptySizeRatioOption');
    },

    async enableAutoApply() {
      return testSubjects.setEuiSwitch('lnsToggleAutoApply', 'check');
    },

    async disableAutoApply() {
      return testSubjects.setEuiSwitch('lnsToggleAutoApply', 'uncheck');
    },

    async getAutoApplyEnabled() {
      return testSubjects.isEuiSwitchChecked('lnsToggleAutoApply');
    },

    applyChangesExists(whichButton: 'toolbar' | 'suggestions' | 'workspace') {
      return testSubjects.exists(`lnsApplyChanges__${whichButton}`);
    },

    async applyChanges(whichButton: 'toolbar' | 'suggestions' | 'workspace') {
      const applyButtonSelector = `lnsApplyChanges__${whichButton}`;
      await testSubjects.waitForEnabled(applyButtonSelector);
      await testSubjects.click(applyButtonSelector);
    },

    async assertNoInlineWarning() {
      await testSubjects.missingOrFail('chart-inline-warning');
    },

    async assertNoEditorWarning() {
      await testSubjects.missingOrFail('lens-editor-warning');
    },

    /**
     * Applicable both on the embeddable and in the editor. In both scenarios, a popover containing user messages (errors, warnings) is shown.
     *
     * If you're going to use this many times in your test consider retrieving all the messages in one go using getMessageListTexts
     * and running your own assertions for performance reasons.
     */
    async assertMessageListContains(assertText: string, severity: 'warning' | 'error') {
      await testSubjects.click('lens-message-list-trigger');
      const messageSelector = `lens-message-list-${severity}`;
      await testSubjects.existOrFail(messageSelector);
      const messages = await testSubjects.findAll(messageSelector);
      let found = false;
      for (const message of messages) {
        const text = await message.getVisibleText();
        log.info(text);
        if (text === assertText) {
          found = true;
        }
      }
      await testSubjects.click('lens-message-list-trigger');
      if (!found) {
        throw new Error(`Message with text "${assertText}" not found`);
      }
    },

    async getMessageListTexts(severity: 'warning' | 'error') {
      await testSubjects.click('lens-message-list-trigger');

      const messageSelector = `lens-message-list-${severity}`;

      await testSubjects.existOrFail(messageSelector);

      const messageEls = await testSubjects.findAll(messageSelector);

      const messages = await Promise.all(messageEls.map((el) => el.getVisibleText()));

      await testSubjects.click('lens-message-list-trigger');

      return messages;
    },

    async getPaletteColorStops() {
      const stops = await find.allByCssSelector(
        `[data-test-subj^="lnsPalettePanel_dynamicColoring_range_value_"]`
      );
      const colorsElements = await testSubjects.findAll('euiColorPickerAnchor');
      const colors = await Promise.all(
        colorsElements.map((c) => c.getComputedStyle('background-color'))
      );

      return await Promise.all(
        stops.map(async (stop, index) => {
          return { stop: await stop.getAttribute('value'), color: colors[index] };
        })
      );
    },

    async findFieldIdsByType(
      type: 'keyword' | 'number' | 'date' | 'geo_point' | 'ip_range',
      group: 'available' | 'empty' | 'meta' = 'available'
    ) {
      const groupCapitalized = `${group[0].toUpperCase()}${group.slice(1).toLowerCase()}`;
      const allFieldsForType = await find.allByCssSelector(
        `[data-test-subj="lnsIndexPattern${groupCapitalized}Fields"] .unifiedFieldListItemButton--${type}`
      );
      // map to testSubjId
      return Promise.all(
        allFieldsForType.map(async (el) => {
          const parent = await el.findByXpath('./..');
          return (await parent.getAttribute('data-test-subj')) ?? '';
        })
      );
    },

    async clickShareButton() {
      return await testSubjects.click('lnsApp_shareButton');
    },

    async clickExportButton() {
      return await testSubjects.click('lnsApp_exportButton');
    },

    async isShareable() {
      return await testSubjects.isEnabled('lnsApp_shareButton');
    },

    isExportActionEnabled() {
      return testSubjects.isEnabled('lnsApp_exportButton');
    },

    async isShareActionEnabled(action: 'link') {
      switch (action) {
        case 'link':
          return await testSubjects.isEnabled('tabbedModal-link-content');
        default:
          return await testSubjects.isEnabled(`tabbedModal-${action}-content`);
      }
    },

    async ensureShareMenuIsOpen(action: 'link') {
      if (
        (await testSubjects.exists('shareContextModal')) &&
        !(await this.isShareActionEnabled(action))
      ) {
        throw Error(`${action} sharing feature is disabled`);
      }
      return await testSubjects.click(action);
    },

    async openPermalinkShare() {
      await this.ensureShareMenuIsOpen('link');
      await testSubjects.click('link');
    },

    closeShareModal() {
      return share.closeShareModal();
    },

    closeExportFlyout() {
      return exports.closeExportFlyout();
    },

    async isPopoverItemEnabled(label: string) {
      await this.clickExportButton();

      return await exports.isPopoverItemEnabled(label);
    },

    async clickPopoverItem(label: string) {
      log.debug(`clickPopoverItem label: ${label}`);

      await retry.waitFor('ascertain that export popover is open', async () => {
        const isExportPopoverOpen = await exports.isExportPopoverOpen();
        if (!isExportPopoverOpen) {
          await this.clickExportButton();
        }
        return isExportPopoverOpen;
      });

      await testSubjects.click(`exportMenuItem-${label}`);
    },

    async getUrl() {
      await this.clickShareButton();

      await this.isShareActionEnabled('link');
      const url = await share.getSharedUrl();

      if (!url) {
        throw Error('No data-share-url attribute found');
      }

      // close share modal after url is copied
      await this.closeShareModal();
      return url;
    },

    async triggerCSVDownloadExport() {
      await this.clickExportButton();
      // simply clicking the export button is enough, to trigger the CSV download in lens
      await exports.clickPopoverItem('CSV', async () => {
        await this.clickExportButton();
        return true;
      });
    },

    async setCSVDownloadDebugFlag(value: boolean = true) {
      await browser.execute<[boolean], void>((v) => {
        window.ELASTIC_LENS_CSV_DOWNLOAD_DEBUG = v;
      }, value);
    },

    async openReportingShare(type: 'PNG' | 'PDF') {
      await this.clickExportButton();
      await exports.clickPopoverItem(type);
    },

    async getCSVContent() {
      return await browser.execute<
        [void],
        Record<string, { content: string; type: string }> | undefined
      >(() => window.ELASTIC_LENS_CSV_CONTENT);
    },

    async closeSuggestionPanel() {
      const isSuggestionPanelOpen = await testSubjects.exists('lnsSuggestionsPanel');
      if (isSuggestionPanelOpen) {
        await testSubjects.click('lensSuggestionsPanelToggleButton');
      }
    },

    /**
     * Enables elastic charts debug state with *soft* refresh
     */
    async enableEchDebugState() {
      await elasticChart.setNewChartUiDebugFlag(true);
      await queryBar.clickQuerySubmitButton();
    },

    async changeColorMappingPalette(selector: string, paletteId: string) {
      await retry.try(async () => {
        if (!(await testSubjects.exists('lns-indexPattern-dimensionContainerClose'))) {
          await testSubjects.click(selector);
        }
        await testSubjects.existOrFail('lns-indexPattern-dimensionContainerClose');
      });
      await this.setPalette(paletteId, false);
      await this.closeDimensionEditor();
    },

    async changeColorMappingCategoricalColors(
      selector: string,
      colorSwatchIndex: number,
      paletteColorIndex: number
    ) {
      await retry.try(async () => {
        if (!(await testSubjects.exists('lns-indexPattern-dimensionContainerClose'))) {
          await testSubjects.click(selector);
        }
        await testSubjects.existOrFail('lns-indexPattern-dimensionContainerClose');
      });
      await testSubjects.click('lns_colorEditing_trigger');

      // assign all
      await testSubjects.click('lns-colorMapping-assignmentsPromptAddAll');

      await testSubjects.click(`lns-colorMapping-colorSwatch-${colorSwatchIndex}`);

      await testSubjects.click(`lns-colorMapping-colorPicker-staticColor-${paletteColorIndex}`);

      await testSubjects.click(`lns-colorMapping-colorSwatch-${colorSwatchIndex}`);

      await this.closePaletteEditor();

      await this.closeDimensionEditor();
    },

    async getWorkspaceVisContainerDimensions() {
      const visContainer = await testSubjects.find('lnsWorkspacePanelWrapper__innerContent');
      const [width, height] = await Promise.all([
        visContainer.getComputedStyle('width'),
        visContainer.getComputedStyle('height'),
      ]);

      return { width, height };
    },

    async getWorkspaceVisContainerStyles() {
      const visContainer = await testSubjects.find('lnsWorkspacePanelWrapper__innerContent');
      const [maxWidth, maxHeight, minWidth, minHeight, aspectRatio] = await Promise.all([
        visContainer.getComputedStyle('max-width'),
        visContainer.getComputedStyle('max-height'),
        visContainer.getComputedStyle('min-width'),
        visContainer.getComputedStyle('min-height'),
        visContainer.getComputedStyle('aspect-ratio'),
      ]);

      return { maxWidth, maxHeight, minWidth, minHeight, aspectRatio };
    },

    async toggleDebug(enable: boolean = true) {
      await browser.execute(`window.ELASTIC_LENS_LOGGER = arguments[0];`, enable);
    },

    async setDataTableDensity(value: string) {
      const settings = await testSubjects.find('lnsDensitySettings');
      const option = await settings.findByTestSubject(value);
      await option.click();
    },

    async toggleShowRowNumbers() {
      const rowNumberSwitch = await testSubjects.find('lens-table-row-numbers-switch');
      await rowNumberSwitch.click();
    },

    async findRowNumberColumn() {
      return await testSubjects.exists('lnsDataTable-rowNumber');
    },

    async checkDataTableDensity(size: 'l' | 'm' | 's') {
      return find.existsByCssSelector(
        `[data-test-subj="lnsDataTable"][class*="cellPadding-${size}-fontSize-${size}"]`
      );
    },

    async getSecondaryMetricLabel(tile?: WebElementWrapper) {
      const ECH_SECONDARY_METRIC_LABEL_SELECTOR = '.echSecondaryMetric__label';
      const label = tile
        ? await this.getMetricElementIfExists(ECH_SECONDARY_METRIC_LABEL_SELECTOR, tile)
        : await find.byCssSelector(ECH_SECONDARY_METRIC_LABEL_SELECTOR);
      return label ? label.getAttribute('innerText') : undefined;
    },

    async hasSecondaryMetricBadge(tile?: WebElementWrapper) {
      return tile
        ? Boolean(this.getMetricElementIfExists(ECH_BADGE_SELECTOR, tile))
        : find.existsByCssSelector(ECH_BADGE_SELECTOR);
    },

    async getSecondaryMetricBadge(tile?: WebElementWrapper) {
      return tile
        ? this.getMetricElementIfExists(ECH_BADGE_SELECTOR, tile)
        : find.byCssSelector(ECH_BADGE_SELECTOR);
    },

    async getSecondaryMetricBadgeText(tile?: WebElementWrapper) {
      const badge = await this.getSecondaryMetricBadge(tile);
      return badge ? await badge.getVisibleText() : undefined;
    },

    async getSecondaryMetricBadgeColor(tile?: WebElementWrapper) {
      const badge = await this.getSecondaryMetricBadge(tile);
      const color = badge ? await badge.getComputedStyle('background-color') : undefined;
      return color ? chroma(color).hex().toUpperCase() : undefined;
    },
  });
}
