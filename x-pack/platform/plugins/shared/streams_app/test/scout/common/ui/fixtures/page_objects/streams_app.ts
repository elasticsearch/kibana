/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/* eslint-disable playwright/no-nth-methods */

import moment from 'moment';
import type { Locator, ScoutPage } from '@kbn/scout';
import { KibanaCodeEditorWrapper, type EuiDataGridObject } from '@kbn/scout';
import { expect } from '@kbn/scout/ui';
import type { FieldTypeOption } from '../../../../../../public/components/stream_management/data_management/schema_editor/constants';

interface CellValueExpectation {
  columnName: string;
  rowIndex: number;
  value: string;
  invertCondition?: boolean;
  timeout?: number;
}

const LEGACY_DATE_FORMAT = 'MMM D, YYYY @ HH:mm:ss.SSS';

export class StreamsApp {
  public readonly processorFieldComboBox;
  public readonly conditionEditorFieldComboBox;
  public readonly conditionEditorValueComboBox;
  public readonly processorTypeComboBox;
  public readonly dateProcessorFormatsComboBox;
  public readonly fieldTypeSuperSelect;
  public readonly previewDataGrid;
  public readonly schemaDataGrid;
  public readonly kibanaMonacoEditor;
  public readonly saveRoutingRuleButton;
  public readonly concatFieldInput;
  public readonly concatLiteralInput;
  public readonly createStreamButton;
  public readonly createQueryStreamButton;
  public readonly childStreamTypeSelector;
  public readonly queryStreamFlyout;
  public readonly queryStreamFlyoutSaveButton;
  public readonly queryStreamCreatedSuccessToast;
  public readonly childQueryStreamCreatedSuccessToast;
  public readonly queryStreamUpdatedSuccessToast;
  public readonly queryStreamDetailsQueryViewerCodeBlock;
  public readonly deleteQueryStreamModalInput;
  public readonly queryStreamDeletedSuccessToast;
  public readonly queryStreamCreateErrorToast;
  public readonly fetchMoreMatchingSamplesButton;
  // Canvas
  public readonly canvasTab;
  public readonly canvasZoomControls;
  public readonly canvasZoomIn;
  public readonly canvasZoomOut;
  public readonly canvasFitToScreen;
  public readonly canvasMinimap;
  public readonly canvasMinimapCollapse;
  public readonly canvasMinimapExpand;
  public readonly canvasToolbar;
  public readonly canvasUndo;
  public readonly canvasRedo;
  public readonly canvasAddSource;
  public readonly canvasAddDestination;
  public readonly canvasContextMenu;
  public readonly canvasContextMenuTidyUp;
  public readonly canvasEmptyState;
  // Streams layout
  public readonly streamsSourcesTable;
  public readonly streamsAddSourceButton;
  public readonly streamsDestinationsTable;
  public readonly streamsDestinationsSearch;

  constructor(private readonly page: ScoutPage) {
    this.processorFieldComboBox = this.page.components.comboBox(
      'streamsAppProcessorFieldSelectorComboFieldText'
    );
    this.conditionEditorFieldComboBox = this.page.components.comboBox(
      'streamsAppConditionEditorFieldText'
    );
    this.conditionEditorValueComboBox = this.page.components.comboBox(
      'streamsAppConditionEditorValueText'
    );
    this.processorTypeComboBox = this.page.components.comboBox('streamsAppProcessorTypeSelector');
    this.dateProcessorFormatsComboBox = this.page.components.comboBox(
      'streamsAppDateProcessorFormatsComboBox'
    );
    this.fieldTypeSuperSelect = this.page.components.superSelect('streamsAppFieldFormTypeSelect');
    this.previewDataGrid = this.page.components.dataGrid('streamsAppPreviewDataGrid');
    this.schemaDataGrid = this.page.components.dataGrid('streamsAppSchemaEditorFieldsTableLoaded');
    this.kibanaMonacoEditor = new KibanaCodeEditorWrapper(this.page);
    this.saveRoutingRuleButton = this.page.getByTestId('streamsAppStreamDetailRoutingSaveButton');
    this.concatFieldInput = this.page.components.superSelect('streamsAppConcatFieldInput');
    this.concatLiteralInput = this.page.getByTestId('streamsAppConcatLiteralInput');
    this.createStreamButton = this.page.getByTestId('streamsAppCreateStreamButton');
    this.createQueryStreamButton = this.page.getByTestId('streamsAppCreateQueryStreamButton');
    this.childStreamTypeSelector = this.page.getByTestId('streamsAppChildStreamTypeSelector');
    this.queryStreamFlyout = this.page.getByTestId('streamsAppQueryStreamFlyout');
    this.queryStreamFlyoutSaveButton = this.page.getByTestId(
      'streamsAppQueryStreamFlyoutSaveButton'
    );
    this.queryStreamCreatedSuccessToast = this.page.getByText('Query stream created successfully');
    this.childQueryStreamCreatedSuccessToast = this.page.getByText('Query stream created');
    this.queryStreamUpdatedSuccessToast = this.page.getByText('Query stream updated');
    this.queryStreamDetailsQueryViewerCodeBlock = this.page.getByTestId(
      'queryStreamDetailsQueryViewerCodeBlock'
    );
    this.deleteQueryStreamModalInput = this.page.getByTestId(
      'streamsAppDeleteStreamModalStreamNameInput'
    );
    this.queryStreamDeletedSuccessToast = this.page.getByText('Stream deleted');
    this.queryStreamCreateErrorToast = this.page.getByText('Error creating query stream');
    this.fetchMoreMatchingSamplesButton = this.page.getByTestId(
      'streamsAppFetchMoreMatchingSamplesButton'
    );
    // Canvas locators
    this.canvasTab = this.page.testSubj.locator('streamsCanvasTab');
    this.canvasZoomControls = this.page.testSubj.locator('streamsCanvasZoomControls');
    this.canvasZoomIn = this.page.testSubj.locator('streamsCanvasZoomIn');
    this.canvasZoomOut = this.page.testSubj.locator('streamsCanvasZoomOut');
    this.canvasFitToScreen = this.page.testSubj.locator('streamsCanvasFitToScreen');
    this.canvasMinimap = this.page.testSubj.locator('streamsCanvasMinimap');
    this.canvasMinimapCollapse = this.page.testSubj.locator('streamsCanvasMinimapCollapse');
    this.canvasMinimapExpand = this.page.testSubj.locator('streamsCanvasMinimapExpand');
    this.canvasToolbar = this.page.testSubj.locator('streamsCanvasToolbar');
    this.canvasUndo = this.page.testSubj.locator('streamsCanvasUndo');
    this.canvasRedo = this.page.testSubj.locator('streamsCanvasRedo');
    this.canvasAddSource = this.page.testSubj.locator('streamsCanvasAddSource');
    this.canvasAddDestination = this.page.testSubj.locator('streamsCanvasAddDestination');
    this.canvasContextMenu = this.page.testSubj.locator('streamsCanvasContextMenu');
    this.canvasContextMenuTidyUp = this.page.testSubj.locator('streamsCanvasContextMenuTidyUp');
    this.canvasEmptyState = this.page.testSubj.locator('streamsCanvasEmptyState');
    // Streams layout locators
    this.streamsSourcesTable = this.page.testSubj.locator('streamsSourcesTable');
    this.streamsAddSourceButton = this.page.testSubj.locator('streamsAddSourceButton');
    this.streamsDestinationsTable = this.page.testSubj.locator('streamsDestinationsTable');
    this.streamsDestinationsSearch = this.page.testSubj.locator('streamsDestinationsSearch');
  }

  async goto() {
    await this.page.gotoApp('streams');
  }

