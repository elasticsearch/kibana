/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ScoutPage, ScoutParallelTestFixtures, PageObjects } from '@kbn/scout';
import { expect } from '@kbn/scout/ui';
import type { ContextPage } from './page_objects';
import { FILTER_FIELD_GEO_SRC, FILTER_VALUE_GEO_SRC_IN } from './constants';

type ContextPageObjects = PageObjects & { contextPage: ContextPage };

/**
 * Adds a filter via the filter bar popover without asserting a single filter badge exists afterward.
 * This avoids Playwright strict mode violations when multiple filters are already present.
 */
export async function addFilterWithoutStrictCheck(
  page: ScoutPage,
  field: string,
  value: string
): Promise<void> {
  await page.testSubj.click('addFilter');
  await page.testSubj.waitForSelector('addFilterPopover');
  await page.testSubj.typeWithDelay('filterFieldSuggestionList > comboBoxSearchInput', field);
  await page.locator(`.euiComboBoxOption[title="${field}"]`).click();
  await expect(page.testSubj.locator('filterOperatorList')).not.toHaveClass(
    /euiComboBox-isDisabled/
  );
  await page.testSubj.typeWithDelay('filterOperatorList > comboBoxSearchInput', 'is');
  await page.locator('.euiComboBoxOption[title="is"]').click();
  const filterParamsInput = page.locator('[data-test-subj="filterParams"] input');
  await expect(filterParamsInput).toBeEditable();
  await filterParamsInput.focus();
  await page.typeWithDelay('[data-test-subj="filterParams"] input', value);
  await page.testSubj.click('saveFilter');
  await expect(page.testSubj.locator('addFilterPopover')).toBeHidden();
}

/**
 * Adds multiple "is" filters in sequence.
 */
export async function addFilters(page: ScoutPage, filters: Array<[string, string]>): Promise<void> {
  for (const [field, value] of filters) {
    await addFilterWithoutStrictCheck(page, field, value);
  }
}

/**
 * Adds the standard geo.src=IN filter and pins it (mirrors FTR's addPinnedFilter closure).
 */
export const addPinnedFilter = async (pageObjects: ContextPageObjects): Promise<void> => {
  await pageObjects.filterBar.addFilter({
    field: FILTER_FIELD_GEO_SRC,
    operator: 'is',
    value: FILTER_VALUE_GEO_SRC_IN,
  });
  await pageObjects.contextPage.waitUntilContextLoadingHasFinished();
  await pageObjects.filterBar.toggleFilterPinned(FILTER_FIELD_GEO_SRC);
  await pageObjects.contextPage.waitUntilContextLoadingHasFinished();
};

/**
 * Returns whether every data grid row satisfies the given predicate
 * (mirrors FTR's everyFieldMatches closure).
 */
export const everyFieldMatches = async (
  pageObjects: ContextPageObjects,
  matches: (row: string[]) => boolean
): Promise<boolean> => {
  const fields = await pageObjects.discover.getDataGridRows();
  return fields.every(matches);
};

/**
 * Finds the data view ID from an array of imported saved objects by matching the title.
 * Falls back to the title itself if no matching object is found.
 */
export const resolveDataViewId = (
  imported: Array<{ title: string; id?: string }>,
  title: string
): string => imported.find((so) => so.title === title)?.id ?? title;

/**
 * Logs in as viewer and navigates to the Discover app in classic query mode,
 * waiting for the search to complete and the doc table to render.
 */
export const loginAndGoToDiscover = async ({
  browserAuth,
  pageObjects,
}: Pick<ScoutParallelTestFixtures, 'browserAuth' | 'pageObjects'>) => {
  await browserAuth.loginAsViewer();
  await pageObjects.discover.goto({ queryMode: 'classic' });
  await pageObjects.discover.waitUntilSearchingHasFinished();
  await pageObjects.discover.waitForDocTableRendered();
};

/**
 * Opens the first document's details in Discover, clicks "View surrounding documents",
 * and waits for the context view to finish loading.
 */
export const navigateToFirstDocContext = async (
  pageObjects: PageObjects & { contextPage: ContextPage }
) => {
  await pageObjects.discover.openDocumentDetails({ rowIndex: 0 });
  await pageObjects.contextPage.clickRowAction(1);
  await pageObjects.contextPage.waitUntilContextLoadingHasFinished();
};
