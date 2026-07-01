/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ScoutPage, Locator } from '@kbn/scout';

/**
 * Page object for the flyout_v2 host entity flyout, opened via `services.overlays.openSystemFlyout`
 * from a `host.name` value (e.g. the alerts table host-details cell or the document flyout entities
 * section).
 *
 * Covers the sections that render when the host is NOT in the entity store: the header, observed
 * data, footer actions, and the alerts insight tool. Entity-store-backed sections (risk summary,
 * asset criticality, risk-inputs tool, entity store tabs/visualizations) require seeding the entity
 * store and are out of scope here — see the deferred follow-up.
 */
export class HostFlyout {
  /** Header container. */
  public readonly header: Locator;
  /** Title text (the host name). Scoped to the header to disambiguate from a parent document flyout. */
  public readonly title: Locator;
  /** First/last seen timestamp (only rendered when the host is not in the entity store). */
  public readonly lastSeen: Locator;
  /** "Host" entity-type badge. */
  public readonly entityTypeBadge: Locator;
  /** Entity source badge (observed vs entity store). */
  public readonly observedBadge: Locator;
  /** Observed-data accordion. */
  public readonly observedAccordion: Locator;
  /** Entity insight accordion wrapping the CSP / alerts previews. */
  public readonly entityInsight: Locator;
  /** Link that opens the Alerts insight tool. */
  public readonly alertsInsightLink: Locator;
  /** Take action button in the footer. */
  public readonly takeActionButton: Locator;
  /** Root of the stacked Alerts insight tool flyout. */
  public readonly alertsInsightsTool: Locator;
  /** Alerts table rendered inside the Alerts insight tool. */
  public readonly alertsInsightsToolTable: Locator;
  /**
   * Severity badges inside the Alerts insight tool table — one per alert row. Scoped to the tool so
   * it never matches the entity-insight preview behind it, and only present for real alert rows (the
   * empty state renders no badge), making it a meaningful "an alert is listed" assertion.
   */
  public readonly alertsInsightsToolAlertSeverities: Locator;
  /**
   * Source-context title button in the tool header. For the alerts insight tool it shows the host
   * name + storage icon and opens the host flyout when clicked.
   */
  public readonly toolsFlyoutTitle: Locator;
  /**
   * Expand control in the first alert row of the Alerts insight tool table. Opens that alert's
   * document flyout as a child. It's an `EuiLink` with `onClick` (rendered as a button) and no
   * test-subj, and it's the only button in the row's first cell — scope to that cell so the locator
   * is unambiguous without the banned nth-method `.first()`.
   */
  public readonly alertsInsightsToolExpandFirstRow: Locator;

  constructor(page: ScoutPage) {
    this.header = page.testSubj.locator('host-panel-header');
    this.title = this.header.locator('[data-test-subj="flyoutTitleText"]');
    this.lastSeen = page.testSubj.locator('host-panel-header-lastSeen');
    this.entityTypeBadge = page.testSubj.locator('host-panel-header-entity-type-badge');
    this.observedBadge = page.testSubj.locator('host-panel-header-observed-badge');
    this.observedAccordion = page.testSubj.locator('observedEntity-accordion');
    this.entityInsight = page.testSubj.locator('entityInsightTestSubj');
    this.alertsInsightLink = page.testSubj.locator('securitySolutionFlyoutInsightsAlertsTitleLink');
    this.takeActionButton = page.testSubj.locator('take-action-button');
    this.alertsInsightsTool = page.testSubj.locator('alertsInsightsTool');
    this.alertsInsightsToolTable = page.testSubj.locator(
      'securitySolutionFlyoutAlertsFindingsTable'
    );
    this.alertsInsightsToolAlertSeverities = this.alertsInsightsTool.locator(
      '[data-test-subj="severityPropertyValue"]'
    );
    this.toolsFlyoutTitle = page.testSubj.locator('securitySolutionFlyoutToolsFlyoutHeaderTitle');
    this.alertsInsightsToolExpandFirstRow = this.alertsInsightsTool.locator(
      'tbody tr:first-child td:first-child button'
    );
  }

  /** Wait for the host flyout to be visible and its header rendered. */
  async waitForHostFlyout() {
    await this.header.waitFor({ state: 'visible', timeout: 15_000 });
  }

  /** Open the Alerts insight tool from the entity-insight section. */
  async openAlertsInsightTool() {
    await this.alertsInsightLink.click();
    await this.alertsInsightsTool.waitFor({ state: 'visible', timeout: 15_000 });
  }

  /**
   * Distribution-bar segment for a given severity inside the Alerts insight tool. Clicking it filters
   * the alerts table to that severity. The bar is rendered without a data-test-subj, so its segments
   * fall back to a `*__part` suffix; scope to the tool and filter by the (capitalized) severity label.
   */
  alertsInsightsToolSeveritySegment(severityLabel: string): Locator {
    return this.alertsInsightsTool
      .locator('[data-test-subj$="__part"]')
      .filter({ hasText: severityLabel });
  }
}
