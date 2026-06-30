/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';
import type { SignificantEventsAvailabilityResponse } from '../../../../../common';
import { STREAMS_API_PRIVILEGES } from '../../../../../common/constants';
import { createServerRoute } from '../../../create_server_route';
import { getSignificantEventsAvailability } from '../../../utils/assert_significant_events_access';

const significantEventsAvailabilityRoute = createServerRoute({
  endpoint: 'GET /internal/significant_events/availability',
  options: {
    access: 'internal',
    summary: 'Get significant events availability',
    description:
      'Returns whether significant events is available given the current pricing tier, license, settings and required plugins.',
  },
  security: {
    authz: {
      requiredPrivileges: [STREAMS_API_PRIVILEGES.read],
    },
  },
  params: z.object({}),
  handler: async ({
    request,
    getScopedClients,
    server,
  }): Promise<SignificantEventsAvailabilityResponse> => {
    const { licensing, uiSettingsClient } = await getScopedClients({ request });

    return getSignificantEventsAvailability({ server, licensing, uiSettingsClient });
  },
});

export const internalSigEventsAvailabilityRoutes = {
  ...significantEventsAvailabilityRoute,
};
