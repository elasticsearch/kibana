/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';
import { MAX_STREAM_NAME_LENGTH } from '@kbn/streams-schema';
import { createServerRoute } from '../../../create_server_route';
import { assertSignificantEventsAccess } from '../../../utils/assert_significant_events_access';
import { STREAMS_API_PRIVILEGES } from '../../../../../common/constants';

export const keepAlivePersistentIndicatorsRoute = createServerRoute({
  endpoint: 'POST /internal/streams/{streamName}/knowledge_indicators/_keep_alive',
  options: {
    access: 'internal',
    summary: 'Keep alive persistent (durable or excluded) knowledge indicators for a stream',
  },
  security: {
    authz: {
      requiredPrivileges: [STREAMS_API_PRIVILEGES.manage],
    },
  },
  params: z.object({
    path: z.object({ streamName: z.string().max(MAX_STREAM_NAME_LENGTH) }),
    body: z.object({ lastRefreshedBefore: z.iso.datetime() }),
  }),
  handler: async ({ params, request, getScopedClients, server }) => {
    const { getKnowledgeIndicatorClient, licensing, uiSettingsClient } = await getScopedClients({
      request,
    });

    await assertSignificantEventsAccess({ server, licensing, uiSettingsClient });

    const kiClient = await getKnowledgeIndicatorClient();
    const { refreshed } = await kiClient.keepAlivePersistentIndicators(params.path.streamName, {
      lastRefreshedBefore: params.body.lastRefreshedBefore,
    });
    return { refreshed };
  },
});

export const keepAliveRoutes = {
  ...keepAlivePersistentIndicatorsRoute,
};
