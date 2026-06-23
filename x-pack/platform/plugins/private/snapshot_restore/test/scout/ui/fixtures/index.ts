/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { test as baseTest } from '@kbn/scout';
import type { PageObjects, ScoutPage, ScoutTestFixtures, ScoutWorkerFixtures } from '@kbn/scout';

import type { SnapshotRestorePageObjects } from './page_objects';
import { extendPageObjects } from './page_objects';

export interface SnapshotRestoreTestFixtures extends ScoutTestFixtures {
  pageObjects: SnapshotRestorePageObjects;
}

export const test = baseTest.extend<SnapshotRestoreTestFixtures, ScoutWorkerFixtures>({
  pageObjects: async (
    { pageObjects, page }: { pageObjects: PageObjects; page: ScoutPage },
    use: (pageObjects: SnapshotRestorePageObjects) => Promise<void>
  ) => {
    await use(extendPageObjects(pageObjects, page));
  },
});