  async gotoStreamMainPage() {
    await this.page.gotoApp(`streams`);
  }

  async gotoStreamManagementTab(streamName: string, tabName: string) {
    await this.page.gotoApp(`streams/${streamName}/management/${tabName}`);
  }

  async gotoPartitioningTab(streamName: string) {
    await this.gotoStreamManagementTab(streamName, 'partitioning');
  }

  async gotoDataRetentionTab(streamName: string) {
    await this.gotoStreamManagementTab(streamName, 'lifecycle');
  }

  async gotoDataQualityTab(streamName: string) {
    await this.gotoStreamManagementTab(streamName, 'dataQuality');
  }

  async gotoOverviewTab(streamName: string) {
    await this.gotoStreamManagementTab(streamName, 'overview');
  }

  async gotoProcessingTab(streamName: string) {
    await this.gotoStreamManagementTab(streamName, 'processing');
  }

  async gotoSchemaEditorTab(streamName: string) {
    await this.gotoStreamManagementTab(streamName, 'schema');
  }

  async gotoAttachmentsTab(streamName: string) {
    await this.gotoStreamManagementTab(streamName, 'attachments');
  }

  async gotoStreamsLayout() {
    await this.page.gotoApp('streams/new-experience');
  }

  async gotoStreamsLayoutTab(tabName: string) {
    await this.page.gotoApp(`streams/new-experience/${tabName}`);
  }

  getStreamsLayoutTab(tabName: string) {
    return this.page.testSubj.locator(`streamsLayoutTab-${tabName}`);
  }

  async clickStreamsLayoutTab(tabName: string) {
    await this.getStreamsLayoutTab(tabName).click();
  }

  // Canvas utility methods
  getCanvasSourceNode(streamName: string) {
    return this.page.testSubj.locator('streamsCanvasSourceNode').filter({ hasText: streamName });
  }

  getCanvasDestinationNode(streamName: string) {
    return this.page.testSubj
      .locator('streamsCanvasDestinationNode')
      .filter({ hasText: streamName });
  }

  getCanvasProcessingButton(streamName: string) {
    return this.getCanvasDestinationNode(streamName).getByTestId('streamsCanvasProcessingButton');
  }

  getCanvasNodeByAriaLabel(ariaLabel: string) {
    return this.page.locator(`.react-flow__node[aria-label="${ariaLabel}"]`);
  }

  /**
   * Click the node title so the hit point scales with the React Flow zoom and
   * stays clear of the floating toolbar (bottom-center), even when `fitView`
   * shrinks the card to `MIN_ZOOM`.
   */
  async clickCanvasNode(
    node: Locator,
    options: { button?: 'left' | 'right'; modifiers?: Array<'Shift'> } = {}
  ) {
    await node.getByTestId('streamsCanvasNodeTitle').click(options);
  }

  async rightClickCanvasNode(node: Locator) {
    await this.clickCanvasNode(node, { button: 'right' });
  }

  async openCanvasPaneContextMenu() {
    await this.page
      .locator('.react-flow__pane')
      .click({ button: 'right', position: { x: 5, y: 5 } });
    await expect(this.canvasContextMenu).toBeVisible();
  }

  async tidyUpCanvasFromPane() {
    await this.openCanvasPaneContextMenu();
    await this.canvasContextMenuTidyUp.click();
    await expect(this.canvasContextMenu).toHaveCount(0);
  }

  async clickStreamNameLink(streamName: string) {
    await this.page.getByTestId(`streamsNameLink-${streamName}`).click();
  }

  async clickDataQualityTab() {
    await this.page.getByTestId('dataQualityTab').click();
  }

  async clickRetentionTab() {
    await this.page.getByTestId('retentionTab').click();
  }

  async clickRootBreadcrumb() {
    await this.page.getByTestId('breadcrumb first').click();
  }

  async backToStreamsMainPage() {
    const backButton = this.page.testSubj.locator('appHeaderBack');
    // Both the breadcrumb trail and the app header back button can be present at once, and each
    // navigates to the Streams main page. Prefer the back button when it is rendered.
    if (await backButton.isVisible()) {
      await backButton.click();
    } else {
      await this.page
        .locator('a[data-test-subj^="breadcrumb"]')
        .filter({ hasText: /^Streams$/ })
        .click();
    }
    await this.expectStreamsTableVisible();
  }

  // Streams table utility methods
  async expectStreamsTableVisible() {
    await expect(this.page.getByTestId('streamsTable')).toBeVisible();
  }

  async verifyDatePickerTimeRange(expectedRange: { from: string; to: string }) {
    // Use .first() because some pages (like Retention) may have multiple date pickers
    const newControlButton = this.page.testSubj.locator('dateRangePickerControlButton').first();
    try {
      await newControlButton.waitFor({ state: 'visible', timeout: 5_000 });
      // New DateRangePicker stores the range as ISO strings on data-date-range
      // for absolute dates. Compare canonical ISO on both sides to avoid the
      // display-format differences between the legacy and new pickers.
      const dateRange = (await newControlButton.getAttribute('data-date-range')) ?? '';
      const [actualStart, actualEnd] = dateRange.split(' to ').map((s) => s.trim());
      const expectedStart = moment.utc(expectedRange.from, LEGACY_DATE_FORMAT, true).toISOString();
      const expectedEnd = moment.utc(expectedRange.to, LEGACY_DATE_FORMAT, true).toISOString();
      expect(actualStart, `Date picker 'start date' is incorrect`).toBe(expectedStart);
      expect(actualEnd, `Date picker 'end date' is incorrect`).toBe(expectedEnd);
      return;
    } catch {
      // New picker not present; fall through to legacy assertions.
    }
    await expect(
      this.page.testSubj.locator('superDatePickerstartDatePopoverButton').first(),
      `Date picker 'start date' is incorrect`
    ).toHaveText(expectedRange.from);
    await expect(
      this.page.testSubj.locator('superDatePickerendDatePopoverButton').first(),
      `Date picker 'end date' is incorrect`
    ).toHaveText(expectedRange.to);
  }

  async verifyDocCount(streamName: string, expectedCount: number) {
    await expect(this.page.locator(`[data-test-subj="streamsDocCount-${streamName}"]`)).toHaveText(
      expectedCount.toString()
    );
  }

  async verifyDataQuality(streamName: string, expectedQuality: string) {
    await expect(
      this.page.locator(`[data-test-subj="dataQualityIndicator-${streamName}"]`)
    ).toHaveText(expectedQuality);
  }

  async verifyRetention(streamName: string, expectedIlmPolicy: string) {
    await expect(
      this.page.locator(`[data-test-subj="retentionColumn-${streamName}"]`)
    ).toContainText(expectedIlmPolicy);
  }

  async verifyDiscoverButtonLink(streamName: string, sourceCommand: 'FROM' | 'TS' = 'FROM') {
    const locator = this.page.locator(
      `[data-test-subj="streamsDiscoverActionButton-${streamName}"]`
    );
    await locator.waitFor();

    const href = await locator.getAttribute('href');
    if (!href) {
      throw new Error(`Missing href for Discover action button of stream ${streamName}`);
    }

    // Expect encoded ESQL snippet to appear (basic validation)
    // '<sourceCommand> <streamName>' should appear URL-encoded
    const expectedFragment = encodeURIComponent(`${sourceCommand} ${streamName}`);
    if (!href.includes(expectedFragment)) {
      throw new Error(
        `Href for ${streamName} did not contain expected ESQL fragment. href=${href} expectedFragment=${expectedFragment}`
      );
    }
  }

