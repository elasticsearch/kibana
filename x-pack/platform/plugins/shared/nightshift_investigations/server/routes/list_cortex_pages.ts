/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { notFound } from '@hapi/boom';
import { z } from '@kbn/zod/v4';
import { CORTEX_ENTITY_TYPES, CORTEX_PAGE_STATUSES } from '../../common/cortex';
import { createNightshiftInvestigationsServerRoute } from './create_server_route';

export const listCortexPagesRoute = createNightshiftInvestigationsServerRoute({
  endpoint: 'GET /internal/nightshift/cortex/pages',
  options: {
    access: 'internal',
    summary: 'List Cortex pages',
    description: 'Returns Cortex wiki pages stored in the Context Engine AI index.',
  },
  security: {
    authz: { requiredPrivileges: ['agentBuilder:read'] },
  },
  params: z.object({
    query: z
      .object({
        status: z.enum(CORTEX_PAGE_STATUSES).optional(),
        entity_type: z.enum(CORTEX_ENTITY_TYPES).optional(),
      })
      .optional()
      .default({}),
  }),
  handler: async ({ request, params, getCortexPageStore, isCortexEnabled }) => {
    if (!isCortexEnabled()) throw notFound('Cortex is not enabled');

    const store = getCortexPageStore(request);
    return store.list({
      status: params.query?.status,
      entityType: params.query?.entity_type,
    });
  },
});
