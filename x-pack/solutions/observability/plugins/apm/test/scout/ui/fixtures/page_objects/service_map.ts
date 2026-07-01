/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { EuiComboBoxWrapper, type KibanaUrl, type Locator, type ScoutPage } from '@kbn/scout-oblt';
import { expect } from '@kbn/scout-oblt/ui';
import { waitForApmSettingsHeaderLink } from '../page_helpers';
import { EXTENDED_TIMEOUT, PRODUCTION_ENVIRONMENT, SERVICE_OPBEANS_JAVA } from '../constants';

export class ServiceMapPage {
  public serviceMap: Locator;
  public serviceMapGraph: Locator;
  public serviceMapViewport: Locator;
  public mapControls: Locator;
  public zoomInBtn: Locator;
  public zoomOutBtn: Locator;
  public centerServiceMapBtn: Locator;
  public zoomInBtnControl: Locator;
  public zoomOutBtnControl: Locator;
  public fitViewBtn: Locator;
  public noServicesPlaceholder: Locator;
  public serviceMapFlyout: Locator;
  public serviceMapFlyoutContent: Locator;
  public serviceMapFlyoutTitle: Locator;
  public serviceMapFlyoutActions: Locator;
  public serviceMapPopover: Locator;
  public serviceMapPopoverContent: Locator;
  public serviceMapPopoverTitle: Locator;
  public serviceMapDependencyDetailsButton: Locator;
  public serviceMapEdgeExploreTracesButton: Locator;
  public serviceMapOptionsPanel: Locator;
  public serviceMapHideControlsButton: Locator;
  public serviceMapShowControlsButton: Locator;
  public serviceMapFindInPageInput: Locator;
  /**
   * Native search `<input>` (`SERVICE_MAP_FIND_INPUT_ID`). Prefer this for fill/focus so React
   * `onFocus` runs and find highlights sync (`service_map_find_in_page` gates on `isFocused`).
   */
  public serviceMapFindInPageNativeInput: Locator;
  public serviceMapFindMatchSummary: Locator;
  public readonly serviceMapEmbeddable: Locator;
  public readonly serviceMapEditorSaveButton: Locator;
  public readonly serviceMapEditorServiceNameComboBox: EuiComboBoxWrapper;
  public readonly serviceMapEditorEnvironmentComboBoxInput: Locator;
  public readonly serviceMapEditorKueryInput: Locator;
  public readonly serviceMapViewFullMapButton: Locator;
  public readonly dashboardEmbeddablePanel: Locator;
  public readonly maximizedDashboardPanel: Locator;

  private readonly serviceMapEditorServiceNameComboBoxLoading: Locator;
  private readonly serviceMapEditorEnvironmentComboBoxLoading: Locator;

