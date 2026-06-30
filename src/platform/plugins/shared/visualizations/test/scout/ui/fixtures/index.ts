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
  ScoutTestFixtures,
  ScoutWorkerFixtures,
  ScoutParallelTestFixtures,
  ScoutParallelWorkerFixtures,
} from '@kbn/scout';
import { test as baseTest, spaceTest as spaceBaseTest, createLazyPageObject } from '@kbn/scout';
import { VisualizeListingPage } from './page_objects';

export interface ExtScoutTestFixtures extends ScoutTestFixtures {
  pageObjects: PageObjects & {
    visualizeListing: VisualizeListingPage;
  };
}

export const test = baseTest.extend<ExtScoutTestFixtures, ScoutWorkerFixtures>({
  pageObjects: async (
    {
      pageObjects,
      page,
    }: {
      pageObjects: ExtScoutTestFixtures['pageObjects'];
      page: ExtScoutTestFixtures['page'];
    },
    use: (pageObjects: ExtScoutTestFixtures['pageObjects']) => Promise<void>
  ) => {
    const extendedPageObjects = {
      ...pageObjects,
      visualizeListing: createLazyPageObject(VisualizeListingPage, page),
    };

    await use(extendedPageObjects);
  },
});

export interface ExtParallelRunTestFixtures extends ScoutParallelTestFixtures {
  pageObjects: PageObjects & {
    visualizeListing: VisualizeListingPage;
  };
}

export const spaceTest = spaceBaseTest.extend<
  ExtParallelRunTestFixtures,
  ScoutParallelWorkerFixtures
>({
  pageObjects: async (
    {
      pageObjects,
      page,
    }: {
      pageObjects: ExtParallelRunTestFixtures['pageObjects'];
      page: ExtParallelRunTestFixtures['page'];
    },
    use: (pageObjects: ExtParallelRunTestFixtures['pageObjects']) => Promise<void>
  ) => {
    const extendedPageObjects = {
      ...pageObjects,
      visualizeListing: createLazyPageObject(VisualizeListingPage, page),
    };

    await use(extendedPageObjects);
  },
});

export * as testData from './constants';
