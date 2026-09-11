/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { DebugState } from '@elastic/charts';
import { encode as encodeRison } from '@kbn/rison';
import { KibanaCodeEditorWrapper, type Locator, type ScoutPage } from '@kbn/scout';
import { LOGSTASH_IN_RANGE_DATES } from '../../../../fixtures/constants';
import { WAIT_FOR_FUNCTION_TIMEOUT_MS } from './lens_editor_helpers';

/** `LensApp` helpers needed by workspace navigation / formula reading. */
interface LensWorkspaceDeps {
  closeDimensionEditorButton: Locator;
  waitForLensApp: () => Promise<void>;
  waitForVisualization: (chartTestSubj: string) => Promise<void>;
  getFormulaModelIndex: () => Promise<number>;
  getCodeEditorValue: (modelIndex: number) => Promise<string>;
}

export interface LensEditorTimeRange {
  from: string;
  to: string;
}

/**
 * Lens workspace chrome: navigation, apply/discard, settings, tag cloud, ES|QL /
 * inline-editor getters, and formula text.
 */
export class LensWorkspace {
  public readonly chartTitle;
  /** XY legend items (elastic-charts does not expose a `data-test-subj` for these). */
  public readonly xyLegendItems;
  // Stable locators as readonly fields (Scout UI best practice); methods stay for parameterized
  // locators and multi-step actions. See docs/extend/testing/ui-best-practices.md.
  readonly convertToEsqlButton;
  readonly convertToEsqlModal;
  readonly convertToEsqlModalConfirmButton;
  /** Same control as `closeDimensionEditorButton` — kept under this name for flyout-back call sites. */
  readonly secondaryFlyoutBackButton;
  readonly inlineEditor;
  readonly discardChangesModal;
  readonly autoApplyToggle;
  readonly noResults;

  private readonly goBackToAppButton;
  private readonly confirmModalConfirmButton;
  private readonly messageListTrigger;
  private readonly settingsButton;
  private readonly settingsMenu;
  private readonly emptyWorkspacePrompt;
  private readonly applyChangesPrompt;
  private readonly suggestionPanelToggle;
  /** Error badge on the current-visualization suggestion card. */
  readonly currentSuggestionError;
  readonly shareButton;
  readonly exportButton;
  /** Top-nav "Explore in Discover" control (`lnsApp_openInDiscover`). */
  readonly openInDiscoverButton;
  /** Dimension Filter-by popover trigger (`indexPattern-filters-existingFilterTrigger`). */
  readonly dimensionFilterTrigger;
  private readonly dimensionFilterQueryInput;
  private readonly shareModal;
  private readonly copyShareUrlButton;
  private readonly esqlCodeEditor;
  readonly esqlRunQueryButton;

  constructor(private readonly page: ScoutPage, private readonly deps: LensWorkspaceDeps) {
    this.chartTitle = this.page.testSubj.locator('lns_ChartTitle');
    this.xyLegendItems = this.page.locator('.echLegendItem');
    this.convertToEsqlButton = this.page.getByRole('button', { name: 'Convert to ES|QL' });
    this.convertToEsqlModal = this.page.getByTestId('lnsConvertToEsqlModal');
    this.convertToEsqlModalConfirmButton = this.page.getByTestId('confirmModalConfirmButton');
    this.secondaryFlyoutBackButton = this.deps.closeDimensionEditorButton;
    this.inlineEditor = this.page.getByTestId('customizeLens');
    this.discardChangesModal = this.page.testSubj.locator('lnsApp_discardChangesModalOrigin');
    this.autoApplyToggle = this.page.testSubj.locator('lnsToggleAutoApply');
    this.noResults = this.page.testSubj
      .locator('lnsVisualizationContainer')
      .getByText('No results found', { exact: true });

    this.goBackToAppButton = this.page.testSubj.locator('lnsApp_goBackToAppButton');
    this.confirmModalConfirmButton = this.page.testSubj.locator('confirmModalConfirmButton');
    this.messageListTrigger = this.page.testSubj.locator('lens-message-list-trigger');
    this.settingsButton = this.page.testSubj.locator('lnsApp_settingsButton');
    this.settingsMenu = this.page.testSubj.locator('lnsApp__settingsMenu');
    this.emptyWorkspacePrompt = this.page.testSubj.locator('workspace-drag-drop-prompt');
    this.applyChangesPrompt = this.page.testSubj.locator('workspace-apply-changes-prompt');
    this.suggestionPanelToggle = this.page.testSubj.locator('lensSuggestionsPanelToggleButton');
    this.currentSuggestionError = this.page.testSubj.locator(
      'lnsSuggestion-currentVisualization > lnsSuggestionPanel__error'
    );
    this.shareButton = this.page.testSubj.locator('lnsApp_shareButton');
    this.exportButton = this.page.testSubj.locator('lnsApp_exportButton');
    this.openInDiscoverButton = this.page.testSubj.locator('lnsApp_openInDiscover');
    this.dimensionFilterTrigger = this.page.testSubj.locator(
      'indexPattern-filters-existingFilterTrigger'
    );
    this.dimensionFilterQueryInput = this.page.testSubj.locator(
      'indexPattern-filters-queryStringInput'
    );
    this.shareModal = this.page.testSubj.locator('shareContextModal');
    this.copyShareUrlButton = this.page.testSubj.locator('copyShareUrlButton');
    this.esqlCodeEditor = new KibanaCodeEditorWrapper(this.page);
    this.esqlRunQueryButton = this.page.testSubj.locator('ESQLEditor-run-query-button');
  }