  constructor(private readonly page: ScoutPage, private readonly kbnUrl: KibanaUrl) {
    this.serviceMap = page.testSubj.locator('serviceMap');
    this.serviceMapGraph = page.testSubj.locator('serviceMapGraph');
    this.serviceMapViewport = this.serviceMapGraph.locator('.react-flow__viewport');
    this.mapControls = page.locator('[data-testid="rf__controls"]');
    this.zoomInBtn = this.mapControls.getByRole('button', { name: 'Zoom In' });
    this.zoomOutBtn = this.mapControls.getByRole('button', { name: 'Zoom Out' });
    this.centerServiceMapBtn = this.mapControls.getByRole('button', { name: 'Fit View' });
    this.zoomInBtnControl = this.zoomInBtn;
    this.zoomOutBtnControl = this.zoomOutBtn;
    this.fitViewBtn = this.centerServiceMapBtn;
    this.noServicesPlaceholder = page.locator('.euiEmptyPrompt__content .euiTitle');
    this.serviceMapPopover = page.testSubj.locator('serviceMapPopover');
    this.serviceMapPopoverContent = page.testSubj.locator('serviceMapPopoverContent');
    this.serviceMapPopoverTitle = page.testSubj.locator('serviceMapPopoverTitle');
    this.serviceMapFlyout = page.testSubj.locator('serviceFlyout');
    this.serviceMapFlyoutContent = page.testSubj.locator('serviceFlyoutOverview');
    this.serviceMapFlyoutTitle = page.testSubj.locator('serviceFlyoutTitleLink');
    this.serviceMapFlyoutActions = page.testSubj.locator('serviceFlyoutActionsButton');
    this.serviceMapDependencyDetailsButton = page.testSubj.locator(
      'apmDependencyContentsDependencyDetailsButton'
    );
    this.serviceMapEdgeExploreTracesButton = page.testSubj.locator(
      'apmEdgeContentsOpenInDiscoverButton'
    );
    this.serviceMapOptionsPanel = page.testSubj.locator('serviceMapOptionsPanel');
    this.serviceMapHideControlsButton = page.testSubj.locator('serviceMapHideControlsButton');
    this.serviceMapShowControlsButton = page.testSubj.locator('serviceMapShowControlsButton');
    this.serviceMapFindInPageInput = page.testSubj.locator('serviceMapControlsSearch');
    this.serviceMapFindInPageNativeInput = page.locator('#serviceMapFindInPageInput');
    this.serviceMapFindMatchSummary = page.testSubj.locator('serviceMapFindMatchSummary');
    this.serviceMapEmbeddable = page.testSubj.locator('apmServiceMapEmbeddable');
    this.serviceMapEditorSaveButton = page.testSubj.locator('apmServiceMapEditorSaveButton');
    this.serviceMapEditorServiceNameComboBox = new EuiComboBoxWrapper(
      page,
      'apmServiceMapEditorServiceNameComboBox'
    );
    this.serviceMapEditorServiceNameComboBoxLoading = page.testSubj.locator(
      'apmServiceMapEditorServiceNameComboBoxLoading'
    );
    this.serviceMapEditorEnvironmentComboBoxLoading = page.testSubj.locator(
      'apmServiceMapEditorEnvironmentComboBoxLoading'
    );
    this.serviceMapEditorEnvironmentComboBoxInput = page.testSubj
      .locator('apmServiceMapEditorEnvironmentComboBox')
      .locator('[data-test-subj="comboBoxInput"]');
    this.serviceMapEditorKueryInput = page.testSubj.locator('apmServiceMapEditorKueryInput');
    this.serviceMapViewFullMapButton = page.testSubj.locator('serviceMapViewFullMapButton');
    this.dashboardEmbeddablePanel = page.testSubj.locator('embeddablePanel');
    this.maximizedDashboardPanel = page.locator('.dshLayout-isMaximizedPanel');
  }

  async gotoWithDateSelected(start: string, end: string, options?: { kuery?: string }) {
    const params = new URLSearchParams({
      rangeFrom: start,
      rangeTo: end,
      environment: PRODUCTION_ENVIRONMENT,
    });
    if (options?.kuery) {
      params.set('kuery', options.kuery);
    }
    await this.page.goto(`${this.kbnUrl.app('apm')}/service-map?${params.toString()}`);
    return await waitForApmSettingsHeaderLink(this.page);
  }

  async gotoDetailedServiceMapWithDateSelected(start: string, end: string) {
    await this.page.goto(
      `${this.kbnUrl.app(
        'apm'
      )}/services/${SERVICE_OPBEANS_JAVA}/service-map?rangeFrom=${start}&rangeTo=${end}&environment=${PRODUCTION_ENVIRONMENT}`
    );
    return await waitForApmSettingsHeaderLink(this.page);
  }

  async getSearchBar() {
    await this.page.testSubj.waitForSelector('apmUnifiedSearchBar');
  }

  async typeInTheSearchBar(text: string) {
    await this.getSearchBar();
    await this.page.testSubj.typeWithDelay('apmUnifiedSearchBar', text, { delay: 150 });
    await this.page.getByTestId('querySubmitButton').press('Enter');
  }

  async waitForServiceMapToLoad() {
    await this.serviceMap.waitFor({ state: 'visible' });
    await this.serviceMapGraph.waitFor({ state: 'visible' });
  }

