/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema } from '@kbn/config-schema';
import { kqlQuery } from '@kbn/observability-plugin/server';
import type { RouteRegisterParameters } from '.';
import { IDLE_SOCKET_TIMEOUT } from '.';
import { getRoutePaths, MAX_KUERY_LENGTH } from '../../common';
import { handleRouteHandlerError } from '../utils/handle_route_error_handler';
import { getClient } from './compat';

export function registerFlameChartSearchRoute({
  router,
  logger,
  dependencies: {
    start: { profilingDataAccess },
  },
}: RouteRegisterParameters) {
  const paths = getRoutePaths();
  router.get(
    {
      path: paths.Flamechart,
      security: {
        authz: {
          requiredPrivileges: ['profiling'],
        },
      },
      options: { timeout: { idleSocket: IDLE_SOCKET_TIMEOUT } },
      validate: {
        query: schema.object({
          timeFrom: schema.number(),
          timeTo: schema.number(),
          kuery: schema.string({ maxLength: MAX_KUERY_LENGTH }),
        }),
      },
    },
    async (context, request, response) => {
      const { timeFrom, timeTo, kuery } = request.query;

      const core = await context.core;
      const startSecs = timeFrom / 1000;
      const endSecs = timeTo / 1000;

      try {
        const esClient = await getClient(context);
        const flamegraph = await profilingDataAccess.services.fetchFlamechartData({
          core,
          esClient,
          totalSeconds: endSecs - startSecs,
          query: {
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
          },
        });

        return response.ok({ body: flamegraph });
      } catch (error) {
        return handleRouteHandlerError({
          error,
          logger,
          response,
          message: 'Error while fetching flamegraph',
        });
      }
    }
  );
}