  /** Submits a query through the visible inline ES|QL editor. */
  async submitEsqlQuery(query: string) {
    await this.esqlCodeEditor.waitCodeEditorReady('InlineEditingESQLEditor');
    await this.esqlCodeEditor.setCodeEditorValue(query);
    await this.esqlRunQueryButton.waitFor({ state: 'visible' });
    await this.esqlRunQueryButton.click();
  }

  /** Reads the query from the visible inline ES|QL editor. */
  async getEsqlQuery(): Promise<string> {
    await this.esqlCodeEditor.waitCodeEditorReady('InlineEditingESQLEditor');
    return this.esqlCodeEditor.getCodeEditorValue();
  }

  async openFullEditor() {
    await this.page.gotoApp('lens');
    await this.page.waitForURL((url) => url.hash.includes('_g='));
    await this.deps.waitForLensApp();
  }

  /**
   * Opens a fresh empty Lens editor with global `_g` already in the hash.
   * Landing on `#/` without `_g` lets `syncGlobalQueryStateWithUrl` `history.replace`
   * the timefilter defaults into the URL after mount, which remounts the editor and
   * detaches open UI (e.g. the chart switcher) under Playwright.
   *
   * Defaults to {@link LOGSTASH_IN_RANGE_DATES}. Suites with a different window must
   * pass `timeRange` — an existing `_g` is not overwritten from uiSettings.
   */
  async openEmptyEditor(timeRange: LensEditorTimeRange = LOGSTASH_IN_RANGE_DATES) {
    const globalState = encodeRison({
      filters: [],
      refreshInterval: { pause: true, value: 60000 },
      time: { from: timeRange.from, to: timeRange.to },
    });
    await this.page.gotoApp('lens', { hash: `/?_g=${globalState}` });
    await this.deps.waitForLensApp();
  }

  /**
   * Navigates directly to the Lens editor for a saved visualization and waits for its
   * chart to render. Prefer this over going through the visualize listing page when the
   * saved-object id is known (e.g. fixture-loaded or freshly-saved visualizations).
   *
   * @param id - saved-object id of the Lens visualization
   * @param chartTestSubj - `data-test-subj` of the rendered chart container
   *   (e.g. `xyVisChart`, `partitionVisChart`, `mtrVis`, `legacyMtrVis`,
   *   `lnsVisualizationContainer` for datatable).
   */
  async openEditor(id: string, chartTestSubj: string) {
    await this.page.gotoApp('lens', { hash: `/edit/${id}` });
    await this.page.waitForURL((url) => url.hash.includes('_g='));
    await this.deps.waitForVisualization(chartTestSubj);
  }

  /**
   * Adds a new KQL filter row to a filters-aggregation dimension editor.
   *
   * The query input debounces its `onChange` (~256ms; see `useDebouncedValue`
   * in `@kbn/visualization-utils`), so the typed query only reaches the parent
   * `filter.input` after the debounce fires. If we close the popover before
   * then, `FilterPopover.closePopover` resets the input back to the default
   * (`localFilter.input = filter.input`) and the filter reverts to
   * "All records". We wait for the label input's placeholder — which mirrors
   * `localFilter.input.query` — to match the typed query as the visible DOM
   * signal that the debounce has flushed.
   */
  async addFilterToAgg(kql: string) {
    await this.page.testSubj.click('lns-newBucket-add');
    const queryInput = this.page.testSubj.locator('indexPattern-filters-queryStringInput');
    await queryInput.waitFor({ state: 'visible' });
    await queryInput.pressSequentially(kql);
    await this.page.waitForFunction((expected) => {
      const el = document.querySelector('[data-test-subj="indexPattern-filters-label"]');
      return el instanceof HTMLInputElement && el.placeholder === expected;
    }, kql);
    // Close the popover by clicking its trigger button (identified by the typed query text).
    // This toggles `activeFilterId` without invoking `closePopover()` (which resets
    // localFilter.input to the prop value and can race with React's prop propagation).
    await this.page.testSubj
      .locator('indexPattern-filters-existingFilterTrigger')
      .filter({ hasText: kql })
      .click();
  }

