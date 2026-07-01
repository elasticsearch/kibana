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
import { logRequest, writeErrorHandler } from '@kbn/as-code-utils';
import type { VersionedRouter } from '@kbn/core-http-server';
import type { Logger, RequestHandlerContext } from '@kbn/core/server';
import type { UsageCounter } from '@kbn/usage-collection-plugin/server';

import { trackCreateDashboardAction } from '../../user_activity';
import { getDashboardStateSchema } from '../dashboard_state_schemas';
import { getRouteConfig } from '../get_route_config';
import { TransformPanelsInError } from '../transforms/in/transform_panels_in_error';
import { create } from './create';
import { getCreateResponseBodySchema } from './schemas';

export function registerCreateRoute(
  router: VersionedRouter<RequestHandlerContext>,
  usageCounter: UsageCounter | undefined,
  isDashboardAppRequest: boolean,
  logger: Logger
) {
  const { basePath, routeConfig, routeVersion } = getRouteConfig(isDashboardAppRequest);
  const createRoute = router.post({
    path: basePath,
    summary: 'Create a dashboard',
    ...routeConfig,
    description: 'Creates a new dashboard and returns its ID, full state, and metadata.',
  });

  // Do not call getDashboardStateSchema when registering route.
  // Route is registered during setup and before all plugins have registered embeddable schemas.
  // Instead, use once to only call getDashboardStateSchema the first time a route handler is executed.
  const getCachedDashboardStateSchema = once(() => {
    return getDashboardStateSchema(false);
  });

  createRoute.addVersion(
    {
      version: routeVersion,
      options: {
        oasOperationObject: async () =>
          (await import('../oas_examples')).createDashboardOASOperationObject,
      },
      validate: () => ({
        request: {
          body: getDashboardStateSchema(isDashboardAppRequest),
        },
        response: {
          201: {
            body: () => getCreateResponseBodySchema(isDashboardAppRequest),
            description: 'created',
          },
          400: {
            description: 'invalid request',
          },
          403: {
            description: 'forbidden',
          },
        },
      }),
    },
    async (ctx, req, res) =>
      telemetryHandler(req, usageCounter, async () => {
        try {
          const result = await create(
            ctx,
            getCachedDashboardStateSchema(),
            req.body,
            req.serverTiming,
            isDashboardAppRequest
          );
          try {
            await trackCreateDashboardAction(result, req);
          } catch (e) {
            // if tracking throws, just swallow the error; no need to surface it
          }
          return res.created({ body: result });
        } catch (e) {
          if (e instanceof TransformPanelsInError) {
            logRequest(logger, req, 'warn', e.message);
            return res.custom(e.getCustomResponse());
          }
          return writeErrorHandler(e, res, logger, req);
        }
      })
  );
}
