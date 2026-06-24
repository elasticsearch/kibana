/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ScoutTestFixtures } from '@kbn/scout';
import { expect } from '@kbn/scout/ui';
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
