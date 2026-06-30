/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ApiServicesFixture } from '@kbn/scout';
import { spaceTest as baseTest, mergeTests } from '@kbn/scout';
import type {
  SecurityApiServicesFixture,
  SecurityParallelTestFixtures,
  SecurityParallelWorkerFixtures,
} from './types';
import {
  getDetectionRuleApiService,
  getDetectionAlertsApiService,
  getEntityAnalyticsApiService,
  getCloudConnectorApiService,
  getTimelineApiService,
  getAttackDiscoveryApiService,
} from './worker';
import { extendPageObjects, securityBrowserAuthFixture } from './test';

const securityParallelFixtures = mergeTests(baseTest, securityBrowserAuthFixture);

/**
 * Should be used test spec files, running in parallel in isolated spaces agaist the same Kibana instance.
 */
export const spaceTest = securityParallelFixtures.extend<
  SecurityParallelTestFixtures,
  SecurityParallelWorkerFixtures
>({
  pageObjects: async (
    {
      pageObjects,
      page,
      config,
    }: {
      pageObjects: SecurityParallelTestFixtures['pageObjects'];
      page: SecurityParallelTestFixtures['page'];
      config: SecurityParallelWorkerFixtures['config'];
    },
    use: (pageObjects: SecurityParallelTestFixtures['pageObjects']) => Promise<void>
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
        scoutSpace,
      }: {
        apiServices: ApiServicesFixture;
        kbnClient: SecurityParallelWorkerFixtures['kbnClient'];
        esClient: SecurityParallelWorkerFixtures['esClient'];
        log: SecurityParallelWorkerFixtures['log'];
        scoutSpace: SecurityParallelWorkerFixtures['scoutSpace'];
      },
      use: (extendedApiServices: SecurityApiServicesFixture) => Promise<void>
    ) => {
      const extendedApiServices = apiServices as SecurityApiServicesFixture;
      extendedApiServices.detectionAlerts = getDetectionAlertsApiService({
        esClient,
        log,
        scoutSpace,
      });
      extendedApiServices.detectionRule = getDetectionRuleApiService({
        kbnClient,
        log,
        scoutSpace,
      });
      extendedApiServices.entityAnalytics = getEntityAnalyticsApiService({
        kbnClient,
        log,
        scoutSpace,
        esClient,
      });
      extendedApiServices.cloudConnectorApi = getCloudConnectorApiService({
        kbnClient,
        scoutSpace,
      });
      extendedApiServices.timeline = getTimelineApiService({
        kbnClient,
        log,
        scoutSpace,
      });
      extendedApiServices.attackDiscovery = getAttackDiscoveryApiService({
        kbnClient,
        log,
        scoutSpace,
        esClient,
      });

      await use(extendedApiServices);
    },
    { scope: 'worker' },
  ],
});
