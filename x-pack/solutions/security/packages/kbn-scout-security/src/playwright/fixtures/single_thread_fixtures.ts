/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ApiServicesFixture } from '@kbn/scout';
import { test as baseTest, mergeTests } from '@kbn/scout';
import type {
  SecurityApiServicesFixture,
  SecurityTestFixtures,
  SecurityWorkerFixtures,
} from './types';
import {
  getDetectionRuleApiService,
  getDetectionAlertsApiService,
  getEntityAnalyticsApiService,
  getTimelineApiService,
  getAttackDiscoveryApiService,
} from './worker';
import { extendPageObjects, securityBrowserAuthFixture } from './test';

const securityFixtures = mergeTests(baseTest, securityBrowserAuthFixture);

export const test = securityFixtures.extend<SecurityTestFixtures, SecurityWorkerFixtures>({
  pageObjects: async (
    {
      pageObjects,
      page,
      config,
    }: {
      pageObjects: SecurityTestFixtures['pageObjects'];
      page: SecurityTestFixtures['page'];
      config: SecurityWorkerFixtures['config'];
    },
    use: (pageObjects: SecurityTestFixtures['pageObjects']) => Promise<void>
  ) => {
    const extendedPageObjects = extendPageObjects(pageObjects, page, config);
    await use(extendedPageObjects);
  },
  apiServices: [
    async (
      {
        apiServices,
        kbnClient,
        esClient,
        log,
      }: {
        apiServices: ApiServicesFixture;
        kbnClient: SecurityWorkerFixtures['kbnClient'];
        esClient: SecurityWorkerFixtures['esClient'];
        log: SecurityWorkerFixtures['log'];
      },
      use: (extendedApiServices: SecurityApiServicesFixture) => Promise<void>
    ) => {
      const extendedApiServices = apiServices as SecurityApiServicesFixture;
      extendedApiServices.detectionAlerts = getDetectionAlertsApiService({
        esClient,
        log,
      });
      extendedApiServices.detectionRule = getDetectionRuleApiService({
        kbnClient,
        log,
      });
      extendedApiServices.entityAnalytics = getEntityAnalyticsApiService({
        kbnClient,
        log,
        esClient,
      });
      extendedApiServices.timeline = getTimelineApiService({
        kbnClient,
        log,
      });
      extendedApiServices.attackDiscovery = getAttackDiscoveryApiService({
        kbnClient,
        log,
        esClient,
      });

      await use(extendedApiServices);
    },
    { scope: 'worker' },
  ],
});