  async getDiscoverButtonLinkSourceCommand(streamName: string): Promise<'FROM' | 'TS' | null> {
    const locator = this.page.locator(
      `[data-test-subj="streamsDiscoverActionButton-${streamName}"]`
    );
    await locator.waitFor();

    const href = await locator.getAttribute('href');
    if (!href) {
      return null;
    }

    // Check which source command is used in the URL
    const fromFragment = encodeURIComponent(`FROM ${streamName}`);
    const tsFragment = encodeURIComponent(`TS ${streamName}`);

    if (href.includes(tsFragment)) {
      return 'TS';
    } else if (href.includes(fromFragment)) {
      return 'FROM';
    }
    return null;
  }

  /**
   * Verifies that the Discover button for a wired stream links to the ES|QL view ($.streamname)
   * rather than the raw glob pattern.
   */
  async verifyWiredStreamDiscoverLinkUsesView(streamName: string) {
    const locator = this.page.locator(
      `[data-test-subj="streamsDiscoverActionButton-${streamName}"]`
    );
    await locator.waitFor();

    const href = await locator.getAttribute('href');
    if (!href) {
      throw new Error(`Missing href for Discover action button of stream ${streamName}`);
    }

    // Wired streams should use the ES|QL view ($.streamname), not the raw pattern.
    const decodedHref = decodeURIComponent(href);
    const viewFragment = `FROM $.${streamName}`;
    const rawFragment = `FROM ${streamName}, ${streamName}.*`;

    if (decodedHref.includes(rawFragment)) {
      throw new Error(
        `Discover link for wired stream ${streamName} still uses raw glob pattern. Expected view reference ($.${streamName}).`
      );
    }
    if (!decodedHref.includes(viewFragment)) {
      throw new Error(
        `Discover link for wired stream ${streamName} does not contain expected view fragment. href=${href} expected=FROM $.${streamName}`
      );
    }
  }

  async verifyStreamsAreInTable(streamNames: string[]) {
    for (const name of streamNames) {
      await expect(
        this.page.getByTestId(`streamsNameLink-${name}`),
        `Stream ${name} should be present in the table`
      ).toBeVisible();
    }
  }

  async verifyStreamsAreNotInTable(streamNames: string[]) {
    for (const name of streamNames) {
      await expect(
        this.page.getByTestId(`streamsNameLink-${name}`),
        `Stream ${name} should not be present in the table`
      ).toBeHidden();
    }
  }

  async expandAllStreams() {
    const expandAllButton = this.page.getByTestId('streamsExpandAllButton');
    await expect(expandAllButton, 'Expand all button should be visible').toBeVisible();
    await expandAllButton.click();
  }

  async collapseAllStreams() {
    const collapseAllButton = this.page.getByTestId('streamsCollapseAllButton');
    await expect(collapseAllButton, 'Collapse all button should be visible').toBeVisible();
    await collapseAllButton.click();
  }

  async collapseExpandStream(streamName: string, collapse: boolean) {
    if (collapse) {
      const collapseButton = this.page.locator(`[data-test-subj="collapseButton-${streamName}"]`);
      if (await collapseButton.isVisible()) {
        await collapseButton.click();
      }
    } else {
      const expandButton = this.page.locator(`[data-test-subj="expandButton-${streamName}"]`);
      if (await expandButton.isVisible()) {
        await expandButton.click();
      }
    }
  }

  // Streams header utility methods

  /**
   * The shared app header only renders the first two badges inline and collapses the rest into a
   * "Show N more badges" overflow popover (overflow triggers at more than three badges). Call this
   * from tests that drive a stream with enough badges to overflow (e.g. TSDB streams) so overflowed
   * badges like the lifecycle badge become assertable.
   */
  async openBadgesOverflow() {
    await this.page.testSubj.click('appHeaderBadgesOverflow');
  }

  async verifyLifecycleBadge(streamName: string, expectedLabel: string) {
    await expect(this.page.testSubj.locator(`lifecycleBadge-${streamName}`)).toContainText(
      expectedLabel
    );
  }

  async verifyClassicBadge() {
    await expect(this.page.locator(`[data-test-subj="classicStreamBadge"]`)).toBeVisible();
  }

  async verifyWiredBadge() {
    await expect(this.page.locator(`[data-test-subj="wiredStreamBadge"]`)).toBeVisible();
  }

  // Routing-specific utility methods
  async clickCreateRoutingRule() {
    const button = this.page.getByTestId('streamsAppStreamDetailRoutingAddRuleButton');
    await expect(button).toBeVisible();
    // Locator.click() can get flaky here due to rapid re-renders; use a direct DOM click.
    await button.evaluate((el) => (el as HTMLElement).click());
  }

  async fillRoutingRuleName(name: string) {
    await this.page.getByTestId('streamsAppRoutingStreamEntryNameField').fill(name);
    // eslint-disable-next-line playwright/no-wait-for-timeout
    await this.page.waitForTimeout(300); // accommodates the input debounce delay
  }

  async clickEditRoutingRule(streamName: string) {
    await this.page.getByTestId(`routingRuleEditButton-${streamName}`).click();
  }

  async switchToColumnsView() {
    // Draft streams fetch samples via ES|QL from the parent, which can be slow
    await this.page.getByTestId('streamsAppPreviewTableViewModeToggle').click({ timeout: 60_000 });
  }

  /**
   * Draft-stream samples are fetched via ES|QL from the parent stream's `$.` view,
   * which the server creates asynchronously. Until it propagates, the query fails with
   * "Unknown index" and the data-source machine treats that as terminal (empty grid, no
   * auto-retry), so the preview grid — and the view-mode toggle inside its toolbar — never
   * render and any wait times out. Re-trigger the fetch via the refresh button until the
   * grid appears, so a not-yet-propagated parent view is retried rather than fatally awaited.
   */
  async waitForDraftPreviewSamples() {
    const grid = this.page.getByTestId('euiDataGridBody');
    const refreshButton = this.page.getByRole('button', { name: 'Refresh data preview' });

    await expect(async () => {
      if (await grid.isVisible()) return;
      // `click` auto-waits for the button to be enabled (i.e. not mid-load) before refetching.
      await refreshButton.click({ timeout: 15_000 });
      await expect(grid).toBeVisible({ timeout: 10_000 });
    }).toPass({ timeout: 90_000 });
  }

  async saveRoutingRule() {
    await this.page.testSubj.locator('streamsAppStreamDetailRoutingSaveButton').click();
  }

  async updateRoutingRule() {
    await this.page.testSubj.locator('streamsAppStreamDetailRoutingUpdateButton').click();
  }

  async cancelRoutingRule() {
    await this.page.testSubj.locator('streamsAppRoutingStreamEntryCancelButton').click();
  }

  async removeRoutingRule() {
    await this.page.getByRole('button', { name: 'Remove' }).click();
  }

  getModal() {
    return this.page.locator('[role="dialog"], [role="alertdialog"]');
  }

  async confirmDeleteInModal() {
    await this.getModal().getByRole('button', { name: 'Delete' }).click();
    await expect(this.getModal()).toBeHidden();
  }

  async confirmStreamDeleteInModal(streamName: string) {
    await this.getModal()
      .getByTestId('streamsAppDeleteStreamModalStreamNameInput')
      .fill(streamName);
    await this.getModal().getByRole('button', { name: 'Delete' }).click();
    await expect(this.getModal()).toBeHidden();
  }

  async cancelDeleteInModal() {
    await this.getModal().getByRole('button', { name: 'Cancel' }).click();
    await expect(this.getModal()).toBeHidden();
  }

  // Condition editor utility methods
  async fillConditionEditor({
    field,
    value,
    operator,
  }: {
    field?: string;
    value?: string;
    operator?: string;
  }) {
    if (field) {
      await this.conditionEditorFieldComboBox.setCustomSelectedOptions([field]);
    }
    if (value) {
      await this.conditionEditorValueComboBox.setCustomSelectedOptions([value]);
    }
    if (operator) {
      await this.page.getByTestId('streamsAppConditionEditorOperator').selectOption(operator);
    }
  }

