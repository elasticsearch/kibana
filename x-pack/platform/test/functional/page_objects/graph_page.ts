/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { WebElementWrapper } from '@kbn/ftr-common-functional-ui-services';
import { FtrService } from '../ftr_provider_context';

interface Node {
  circle: WebElementWrapper;
  label: string;
}

interface Edge {
  sourceNode: Node;
  targetNode: Node;
  width: number;
  element: WebElementWrapper;
}

export class GraphPageObject extends FtrService {
  private readonly find = this.ctx.getService('find');
  private readonly log = this.ctx.getService('log');
  private readonly testSubjects = this.ctx.getService('testSubjects');
  private readonly retry = this.ctx.getService('retry');
  private readonly browser = this.ctx.getService('browser');

  private readonly common = this.ctx.getPageObject('common');
  private readonly header = this.ctx.getPageObject('header');

  async selectIndexPattern(pattern: string) {
    await this.testSubjects.click('graphDatasourceButton');
    await this.testSubjects.click(`savedObjectTitle${pattern.split(' ').join('-')}`);
    // wait till add fields button becomes available, then the index pattern is loaded completely
    await this.testSubjects.waitForAttributeToChange(
      'graph-add-field-button',
      'aria-disabled',
      'false'
    );
    // Need document focus to not be on `graphDatasourceButton` so its tooltip does not
    // obscure the next intended click area. Focus the adjaecnt input instead.
    await this.testSubjects.click('queryInput');
  }

  async clickAddField() {
    await this.retry.try(async () => {
      await this.testSubjects.click('graph-add-field-button');
      await this.testSubjects.existOrFail('graph-field-search', { timeout: 3000 });
    });
  }

  async selectField(field: string) {
    await this.testSubjects.setValue('graph-field-search', field, { clearWithKeyboard: true });
    await this.find.clickDisplayedByCssSelector(`[title="${field}"]`);
  }

  async addFields(fields: string[]) {
    this.log.debug('click Add Field icon');
    await this.clickAddField();
    for (const field of fields) {
      this.log.debug('select field ' + field);
      await this.selectField(field);
    }
  }

  async query(str: string) {
    await this.testSubjects.click('queryInput');
    await this.testSubjects.setValue('queryInput', str);
    await this.testSubjects.click('graph-explore-button');
  }

  private getPositionAsString(x: string, y: string) {
    return `${x}-${y}`;
  }

  private async getCirclePosition(element: WebElementWrapper) {
    const x = (await element.getAttribute('cx')) ?? '';
    const y = (await element.getAttribute('cy')) ?? '';
    return this.getPositionAsString(x, y);
  }

  private async getLinePositions(element: WebElementWrapper) {
    const x1 = (await element.getAttribute('x1')) ?? '';
    const y1 = (await element.getAttribute('y1')) ?? '';
    const x2 = (await element.getAttribute('x2')) ?? '';
    const y2 = (await element.getAttribute('y2')) ?? '';
    return [this.getPositionAsString(x1, y1), this.getPositionAsString(x2, y2)];
  }

  async isolateEdge(from: string, to: string) {
    // select all nodes
    await this.testSubjects.click('graphSelectAll');

    // go through all nodes and remove every node not source or target
    const selections = await this.find.allByCssSelector('.gphSelectionList__field');
    for (const selection of selections) {
      const labelElement = await selection.findByTagName('span');
      const selectionLabel = await labelElement.getVisibleText();
      this.log.debug('Looking at selection ' + selectionLabel);
      if (selectionLabel !== from && selectionLabel !== to) {
        await (await selection.findByTestSubject(`graph-selected-${selectionLabel}`)).click();
        await this.common.sleep(200);
      }
    }

    // invert selection to select all nodes not source or target
    await this.testSubjects.click('graphInvertSelection');

    // remove all other nodes
    await this.testSubjects.click('graphRemoveSelection');
  }

  async stopLayout() {
    if (await this.testSubjects.exists('graphPauseLayout')) {
      await this.testSubjects.click('graphPauseLayout');
    }
  }

  async startLayout() {
    if (await this.testSubjects.exists('graphResumeLayout')) {
      await this.testSubjects.click('graphResumeLayout');
    }
  }

