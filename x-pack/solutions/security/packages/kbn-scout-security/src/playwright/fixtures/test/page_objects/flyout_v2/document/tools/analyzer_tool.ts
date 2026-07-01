/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ScoutPage, Locator } from '@kbn/scout';

/**
 * Page object for the analyzer tool overlay inside the flyout v2 document flyout.
 * Covers both the analyzer preview in the Visualizations section and the full tool overlay panel
 * that renders the resolver process-tree graph.
 */
export class AnalyzerTool {
  /**
   * Title link in the analyzer preview (Visualizations section) that opens the tool overlay.
   * Only rendered when the analyzer is enabled for the document.
   */
  public readonly titleLink: Locator;
  /** Header row of the tools flyout — use to confirm the overlay is open. */
  public readonly toolsFlyoutHeader: Locator;

  /** Container wrapping the resolver graph inside the analyzer tool overlay. */
  public readonly analyzerGraph: Locator;
  /** The resolver graph (process tree) once data has loaded. */
  public readonly resolverGraph: Locator;
  /** Loading spinner shown while the resolver fetches the process tree. */
  public readonly resolverLoading: Locator;
  /** All process nodes rendered in the resolver graph; use toHaveCount() to assert the number. */
  public readonly resolverNodes: Locator;
  /** Empty-state message shown when the resolver finds no process events. */
  public readonly resolverNoData: Locator;

  // --- Resolver detail panel (opened by clicking a graph node) ---
  /** Node detail panel shown after clicking a process node in the graph. */
  public readonly nodeDetailPanel: Locator;
  /** Title link in the node detail panel; opens the analyzed process document in a child flyout. */
  public readonly nodeDetailTitleLink: Locator;
  /** "{N} Events" link in the node detail panel; drills into the node's related events by type. */
  public readonly nodeDetailEventsLink: Locator;
  /** Event-type (category) row link in the node events panel; e.g. the "alert" category. */
  public readonly eventTypeLink: Locator;
  /** Events-in-category panel listing individual events (e.g. alerts rendered by rule name). */
  public readonly eventsInCategoryPanel: Locator;
  /** Individual event link inside the events-in-category panel; opens that event in a child flyout. */
  public readonly eventInCategoryLink: Locator;

  private readonly page: ScoutPage;

  constructor(page: ScoutPage) {
    this.page = page;
    this.titleLink = page.testSubj.locator('securitySolutionFlyoutAnalyzerPreviewTitleLink');
    this.toolsFlyoutHeader = page.testSubj.locator('securitySolutionFlyoutToolsFlyoutHeader');
    this.analyzerGraph = page.testSubj.locator('securitySolutionFlyoutAnalyzerGraph');
    this.resolverGraph = page.testSubj.locator('resolver:graph');
    this.resolverLoading = page.testSubj.locator('resolver:graph:loading');
    this.resolverNodes = page.testSubj.locator('resolver:node');
    this.resolverNoData = page.testSubj.locator('resolver:no-process-events');
    this.nodeDetailPanel = page.testSubj.locator('resolver:panel:node-detail');
    this.nodeDetailTitleLink = page.testSubj.locator('resolver:node-detail:title-link');
    this.nodeDetailEventsLink = page.testSubj.locator('resolver:node-detail:node-events-link');
    this.eventTypeLink = page.testSubj.locator('resolver:panel:node-events:event-type-link');
    this.eventsInCategoryPanel = page.testSubj.locator('resolver:panel:events-in-category');
    this.eventInCategoryLink = page.testSubj.locator(
      'resolver:panel:node-events-in-category:event-link'
    );
  }

  /** Primary button of the resolver graph node whose process name matches `name`. */
  resolverNodeButton(name: string): Locator {
    return this.page.testSubj.locator('resolver:node:primary-button').filter({ hasText: name });
  }
}
