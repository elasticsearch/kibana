/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ScoutPage, Locator } from '@kbn/scout';

/**
 * Page object for the correlations tool overlay inside the flyout v2 document flyout.
 * Covers both the summary row in the Insights section and the full tool overlay panel.
 */
export class CorrelationsTool {
  /** Title link in the insights correlations panel that opens the tool overlay. */
  public readonly titleLink: Locator;
  /** Header row of the tools flyout — use to confirm the overlay is open. */
  public readonly toolsFlyoutHeader: Locator;

  // --- Sections inside the correlations tool overlay ---
  /** Alerts table inside the "related by source event" section (visible when expanded). */
  public readonly sameSourceAlertsSectionTable: Locator;
  /** Expand button on the first alert row in the sameSource table. */
  public readonly sameSourceAlertsSectionFirstPreviewButton: Locator;
  /** "Investigate in timeline" button in the sameSource section header. */
  public readonly sameSourceAlertsSectionInvestigateInTimeline: Locator;

  /** Alerts table inside the "related by session" section (visible when expanded). */
  public readonly sessionAlertsSectionTable: Locator;
  /** Expand button on the first alert row in the session table. */
  public readonly sessionAlertsSectionFirstPreviewButton: Locator;

  constructor(page: ScoutPage) {
    this.titleLink = page.testSubj.locator('securitySolutionFlyoutCorrelationsTitleLink');
    this.toolsFlyoutHeader = page.testSubj.locator('securitySolutionFlyoutToolsFlyoutHeader');
    this.sameSourceAlertsSectionTable = page.testSubj.locator(
      'securitySolutionFlyoutCorrelationsDetailsAlertsBySourceSectionTable'
    );
    this.sameSourceAlertsSectionFirstPreviewButton = page.testSubj.locator(
      'securitySolutionFlyoutCorrelationsDetailsAlertsBySourceSectionAlertPreviewButton'
    );
    this.sameSourceAlertsSectionInvestigateInTimeline = page.testSubj.locator(
      'securitySolutionFlyoutCorrelationsDetailsAlertsBySourceSectionInvestigateInTimeline'
    );
    this.sessionAlertsSectionTable = page.testSubj.locator(
      'securitySolutionFlyoutCorrelationsDetailsAlertsBySessionSectionTable'
    );
    this.sessionAlertsSectionFirstPreviewButton = page.testSubj.locator(
      'securitySolutionFlyoutCorrelationsDetailsAlertsBySessionSectionAlertPreviewButton'
    );
  }

  /**
   * Click the "Investigate in timeline" button in the sameSource section header. The test-subj
   * wraps the button, so scope to the inner button role rather than exposing the chain in the spec.
   */
  async clickSameSourceInvestigateInTimeline() {
    await this.sameSourceAlertsSectionInvestigateInTimeline.getByRole('button').click();
  }
}
