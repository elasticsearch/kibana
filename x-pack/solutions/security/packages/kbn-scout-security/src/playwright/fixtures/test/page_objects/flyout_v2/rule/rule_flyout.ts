/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ScoutPage, Locator } from '@kbn/scout';

/**
 * Page object for the flyout_v2 rule flyout, opened via `services.overlays.openSystemFlyout`
 * either from the alerts table "Rule" column or the document flyout's "Show rule summary" button.
 */
export class RuleFlyout {
  /**
   * Rule name title text. The header renders the title via FlyoutTitle, which suffixes the test
   * subject with "Text" (the bare RuleDetailsTitle id is only used in the non-link branch).
   */
  public readonly title: Locator;
  /** Header title link, which opens the rule details page in a new tab. */
  public readonly titleLink: Locator;

  constructor(page: ScoutPage) {
    this.title = page.testSubj.locator('securitySolutionFlyoutRuleDetailsTitleText');
    this.titleLink = page.testSubj.locator('securitySolutionFlyoutRuleDetailsTitleLink');
  }

  /** Wait for the rule flyout to be visible and its title rendered. */
  async waitForRuleFlyout() {
    await this.title.waitFor({ state: 'visible', timeout: 15_000 });
  }
}
