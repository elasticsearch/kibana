/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import expect from '@kbn/expect';
import { FtrService } from '@kbn/test-suites-xpack-platform/functional/ftr_provider_context';
import { testSubjectIds } from '../constants/test_subject_ids';

const {
  PREVIEW_SECTION_TEST_ID,
  PREVIEW_SECTION_HEADER_TEST_ID,
  EVENTS_TABLE_ROW_CSS_SELECTOR,
  VISUALIZATIONS_SECTION_HEADER_TEST_ID,
  VISUALIZATIONS_SECTION_CONTENT_TEST_ID,
  GRAPH_PREVIEW_CONTENT_TEST_ID,
  GRAPH_PREVIEW_LOADING_TEST_ID,
  GROUPED_ITEM_TEST_ID,
} = testSubjectIds;

export class NetworkEventsPageObject extends FtrService {
  private readonly retry = this.ctx.getService('retry');
  private readonly pageObjects = this.ctx.getPageObjects(['common', 'header']);
  private readonly testSubjects = this.ctx.getService('testSubjects');
  private readonly defaultTimeoutMs = this.ctx.getService('config').get('timeouts.waitFor');

  async navigateToNetworkEventsPage(urlQueryParams: string = ''): Promise<void> {
    await this.pageObjects.common.navigateToUrlWithBrowserHistory(
      'securitySolution',
      '/network/events',
      `${urlQueryParams && `?${urlQueryParams}`}`,
      {
        ensureCurrentUrl: false,
      }
    );
    await this.pageObjects.header.waitUntilLoadingHasFinished();
  }

  getAbsoluteTimerangeFilter(from: string, to: string) {
    return `timerange=(global:(linkTo:!(),timerange:(from:%27${from}%27,kind:absolute,to:%27${to}%27)))`;
  }

  getFlyoutFilter(eventId: string) {
    return `flyout=(preview:!(),right:(id:document-details-right,params:(id:%27${eventId}%27,indexName:logs-gcp.audit-default,scopeId:network-page-events)))`;
  }

  /**
   * Clicks the refresh button on the network events page and waits for it to complete
   */
  async clickRefresh(): Promise<void> {
    await this.ensureOnNetworkEventsPage();
    await this.testSubjects.click('querySubmitButton');

    // wait for refresh to complete
    await this.retry.waitFor(
      'Network events pages refresh button to be enabled',
      async (): Promise<boolean> => {
        const refreshButton = await this.testSubjects.find('querySubmitButton');

        return (await refreshButton.isDisplayed()) && (await refreshButton.isEnabled());
      }
    );
  }

  async ensureOnNetworkEventsPage(): Promise<void> {
    await this.testSubjects.existOrFail('header-page-title');
  }

  async waitForListToHaveEvents(timeoutMs?: number): Promise<void> {
    const allEventRows = await this.testSubjects.findService.allByCssSelector(
      EVENTS_TABLE_ROW_CSS_SELECTOR
    );

    if (!Boolean(allEventRows.length)) {
      await this.retry.waitForWithTimeout(
        'waiting for events to show up on network events page',
        timeoutMs ?? this.defaultTimeoutMs,
        async (): Promise<boolean> => {
          await this.clickRefresh();

          const allEventRowsInner = await this.testSubjects.findService.allByCssSelector(
            EVENTS_TABLE_ROW_CSS_SELECTOR
          );

          return Boolean(allEventRowsInner.length);
        }
      );
    }
  }

  flyout = {
    expandVisualizations: async (): Promise<void> => {
      const contentEl = await this.testSubjects.find(VISUALIZATIONS_SECTION_CONTENT_TEST_ID);
      const isVisualizationVisible = (await contentEl.getSize()).height > 0;

      if (!isVisualizationVisible) {
        await this.testSubjects.click(VISUALIZATIONS_SECTION_HEADER_TEST_ID);
      }
    },

    assertGraphPreviewVisible: async () => {
      return await this.testSubjects.existOrFail(GRAPH_PREVIEW_CONTENT_TEST_ID);
    },

    assertGraphNodesNumber: async (expected: number) => {
      await this.flyout.waitGraphIsLoaded();
      const graph = await this.testSubjects.find(GRAPH_PREVIEW_CONTENT_TEST_ID);
      await graph.scrollIntoView();
      const nodes = await graph.findAllByCssSelector('.react-flow__nodes .react-flow__node');
      expect(nodes.length).to.be(expected);
    },

    waitGraphIsLoaded: async () => {
      await this.testSubjects.missingOrFail(GRAPH_PREVIEW_LOADING_TEST_ID, { timeout: 10000 });
    },

    assertPreviewPanelIsOpen: async (type: 'alert' | 'event' | 'group') => {
      await this.testSubjects.existOrFail(PREVIEW_SECTION_TEST_ID, { timeout: 10000 });
      expect(await this.testSubjects.getVisibleText(PREVIEW_SECTION_HEADER_TEST_ID)).to.be(
        type === 'alert'
          ? 'Preview alert details'
          : type === 'event'
          ? 'Preview event details'
          : 'Grouped entities panel'
      );
    },
    assertPreviewPanelGroupedItemsNumber: async (expected: number) => {
      await this.testSubjects.existOrFail(PREVIEW_SECTION_TEST_ID, { timeout: 10000 });
      const groupedItems = await this.testSubjects.findAll(GROUPED_ITEM_TEST_ID);
      expect(groupedItems.length).to.be(expected);
    },
  };
}
