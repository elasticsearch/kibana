/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ScoutPage, Locator } from '@kbn/scout';

/**
 * Page object for the threat intelligence tool overlay inside the flyout v2 document flyout.
 * Covers both the summary row in the Insights section and the full tool overlay panel.
 */
export class ThreatIntelligenceTool {
  /** "Fields enriched with threat intelligence" count button in the insights panel. */
  public readonly enrichedButton: Locator;
  /** Loading spinner while the TI tool overlay fetches event data. */
  public readonly detailsLoading: Locator;
  /** Loading spinner while the TI tool overlay fetches investigation-time enrichments. */
  public readonly detailsLoadingEnrichment: Locator;
  /** "Enriched with threat intelligence" section inside the TI tool overlay. */
  public readonly detailsEnrichedSection: Locator;
  /** Date range picker for investigation-time enrichments in the TI tool overlay. */
  public readonly detailsRangePicker: Locator;
  /** All enrichment accordions in the TI tool overlay. */
  public readonly detailsAccordions: Locator;
  /** All rendered content sections inside the TI tool overlay; used to assert any content rendered. */
  public readonly detailsSections: Locator;

  private readonly page: ScoutPage;

  constructor(page: ScoutPage) {
    this.page = page;
    this.enrichedButton = page.testSubj.locator(
      'securitySolutionFlyoutInsightsThreatIntelligenceEnrichedWithThreatIntelligenceButton'
    );
    this.detailsLoading = page.testSubj.locator(
      'securitySolutionFlyoutThreatIntelligenceDetailsLoading'
    );
    this.detailsLoadingEnrichment = page.testSubj.locator(
      'securitySolutionFlyoutThreatIntelligenceDetailsLoadingEnrichment'
    );
    this.detailsEnrichedSection = page.testSubj.locator(
      'securitySolutionFlyoutThreatIntelligenceDetailsEnrichedWithThreatIntel'
    );
    this.detailsRangePicker = page.testSubj.locator(
      'securitySolutionFlyoutThreatIntelligenceDetailsEnrichmentRangePicker'
    );
    this.detailsAccordions = page.testSubj.locator('enrichementAccordion');
    this.detailsSections = page.locator(
      '[data-test-subj^="securitySolutionFlyoutThreatIntelligenceDetails"]'
    );
  }

  /** Return the detail table for the enrichment accordion at the given zero-based index. */
  detailsAccordionTable(index: number): Locator {
    return this.page.testSubj.locator(
      `securitySolutionFlyoutThreatIntelligenceDetailsEnrichmentAccordionTable-${index}`
    );
  }
}