  async waitForMapToLoad() {
    await this.serviceMapGraph.waitFor({ state: 'visible' });
  }

  async getServiceMapEditorComboBoxLoadingCount() {
    return (
      (await this.serviceMapEditorServiceNameComboBoxLoading.count()) +
      (await this.serviceMapEditorEnvironmentComboBoxLoading.count())
    );
  }

  getServiceMapNodeContextHighlightFrame(serviceName: string) {
    return this.page.testSubj.locator(
      `serviceMapNodeContextHighlightFrame > serviceMapNode-service-${serviceName}`
    );
  }

  async selectServiceMapEditorEnvironment(environment: string) {
    await this.serviceMapEditorEnvironmentComboBoxInput.click();
    await this.page.keyboard.type(environment, { delay: 50 });
    const environmentOption = this.page.getByRole('option', { name: environment });
    await environmentOption.waitFor({ state: 'visible', timeout: EXTENDED_TIMEOUT });
    await environmentOption.click();
  }

  /**
   * Blur focused controls and move focus to `document.body` so the service map Ctrl/Cmd+K handler
   * treats the shortcut as in scope (see graph.tsx).
   */
  async focusBodyForMapShortcuts() {
    await this.page.evaluate(() => {
      (document.activeElement as HTMLElement | null)?.blur?.();
      document.body.focus();
    });
  }

  /** Triggers find-in-page focus via the same shortcut as the in-app hint (Control+K / Meta+K). */
  async openFindInPageWithKeyboardShortcut() {
    await this.focusBodyForMapShortcuts();
    await this.page.keyboard.press('Control+KeyK');
  }

  async clickZoom(direction: 'in' | 'out') {
    const button = direction === 'in' ? this.zoomInBtn : this.zoomOutBtn;
    await button.waitFor({ state: 'visible' });
    try {
      await button.click({ timeout: EXTENDED_TIMEOUT });
    } catch {
      await button.click({ timeout: EXTENDED_TIMEOUT });
    }
  }

  async clickZoomIn() {
    await this.clickZoom('in');
  }

  async clickZoomOut() {
    await this.clickZoom('out');
  }

  async clickMapZoomIn() {
    await this.zoomInBtnControl.click();
  }

  async clickMapZoomOut() {
    await this.zoomOutBtnControl.click();
  }

  /**
   * After fit view, the map animates; merging alert/SLO badges can also re-run layout + fitView (see graph.tsx).
   * React Flow drives that animation via the viewport `transform`, so the layout is settled once the
   * transform stops changing between consecutive frames. Polls that signal (Playwright auto-retries the
   * assertion) instead of a fixed sleep, so clicks always target the final node positions.
   */
  async settleServiceMapLayout() {
    await this.serviceMapGraph.waitFor({ state: 'visible' });
    await this.serviceMapViewport.waitFor({ state: 'attached', timeout: EXTENDED_TIMEOUT });

    let previousTransform: string | null = null;

    await expect
      .poll(
        async () => {
          const currentTransform = await this.serviceMapViewport.evaluate(
            (el) => getComputedStyle(el).transform
          );
          const isStable = currentTransform === previousTransform;
          previousTransform = currentTransform;
          return isStable;
        },
        { timeout: EXTENDED_TIMEOUT }
      )
      .toBe(true);
  }

  async clickFitView() {
    await this.fitViewBtn.click();
    await this.settleServiceMapLayout();
  }

  async openServiceNodeFlyout(serviceName: string) {
    await this.settleServiceMapLayout();
    await this.clickServiceNode(serviceName);
    await this.serviceMapFlyoutContent.waitFor({ state: 'visible', timeout: EXTENDED_TIMEOUT });
  }

  async openNodePopover(nodeId: string) {
    await this.settleServiceMapLayout();
    await this.clickNode(nodeId);
    await this.serviceMapPopoverContent.waitFor({ state: 'visible', timeout: EXTENDED_TIMEOUT });
  }

