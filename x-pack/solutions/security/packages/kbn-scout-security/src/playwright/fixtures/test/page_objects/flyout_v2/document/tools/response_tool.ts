/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ScoutPage, Locator } from '@kbn/scout';

/**
 * Page object for the response tool overlay inside the flyout v2 document flyout.
 * Opened from the "View response details" button in the Response section.
 */
export class ResponseTool {
  /** Response details body — confirms the response overlay is open. */
  public readonly content: Locator;
  /** Wrapper around the response actions view (results, empty state, or privilege callout). */
  public readonly viewWrapper: Locator;
  /** Empty-state message shown when the alert has no response actions. */
  public readonly noData: Locator;
  /** Rendered comment for a single endpoint response action result. */
  public readonly endpointActionResult: Locator;

  constructor(page: ScoutPage) {
    this.content = page.testSubj.locator('securitySolutionFlyoutResponseDetails');
    this.viewWrapper = page.testSubj.locator('responseActionsViewWrapper');
    this.noData = page.testSubj.locator('securitySolutionFlyoutResponseNoData');
    this.endpointActionResult = page.testSubj.locator('endpoint-results-comment');
  }
}
