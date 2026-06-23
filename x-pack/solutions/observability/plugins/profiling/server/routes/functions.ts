/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { TypeOf } from '@kbn/config-schema';
import { schema } from '@kbn/config-schema';
import { kqlQuery } from '@kbn/observability-plugin/server';
import { SERVICE_NAME } from '@kbn/observability-shared-plugin/common';
import type { RouteRegisterParameters } from '.';
import { IDLE_SOCKET_TIMEOUT } from '.';
import { getRoutePaths, MAX_KUERY_LENGTH } from '../../common';
import { handleRouteHandlerError } from '../utils/handle_route_error_handler';
import { getClient } from './compat';

const querySchema = schema.object({
  timeFrom: schema.number(),
  timeTo: schema.number(),
  startIndex: schema.number(),
  endIndex: schema.number(),
  kuery: schema.string({ maxLength: MAX_KUERY_LENGTH }),
});

type QuerySchemaType = TypeOf<typeof querySchema>;

export function registerTopNFunctionsSearchRoute({
  router,
  logger,
  dependencies: {
    start: { profilingDataAccess },
  },
}: RouteRegisterParameters) {
  const paths = getRoutePaths();
  router.get(
    {
      path: paths.TopNFunctions,
      security: {
        authz: {
          requiredPrivileges: ['profiling'],
        },
      },
      options: { timeout: { idleSocket: IDLE_SOCKET_TIMEOUT } },
      validate: { query: querySchema },
    },
    async (context, request, response) => {
      try {
        const core = await context.core;

        const { timeFrom, timeTo, kuery }: QuerySchemaType = request.query;
        const startSecs = timeFrom / 1000;
        const endSecs = timeTo / 1000;

        const esClient = await getClient(context);

        const query = {
          bool: {
            filter: [
              ...kqlQuery(kuery),
              {
                range: {
                  ['@timestamp']: {
                    gte: String(startSecs),
                    lt: String(endSecs),
                    format: 'epoch_second',
                  },
                },
              },
            ],
          },
        };

        const totalSeconds = endSecs - startSecs;

        const topNFunctions = await profilingDataAccess.services.fetchESFunctions({
          core,
          esClient,
          query,
          aggregationFields: [SERVICE_NAME],
          totalSeconds,
        });

        return response.ok({
          body: topNFunctions,
        });
      } catch (error) {
        return handleRouteHandlerError({
          error,
          logger,
          response,
          message: 'Error while fetching TopN functions',
        });
      }
    }
  );
}
