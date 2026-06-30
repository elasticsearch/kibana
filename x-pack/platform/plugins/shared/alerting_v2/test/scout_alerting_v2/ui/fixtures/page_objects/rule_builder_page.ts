/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Locator, ScoutPage } from '@kbn/scout';

const BUILDER_CARDS: Record<string, { testSubj: string; buttonName: RegExp }> = {
  threshold: {
    testSubj: 'createThresholdAlertCard',
    buttonName: /threshold alert/i,
  },
};

export class RuleBuilderPage {
  private readonly createRuleButton: Locator;

  constructor(private readonly page: ScoutPage) {
    this.createRuleButton = this.page.testSubj.locator('createRuleButton');
  }

  private builderCard(type: string): Locator {
    const config = BUILDER_CARDS[type];
    if (!config) {
      throw new Error(`Unknown builder type "${type}". Register it in BUILDER_CARDS.`);
    }
    return this.page.testSubj.locator(config.testSubj);
  }

  async openCreateBuilderFlyout(type: string) {
    const config = BUILDER_CARDS[type];
    if (!config) {
      throw new Error(`Unknown builder type "${type}". Register it in BUILDER_CARDS.`);
    }

    const card = this.builderCard(type);
    await this.createRuleButton.or(card).waitFor({ state: 'visible' });

    if (await this.createRuleButton.isVisible()) {
      await this.createRuleButton.click();
      const optionsFlyout = this.page.testSubj.locator('ruleCreateOptionsFlyout');
      await optionsFlyout.waitFor({ state: 'visible' });
      const builderButton = optionsFlyout.getByRole('button', { name: config.buttonName });
      await builderButton.click();
    } else {
      await card.click();
    }
  }
}