  async fillConditionEditorWithSyntax(condition: string) {
    const editor = this.page.getByTestId('streamsAppConditionEditorCodeEditor');

    // CodeEditor can start in "read mode". Activate edit mode when needed.
    const activateEditModeButton = editor.getByRole('button', { name: /activate edit mode/i });
    try {
      await activateEditModeButton.click({ timeout: 1000 });
    } catch {
      // Button is not present when already in edit mode
    }

    // Use Monaco's model API to set value reliably (keyboard interactions can be flaky).
    // There can be multiple Monaco models on the page (e.g. YAML editor), so target the condition model.
    // Condition editor uses YAML format with a "field:" property.
    const conditionModelIndex = await this.page.evaluate(() => {
      interface MonacoModel {
        getValue(): string;
      }
      interface MonacoEditorApi {
        getModels(): MonacoModel[];
      }
      interface MonacoEnv {
        monaco?: { editor?: MonacoEditorApi };
      }
      const monacoEnv = (window as Window & { MonacoEnvironment?: MonacoEnv }).MonacoEnvironment;
      const editorApi = monacoEnv?.monaco?.editor;
      if (!editorApi) {
        throw new Error('MonacoEnvironment.monaco.editor is not available');
      }

      const values: string[] = editorApi.getModels().map((model) => model.getValue());
      // YAML condition format has "field:" at the start of a line
      return values.findIndex((value) => /^field:/m.test(value));
    });

    await this.kibanaMonacoEditor.setCodeEditorValue(
      condition,
      conditionModelIndex >= 0 ? conditionModelIndex : undefined
    );
  }

  async toggleConditionEditorWithSyntaxSwitch() {
    await this.page.getByTestId('streamsAppConditionEditorSwitch').click();
  }

  // Drag and drop utility methods, use with keyboard to test accessibility
  async dragRoutingRule(sourceStream: string, steps: number) {
    await this.page.components.draggable(`routingRuleDragHandle-${sourceStream}`).reorder(steps);
  }

  async dragProcessor({ processorPos, steps }: { processorPos: number; steps: number }) {
    const processors = await this.getProcessorsListItems();
    const targetProcessor = processors[processorPos];
    await this.page.components
      .draggable('streamsAppProcessorDragHandle', targetProcessor)
      .reorder(steps);
  }

  // Expectation utility methods
  async expectRoutingRuleVisible(streamName: string) {
    await expect(this.page.getByTestId(`routingRule-${streamName}`)).toBeVisible();
  }

  async expectRoutingRuleHidden(streamName: string) {
    await expect(this.page.getByTestId(`routingRule-${streamName}`)).toBeHidden();
  }

  async expectRoutingOrder(expectedOrder: string[]) {
    // Wait for the routing rules to be rendered before getting their locators

    await expect(this.page.locator('[data-test-subj^="routingRule-"]').first()).toBeVisible();

    const rulesLocators = await this.page.testSubj.locator('^routingRule-').all();

    const actualOrder = await Promise.all(
      rulesLocators.map(async (ruleLocator) => {
        const testSubj = await ruleLocator.getAttribute('data-test-subj');
        return testSubj?.replace('routingRule-', '');
      })
    );

    expect(actualOrder).toStrictEqual(expectedOrder);
  }

  async expectStreamNameFieldVisible() {
    await expect(this.page.getByTestId('streamsAppRoutingStreamEntryNameField')).toBeVisible();
  }

  async expectPreviewPanelVisible() {
    await expect(this.page.getByTestId('streamsAppRoutingPreviewPanelWithResults')).toBeVisible();
  }

  async saveRuleOrder() {
    await this.page.getByRole('button', { name: 'Change routing' }).click();
  }

  async cancelChanges() {
    await this.page.getByRole('button', { name: 'Cancel changes' }).click();
    await this.getModal().getByRole('button', { name: 'Discard unsaved changes' }).click();
  }

  /**
   * Utility for data processing
   */
  async clickAddProcessor(handleContextMenuClick: boolean = true) {
    if (handleContextMenuClick) {
      // New UI has direct button instead of context menu
      const button = this.page.getByTestId('streamsAppStreamDetailEnrichmentCreateProcessorButton');
      await expect(button).toBeVisible({ timeout: 60000 });
      // Locator.click() can get flaky here due to rapid re-renders; use a direct DOM click.
      await button.evaluate((el) => (el as HTMLElement).click());
    } else {
      // When called from within a condition's context menu, use the old menu item
      const menuItem = this.page.getByTestId(
        'streamsAppStreamDetailEnrichmentCreateStepButtonAddProcessor'
      );
      await expect(menuItem).toBeVisible({ timeout: 60000 });
      await menuItem.evaluate((el) => (el as HTMLElement).click());
    }

    // Wait for the processor configuration panel to be ready before interacting with inputs.
    await expect(
      this.page.getByTestId('streamsAppProcessorConfigurationSaveProcessorButton')
    ).toBeVisible({ timeout: 30000 });
  }

  async clickAddCondition(handleContextMenuClick: boolean = true) {
    if (handleContextMenuClick) {
      // New UI has direct button instead of context menu
      const button = this.page.getByTestId('streamsAppStreamDetailEnrichmentCreateConditionButton');
      await expect(button).toBeVisible({ timeout: 60000 });
      await button.evaluate((el) => (el as HTMLElement).click());
    } else {
      // When called from within a condition's context menu, use the old menu item
      const menuItem = this.page.getByTestId(
        'streamsAppStreamDetailEnrichmentCreateStepButtonAddCondition'
      );
      await expect(menuItem).toBeVisible({ timeout: 60000 });
      await menuItem.evaluate((el) => (el as HTMLElement).click());
    }

    // Wait for the condition configuration panel to be ready before interacting.
    await expect(
      this.page.getByTestId('streamsAppConditionConfigurationSaveConditionButton')
    ).toBeVisible({ timeout: 30000 });
  }
  async getProcessorPatternText() {
    return await this.page.getByTestId('streamsAppProcessorDescription').textContent();
  }

  async clickSaveProcessor() {
    await this.page.getByTestId('streamsAppProcessorConfigurationSaveProcessorButton').click();
  }

  async clickSaveCondition() {
    await this.page.getByTestId('streamsAppConditionConfigurationSaveConditionButton').click();
  }

  async clickCancelProcessorChanges() {
    await this.page.getByTestId('streamsAppProcessorConfigurationCancelButton').click();
  }

  async clickEditProcessor(pos: number) {
    const processorEditButton = await this.getProcessorEditButton(pos);
    await processorEditButton.click();
  }

  async clickDuplicateProcessor(pos: number) {
    const processorDuplicateButton = await this.getProcessorDuplicateButton(pos);
    await processorDuplicateButton.click();
  }

  async clickEditCondition(pos: number) {
    const conditionEditButton = await this.getConditionEditButton(pos);
    await conditionEditButton.click();
  }

  async clickManageDataSourcesButton() {
    await this.page.getByTestId('streamsAppProcessingManageDataSourcesButton').click();
  }

  async addDataSource(type: 'kql' | 'custom') {
    await this.page.getByTestId('streamsAppProcessingAddDataSourcesContextMenu').click();
    const dataSourcesMap = {
      kql: 'streamsAppProcessingAddKqlDataSource',
      custom: 'streamsAppProcessingAddCustomDataSource',
    };
    await this.page.getByTestId(dataSourcesMap[type]).click();
  }

