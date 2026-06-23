/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { once } from 'lodash';

import { telemetryHandler } from '@kbn/as-code-shared-telemetry';
import type { VersionedRouter } from '@kbn/core-http-server';
import type { Logger, RequestHandlerContext } from '@kbn/core/server';
import type { UsageCounter } from '@kbn/usage-collection-plugin/server';

import { getRouteConfig } from '../get_route_config';
import { logRequest } from '../log_request';
import { searchRequestParamsSchema, searchResponseBodySchema } from './schemas';
import { search } from './search';
import { getDashboardStateSchema } from '../dashboard_state_schemas';

export function registerSearchRoute(
  router: VersionedRouter<RequestHandlerContext>,
  usageCounter: UsageCounter | undefined,
  logger: Logger
) {
  const { basePath, routeConfig, routeVersion } = getRouteConfig(false);
  const searchRoute = router.get({
    path: `${basePath}`,
    summary: `Search dashboards`,
    ...routeConfig,
    description:
      'Returns a paginated list of dashboards. Each result includes title, description, tags, and metadata, but not the full panel layout. Use `GET /api/dashboards/{id}` to retrieve the complete state.',
  });

  // Do not call getDashboardStateSchema when registering route.
  // Route is registered during setup and before all plugins have registered embeddable schemas.
  // Instead, use once to only call getDashboardStateSchema the first time a route handler is executed.
  const getCachedDashboardStateSchema = once(() => {
    return getDashboardStateSchema(false, true);
  });

  searchRoute.addVersion(
    {
      version: routeVersion,
      options: {
        oasOperationObject: async () =>
          (await import('../oas_examples')).searchDashboardOASOperationObject,
      },
      validate: {
        request: {
          query: searchRequestParamsSchema,
        },
        response: {
          200: {
            body: () => searchResponseBodySchema,
            description: 'success',
          },
          403: {
            description: 'forbidden',
          },
          500: {
            description: 'internal server error',
          },
        },
      },
    },
    async (ctx, req, res) =>
      telemetryHandler(req, usageCounter, async () => {
        try {
          const result = await search(ctx, req.query, getCachedDashboardStateSchema());
          return res.ok({ body: result });
        } catch (e) {
          if (e.isBoom && e.output.statusCode === 403) {
            logRequest(logger, req, 'debug', e.message);
            return res.forbidden({ body: { message: e.message } });
          }

          logRequest(logger, req, 'error', e.message);
          return res.customError({ statusCode: 500, body: { message: e.message } });
        }
      })
  );
}
