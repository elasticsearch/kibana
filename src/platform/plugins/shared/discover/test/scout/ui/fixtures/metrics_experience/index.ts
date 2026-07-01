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
import { MetricsExperiencePage, Inspector } from './page_objects';
import { METRICS_EXPERIENCE_VIEWER_ROLE, METRICS_EXPERIENCE_PRIVILEGED_ROLE } from './constants';

export interface MetricsExperienceTestFixtures extends ScoutParallelTestFixtures {
  pageObjects: PageObjects & {
    metricsExperience: MetricsExperiencePage;
    inspector: Inspector;
  };
}

export const spaceTest = spaceBaseTest.extend<
  MetricsExperienceTestFixtures,
  ScoutParallelWorkerFixtures
>({
  browserAuth: async ({ browserAuth, config }, use) => {
    await use({
      ...browserAuth,
      loginAsViewer: async () => {
        if (config.serverless && config.projectType === 'security') {
          return browserAuth.loginWithCustomRole(METRICS_EXPERIENCE_VIEWER_ROLE);
        }
        return browserAuth.loginAsViewer();
      },
      loginAsPrivilegedUser: async () => {
        if (config.serverless && config.projectType === 'security') {
          return browserAuth.loginWithCustomRole(METRICS_EXPERIENCE_PRIVILEGED_ROLE);
        }
        return browserAuth.loginAsPrivilegedUser();
      },
    });
  },
  pageObjects: async (
    {
      pageObjects,
      page,
    }: {
      pageObjects: MetricsExperienceTestFixtures['pageObjects'];
      page: MetricsExperienceTestFixtures['page'];
    },
    use: (pageObjects: MetricsExperienceTestFixtures['pageObjects']) => Promise<void>
  ) => {
    await use({
      ...pageObjects,
      metricsExperience: createLazyPageObject(MetricsExperiencePage, page),
      inspector: createLazyPageObject(Inspector, page),
    });
  },
});

export * as testData from './constants';
export * from './generators';
