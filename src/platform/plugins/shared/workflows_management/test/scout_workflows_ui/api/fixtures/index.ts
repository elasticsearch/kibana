/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ApiServicesFixture, KbnClient, ScoutParallelWorkerFixtures } from '@kbn/scout';
import { apiTest as scoutApiTest, spaceTest as spaceBaseTest } from '@kbn/scout';
import type { ScoutSpaceParallelFixture } from '@kbn/scout/src/playwright/fixtures/scope/worker';
import { WorkflowsApiService } from '../../common/apis/workflows';

export interface WorkflowsApiServicesFixture extends ApiServicesFixture {
  workflowsApi: WorkflowsApiService;
}

interface WorkflowsWorkerFixtures extends ScoutParallelWorkerFixtures {
  apiServices: WorkflowsApiServicesFixture;
}

const extendWithWorkflowsApi = (
  spaceId: string,
  kbnClient: KbnClient,
  apiServices: ApiServicesFixture
): WorkflowsApiServicesFixture => {
  const extendedApiServices = apiServices as WorkflowsApiServicesFixture;
  extendedApiServices.workflowsApi = new WorkflowsApiService(spaceId, kbnClient);
  return extendedApiServices;
};

export const spaceTest = spaceBaseTest.extend<{}, WorkflowsWorkerFixtures>({
  apiServices: [
    async (
      {
        apiServices,
        kbnClient,
        scoutSpace,
      }: {
        apiServices: ApiServicesFixture;
        kbnClient: KbnClient;
        scoutSpace: ScoutSpaceParallelFixture;
      },
      use: (extendedApiServices: WorkflowsApiServicesFixture) => Promise<void>
    ) => {
      await use(extendWithWorkflowsApi(scoutSpace.id, kbnClient, apiServices));
    },
    { scope: 'worker' },
  ],
});

export const apiTest = scoutApiTest.extend<{}, WorkflowsWorkerFixtures>({
  apiServices: [
    async (
      {
        apiServices,
        kbnClient,
      }: {
        apiServices: ApiServicesFixture;
        kbnClient: KbnClient;
      },
      use: (extendedApiServices: WorkflowsApiServicesFixture) => Promise<void>
    ) => {
      await use(extendWithWorkflowsApi('default', kbnClient, apiServices));
    },
    { scope: 'worker' },
  ],
});
