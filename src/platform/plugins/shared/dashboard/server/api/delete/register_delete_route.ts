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
import { logRequest } from '@kbn/as-code-utils';
import { schema } from '@kbn/config-schema';
import type { VersionedRouter } from '@kbn/core-http-server';
import type { Logger, RequestHandlerContext } from '@kbn/core/server';
import type { UsageCounter } from '@kbn/usage-collection-plugin/server';

import { getRouteConfig } from '../get_route_config';
import { trackDeleteDashboardAction } from '../../user_activity';
import { deleteDashboard } from './delete';
import { getDashboardStateSchema } from '../dashboard_state_schemas';

export function registerDeleteRoute(
  router: VersionedRouter<RequestHandlerContext>,
  usageCounter: UsageCounter | undefined,
  logger: Logger
) {
  const { basePath, routeConfig, routeVersion } = getRouteConfig(false);
  const deleteRoute = router.delete({
    path: `${basePath}/{id}`,
    summary: `Delete a dashboard`,
    ...routeConfig,
    description: 'Permanently deletes a dashboard by ID.',
  });

  // Do not call getDashboardStateSchema when registering route.
  // Route is registered during setup and before all plugins have registered embeddable schemas.
  // Instead, use once to only call getDashboardStateSchema the first time a route handler is executed.
  const getCachedDashboardStateSchema = once(() => {
    return getDashboardStateSchema(false);
  });

  deleteRoute.addVersion(
    {
      version: routeVersion,
      options: {
        oasOperationObject: async () =>
          (await import('../oas_examples')).deleteDashboardOASOperationObject,
      },
      validate: {
        request: {
          params: schema.object({
            id: schema.string({
              meta: {
                description: 'The dashboard ID, as returned by the create or search endpoints.',
              },
            }),
          }),
        },
        response: {
          200: {
            description: 'deleted',
          },
          403: {
            description: 'forbidden',
          },
          404: {
            description: 'not found',
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
          const result = await deleteDashboard(ctx, req.params.id, getCachedDashboardStateSchema());
          try {
            await trackDeleteDashboardAction(result, req);
          } catch (e) {
            // if tracking throws, just swallow the error; no need to surface it
          }
        } catch (e) {
          if (e.isBoom && e.output.statusCode === 404) {
            const message = `A dashboard with ID [${req.params.id}] was not found.`;
            logRequest(logger, req, 'debug', message);
            return res.notFound({
              body: {
                message,
              },
            });
          }
          if (e.isBoom && e.output.statusCode === 403) {
            logRequest(logger, req, 'debug', e.message);
            return res.forbidden({ body: { message: e.message } });
          }

          const message = e.stack ?? e.message;
          logRequest(logger, req, 'error', message);
          // Throw so Kibana returns a 500 HTTP response on any uncaught errors.
          throw e;
        }

        return res.noContent();
      })
  );
}