  async getProcessorEditButton(pos: number) {
    const processors = await this.getProcessorsListItems();
    const targetProcessor = processors[pos];
    await targetProcessor.getByRole('button', { name: 'Step context menu' }).first().click();
    return this.page.getByTestId('stepContextMenuEditItem');
  }

  async getProcessorDuplicateButton(pos: number) {
    const processors = await this.getProcessorsListItems();
    const targetProcessor = processors[pos];
    await targetProcessor.getByRole('button', { name: 'Step context menu' }).first().click();
    return this.page.getByTestId('stepContextMenuDuplicateItem');
  }

  async getConditionEditButton(pos: number) {
    const conditions = await this.getConditionsListItems();
    const targetCondition = conditions[pos];
    await targetCondition.getByRole('button', { name: 'Step context menu' }).first().click();
    return this.page.getByTestId('stepContextMenuEditItem');
  }

  async getProcessorContextMenuButton(pos: number) {
    const processors = await this.getProcessorsListItems();
    const targetProcessor = processors[pos];
    return targetProcessor.getByRole('button', { name: 'Step context menu' });
  }

  async getConditionAddStepMenuButton(pos: number) {
    const conditions = await this.getConditionsListItems();
    const targetCondition = conditions[pos];
    return targetCondition.getByRole('button', { name: 'Create nested step' }).first();
  }

  async getConditionContextMenuButton(pos: number) {
    const conditions = await this.getConditionsListItems();
    const targetCondition = conditions[pos];

    const allButtons = await targetCondition
      .getByTestId('streamsAppStreamDetailEnrichmentStepContextMenuButton')
      .all();

    // Return the condition's context menu button, not nested conditions / actions.
    return allButtons[0];
  }

  // Gets the first level of nested steps under a condition at position 'pos'
  async getConditionNestedStepsList(pos: number) {
    const conditions = await this.getConditionsListItems();
    const targetCondition = conditions[pos];
    const connectedNodesList = targetCondition.getByTestId(
      'streamsAppStreamDetailEnrichmentConnectedNodesList'
    );
    // Get all <li> elements inside the connected nodes list
    const listItems = await connectedNodesList.locator('li').all();

    // For each <li>, get the first child that matches either processor or condition block
    const firstBlocks = await Promise.all(
      listItems.map(async (li) => {
        const processorBlock = li.getByTestId('streamsAppProcessorBlock').first();
        if (await processorBlock.isVisible()) {
          return processorBlock;
        }
        const conditionBlock = li.getByTestId('streamsAppConditionBlock').first();
        if (await conditionBlock.isVisible()) {
          return conditionBlock;
        }
        return null;
      })
    );

    // Filter out any nulls (where neither block was found)
    const validBlocks = firstBlocks.filter(Boolean);
    return validBlocks;
  }

  async confirmDiscardInModal() {
    await this.getModal().getByRole('button', { name: 'Discard' }).click();
    await expect(this.getModal()).toBeHidden();
  }

  async selectProcessorType(value: string) {
    await this.processorTypeComboBox.setSelectedOptions([value]);
  }

  async fillProcessorFieldInput(value: string, options?: { isCustomValue: boolean }) {
    const isCustomValue = options?.isCustomValue || false;
    if (isCustomValue) {
      return await this.processorFieldComboBox.setCustomSelectedOptions([value]);
    }
    await this.processorFieldComboBox.setSelectedOptions([value]);
  }

  async fillGrokPatternInput(value: string) {
    // Clean previous content
    await this.page.getByTestId('streamsAppPatternExpression').click();
    await this.page.keyboard.press('Control+A');
    await this.page.keyboard.press('Backspace');
    // Fill with new condition
    await this.page.getByTestId('streamsAppPatternExpression').getByRole('textbox').fill(value);
  }

  async fillGrokPatternDefinitionsInput(value: string) {
    await this.page.getByRole('button', { name: 'Advanced settings' }).click();
    // Clean previous content
    await this.page.getByTestId('streamsAppPatternDefinitionsEditor').click();
    await this.page.keyboard.press('Control+A');
    await this.page.keyboard.press('Backspace');
    // Fill with new condition
    await this.page
      .getByTestId('streamsAppPatternDefinitionsEditor')
      .getByRole('textbox')
      .fill(value);
  }

  async fillDateProcessorSourceFieldInput(value: string) {
    await this.processorFieldComboBox.setCustomSelectedOptions([value]);
  }

  async fillDateProcessorFormatInput(value: string) {
    await this.dateProcessorFormatsComboBox.setCustomSelectedOptions([value]);
  }

  async fillDateProcessorTargetFieldInput(value: string) {
    await this.page.getByLabel('Target field').fill(value);
  }

  async fillDateProcessorTimezoneInput(value: string) {
    await this.page.getByLabel('Timezone').fill(value);
  }

  async fillDateProcessorLocaleInput(value: string) {
    await this.page.getByLabel('Locale').fill(value);
  }

  async fillDateProcessorOutputFormatInput(value: string) {
    await this.page.getByLabel('Output format').fill(value);
  }

  async clickDateProcessorAdvancedSettings() {
    await this.page.getByRole('button', { name: 'Advanced settings' }).click();
  }

  async fillCustomSamplesEditor(value: string) {
    // Clean previous content
    await this.page.getByTestId('streamsAppCustomSamplesDataSourceEditor').click();
    await this.page.keyboard.press('Control+A');
    await this.page.keyboard.press('Backspace');
    // Fill with new condition
    await this.page
      .getByTestId('streamsAppCustomSamplesDataSourceEditor')
      .getByRole('textbox')
      .fill(value);
  }

  async fillCondition(field: string, operator: string, value: string) {
    await this.conditionEditorFieldComboBox.setCustomSelectedOptions([field]);
    await this.page.getByTestId('streamsAppConditionEditorOperator').selectOption(operator);
    await this.conditionEditorValueComboBox.setCustomSelectedOptions([value]);
  }

  async removeProcessor(pos: number) {
    await this.clickEditProcessor(pos);
    await this.page.getByRole('button', { name: 'Delete processor' }).click();
  }

  async waitForModifiedFieldsDetection() {
    // "Modified fields" badge only renders when there are detected fields; it's not a reliable
    // signal that the Processing tab has finished initializing. Instead, wait for stable UI
    // primitives that are always present once the tab is ready.
    await expect(this.page.getByTestId('streamsAppProcessingDataSourcesList')).toBeVisible({
      timeout: 60_000,
    });

    const readySignal = this.page
      .getByTestId('streamsAppStreamDetailEnrichmentRootSteps')
      .or(this.page.getByTestId('streamsAppProcessingPreviewEmptyPrompt'))
      .or(this.page.getByTestId('streamsAppStreamDetailEnrichmentCreateProcessorButton'))
      .or(this.page.getByTestId('streamsAppStreamDetailEnrichmentCreateConditionButton'));

    // `readySignal` can legitimately match multiple elements (e.g. both create buttons),
    // so avoid strict-locator assertions like `toBeVisible()` which require a single match.
    await expect.poll(async () => readySignal.count(), { timeout: 60_000 }).toBeGreaterThan(0);
  }

  async saveStepsListChanges() {
    await this.page.getByRole('button', { name: 'Save changes' }).click();
  }

  private async getStepListItems(testId: string, expectItems: boolean = true) {
    const timeout = expectItems ? 15_000 : 2_000;

    try {
      await expect(this.page.getByTestId('streamsAppStreamDetailEnrichmentRootSteps')).toBeVisible({
        timeout,
      });
    } catch {
      // If the list is not visible, it might be empty or not rendered yet
      return [];
    }
    return this.page.getByTestId(testId).all();
  }