  /** Returns the visible label of every existing filter row in a filters-aggregation editor. */
  async getFiltersAggLabels(): Promise<string[]> {
    const filters = await this.page.testSubj
      .locator('indexPattern-filters-existingFilterContainer')
      .all();
    return Promise.all(filters.map(async (filter) => (await filter.innerText()).trim()));
  }

  async enableFilter() {
    await this.page.testSubj.click('indexPattern-advanced-accordion');
    await this.page.testSubj.click('indexPattern-filters-existingFilterTrigger');
  }

  async setFilterBy(queryString: string) {
    await this.page.testSubj
      .locator('indexPattern-filters-queryStringInput')
      .pressSequentially(queryString, { delay: 20 });
    await this.page.testSubj.click('indexPattern-filters-existingFilterTrigger');
  }

  /**
   * Commits a Filter-by query on an already-open dimension filter popover.
   *
   * `QueryInput` uses `useDebouncedValue` (~256ms). Closing the popover or the
   * dimension editor before that flush leaves `inputFilter` empty, so Discover
   * receives no global filter. `fill()` is used instead of `pressSequentially`
   * so operators like `>` are not dropped mid-type. Caller must have the
   * popover open (`enableFilter`).
   */
  async setDimensionFilterQuery(query: string) {
    await this.dimensionFilterQueryInput.waitFor({ state: 'visible' });
    await this.dimensionFilterQueryInput.fill(query);
    await this.page.waitForFunction(
      (expected) => {
        const root = document.querySelector(
          '[data-test-subj="indexPattern-filters-queryStringInput"]'
        );
        if (!root) {
          return false;
        }
        const field =
          root instanceof HTMLTextAreaElement || root instanceof HTMLInputElement
            ? root
            : root.querySelector('textarea, input');
        return field instanceof HTMLTextAreaElement || field instanceof HTMLInputElement
          ? field.value === expected
          : false;
      },
      query,
      { timeout: WAIT_FOR_FUNCTION_TIMEOUT_MS }
    );

    const committedTrigger = this.dimensionFilterTrigger.filter({ hasText: query });
    await committedTrigger.waitFor({ state: 'visible' });
    await committedTrigger.click();
    await this.dimensionFilterQueryInput.waitFor({ state: 'hidden' });
  }

  /** Reads the current title displayed in the Lens editor header. */
  async getChartTitle(): Promise<string> {
    return (await this.chartTitle.innerText()).trim();
  }

  async goBackToPreviousApp() {
    await this.goBackToAppButton.click();
  }

  async confirmDiscardChangesModal() {
    await this.discardChangesModal.waitFor({ state: 'visible' });
    await this.confirmModalConfirmButton.click();
    await this.discardChangesModal.waitFor({ state: 'hidden' });
  }

  /** Locator for the "Apply changes" button rendered in the given area. */
  getApplyChangesButton(target: 'toolbar' | 'suggestions' | 'workspace') {
    return this.page.testSubj.locator(`lnsApplyChanges__${target}`);
  }

  /** Clicks the "Apply changes" button in the given area and waits for it to disappear. */
  async applyChanges(target: 'toolbar' | 'suggestions' | 'workspace') {
    const button = this.getApplyChangesButton(target);
    await button.click();
    await button.waitFor({ state: 'hidden' });
  }

