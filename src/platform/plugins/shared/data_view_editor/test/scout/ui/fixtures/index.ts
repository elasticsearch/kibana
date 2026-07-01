/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { PageObjects, ScoutTestFixtures, ScoutWorkerFixtures } from '@kbn/scout';
import { test as baseTest, createLazyPageObject } from '@kbn/scout';
import { DataViewEditorPage } from './page_objects';

export interface DataViewEditorTestFixtures extends ScoutTestFixtures {
  pageObjects: PageObjects & {
    dataViewEditor: DataViewEditorPage;
  };
}

export const test = baseTest.extend<DataViewEditorTestFixtures, ScoutWorkerFixtures>({
  pageObjects: async (
    {
      pageObjects,
      page,
    }: {
      pageObjects: DataViewEditorTestFixtures['pageObjects'];
      page: DataViewEditorTestFixtures['page'];
    },
    use: (pageObjects: DataViewEditorTestFixtures['pageObjects']) => Promise<void>
  ) => {
    await use({
      ...pageObjects,
      dataViewEditor: createLazyPageObject(DataViewEditorPage, page),
    });
  },
});

export { CUSTOM_ROLES } from './custom_roles';