  async getProcessorsListItems(expectProcessors: boolean = true) {
    return this.getStepListItems('streamsAppProcessorBlock', expectProcessors);
  }

  async getProcessorsListItemsFast() {
    // Fast method for when no processors are expected - uses minimal timeout
    return this.getProcessorsListItems(false);
  }

  async getConditionsListItems(expectConditions: boolean = true) {
    return this.getStepListItems('streamsAppConditionBlock', expectConditions);
  }

  async getConditionsListItemsFast() {
    // Fast method for when no conditions are expected - uses minimal timeout
    return this.getConditionsListItems(false);
  }

  async expectProcessorsOrder(expectedOrder: string[]) {
    // Wait for the routing rules to be rendered before getting their locators
    const processorLocators = await this.getProcessorsListItems();

    const actualOrder = await Promise.all(
      processorLocators.map(async (processorLocator) => {
        return processorLocator.getByTestId('streamsAppProcessorLegend').textContent();
      })
    );

    expect(actualOrder).toStrictEqual(expectedOrder);
  }

  getDataSourcesList() {
    return this.page.getByTestId('streamsAppProcessingDataSourcesList');
  }

  async getDataSourcesSelector() {
    const dataSourcesSelector = this.page.getByTestId('streamsAppProcessingDataSourceSelector');
    await expect(dataSourcesSelector).toBeVisible();
    return dataSourcesSelector;
  }

  getDataSourcesListItems() {
    return this.getDataSourcesList().getByTestId('streamsAppProcessingDataSourceListItem');
  }

  async confirmChangesInReviewModal() {
    const submitButton = this.page.getByTestId('streamsAppSchemaChangesReviewModalSubmitButton');
    await expect(submitButton).toBeEnabled({ timeout: 30_000 });
    await submitButton.click();
  }

  /**
   * Confirms changes in the review modal if it appears, otherwise does nothing.
   * The review modal only appears when there are mapping-affecting changes (not just
   * description-only or unmapped field changes). Use this when the save operation
   * might or might not trigger the modal depending on the type of changes.
   */
  async confirmChangesInReviewModalIfPresent() {
    const submitButton = this.page.getByTestId('streamsAppSchemaChangesReviewModalSubmitButton');
    const appeared = await submitButton
      .waitFor({ state: 'visible', timeout: 3_000 })
      .then(() => true)
      .catch(() => false);
    if (appeared) {
      await expect(submitButton).toBeEnabled({ timeout: 30_000 });
      await submitButton.click();
    }
  }

  /**
   * Utility for data preview
   */
  async getPreviewTableRows() {
    // Wait for the preview table to be rendered
    await expect(this.page.getByTestId('euiDataGridBody')).toBeVisible();
    return this.page.locator('[class="euiDataGridRow"]').all();
  }

  /**
   * Asserts a preview grid cell eventually contains `value`.
   * Uses a high default timeout so the simulation preview has time to refresh
   * after transient stale values (e.g. literal "null" from a Set processor).
   */
  async expectCellValueContains(params: CellValueExpectation) {
    await this.expectGridCellValueContains(this.previewDataGrid, params);
  }

  /** Same as {@link expectCellValueContains}, against the schema editor fields table. */
  async expectSchemaEditorCellValueContains(params: CellValueExpectation) {
    await this.expectGridCellValueContains(this.schemaDataGrid, params);
  }

  private async expectGridCellValueContains(
    grid: EuiDataGridObject,
    { columnName, rowIndex, value, invertCondition = false, timeout = 30_000 }: CellValueExpectation
  ) {
    const cellLocator = grid.cell(rowIndex, columnName);

    if (invertCondition) {
      await expect(cellLocator).not.toContainText(value, { timeout });
    } else {
      await expect(cellLocator).toContainText(value, { timeout });
    }
  }

  /**
   * Schema Editor specific utility methods
   */
  async expectSchemaEditorTableVisible() {
    await expect(this.page.getByTestId('streamsAppSchemaEditorFieldsTableLoaded')).toBeVisible();
  }

  async typeFieldName(value: string) {
    await this.page.testSubj.typeWithDelay('streamsAppSchemaEditorAddFieldFlyoutFieldName', value, {
      delay: 75,
    });
    await this.page.keyboard.press('Enter');
  }

  async searchFields(searchTerm: string) {
    const searchBox = this.page
      .getByTestId('streamsAppSchemaEditorControls')
      .getByRole('searchbox');
    await expect(searchBox).toBeVisible();
    await searchBox.clear();
    await searchBox.focus();
    await this.page.keyboard.type(searchTerm);
  }

  async clearFieldSearch() {
    const searchBox = this.page
      .getByTestId('streamsAppSchemaEditorControls')
      .getByRole('searchbox');
    await searchBox.clear();
  }

  async clickFieldTypeFilter() {
    await this.page.getByRole('button', { name: 'Type' }).click();
  }

  async clickFieldStatusFilter() {
    await this.page.getByRole('button', { name: 'Status' }).click();
  }

  async getFilterOptions() {
    return this.getModal().getByRole('option');
  }

  async selectFilterValue(value: string) {
    await this.getModal().getByRole('option').getByText(value).click();
  }

  async openFieldActionsMenu() {
    await expect(this.page.getByTestId('streamsAppActionsButton')).toHaveCount(1);
    await this.page.getByTestId('streamsAppActionsButton').click();
    await expect(this.getModal().getByText('Field actions')).toBeVisible();
  }

  async clickFieldAction(actionName: string) {
    await this.getModal().getByText(actionName).click();
    await expect(this.getModal().getByText('Field actions')).toBeHidden();
  }

  async expectFieldFlyoutOpen() {
    await expect(this.page.getByTestId('streamsAppSchemaEditorFlyoutCloseButton')).toBeVisible();
  }

  async setFieldMappingType(type: FieldTypeOption) {
    await this.page.getByTestId('streamsAppFieldFormTypeSelect').click();
    await this.page.getByTestId(`option-type-${type}`).click();
  }

  async stageFieldMappingChanges() {
    await this.page.getByTestId('streamsAppSchemaEditorFieldStageButton').click();
  }

  async fillFieldDescription(description: string) {
    const textarea = this.page.getByTestId('streamsAppFieldSummaryDescriptionTextArea');
    await expect(textarea).toBeVisible();
    await textarea.fill(description);
  }

  async clickEditFieldButton() {
    await this.page.getByTestId('streamsAppFieldSummaryEditButton').click();
  }

  async unmapField() {
    await this.openFieldActionsMenu();
    await this.clickFieldAction('Unmap field');
  }

  async discardStagedFieldMappingChanges() {
    await this.page.getByTestId('streamsAppSchemaEditorDiscardChangesButton').click();
  }

  async reviewStagedFieldMappingChanges() {
    await this.page.getByTestId('streamsAppSchemaEditorReviewStagedChangesButton').click();
  }

  async closeSchemaReviewModal() {
    await this.page.getByTestId('streamsAppSchemaChangesReviewModalCancelButton').click();
  }

  async submitSchemaChanges() {
    await this.page.getByTestId('streamsAppSchemaChangesReviewModalSubmitButton').click();
  }

  async checkDraggingOver() {
    await expect(this.page.getByTestId('droppable')).not.toHaveAttribute('class', /isDragging/);
  }

  private async clickCellActionButton(testId: string, cell: Locator) {
    // Get the cell action button scoped to the specific cell
    // EuiDataGrid renders cell actions for all cells in the DOM, but only the one
    // for the hovered/clicked cell is visible. We find the button within the cell's actions wrapper.
    const cellActionsWrapper = cell.locator('.euiDataGridRowCell__actionsWrapper');
    const button = cellActionsWrapper.getByTestId(testId);
    await button.scrollIntoViewIfNeeded();
    await button.click();
  }

