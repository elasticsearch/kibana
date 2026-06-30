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
import { schema } from '@kbn/config-schema';

import { getRouteConfig } from '../get_route_config';
import { logRequest } from '../log_request';
import {
  legacySearchRequestParamsSchema,
  legacySearchResponseBodySchema,
  searchRequestParamsSchema,
  searchResponseBodySchema,
} from './schemas';
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
          query: schema.oneOf([searchRequestParamsSchema, legacySearchRequestParamsSchema]),
        },
        response: {
          200: {
            body: () => schema.oneOf([searchResponseBodySchema, legacySearchResponseBodySchema]),
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
          // Request query is validated against `oneOf([GA, legacy])` by the router (returns 400),
          // and the response is validated against the same schemas in dev. The active shape is
          // determined by the feature flag inside `search`.
          const result = await search(ctx, req.query, getCachedDashboardStateSchema());

          return res.ok({ body: result });
        } catch (e) {
          if (e.isBoom && e.output.statusCode === 403) {
            logRequest(logger, req, 'debug', e.message);
            return res.forbidden({ body: { message: e.message } });
          }

          const message = e.stack ?? e.message;
          logRequest(logger, req, 'error', message);
          // Throw so Kibana returns a 500 HTTP response on any uncaught errors.
          throw e;
        }
      })
  );
}
