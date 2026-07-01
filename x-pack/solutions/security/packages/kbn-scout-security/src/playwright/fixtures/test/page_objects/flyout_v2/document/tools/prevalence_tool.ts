/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ScoutPage, Locator } from '@kbn/scout';

/**
 * Page object for the prevalence tool overlay inside the flyout v2 document flyout.
 */
export class PrevalenceTool {
  /** Title link in the insights prevalence panel that opens the tool overlay. */
  public readonly titleLink: Locator;
  /** Header row of the tools flyout — use to confirm the overlay is open. */
  public readonly toolsFlyoutHeader: Locator;
  /** Clickable button in the tools flyout header showing the document icon and title. */
  public readonly toolsFlyoutTitle: Locator;
  /** Warning icon inside the tools flyout title button, confirming the document is an alert. */
  public readonly toolsFlyoutTitleAlertIcon: Locator;

  /** The prevalence details table. */
  public readonly table: Locator;
  /**
   * Cell-actions hover wrapper for the first data row's value.
   * CellActions uses data-test-subj="cellActions-renderContent-{fieldName}" on the wrapper div;
   * we scope to tbody tr:first-child to avoid needing .first() (banned by no-nth-methods).
   */
  public readonly valueCellHoverTarget: Locator;
  /** Hover-down popover that appears when the cursor is over a cell-actions-enabled value. */
  public readonly hoverActionsPopover: Locator;
  /** Filter-in action button that appears inside the hover popover. */
  public readonly filterInAction: Locator;
  /** Filter-out action button that appears inside the hover popover. */
  public readonly filterOutAction: Locator;
  /** Add-to-timeline action button that appears inside the hover popover. */
  public readonly addToTimelineAction: Locator;
  /** Filter badge(s) added to the page search bar; use toHaveCount() to assert the number. */
  public readonly filterBadges: Locator;
  /**
   * "Investigate in timeline" button inside the alert count cell of the first data row.
   * Scoped with CSS to avoid .first().
   */
  public readonly firstAlertCountTimelineButton: Locator;
  /**
   * ChildLink for the source.ip value in the prevalence table.
   * Scoped to the row whose text includes "source.ip" so it resolves to exactly one element.
   */
  public readonly sourceIpChildLink: Locator;
  /** Title text of the network details flyout opened by clicking the source.ip ChildLink. */
  public readonly networkDetailsFlyoutHeaderText: Locator;

  constructor(page: ScoutPage) {
    this.titleLink = page.testSubj.locator('securitySolutionFlyoutInsightsPrevalenceTitleLink');
    this.toolsFlyoutHeader = page.testSubj.locator('securitySolutionFlyoutToolsFlyoutHeader');
    this.toolsFlyoutTitle = page.testSubj.locator('securitySolutionFlyoutToolsFlyoutHeaderTitle');
    this.toolsFlyoutTitleAlertIcon = page.testSubj.locator(
      'securitySolutionFlyoutToolsFlyoutHeaderTitleIcon'
    );
    this.table = page.testSubj.locator('securitySolutionFlyoutPrevalenceDetailsTable');
    this.valueCellHoverTarget = page.locator(
      '[data-test-subj="securitySolutionFlyoutPrevalenceDetailsTable"] tbody tr:first-child [data-test-subj^="cellActions-renderContent-"]'
    );
    this.hoverActionsPopover = page.testSubj.locator('hoverActionsPopover');
    this.filterInAction = page.testSubj.locator('actionItem-security-default-cellActions-filterIn');
    this.filterOutAction = page.testSubj.locator(
      'actionItem-security-default-cellActions-filterOut'
    );
    this.addToTimelineAction = page.testSubj.locator(
      'actionItem-security-default-cellActions-addToTimeline'
    );
    this.filterBadges = page.locator('[id^="popoverFor_filter"]');
    this.firstAlertCountTimelineButton = page.locator(
      '[data-test-subj="securitySolutionFlyoutPrevalenceDetailsTable"] tbody tr:first-child [data-test-subj="securitySolutionFlyoutPrevalenceDetailsTableAlertCountCell"] [data-test-subj="securitySolutionFlyoutPrevalenceDetailsTableInvestigateInTimelineButton"]'
    );
    this.sourceIpChildLink = page.testSubj
      .locator('securitySolutionFlyoutPrevalenceDetailsTable')
      .locator('tr')
      .filter({ hasText: 'source.ip' })
      .locator('[data-test-subj="securitySolutionFlyoutOpenFlyoutLink"]');
    this.networkDetailsFlyoutHeaderText = page.testSubj.locator(
      'network-details-flyout-headerText'
    );
  }
}
