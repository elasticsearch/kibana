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
import { TracesExperiencePage } from './page_objects';

export interface TracesExperienceTestFixtures extends ScoutParallelTestFixtures {
  pageObjects: PageObjects & {
    tracesExperience: TracesExperiencePage;
  };
}

export const spaceTest = spaceBaseTest.extend<
  TracesExperienceTestFixtures,
  ScoutParallelWorkerFixtures
>({
  pageObjects: async (
    {
      pageObjects,
      page,
    }: {
      pageObjects: TracesExperienceTestFixtures['pageObjects'];
      page: TracesExperienceTestFixtures['page'];
    },
    use: (pageObjects: TracesExperienceTestFixtures['pageObjects']) => Promise<void>
  ) => {
    const extendedPageObjects = {
      ...pageObjects,
      tracesExperience: createLazyPageObject(
        TracesExperiencePage,
        page,
        pageObjects.dataGrid,
        pageObjects.discover
      ),
    };

    await use(extendedPageObjects);
  },
});

export { TRACES, RICH_TRACE, MINIMAL_TRACE, PRODUCER_TRACE, DEEP_TRACE } from './constants';
export { setupTracesExperience, teardownTracesExperience } from './setup';
export { expectTracesExperienceEnabled } from './helpers';
export {
  richTrace,
  traceCorrelatedLogs,
  minimalTraceCorrelatedLogs,
  deepTrace,
} from './synthtrace/complete_traces_experience';