  /** Removes all dimensions from the given panel, polling until none remain. */
  async removeAllDimensions(dimensionTestSubj: string) {
    const removeLocator = this.page.testSubj.locator(
      `${dimensionTestSubj} > indexPattern-dimension-remove`
    );
    // Sequential remove+re-render per dimension can exceed the 10s actionTimeout.
    const deadline = Date.now() + 30_000;
    while ((await removeLocator.count()) > 0) {
      if (Date.now() >= deadline) {
        throw new Error(`Timed out removing dimensions for "${dimensionTestSubj}"`);
      }
      const buttons = await removeLocator.all();
      const button = buttons[0];
      if (!button) {
        break;
      }
      const countBefore = buttons.length;
      await button.hover();
      await button.click();
      // waitForFunction has no Scout default (unlike expect/actionTimeout).
      await this.page.waitForFunction(
        ({ panelSubj, before }) => {
          const panel = document.querySelector(`[data-test-subj="${panelSubj}"]`);
          if (!panel) {
            return true;
          }
          return (
            panel.querySelectorAll('[data-test-subj="indexPattern-dimension-remove"]').length <
            before
          );
        },
        { panelSubj: dimensionTestSubj, before: countBefore },
        { timeout: WAIT_FOR_FUNCTION_TIMEOUT_MS }
      );
    }
  }

  /**
   * Reads the current Elastic Charts / embeddable render count for a workspace chart, or
   * `null` when the chart isn't an Elastic Charts visualization (e.g. a data table).
   * Pair with `waitForVisualization(subj, { afterCount })` when the next action must wait
   * for a *new* render pass rather than settling on the current one.
   */
  async getVisualizationRenderCount(chartSubj: string): Promise<number | null> {
    return this.page.evaluate((subj) => {
      const workspaceEl = document.querySelector('[data-test-subj="lnsWorkspace"]');
      const el = workspaceEl?.querySelector(`[data-test-subj="${subj}"]`);
      if (!el) {
        return null;
      }
      const chartStatus = el.querySelector('.echChartStatus');
      const raw =
        el.getAttribute('data-rendering-count') ??
        (chartStatus?.getAttribute('data-ech-render-complete') === 'true'
          ? chartStatus.getAttribute('data-ech-render-count')
          : null);
      if (raw === null) {
        return null;
      }
      const count = Number(raw);
      return Number.isFinite(count) ? count : null;
    }, chartSubj);
  }

  /**
   * Reads `@elastic/charts` debug state after the visualization finishes rendering.
   * Requires `enableElasticChartDebug` (or equivalent init script) before navigation.
   */
  async getCurrentChartDebugState(visType: string): Promise<DebugState> {
    await this.deps.waitForVisualization(visType);
    const chart = this.page.testSubj.locator('lnsWorkspace').getByTestId(visType);
    // Elastic Charts status node — no Lens data-test-subj; same signal as FTR / open-in-Lens helpers.
    await chart.locator('.echChartStatus[data-ech-render-complete="true"]').waitFor({
      state: 'attached',
    });
    const debugJson = await chart.locator('.echChartStatus').getAttribute('data-ech-debug-state');
    if (!debugJson) {
      throw new Error('Elastic charts debugState not found — enable chart debug before navigation');
    }
    return JSON.parse(debugJson) as DebugState;
  }

  /**
   * Reads `@elastic/charts` debug state from a chart rendered inside a dashboard panel.
   * Unlike {@link getCurrentChartDebugState}, it does not scope its locators under
   * `lnsWorkspace`, which does not exist on dashboards. Requires `enableElasticChartDebug`
   * (or equivalent init script) before navigation.
   */
  async getDashboardChartDebugState(chartTestSubj: string): Promise<DebugState> {
    const chart = this.page.testSubj.locator(chartTestSubj);
    // Elastic Charts status node — no Lens data-test-subj; same signal as the editor helper.
    await chart.locator('.echChartStatus[data-ech-render-complete="true"]').waitFor({
      state: 'attached',
    });
    const debugJson = await chart.locator('.echChartStatus').getAttribute('data-ech-debug-state');
    if (!debugJson) {
      throw new Error('Elastic charts debugState not found — enable chart debug before navigation');
    }
    return JSON.parse(debugJson) as DebugState;
  }

  async openMessageList() {
    await this.messageListTrigger.click();
  }

  async closeMessageList() {
    await this.messageListTrigger.click();
  }

  getMessageListItems(severity: 'warning' | 'error') {
    return this.page.testSubj.locator(`lens-message-list-${severity}`);
  }

