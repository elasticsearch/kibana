/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  ApiServicesFixture,
  KibanaUrl,
  PageObjects,
  ScoutTestFixtures,
  ScoutWorkerFixtures,
  ScoutParallelTestFixtures,
  ScoutParallelWorkerFixtures,
} from '@kbn/scout';
import { test as baseTest, spaceTest as spaceBaseTest, createLazyPageObject } from '@kbn/scout';
import type { GraphWorkspaceApiService } from '../services/graph_workspace_api_service';
import { getGraphWorkspaceApiService } from '../services/graph_workspace_api_service';
import { GraphPage, GraphListingPage } from './page_objects';

export interface GraphApiServicesFixture extends ApiServicesFixture {
  graphWorkspaces: GraphWorkspaceApiService;
}

export interface GraphTestFixtures extends ScoutTestFixtures {
  pageObjects: PageObjects & {
    graph: GraphPage;
  };
}

export interface GraphWorkerFixtures extends ScoutWorkerFixtures {
  apiServices: GraphApiServicesFixture;
}

export const test = baseTest.extend<GraphTestFixtures, GraphWorkerFixtures>({
  pageObjects: async (
    {
      pageObjects,
      page,
      kbnUrl,
    }: {
      pageObjects: GraphTestFixtures['pageObjects'];
      page: GraphTestFixtures['page'];
      kbnUrl: KibanaUrl;
    },
    use: (pageObjects: GraphTestFixtures['pageObjects']) => Promise<void>
  ) => {
    await use({
      ...pageObjects,
      graph: createLazyPageObject(GraphPage, page, kbnUrl),
    });
  },

  apiServices: [
    async ({ apiServices, kbnClient }, use) => {
      const extended = apiServices as GraphApiServicesFixture;
      extended.graphWorkspaces = getGraphWorkspaceApiService(kbnClient);
      await use(extended);
    },
    { scope: 'worker' },
  ],
});

export interface GraphListingParallelTestFixtures extends ScoutParallelTestFixtures {
  pageObjects: PageObjects & {
    graphListing: GraphListingPage;
  };
}

export const spaceTest = spaceBaseTest.extend<
  GraphListingParallelTestFixtures,
  ScoutParallelWorkerFixtures
>({
  pageObjects: async (
    {
      pageObjects,
      page,
    }: {
      pageObjects: GraphListingParallelTestFixtures['pageObjects'];
      page: GraphListingParallelTestFixtures['page'];
    },
    use: (pageObjects: GraphListingParallelTestFixtures['pageObjects']) => Promise<void>
  ) => {
    await use({
      ...pageObjects,
      graphListing: createLazyPageObject(GraphListingPage, page),
    });
  },
});

export * as testData from './constants';
