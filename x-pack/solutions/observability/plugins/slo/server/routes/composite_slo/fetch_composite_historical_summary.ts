/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { fetchCompositeHistoricalSummaryParamsSchema } from '@kbn/slo-schema';
import { CompositeHistoricalSummaryClient } from '../../services';
import { createCompositeSloServerRoute } from './create_composite_slo_server_route';

export const fetchCompositeHistoricalSummaryRoute = createCompositeSloServerRoute({
  endpoint: 'POST /internal/observability/slo_composites/_historical_summary',
  options: { access: 'internal' },
  security: {
    authz: {
      requiredPrivileges: ['slo_read'],
    },
  },
  params: fetchCompositeHistoricalSummaryParamsSchema,
  handler: async ({ request, logger, params, getScopedClients }) => {
    const { scopedClusterClient, repository, compositeRepository, spaceId } =
      await getScopedClients({
        request,
        logger,
      });

    const client = new CompositeHistoricalSummaryClient(
      scopedClusterClient.asCurrentUser,
      compositeRepository,
      repository,
      spaceId
    );

    return await client.fetch(params.body);
  },
});
