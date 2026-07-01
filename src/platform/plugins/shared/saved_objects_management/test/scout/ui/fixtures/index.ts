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
import { SavedObjectsManagementPage, CopySavedObjectsToSpaceFlyout } from './page_objects';

export interface SavedObjectsManagementTestFixtures extends ScoutTestFixtures {
  pageObjects: PageObjects & {
    savedObjectsManagement: SavedObjectsManagementPage;
    copySavedObjectsToSpaceFlyout: CopySavedObjectsToSpaceFlyout;
  };
}

export const test = baseTest.extend<SavedObjectsManagementTestFixtures, ScoutWorkerFixtures>({
  pageObjects: async (
    {
      pageObjects,
      page,
      kbnUrl,
    }: {
      pageObjects: SavedObjectsManagementTestFixtures['pageObjects'];
      page: SavedObjectsManagementTestFixtures['page'];
      kbnUrl: ScoutWorkerFixtures['kbnUrl'];
    },
    use: (pageObjects: SavedObjectsManagementTestFixtures['pageObjects']) => Promise<void>
  ) => {
    await use({
      ...pageObjects,
      savedObjectsManagement: createLazyPageObject(SavedObjectsManagementPage, page, kbnUrl),
      copySavedObjectsToSpaceFlyout: createLazyPageObject(CopySavedObjectsToSpaceFlyout, page),
    });
  },
});

export { CUSTOM_ROLES } from '../../api/fixtures/custom_roles';
export { testData } from '../../api/fixtures';
