/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { test as base } from '@kbn/scout';
import type { ScoutPage, ScoutTestFixtures, ScoutWorkerFixtures } from '@kbn/scout';
import { RemoteClustersPage } from './page_objects/remote_clusters_page';

interface RemoteClustersFixtures extends ScoutTestFixtures {
  pageObjects: ScoutTestFixtures['pageObjects'] & {
    remoteClusters: RemoteClustersPage;
  };
}

export const test = base.extend<RemoteClustersFixtures, ScoutWorkerFixtures>({
  pageObjects: async (
    { pageObjects, page }: { pageObjects: ScoutTestFixtures['pageObjects']; page: ScoutPage },
    use
  ) => {
    await use({
      ...pageObjects,
      remoteClusters: new RemoteClustersPage(page),
    } as RemoteClustersFixtures['pageObjects']);
  },
});

export * as testData from './constants';
export {
  seedSniffCluster,
  seedProxyCluster,
  removeCluster,
} from '../../common/fixtures/remote_cluster_settings';
export { expectNoA11yViolations } from './expect_no_a11y_violations';
