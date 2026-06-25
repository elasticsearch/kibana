/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Locator, ScoutPage } from '@kbn/scout';

export interface BreakdownSelector {
  readonly toggleButton: Locator;
  readonly searchInput: Locator;
  readonly selectable: Locator;
  readonly getToggleWithSelection: (dimensionName: string) => Locator;
  readonly selectDimension: (dimensionName: string) => Promise<void>;
}

export function createBreakdownSelector(page: ScoutPage): BreakdownSelector {
  const button = page.testSubj.locator('metricsExperienceBreakdownSelectorButton');
  const selectable = page.testSubj.locator('metricsExperienceBreakdownSelectorSelectable');
  const searchInput = page.testSubj.locator('metricsExperienceBreakdownSelectorSelectorSearch');

  return {
    toggleButton: button,
    searchInput,
    selectable,
    getToggleWithSelection: (dimensionName: string) =>
      page.locator(
        `[data-test-subj="metricsExperienceBreakdownSelectorButton"][data-selected-value*="${dimensionName}"]`
      ),
    selectDimension: async (dimensionName: string) => {
      if (!(await selectable.isVisible())) {
        await button.click();
        await selectable.waitFor({ state: 'visible' });
      }
      await searchInput.fill(dimensionName);
      await page.testSubj.click(`dimensionSelectorOption-${dimensionName}`);
      if (await selectable.isVisible()) {
        await page.keyboard.press('Escape');
        await selectable.waitFor({ state: 'hidden' });
      }
    },
  };
}