  /**
   * Locator for a Lens datatable-adjacent count of workspace errors shown in the message list
   * pagination. Excludes the prev/next controls, which also share the `pagination-button-`
   * prefix as `pagination-button-previous` / `pagination-button-next`.
   */
  async getErrorCount(): Promise<number> {
    const errors = this.page.testSubj.locator('lnsWorkspaceErrors');
    if ((await errors.count()) === 0) {
      return 0;
    }
    const pagination = this.page.testSubj.locator('lnsWorkspaceErrorsPaginationControl');
    if ((await pagination.count()) === 0) {
      return 1;
    }
    // EUI pagination buttons use data-test-subj pagination-button-{n}; exclude
    // pagination-button-previous/-next, which match the same prefix.
    return pagination
      .locator(
        '[data-test-subj^="pagination-button-"]:not([data-test-subj$="-previous"]):not([data-test-subj$="-next"])'
      )
      .count();
  }

  /** Opens the Lens settings menu (auto-apply toggle lives here). */
  async openSettingsMenu() {
    await this.settingsButton.click();
    await this.settingsMenu.waitFor({ state: 'visible' });
  }

  /**
   * Opens the Share modal. Waits until the share button is enabled (can lag after save).
   * Dismisses save toasts first — they sit over the top nav and intercept the click.
   */
  async openShareModal() {
    await this.page.waitForFunction(
      () => {
        const btn = document.querySelector(
          '[data-test-subj="lnsApp_shareButton"]'
        ) as HTMLButtonElement | null;
        return Boolean(btn && !btn.disabled);
      },
      undefined,
      { timeout: WAIT_FOR_FUNCTION_TIMEOUT_MS }
    );

    await this.page.components.toast().closeAll();
    await this.shareButton.click();
    await this.shareModal.waitFor({ state: 'visible' });
    await this.copyShareUrlButton.waitFor({ state: 'visible' });
  }

  /**
   * Opens Share and returns the share URL from the copy button.
   * Modern share modal exposes Copy link directly (no `link` tab). Closes the modal after.
   */
  async getSharedUrl(): Promise<string> {
    await this.openShareModal();
    await this.copyShareUrlButton.click();
    await this.page.waitForFunction(() => {
      const url = document
        .querySelector('[data-test-subj="copyShareUrlButton"]')
        ?.getAttribute('data-share-url');
      return Boolean(url);
    });
    const url = await this.copyShareUrlButton.getAttribute('data-share-url');
    await this.closeShareModal();
    if (!url) {
      throw new Error('Share URL was not available on the copy button');
    }
    return url;
  }

  /** Closes the share modal. Caller must have the modal open. */
  async closeShareModal() {
    await this.shareModal.getByLabel(/Close/).click();
    await this.shareModal.waitFor({ state: 'hidden' });
  }

  /** Closes the Lens settings menu. */
  async closeSettingsMenu() {
    await this.settingsButton.click();
    await this.settingsMenu.waitFor({ state: 'hidden' });
  }

  /** Toggles the auto-apply setting. Requires the settings menu to be open. */
  async toggleAutoApply() {
    await this.autoApplyToggle.click();
  }

  /** Waits for the empty Lens workspace drop prompt to be visible. */
  async waitForEmptyWorkspace() {
    await this.emptyWorkspacePrompt.waitFor({ state: 'visible' });
  }

  /** Waits for the workspace "apply changes" prompt (shown when auto-apply is disabled). */
  async waitForWorkspaceWithApplyChangesPrompt() {
    await this.applyChangesPrompt.waitFor({ state: 'visible' });
  }

  /**
   * Applies a Lens suggestion by its card test-subj prefix, then waits until the
   * resulting workspace chart has rendered.
   *
   * @param suggestionTestSubj - card prefix (e.g. `lnsSuggestion-treemap`)
   * @param chartTestSubj - `data-test-subj` of the chart that apply should produce
   *   (e.g. `partitionVisChart` for treemap/pie, `xyVisChart` for bar/line/area).
   */
  async applySuggestion(suggestionTestSubj: string, chartTestSubj: string) {
    const suggestion = this.page.testSubj.locator(`${suggestionTestSubj} > lnsSuggestion`);
    await suggestion.waitFor({ state: 'visible' });
    await suggestion.click();
    await this.deps.waitForVisualization(chartTestSubj);
  }

  /**
   * Collapses the suggestions panel.
   * Caller must have suggestions mounted with the panel expanded.
   */
  async closeSuggestionPanel() {
    await this.suggestionPanelToggle.waitFor({ state: 'visible' });
    // waitForFunction has no Scout default (unlike expect/actionTimeout).
    await this.page.waitForFunction(
      () =>
        document
          .querySelector('[data-test-subj="lensSuggestionsPanelToggleButton"]')
          ?.getAttribute('aria-expanded') === 'true',
      undefined,
      { timeout: WAIT_FOR_FUNCTION_TIMEOUT_MS }
    );
    await this.suggestionPanelToggle.click();
    await this.page.waitForFunction(
      () => {
        const el = document.querySelector('[data-test-subj="lensSuggestionsPanelToggleButton"]');
        return el == null || el.getAttribute('aria-expanded') !== 'true';
      },
      undefined,
      { timeout: WAIT_FOR_FUNCTION_TIMEOUT_MS }
    );
  }

