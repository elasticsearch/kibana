/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type {
  PageObjects,
  ScoutParallelTestFixtures,
  ScoutParallelWorkerFixtures,
} from '@kbn/scout';
import { spaceTest as spaceBaseTest, createLazyPageObject } from '@kbn/scout';
import { SavedQueryManagementMenu } from './page_objects';

export interface UnifiedSearchTestFixtures extends ScoutParallelTestFixtures {
  pageObjects: PageObjects & {
    savedQueryManagementMenu: SavedQueryManagementMenu;
  };
}

export const spaceTest = spaceBaseTest.extend<
  UnifiedSearchTestFixtures,
  ScoutParallelWorkerFixtures
>({
  pageObjects: async (
    {
      pageObjects,
      page,
    }: {
      pageObjects: UnifiedSearchTestFixtures['pageObjects'];
      page: UnifiedSearchTestFixtures['page'];
    },
    use: (pageObjects: UnifiedSearchTestFixtures['pageObjects']) => Promise<void>
  ) => {
    await use({
      ...pageObjects,
      savedQueryManagementMenu: createLazyPageObject(SavedQueryManagementMenu, page),
    });
  },
});

export * as testData from './constants';