  async clickFilterForButton(cell: Locator) {
    await this.clickCellActionButton('streamsAppCellActionFilterFor', cell);
  }

  async clickFilterOutButton(cell: Locator) {
    await this.clickCellActionButton('streamsAppCellActionFilterOut', cell);
  }

  /**
   * AI Suggestions utility methods
   */
  async clickSuggestPartitionsButton() {
    const button = this.page.getByTestId('streamsAppGenerateSuggestionButton');
    await expect(button).toBeVisible();
    await button.click();
  }

  async expectSuggestionsVisible(count?: number) {
    await expect(this.page.getByText('Review partitioning suggestions')).toBeVisible();
    if (count !== undefined) {
      const suggestions = await this.page
        .locator('[data-test-subj^="suggestionEditButton-"]')
        .all();
      expect(suggestions.length).toHaveLength(count);
    }
  }

  async previewSuggestion(suggestionName: string) {
    const previewButton = this.page.getByTestId(`suggestionPreviewButton-${suggestionName}`);
    await previewButton.click();
  }

  async editSuggestion(suggestionName: string) {
    const editButton = this.page.getByTestId(`suggestionEditButton-${suggestionName}`);
    await editButton.click();
  }

  async rejectSuggestion(suggestionName: string) {
    const rejectButton = this.page.getByTestId(`suggestionRejectButton-${suggestionName}`);
    await rejectButton.click();
  }

  async acceptSuggestion(suggestionName: string) {
    const acceptButton = this.page.getByTestId(`suggestionAcceptButton-${suggestionName}`);
    await acceptButton.click();
  }

  async expectConfirmationModalVisible() {
    const modal = this.page.getByTestId('streamsAppCreateStreamConfirmationModal');
    await expect(modal).toBeVisible();
    await expect(modal.getByTestId('streamsAppCreateStreamConfirmationModalTitle')).toBeVisible();
  }

  /**
   * Pipeline Suggestions utility methods
   */
  getSuggestPipelineButton() {
    return this.page.getByTestId('streamsAppGenerateSuggestionButton');
  }

  async clickSuggestPipelineButton() {
    const button = this.getSuggestPipelineButton();
    await expect(button).toBeVisible();
    await button.click();
  }

  getSuggestPipelinePanel() {
    return this.page.getByTestId('streamsAppSuggestPipelinePanel');
  }

  getPipelineSuggestionCallout() {
    return this.page.getByTestId('streamsAppPipelineSuggestionCallout');
  }

  getPipelineSuggestionAcceptButton() {
    return this.page.getByTestId('streamsAppPipelineSuggestionAcceptButton');
  }

  async acceptPipelineSuggestion() {
    const button = this.getPipelineSuggestionAcceptButton();
    await expect(button).toBeVisible();
    await button.click();
  }

  getPipelineSuggestionRejectButton() {
    return this.page.getByTestId('streamsAppPipelineSuggestionRejectButton');
  }

  async rejectPipelineSuggestion() {
    const button = this.getPipelineSuggestionRejectButton();
    await expect(button).toBeVisible();
    await button.click();
  }

  getRegeneratePipelineSuggestionButton() {
    return this.page
      .getByTestId('streamsAppGenerateSuggestionButton')
      .filter({ hasText: 'Regenerate' });
  }

  async regeneratePipelineSuggestion() {
    const regenerateButton = this.getRegeneratePipelineSuggestionButton();
    await expect(regenerateButton).toBeVisible();
    await regenerateButton.click();
  }

  /**
   * Share utility methods
   */

  async closeFlyout() {
    await this.page.getByTestId('euiFlyoutCloseButton').click();
    await expect(this.page.getByTestId('euiFlyoutCloseButton')).toBeHidden();
  }

  // Attachments utility methods
  async expectAttachmentsEmptyPromptVisible() {
    await expect(this.page.getByTestId('streamsAppAttachmentsEmptyStateAddButton')).toBeVisible({
      timeout: 15000, // the button may take longer to render due to environment slowness
    });
  }

  async clickAddAttachmentsButton() {
    await this.page.getByTestId('streamsAppAttachmentsEmptyStateAddButton').click();
  }

  async expectAddAttachmentFlyoutVisible() {
    await expect(
      this.page.getByTestId('streamsAppAddAttachmentFlyoutAttachmentsTable')
    ).toBeVisible();
  }

  async expectAttachmentInFlyout(attachmentTitle: string) {
    const flyoutTable = this.page.getByTestId('streamsAppAddAttachmentFlyoutAttachmentsTable');
    await expect(flyoutTable.getByText(attachmentTitle)).toBeVisible();
  }

  async closeAddAttachmentFlyout() {
    await this.page.getByTestId('streamsAppAddAttachmentFlyoutCancelButton').click();
  }

  async selectAllAttachmentsInFlyout() {
    const flyoutTable = this.page.getByTestId('streamsAppAddAttachmentFlyoutAttachmentsTable');
    await flyoutTable.locator('thead input[type="checkbox"]').click();
  }

  async selectAttachmentInFlyout(attachmentTitle: string) {
    const flyoutTable = this.page.getByTestId('streamsAppAddAttachmentFlyoutAttachmentsTable');
    const row = flyoutTable.getByRole('row', { name: attachmentTitle });
    await row.locator('input[type="checkbox"]').click();
  }

  async clickAddToStreamButton() {
    await this.page.getByTestId('streamsAppAddAttachmentFlyoutAddAttachmentsButton').click();
  }

  async expectAttachmentsTableVisible() {
    await expect(this.page.getByTestId('streamsAppStreamDetailAttachmentsTable')).toBeVisible();
  }

  async expectAttachmentInTable(attachmentTitle: string) {
    const table = this.page.getByTestId('streamsAppStreamDetailAttachmentsTable');
    await expect(table.getByText(attachmentTitle)).toBeVisible();
  }

  async expectAttachmentsCount(count: number) {
    // Use exact match to avoid matching toast notifications like "3 attachments were added to..."
    await expect(this.page.getByText(`${count} Attachments`, { exact: true })).toBeVisible();
  }

  async selectAllAttachmentsInTable() {
    const table = this.page.getByTestId('streamsAppStreamDetailAttachmentsTable');
    // Click the header checkbox to select all
    await table.locator('thead input[type="checkbox"]').click();
  }

  async clickSelectedAttachmentsLink() {
    await this.page.getByTestId('streamsAppStreamDetailSelectedAttachmentsLink').click();
  }

  async clickRemoveAttachmentsInPopover() {
    await this.page.getByText('Remove attachments').click();
  }

  async confirmRemoveAttachments() {
    await this.page.getByTestId('streamsAppConfirmAttachmentModalConfirmButton').click();
  }

  async clickAttachmentDetailsButton(attachmentTitle: string) {
    const table = this.page.getByTestId('streamsAppStreamDetailAttachmentsTable');
    // Find the row containing the attachment title, then click the expand button within that row
    const row = table.locator('tr').filter({ hasText: attachmentTitle });
    await row.getByTestId('streamsAppAttachmentDetailsButton').click();
  }

  async expectAttachmentDetailsFlyoutVisible() {
    await expect(
      this.page.getByTestId('streamsAppAttachmentDetailsFlyoutGoToButton')
    ).toBeVisible();
  }

  async expectAttachmentDetailsFlyoutTitle(title: string) {
    // The title is in an h2 element within the flyout header
    const flyoutTitle = this.page.locator('.euiFlyoutHeader h2');
    await expect(flyoutTitle).toHaveText(title);
  }

