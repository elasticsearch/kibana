/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { PageObjects, ScoutTestFixtures, ScoutWorkerFixtures } from '@kbn/scout';
import { test as baseTest, createLazyPageObject } from '@kbn/scout';
import { DashboardLinks } from './page_objects';

export interface ReleaseTestingTestFixtures extends ScoutTestFixtures {
  pageObjects: PageObjects & {
    dashboardLinks: DashboardLinks;
  };
}

export const test = baseTest.extend<ReleaseTestingTestFixtures, ScoutWorkerFixtures>({
  pageObjects: async (
    {
      pageObjects,
      page,
    }: {
      pageObjects: ReleaseTestingTestFixtures['pageObjects'];
      page: ReleaseTestingTestFixtures['page'];
    },
    use: (pageObjects: ReleaseTestingTestFixtures['pageObjects']) => Promise<void>
  ) => {
    await use({
      ...pageObjects,
      dashboardLinks: createLazyPageObject(DashboardLinks, page),
    });
  },
});
