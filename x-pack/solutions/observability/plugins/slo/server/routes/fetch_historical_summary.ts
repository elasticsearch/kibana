/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { fetchHistoricalSummaryParamsSchema } from '@kbn/slo-schema';
import { HistoricalSummaryClient } from '../services/historical_summary_client';
import { createSloServerRoute } from './utils/create_slo_server_route';
import { assertPlatinumLicense } from './utils/assert_platinum_license';

export const fetchHistoricalSummary = createSloServerRoute({
  endpoint: 'POST /internal/observability/slos/_historical_summary',
  options: { access: 'internal' },
  security: {
    authz: {
      requiredPrivileges: ['slo_read'],
    },
  },
  params: fetchHistoricalSummaryParamsSchema,
  handler: async ({ request, logger, params, plugins, getScopedClients }) => {
    await assertPlatinumLicense(plugins);
    const { scopedClusterClient, spaceId } = await getScopedClients({ request, logger });
    const historicalSummaryClient = new HistoricalSummaryClient(
      scopedClusterClient.asCurrentUser,
      spaceId
    );

    return await historicalSummaryClient.fetch(params.body);
  },
});
