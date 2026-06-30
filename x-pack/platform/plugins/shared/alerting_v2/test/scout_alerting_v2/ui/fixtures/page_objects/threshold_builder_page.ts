/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Locator, ScoutPage } from '@kbn/scout';
import { EuiComboBoxWrapper } from '@kbn/scout';

export class ThresholdBuilderPage {
  public readonly timeFieldSelect: Locator;
  public readonly addStatButton: Locator;

  private readonly indexComboBox: EuiComboBoxWrapper;

  constructor(private readonly page: ScoutPage) {
    this.timeFieldSelect = this.page.testSubj.locator('ruleBuilderTimeField');
    this.addStatButton = this.page.testSubj.locator('ruleBuilderAddStat');
    this.indexComboBox = new EuiComboBoxWrapper(page, 'ruleBuilderIndexField');
  }

  async setIndex(pattern: string) {
    await this.indexComboBox.setCustomSingleOption(pattern, { settleTimeoutMs: 10_000 });
  }

  statAggSelect(idx: number): Locator {
    return this.page.testSubj.locator(`ruleBuilderStatAgg-${idx}`);
  }

  conditionThresholdInput(idx: number): Locator {
    return this.page.testSubj.locator(`ruleBuilderConditionThreshold-${idx}`);
  }

  async setConditionThreshold(idx: number, value: string) {
    await this.conditionThresholdInput(idx).fill(value);
  }
}