  async openEdgePopover(edgeId: string) {
    await this.settleServiceMapLayout();
    await this.clickEdge(edgeId);
    await this.serviceMapPopoverContent.waitFor({ state: 'visible', timeout: EXTENDED_TIMEOUT });
  }

  getNodeById(nodeId: string) {
    return this.serviceMapGraph.locator(`[data-id="${nodeId}"]`);
  }

  /** Wrapper for a service node (icon, badges row, label). `data.id` on the map matches the service name in tests. */
  getServiceNodeRoot(serviceName: string) {
    return this.serviceMapGraph.getByTestId(`serviceMapNode-service-${serviceName}`);
  }

  /**
   * Highlight frame around the active find-in-page match (`HighlightWrapper` when `isActiveSearchMatch`).
   */
  getActiveFindMatchHighlightFrame(serviceName: string) {
    return this.getServiceNodeRoot(serviceName).locator(
      'xpath=ancestor::*[@data-test-subj="serviceMapNodeSearchHighlightFrame"][1]'
    );
  }

  /**
   * The clickable/focusable service circle only. Prefer this over role+name: when shown, violated/degrading SLO
   * badges can also be buttons whose accessible name includes the service name, so `getByRole('button', { name })`
   * is ambiguous.
   */
  getServiceNode(serviceName: string) {
    return this.getServiceNodeRoot(serviceName).getByTestId('serviceMapNodeServiceCircle');
  }

  getServiceNodeAlertsBadge(serviceName: string) {
    return this.getServiceNodeRoot(serviceName).getByTestId('serviceMapNodeAlertsBadge');
  }

  async waitForNodeToLoad(nodeId: string) {
    await this.getNodeById(nodeId).waitFor({ state: 'visible', timeout: EXTENDED_TIMEOUT });
  }

  async waitForServiceNodeToLoad(serviceName: string) {
    const circle = this.getServiceNode(serviceName);
    await circle.waitFor({ state: 'attached', timeout: EXTENDED_TIMEOUT });
    await circle.waitFor({ state: 'visible', timeout: EXTENDED_TIMEOUT });
  }

  /**
   * Stable handle on the edge stroke path (see `ServiceMapEdge` + `BaseEdge`); avoids the React Flow
   * wrapper `[data-id]` which can detach briefly while the graph re-renders after fit view / badge merge.
   */
  getEdgeById(edgeId: string) {
    return this.serviceMapGraph.getByTestId(`serviceMapEdge-${edgeId}`);
  }

  async waitForEdgeToLoad(edgeId: string) {
    const edge = this.getEdgeById(edgeId);
    await edge.waitFor({ state: 'attached', timeout: EXTENDED_TIMEOUT });
    await edge.waitFor({ state: 'visible', timeout: EXTENDED_TIMEOUT });
  }

