/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Locator, ScoutPage } from '@kbn/scout';

/**
 * Page object for the alerting_v2 entries inside Discover's app-menu.
 *
 * With alerting v2 enabled, clicking the Alerts trigger (`discoverAlertsButton`)
 * opens the `RuleCreateOptionsFlyout` directly (no popover submenu). The flyout
 * contains option cards (`createEsqlRuleCard`, etc.) for each rule type.
 *
 * Discover's app-menu places its items either directly on the top bar or inside
 * the overflow popover, depending on the available viewport width. The Alerts
 * trigger keeps the same `data-test-subj` in both render paths because
 * `core-chrome-app-menu-components/src/utils.tsx` propagates `item.testId` to
 * the popover panel item.
 */
export class DiscoverAppMenu {
  public readonly alertsTrigger: Locator;
  public readonly overflowButton: Locator;
  public readonly overflowPopover: Locator;
  public readonly selectorFlyout: Locator;
  public readonly createEsqlRuleCard: Locator;
  public readonly createAlertButton: Locator;
  public readonly manageAlertsButton: Locator;
  public readonly rulesTopLevelButton: Locator;

  constructor(private readonly page: ScoutPage) {
    this.alertsTrigger = this.page.testSubj.locator('discoverAlertsButton');
    this.overflowButton = this.page.testSubj.locator('app-menu-overflow-button');
    this.overflowPopover = this.page.testSubj.locator('app-menu-popover');
    this.selectorFlyout = this.page.testSubj.locator('ruleCreateOptionsFlyout');
    this.createEsqlRuleCard = this.page.testSubj.locator('createEsqlRuleCard');
    this.createAlertButton = this.page.testSubj.locator('discoverCreateAlertButton');
    this.manageAlertsButton = this.page.testSubj.locator('discoverManageAlertsButton');
    this.rulesTopLevelButton = this.page.testSubj.locator('discoverRulesMenuButton');
  }

  /**
   * Opens the Alerts entry in Discover's app-menu.
   *
   * With v2 enabled this opens the rule-create-options selector flyout.
   *
   * @param isInOverflowMenu Force the overflow path. When omitted, the method
   *   clicks the trigger directly if it's already visible on the top bar and
   *   falls back to opening the overflow popover otherwise.
   */
  async openAlertsMenu({ isInOverflowMenu }: { isInOverflowMenu?: boolean } = {}) {
    if (!isInOverflowMenu && (await this.alertsTrigger.isVisible())) {
      await this.alertsTrigger.click();
      return;
    }

    // Dismiss any stale popovers from a previous interaction so the next click
    // opens the overflow rather than closing it.
    if (await this.overflowPopover.isVisible()) {
      await this.overflowButton.click();
      await this.overflowPopover.waitFor({ state: 'hidden' });
    }

    await this.overflowButton.waitFor({ state: 'visible' });
    await this.overflowButton.click();
    await this.overflowPopover.waitFor({ state: 'visible' });
    await this.alertsTrigger.waitFor({ state: 'visible' });
    await this.alertsTrigger.click();
  }

  /**
   * Opens Alerts → selector flyout → "Create ES|QL rule" card and leaves the
   * rule form flyout open.
   */
  async openCreateEsqlRuleFlyout(options: { isInOverflowMenu?: boolean } = {}) {
    await this.openAlertsMenu(options);
    await this.selectorFlyout.waitFor({ state: 'visible' });
    await this.createEsqlRuleCard.click();
    await this.waitForComposeDiscoverFlyout();
  }

  /**
   * In create mode ComposeDiscoverFlyout opens the query sandbox by default
   * (`childOpen: true`), which disables Next until the user applies.
   */
  async dismissQuerySandboxIfOpen() {
    const applyButton = this.page.testSubj.locator('querySandboxApply');
    try {
      await applyButton.waitFor({ state: 'visible', timeout: 5_000 });
      await applyButton.click();
      await applyButton.waitFor({ state: 'hidden' });
    } catch {
      // Sandbox not shown — already dismissed or not in create mode.
    }
  }

  /** Waits until ComposeDiscoverFlyout is open and the sandbox gate is cleared. */
  async waitForComposeDiscoverFlyout() {
    await this.page.locator('[aria-labelledby="composeDiscoverFlyoutTitle"]').waitFor({
      state: 'visible',
    });
    await this.page.waitForFunction(() =>
      Boolean(
        document.querySelector('[data-test-subj="composeDiscoverNext"]') ||
          document.querySelector('[data-test-subj="composeDiscoverSubmit"]')
      )
    );
    await this.dismissQuerySandboxIfOpen();
  }
}