  async getGraphObjects() {
    await this.stopLayout();
    // read node labels directly from DOM because getVisibleText is not reliable for the way the graph is rendered
    const nodeNames: string[] = await this.browser.execute(`
      const elements = document.querySelectorAll('#graphSvg text.gphNode__label');
      return [...elements].map(element => element.innerHTML);
    `);
    const graphElements = await this.find.allByCssSelector(
      '#graphSvg line:not(.gphEdge--clickable), #graphSvg circle'
    );
    const nodes: Node[] = [];
    const nodePositionMap: Record<string, number> = {};
    const edges: Edge[] = [];

    // find all nodes and save their positions
    for (const element of graphElements) {
      const tagName: string = await element.getTagName();
      // check the position of the circle element
      if (tagName === 'circle') {
        nodes.push({ circle: element, label: nodeNames[nodes.length] });
        const position = await this.getCirclePosition(element);
        nodePositionMap[position] = nodes.length - 1;
      }
    }

    // find all edges
    for (const element of graphElements) {
      const tagName: string = await element.getTagName();
      if (tagName === 'line') {
        const [sourcePosition, targetPosition] = await this.getLinePositions(element);
        const lineStyle = (await element.getAttribute('style')) ?? '';
        // grep out the width of the connection from the style attribute
        const strokeWidth = Number(/stroke-width: ?(\d+(\.\d+)?)/.exec(lineStyle)![1]);
        edges.push({
          element,
          width: strokeWidth,
          // look up source and target node by matching start and end coordinates
          // of the edges and the nodes
          sourceNode: nodes[nodePositionMap[sourcePosition]],
          targetNode: nodes[nodePositionMap[targetPosition]],
        });
      }
    }

    await this.startLayout();

    return {
      nodes,
      edges,
    };
  }

  async createWorkspace() {
    await this.testSubjects.click('graphCreateGraphPromptButton');
  }

  async newGraph() {
    this.log.debug('Click New Workspace');
    await this.retry.try(async () => {
      await this.testSubjects.click('graphNewButton');
      await this.testSubjects.existOrFail('confirmModal', { timeout: 3000 });
    });
    await this.common.clickConfirmOnModal();
    await this.testSubjects.existOrFail('graphGuidancePanel');
  }

  async saveGraph(name: string) {
    await this.retry.try(async () => {
      await this.testSubjects.click('graphSaveButton');
      await this.testSubjects.existOrFail('savedObjectTitle', { timeout: 3000 });
    });
    await this.testSubjects.setValue('savedObjectTitle', name);
    await this.testSubjects.click('confirmSaveSavedObjectButton');

    // Confirm that the Graph has been saved.
    return await this.testSubjects.exists('saveGraphSuccess', { timeout: 10000 });
  }

  async searchForWorkspaceWithName(name: string) {
    await this.retry.try(async () => {
      const searchBox = await this.testSubjects.find('contentListToolbar-searchBox');
      await searchBox.clearValue();
      await searchBox.click();
      await searchBox.type(name);
      await this.common.pressEnterKey();
      // `EuiBasicTable` adds the `.euiBasicTable-loading` class while
      // `loading={isFetching}` is `true`. Waiting for it to disappear ensures the
      // post-search render has settled before any subsequent assertions or clicks.
      await this.find.waitForDeletedByCssSelector('.euiBasicTable-loading', 5000);
    });

    await this.header.waitUntilLoadingHasFinished();
  }

  async goToListingPage() {
    await this.retry.try(async () => {
      await this.testSubjects.click('breadcrumb graphHomeBreadcrumb first');
      await this.testSubjects.existOrFail('kibana-content-list-page-header', { timeout: 3000 });
    });
  }

  async openGraph(name: string) {
    await this.goToListingPage();
    await this.searchForWorkspaceWithName(name);
    await this.find.clickByLinkText(name);
    // wait for nodes to show up
    if (!(await this.find.existsByCssSelector('.gphNode', 10000))) {
      throw new Error('nodes did not show up');
    }
    // let force simulation settle down before continuing
    await this.common.sleep(5000);
  }

  async getVennTerm1() {
    const el = await this.find.byCssSelector('span.gphLinkSummary__term--1');
    return await el.getVisibleText();
  }

  async getVennTerm2() {
    const el = await this.find.byCssSelector('span.gphLinkSummary__term--2');
    return await el.getVisibleText();
  }

  async getSmallVennTerm1() {
    const el = await this.find.byCssSelector('small.gphLinkSummary__term--1');
    return await el.getVisibleText();
  }

  async getSmallVennTerm12() {
    const el = await this.find.byCssSelector('small.gphLinkSummary__term--1-2');
    return await el.getVisibleText();
  }

  async getSmallVennTerm2() {
    const el = await this.find.byCssSelector('small.gphLinkSummary__term--2');
    return await el.getVisibleText();
  }

  async getAllGraphNodes() {
    const el = await this.find.allByCssSelector('.gphNode');
    return el.length;
  }
}