  /**
   * Nodes and edges can unmount/remount while the map settles (fit view animation, badge API merge).
   * Re-resolve locators each attempt to avoid "not attached to the DOM" flakes.
   */
  private async runWithDomRetry<T>(
    description: string,
    run: () => Promise<T>,
    timeoutMs: number = EXTENDED_TIMEOUT
  ): Promise<T> {
    const start = Date.now();
    let lastError: Error | undefined;
    while (Date.now() - start < timeoutMs) {
      try {
        return await run();
      } catch (e) {
        lastError = e instanceof Error ? e : new Error(String(e));
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    }
    throw lastError ?? new Error(`runWithDomRetry failed: ${description}`);
  }

  /**
   * Clicks the node's real hit target (service circle or dependency diamond), not the React Flow
   * wrapper. The wrapper's center often lands on `NodeLabel` (`pointer-events: none`), so the click
   * passes through to the pane and never opens the popover.
   */
  async clickNode(nodeId: string) {
    await this.runWithDomRetry(`clickNode ${nodeId}`, async () => {
      const node = this.getNodeById(nodeId);
      await node.waitFor({ state: 'attached', timeout: 10000 });
      await node.waitFor({ state: 'visible', timeout: 10000 });
      const circle = node.getByTestId('serviceMapNodeServiceCircle');
      const diamond = node.getByTestId('serviceMapNodeDiamondHit');
      if ((await circle.count()) > 0) {
        const hit = circle;
        await hit.scrollIntoViewIfNeeded();
        await hit.click({ force: true, timeout: 15000 });
      } else if ((await diamond.count()) > 0) {
        const hit = diamond;
        await hit.scrollIntoViewIfNeeded();
        await hit.click({ force: true, timeout: 15000 });
      } else {
        await node.scrollIntoViewIfNeeded();
        await node.click({ force: true, timeout: 15000 });
      }
    });
  }

  /** Click a service node by its service name (uses role + aria-label). */
  async clickServiceNode(serviceName: string) {
    await this.runWithDomRetry(`clickServiceNode ${serviceName}`, async () => {
      const button = this.getServiceNode(serviceName);
      await button.waitFor({ state: 'attached', timeout: 10000 });
      await button.waitFor({ state: 'visible', timeout: 10000 });
      await button.scrollIntoViewIfNeeded();
      await button.click({ force: true, timeout: 15000 });
    });
  }

  async clickEdge(edgeId: string) {
    await this.runWithDomRetry(`clickEdge ${edgeId}`, async () => {
      const edge = this.getEdgeById(edgeId);
      await edge.waitFor({ state: 'attached', timeout: 10000 });
      await edge.waitFor({ state: 'visible', timeout: 10000 });
      await edge.scrollIntoViewIfNeeded();
      await edge.click({ force: true, timeout: 15000 });
    });
  }

  async waitForPopoverToBeVisible() {
    await this.serviceMapPopover.waitFor({ state: 'visible', timeout: EXTENDED_TIMEOUT });
    await this.serviceMapPopoverContent.waitFor({ state: 'visible', timeout: EXTENDED_TIMEOUT });
  }

  async waitForPopoverToBeHidden(options?: { timeout?: number }) {
    await this.serviceMapPopoverContent.waitFor({
      state: 'hidden',
      timeout: options?.timeout ?? EXTENDED_TIMEOUT,
    });
  }

  async waitForFlyoutToBeHidden(options?: { timeout?: number }) {
    await this.serviceMapFlyout.waitFor({
      state: 'hidden',
      timeout: options?.timeout ?? EXTENDED_TIMEOUT,
    });
  }

  async closeFlyout() {
    await this.page.testSubj.click('euiFlyoutCloseButton');
    await this.waitForFlyoutToBeHidden();
  }

  /** Dismiss any open popover (e.g. so a node is not covered). No-op if popover already hidden. */
  async dismissPopoverIfOpen() {
    await this.page.keyboard.press('Escape');
    await this.waitForPopoverToBeHidden({ timeout: 2000 }).catch(() => {});
  }

  /**
   * Collapse the options panel if it is currently open. Use in tests that don't exercise the
   * panel itself so the expanded menu can't overlap nodes/edges/badges after fit view.
   */
  async closeOptionsPanelIfOpen() {
    if (await this.serviceMapHideControlsButton.isVisible().catch(() => false)) {
      await this.serviceMapHideControlsButton.click();
      await this.serviceMapOptionsPanel.waitFor({ state: 'hidden', timeout: 2000 }).catch(() => {});
    }
  }

  /**
   * Expand the options panel if it is currently collapsed. Use in tests that assert on
   * panel contents (find-in-page input, filters) after the panel was closed in beforeEach.
   */
  async openOptionsPanelIfClosed() {
    if (await this.serviceMapShowControlsButton.isVisible().catch(() => false)) {
      await this.serviceMapShowControlsButton.click();
      await this.serviceMapOptionsPanel
        .waitFor({ state: 'visible', timeout: 2000 })
        .catch(() => {});
    }
  }

  async getPopoverTitle() {
    return this.serviceMapPopoverTitle.textContent();
  }

  async getFlyoutTitle() {
    return this.serviceMapFlyoutTitle.textContent();
  }

  async clickServiceMapFlyoutAction(action: string) {
    await this.serviceMapFlyoutActions.click();
    await this.page.testSubj.click(`serviceFlyoutActionsMenuItem-${action}`);
  }

  async focusNodeAndWaitForFocus(nodeId: string) {
    await this.waitForNodeToLoad(nodeId);
    const node = this.getNodeById(nodeId);
    const circle = node.getByTestId('serviceMapNodeServiceCircle');
    const diamond = node.getByTestId('serviceMapNodeDiamondHit');
    if ((await circle.count()) > 0) {
      await circle.focus();
    } else if ((await diamond.count()) > 0) {
      await diamond.focus();
    } else {
      await node.getByRole('button').focus();
    }
    await this.page.waitForFunction(
      (id) => {
        const nodeEl = document.querySelector(`[data-id="${id}"]`);
        const circleEl = nodeEl?.querySelector('[data-test-subj="serviceMapNodeServiceCircle"]');
        const diamondEl = nodeEl?.querySelector('[data-test-subj="serviceMapNodeDiamondHit"]');
        const buttonEl = circleEl ?? diamondEl ?? nodeEl?.querySelector('[role="button"]');
        return (
          buttonEl === document.activeElement ||
          nodeEl === document.activeElement ||
          (nodeEl?.contains(document.activeElement) ?? false)
        );
      },
      nodeId,
      { timeout: EXTENDED_TIMEOUT }
    );
  }

  /** Focus a service node by service name (uses role + aria-label) and wait for focus. */
  async focusServiceNodeAndWaitForFocus(serviceName: string) {
    await this.waitForServiceNodeToLoad(serviceName);
    const button = this.getServiceNode(serviceName);
    await button.focus();
    await this.page.waitForFunction(
      (name: string) => {
        const focused = document.activeElement;
        if (!focused || !focused.getAttribute('aria-label')) return false;
        return focused.getAttribute('aria-label')!.toLowerCase().includes(name.toLowerCase());
      },
      serviceName,
      { timeout: EXTENDED_TIMEOUT }
    );
  }

  /**
   * Focus the node wrapper (element with data-id) so the document keydown handler
   * sees activeElement.closest('[data-id]') and can open the popover on Enter/Space.
   */
  async focusNodeWrapperAndWaitForFocus(nodeId: string) {
    await this.waitForNodeToLoad(nodeId);
    const wrapper = this.getNodeById(nodeId);
    await wrapper.focus();
    await this.page.waitForFunction(
      (id: string) => document.activeElement?.getAttribute('data-id') === id,
      nodeId,
      { timeout: EXTENDED_TIMEOUT }
    );
  }

  async openPopoverWithKeyboard(nodeId: string, key: 'Enter' | ' ') {
    await this.focusNodeAndWaitForFocus(nodeId);
    const node = this.getNodeById(nodeId);
    const circle = node.getByTestId('serviceMapNodeServiceCircle');
    const diamond = node.getByTestId('serviceMapNodeDiamondHit');
    if ((await circle.count()) > 0) {
      await circle.press(key === ' ' ? 'Space' : key);
    } else if ((await diamond.count()) > 0) {
      await diamond.press(key === ' ' ? 'Space' : key);
    } else {
      await node.getByRole('button').press(key === ' ' ? 'Space' : key);
    }
    await this.waitForPopoverToBeVisible();
  }

  /**
   * Open popover via keyboard for a service node. Focuses the node wrapper then dispatches keydown
   * on document so the document listener (use_keyboard_navigation) runs; it uses activeElement
   * (the focused wrapper) to find the node and open the popover. Dispatching on document avoids
   * React Flow's node wrapper onKeyDown handling Enter/Space before our listener.
   */
  async openPopoverWithKeyboardForService(serviceName: string, key: 'Enter' | ' ') {
    await this.waitForServiceNodeToLoad(serviceName);
    await this.focusNodeWrapperAndWaitForFocus(serviceName);
    const keyToSend = key === ' ' ? ' ' : 'Enter';
    await this.page.evaluate((k: string) => {
      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: k, code: k === ' ' ? 'Space' : 'Enter', bubbles: true })
      );
    }, keyToSend);
    await this.waitForPopoverToBeVisible();
  }
}
