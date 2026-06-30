/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  getHealthScanParamsSchema,
  listHealthScanParamsSchema,
  postHealthScanParamsSchema,
  type GetHealthScanResultsResponse,
  type ListHealthScanResponse,
  type PostHealthScanResponse,
} from '@kbn/slo-schema';
import {
  getAccessibleSpaceIds,
  getHealthScanResults,
  listHealthScans,
  scheduleHealthScan,
} from '../services/health_scan';
import { createSloServerRoute } from './utils/create_slo_server_route';
import { assertPlatinumLicense } from './utils/assert_platinum_license';

export const postHealthScanRoute = createSloServerRoute({
  endpoint: 'POST /internal/observability/slos/_health/scans',
  options: { access: 'internal' },
  security: {
    authz: {
      requiredPrivileges: ['slo_write'],
    },
  },
  params: postHealthScanParamsSchema,
  handler: async ({ params, plugins, request }): Promise<PostHealthScanResponse> => {
    await assertPlatinumLicense(plugins);
    const taskManager = await plugins.taskManager.start();

    return scheduleHealthScan({ force: params?.body?.force }, { taskManager, request });
  },
});

export const listHealthScanRoute = createSloServerRoute({
  endpoint: 'GET /internal/observability/slos/_health/scans',
  options: { access: 'internal' },
  security: {
    authz: {
      requiredPrivileges: ['slo_read'],
    },
  },
  params: listHealthScanParamsSchema,
  handler: async ({
    request,
    params,
    plugins,
    getScopedClients,
    logger,
  }): Promise<ListHealthScanResponse> => {
    await assertPlatinumLicense(plugins);
    const { scopedClusterClient, spaceId } = await getScopedClients({ request, logger });
    const taskManager = await plugins.taskManager.start();
    const spaceIds = await getAccessibleSpaceIds({
      plugins,
      request,
      activeSpaceId: spaceId,
    });

    return listHealthScans(
      { size: params?.query?.size },
      { scopedClusterClient, taskManager, spaceIds }
    );
  },
});

export const getHealthScanRoute = createSloServerRoute({
  endpoint: 'GET /internal/observability/slos/_health/scans/{scanId}',
  options: { access: 'internal' },
  security: {
    authz: {
      requiredPrivileges: ['slo_read'],
    },
  },
  params: getHealthScanParamsSchema,
  handler: async ({
    request,
    params,
    plugins,
    getScopedClients,
    logger,
  }): Promise<GetHealthScanResultsResponse> => {
    await assertPlatinumLicense(plugins);
    const taskManager = await plugins.taskManager.start();
    const { scopedClusterClient, spaceId } = await getScopedClients({ request, logger });

    const spaceIds = params.query?.allSpaces
      ? await getAccessibleSpaceIds({ plugins, request, activeSpaceId: spaceId })
      : [spaceId];

    return getHealthScanResults(
      {
        scanId: params.path.scanId,
        size: params.query?.size,
        problematic: params.query?.problematic,
        searchAfter: params.query?.searchAfter,
      },
      { scopedClusterClient, taskManager, spaceIds }
    );
  },
});

export const healthScanRoutes = {
  ...postHealthScanRoute,
  ...listHealthScanRoute,
  ...getHealthScanRoute,
};
