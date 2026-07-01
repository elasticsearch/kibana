/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ScoutPage, ScoutTestFixtures } from '@kbn/scout';
import { expect } from '@kbn/scout/ui';
import { DISCOVER_QUERY_MODE_KEY } from '../../../../../common/constants';
import { testData } from '.';

export const expectSampleSizeFooter = async ({
  pageObjects,
  sampleSize,
}: {
  pageObjects: ScoutTestFixtures['pageObjects'];
  sampleSize: number;
}) => {
  const { dataGrid } = pageObjects;

  await dataGrid.goToLastSamplePage(sampleSize, testData.DEFAULT_ROWS_PER_PAGE);
  await expect.poll(() => dataGrid.getDataGridFooterText()).toContain(String(sampleSize));
};

export const clearStoredQueryMode = async (page: ScoutPage): Promise<void> => {
  await page.evaluate((storageKey) => {
    window.localStorage.removeItem(storageKey);
  }, DISCOVER_QUERY_MODE_KEY);
};

export const getStoredQueryMode = async (page: ScoutPage): Promise<'classic' | 'esql' | null> => {
  return await page.evaluate((storageKey) => {
    const storedValue = window.localStorage.getItem(storageKey);

    if (!storedValue) {
      return null;
    }

    try {
      const parsedValue = JSON.parse(storedValue);

      if (parsedValue === 'classic' || parsedValue === 'esql') {
        return parsedValue;
      }
    } catch {
      return null;
    }

    return null;
  }, DISCOVER_QUERY_MODE_KEY);
};