  async expectAttachmentDetailsFlyoutDescription(description: string) {
    // The description is shown in the first InfoPanel - scope to the flyout
    const flyout = this.page.locator('.euiFlyout');
    const descriptionText = flyout.getByText(description);
    await expect(descriptionText).toBeVisible();
  }

  async expectAttachmentDetailsFlyoutType(typeLabel: string) {
    // The type badge is inside the flyout - scope to the flyout to avoid matching table badges
    const flyout = this.page.locator('.euiFlyout');
    const typeBadge = flyout.getByText(typeLabel, { exact: true });
    await expect(typeBadge).toBeVisible();
  }

  async expectAttachmentDetailsFlyoutHasStream(streamName: string) {
    const streamLink = this.page.getByTestId('streamsAppAttachmentDetailsFlyoutStreamLink');
    await expect(streamLink).toHaveText(streamName);
  }

  async closeAttachmentDetailsFlyout() {
    await this.page.getByTestId('euiFlyoutCloseButton').click();
  }

  async clickUnlinkInDetailsFlyout() {
    await this.page.getByTestId('streamsAppAttachmentDetailsFlyoutUnlinkButton').click();
  }

  async clickProcessorPreviewTab(label: string) {
    await this.page.getByText(label).click();
  }

  async clickAddConcatField() {
    await this.page.getByTestId('streamsAppConcatAddFieldButton').click();
  }

  async clickAddConcatLiteral() {
    await this.page.getByTestId('streamsAppConcatAddLiteralButton').click();
  }

  async fillConcatFieldInput(value: string) {
    await this.concatFieldInput.selectOptionByValue(value);
  }

  async fillConcatLiteralInput(value: string) {
    await this.concatLiteralInput.fill(value);
  }

  async openCreateStreamPopover() {
    await this.createStreamButton.click();
  }

  async openStreamsSettings() {
    await this.page.getByTestId('app-menu-overflow-button').click();
    await this.page.getByTestId('streamsAppSettingsButton').click();
  }

  async clickCreateQueryStreamButton() {
    await this.openCreateStreamPopover();
    await this.createQueryStreamButton.click();
  }

  async clickQueryStreamFlyoutSaveButton() {
    await this.queryStreamFlyoutSaveButton.click();
  }

  async selectChildStreamType(type: 'Query' | 'Index') {
    await this.childStreamTypeSelector.getByRole('button', { name: type }).click();
  }

  async clickQueryModeCreateQueryStreamButton() {
    await this.page.getByTestId('streamsAppQueryModeCreateButton').click();
  }

  async clickQueryStreamFormCreateButton() {
    await this.page.getByTestId('streamsAppQueryStreamFormSaveButton').click();
  }

  async clickQueryStreamLink(streamName: string) {
    await this.page.getByTestId(`streamsAppQueryStreamEntryButton-${streamName}`).click();
  }

  async clickQueryStreamDetailsTab(tabName: string) {
    await this.page.getByTestId(`queryStreamDetails-${tabName}-tab`).click();
  }

  async clickQueryStreamDetailsEditQueryButton() {
    await this.page.getByTestId('queryStreamDetailsEditQueryButton').click();
  }

  async clickDeleteQueryStreamButton() {
    await this.page.testSubj.click('app-menu-overflow-button');
    await this.page.testSubj.click('streamsDeleteStreamButton');
  }

  async fillDeleteQueryStreamModalInput(value: string) {
    await this.deleteQueryStreamModalInput.fill(value);
  }

  async clickDeleteQueryStreamModalDeleteButton() {
    // Toast notifications rendered in the globalToastList can overlap the confirm
    // button and intercept pointer events. Wait until the list is empty before clicking.
    await this.waitForEmptyGlobalToastList();
    await this.page.getByTestId('streamsAppDeleteStreamModalDeleteButton').click();
  }

  // Toasts rendered in the globalToastList can overlay buttons (Save / Delete) and
  // intercept pointer events, causing flaky click timeouts. Use before clicking a
  // primary action that lives near the bottom of the viewport.
  async waitForEmptyGlobalToastList(timeout: number = 15_000) {
    await expect(this.page.testSubj.locator('globalToastList').locator(':scope > *')).toHaveCount(
      0,
      { timeout }
    );
  }

  async clickQueryStreamEditButton(streamName: string) {
    await this.page.getByTestId(`streamsAppQueryStreamEditButton-${streamName}`).click();
  }

  async clickQueryStreamFormSaveButton() {
    await this.page.getByTestId('streamsAppQueryStreamFormSaveButton').click();
  }

  async saveInlineQueryStreamEdit() {
    await this.clickQueryStreamFormSaveButton();
    await this.queryStreamUpdatedSuccessToast.waitFor({ state: 'visible' });
  }

  async saveFlyoutQueryStreamCreate() {
    await this.waitForEmptyGlobalToastList();
    await this.clickQueryStreamFlyoutSaveButton();
    await this.queryStreamCreatedSuccessToast.waitFor({ state: 'visible' });
  }

  async saveFlyoutQueryStreamEdit() {
    await this.waitForEmptyGlobalToastList();
    await this.clickQueryStreamFlyoutSaveButton();
    await this.queryStreamUpdatedSuccessToast.waitFor({ state: 'visible' });
  }

  async clickQueryStreamFormDeleteButton() {
    await this.page.getByTestId('streamsAppQueryStreamFormDeleteButton').click();
  }

  async createRootQueryStream(name: string, esqlQuery: string) {
    await this.clickCreateQueryStreamButton();
    await this.fillRoutingRuleName(name);
    await this.kibanaMonacoEditor.waitCodeEditorReady('streamsEsqlEditor');
    await this.kibanaMonacoEditor.setCodeEditorValue(esqlQuery);
    await this.saveFlyoutQueryStreamCreate();
  }

  async openCreateChildQueryStreamForm() {
    await this.clickQueryModeCreateQueryStreamButton();
    await this.kibanaMonacoEditor.waitCodeEditorReady('streamsEsqlEditor');
  }

  async fillChildQueryStreamForm(childName: string, esqlQuery: string) {
    await this.fillRoutingRuleName(childName);
    await this.kibanaMonacoEditor.setCodeEditorValue(esqlQuery);
  }

  async saveChildQueryStream() {
    await this.clickQueryStreamFormCreateButton();
    await this.childQueryStreamCreatedSuccessToast.waitFor({ state: 'visible' });
  }

  async createChildQueryStreamFromPartitioningTab(childName: string, esqlQuery: string) {
    await this.openCreateChildQueryStreamForm();
    await this.fillChildQueryStreamForm(childName, esqlQuery);
    await this.saveChildQueryStream();
  }

  async clickFetchMoreUntilThresholdReached({ maxClicks = 10 } = {}) {
    let clicks = 0;
    while (await this.fetchMoreMatchingSamplesButton.isVisible()) {
      if (clicks >= maxClicks) {
        throw new Error(
          `Fetch more button still visible after ${maxClicks} clicks. ` +
            `The match rate may not have crossed the threshold — check that enough matching data exists in ES.`
        );
      }
      await this.fetchMoreMatchingSamplesButton.click();
      clicks++;
      // Wait for the button to either disappear or become clickable again
      await this.fetchMoreMatchingSamplesButton
        .waitFor({ state: 'hidden', timeout: 10000 })
        .catch(() => {});
    }
  }

  async deleteQueryStreamFromOverviewTab(streamName: string) {
    await this.clickStreamNameLink(streamName);
    await this.clickQueryStreamDetailsTab('overview');
    await this.clickDeleteQueryStreamButton();
    await this.fillDeleteQueryStreamModalInput(streamName);
    await this.clickDeleteQueryStreamModalDeleteButton();
    await this.queryStreamDeletedSuccessToast.waitFor({ state: 'visible' });
  }
}
