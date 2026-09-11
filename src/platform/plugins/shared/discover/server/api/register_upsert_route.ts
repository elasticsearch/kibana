/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { telemetryHandler } from '@kbn/as-code-shared-telemetry';
import { writeErrorHandler } from '@kbn/as-code-utils';
import type { VersionedRouter } from '@kbn/core-http-server';
import type { CoreSetup, Logger, RequestHandlerContext } from '@kbn/core/server';
import type { UsageCounter } from '@kbn/usage-collection-plugin/server';
import { z } from '@kbn/zod';
import { discoverSessionApiDataSchema } from '@kbn/as-code-discover-schema';
import { getRouteConfig } from './get_route_config';
import { discoverSessionApiResponseSchema } from './schema';
import { upsertDiscoverSession } from './session_upsert';
import { trackDiscoverSessionAction } from './user_activity';

export const registerUpsertRoute = (
  router: VersionedRouter<RequestHandlerContext>,
  userActivity: CoreSetup['userActivity'],
  logger: Logger,
  usageCounter: UsageCounter | undefined
) => {
  const { basePath, routeConfig, routeVersion } = getRouteConfig();

  router
    .put({
      path: `${basePath}/{id}`,
      summary: 'Upsert a Discover session',
      description:
        'Creates a Discover session with the specified ID, or fully replaces the existing session.',
      ...routeConfig,
    })
    .addVersion(
      {
        version: routeVersion,
        validate: {
          request: {
            params: z
              .object({
                id: z.string().meta({
                  description: 'The unique ID of the Discover session to create or replace.',
                }),
              })
              .strict(),
            body: discoverSessionApiDataSchema,
          },
          response: {
            200: {
              body: () => discoverSessionApiResponseSchema,
              description: 'Updated',
            },
            201: {
              body: () => discoverSessionApiResponseSchema,
              description: 'Created',
            },
            400: { description: 'Invalid request' },
            403: { description: 'Forbidden' },
            409: { description: 'Conflict' },
          },
        },
      },
      async (context, request, response) =>
        telemetryHandler(request, { usageCounter }, async () => {
          try {
            const { body, operation } = await upsertDiscoverSession(
              context,
              request.params.id,
              request.body
            );
            trackDiscoverSessionAction(userActivity, operation, body);

            return operation === 'create' ? response.created({ body }) : response.ok({ body });
          } catch (error) {
            return writeErrorHandler(error, response, logger, request);
          }
        })
    );
};
