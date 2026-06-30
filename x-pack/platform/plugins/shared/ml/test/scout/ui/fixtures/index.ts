/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { KibanaUrl, PageObjects, ScoutTestFixtures, ScoutWorkerFixtures } from '@kbn/scout';
import { test as baseTest, createLazyPageObject } from '@kbn/scout';
import { DataFrameAnalyticsPage } from './page_objects/data_frame_analytics_page';

export interface MlUiTestFixtures extends ScoutTestFixtures {
  pageObjects: PageObjects & {
    dataFrameAnalytics: DataFrameAnalyticsPage;
  };
}

export const test = baseTest.extend<MlUiTestFixtures, ScoutWorkerFixtures>({
  pageObjects: async (
    {
      pageObjects,
      page,
      kbnUrl,
    }: {
      pageObjects: MlUiTestFixtures['pageObjects'];
      page: MlUiTestFixtures['page'];
      kbnUrl: KibanaUrl;
    },
    use: (pageObjects: MlUiTestFixtures['pageObjects']) => Promise<void>
  ) => {
    await use({
      ...pageObjects,
      dataFrameAnalytics: createLazyPageObject(DataFrameAnalyticsPage, page, kbnUrl),
    });
  },
});

export { CUSTOM_ROLES } from '../../api/fixtures/custom_roles';
export { ML_USERS } from '../../api/fixtures/constants';
