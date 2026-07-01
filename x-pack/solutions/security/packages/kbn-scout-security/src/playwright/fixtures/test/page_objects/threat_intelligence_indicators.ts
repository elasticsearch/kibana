/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ScoutPage, Locator } from '@kbn/scout';

const PAGE_URL = 'security/threat_intelligence/indicators';

/**
 * Page object for the Threat Intelligence → Indicators page. Used to reach the IOC flyout:
 * filter the (globally-scoped) indicators table down to a single indicator by its unique name,
 * then open the flyout from that row.
 */
export class ThreatIntelligenceIndicatorsPage {
  public readonly table: Locator;
  public readonly emptyState: Locator;
  public readonly queryInput: Locator;
  public readonly querySubmitButton: Locator;

  constructor(private readonly page: ScoutPage) {
    this.table = this.page.testSubj.locator('tiIndicatorsTable');
    this.emptyState = this.page.testSubj.locator('tiIndicatorsTableEmptyState');
    this.queryInput = this.page.testSubj.locator('queryInput');
    this.querySubmitButton = this.page.testSubj.locator('querySubmitButton');
  }

  async navigate() {
    await this.page.gotoApp(PAGE_URL);
  }

  /**
   * Wait for the indicators data grid to finish loading. The Threat Intelligence page is slow to
   * mount and intermittently gets stuck on its initial data view / indicators query (showing only a
   * loading spinner, so neither the table nor the empty-state ever appears).
   *
   * Give the load one generous, uninterrupted window first — re-navigating mid-load resets the
   * query and can stop it from ever completing — then re-navigate once as a last-resort recovery.
   */
  async waitForTable() {
    // Either the populated table or the empty-state means loading has finished.
    const ready = this.table.or(this.emptyState);
    try {
      await ready.waitFor({ state: 'visible', timeout: 60_000 });
    } catch {
      // Genuinely stuck: re-navigate once to restart the query, then wait again.
      await this.navigate();
      await ready.waitFor({ state: 'visible', timeout: 45_000 });
    }
  }

  /** Enter a KQL query in the global search bar and submit it. */
  async filterByQuery(kql: string) {
    await this.queryInput.waitFor({ state: 'visible' });
    await this.queryInput.click();
    await this.queryInput.clear();
    // The unified search bar is a QueryStringInput: it submits this.props.query (React prop), not
    // the DOM value. pressSequentially types character-by-character so React can sync props before
    // the submit fires.
    await this.queryInput.pressSequentially(kql);
    await this.querySubmitButton.click();
  }

  /**
   * Filter the table down to the indicator with the given (unique) name and open its flyout.
   * Filtering first guarantees the target row is the only one rendered, side-stepping
   * EuiDataGrid column/row virtualization.
   */
  async openFlyoutForIndicator(indicatorName: string) {
    await this.waitForTable();
    await this.filterByQuery(`threat.indicator.name: "${indicatorName}"`);

    // Filtering narrows the grid to the single matching row; scope to that row by its unique
    // indicator name (via the ARIA row role, avoiding brittle EUI-internal class / XPath ancestor
    // climbs) and click its "open flyout" toggle. The re-fetch can be slow, so wait generously.
    const row = this.table.getByRole('row').filter({ hasText: indicatorName });
    await row.waitFor({ state: 'visible', timeout: 30_000 });
    await row.getByTestId('tiToggleIndicatorFlyoutButton').click();
  }
}