  /** Returns visible tag labels from the Lens tag cloud workspace. */
  async getTagCloudTexts(): Promise<string[]> {
    // SVG <text> nodes — use css= so Playwright does not treat "text" as a text-engine query.
    const tags = this.page.testSubj.locator('tagCloudVisualization').locator('css=text');
    return tags.evaluateAll((elements) =>
      elements.map((el) => (el.textContent ?? '').trim()).filter((text) => text.length > 0)
    );
  }

  /** Clicks a tag cloud label matching `tagDisplayText`. */
  async selectTagCloudTag(tagDisplayText: string): Promise<void> {
    const escaped = tagDisplayText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const tag = this.page.testSubj
      .locator('tagCloudVisualization')
      .locator('css=text')
      .filter({ hasText: new RegExp(`^${escaped}$`) });
    await tag.waitFor({ state: 'visible' });
    // SVG <text> hit boxes from Elastic Charts are often too thin for Playwright's
    // actionability hit-test; dispatch a DOM click instead of { force: true }.
    await tag.dispatchEvent('click');
  }

  /**
   * Fills a controlled Lens input and waits for React to accept the value.
   *
   * Pass `inputType` when the test-subj is not unique: `EuiRange` with `showInput` stamps it on
   * both the range slider and the number input, so the bare selector is a strict-mode violation.
   */
  async setInputValue(testSubj: string, value: string, options?: { inputType?: string }) {
    const typeSelector = options?.inputType ? `[type="${options.inputType}"]` : '';
    const selector = `input[data-test-subj="${testSubj}"]${typeSelector}`;
    const input = this.page.locator(selector);
    await input.waitFor({ state: 'visible' });
    await input.scrollIntoViewIfNeeded();
    // fill() clears first (avoids "07747" from incomplete selection on number inputs).
    await input.fill(value);
    // Controlled EuiFieldNumber often ignores DOM-only fills — also invoke React onChange
    // with an explicit value (React hijacks input.value so the event must carry it).
    await input.evaluate((el, nextValue) => {
      const inputEl = el as HTMLInputElement & Record<string, unknown>;
      const propsKey = Object.keys(inputEl).find((key) => key.startsWith('__reactProps$'));
      if (!propsKey) {
        return;
      }
      const props = inputEl[propsKey] as {
        onChange?: (e: { target: { value: string }; currentTarget: { value: string } }) => void;
      };
      props.onChange?.({ target: { value: nextValue }, currentTarget: { value: nextValue } });
    }, value);
    // Sync until React controlled value matches (readiness wait — assertions stay in specs).
    // waitForFunction has no Scout default (unlike expect/actionTimeout).
    await this.page.waitForFunction(
      ({ sel, expected }) => {
        const el = document.querySelector(sel) as HTMLInputElement | null;
        return el?.value === expected;
      },
      { sel: selector, expected: value },
      { timeout: WAIT_FOR_FUNCTION_TIMEOUT_MS }
    );
    // Blur programmatically instead of pressing Tab: Tab would focus the next
    // control, and focus-opening widgets (e.g. EuiComboBox) would leave a portal
    // popover behind that intercepts subsequent clicks.
    await input.evaluate((el) => (el as HTMLElement).blur());
    // Blur completed — callers must poll a UI side effect (chart debug, dimension label)
    // before closing flyouts; useDebouncedValue (~256ms) has no DOM readiness hook here.
    await this.page.waitForFunction(
      (sel) => {
        const el = document.querySelector(sel);
        return el != null && document.activeElement !== el;
      },
      selector,
      { timeout: WAIT_FOR_FUNCTION_TIMEOUT_MS }
    );
  }

  async toggleFullscreen() {
    await this.page.testSubj.click('lnsFormula-fullscreen');
  }

  /** Returns the current formula Monaco model value (last registered model). */
  async getFormulaText(): Promise<string> {
    const modelIndex = await this.deps.getFormulaModelIndex();
    return this.deps.getCodeEditorValue(modelIndex);
  }
}
