/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';
import { createNightshiftInvestigationsServerRoute } from './create_server_route';

export const getCortexAvailabilityRoute = createNightshiftInvestigationsServerRoute({
  endpoint: 'GET /internal/nightshift/cortex/availability',
  options: {
    access: 'internal',
    summary: 'Check whether Cortex is enabled',
    description:
      'Reports xpack.nightshift_investigations.cortex.enabled so the UI can hide the Cortex view when it is off.',
  },
  security: {
    authz: { requiredPrivileges: ['agentBuilder:read'] },
  },
  params: z.object({}),
  handler: async ({ isCortexEnabled }) => {
    return { enabled: isCortexEnabled() };
  },
});
