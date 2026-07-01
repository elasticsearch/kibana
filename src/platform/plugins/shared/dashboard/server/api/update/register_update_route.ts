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
import { schema } from '@kbn/config-schema';
import type { VersionedRouter } from '@kbn/core-http-server';
import type { Logger, RequestHandlerContext } from '@kbn/core/server';
import type { UsageCounter } from '@kbn/usage-collection-plugin/server';

import { trackCreateDashboardAction, trackUpdateDashboardAction } from '../../user_activity';
import { getDashboardStateSchema } from '../dashboard_state_schemas';
import { getRouteConfig } from '../get_route_config';
import { TransformPanelsInError } from '../transforms/in/transform_panels_in_error';
import { getUpdateResponseBodySchema } from './schemas';
import { update } from './update';

export function registerUpdateRoute(
  router: VersionedRouter<RequestHandlerContext>,
  usageCounter: UsageCounter | undefined,
  isDashboardAppRequest: boolean,
  logger: Logger
) {
  const { basePath, routeConfig, routeVersion } = getRouteConfig(isDashboardAppRequest);
  const updateRoute = router.put({
    path: `${basePath}/{id}`,
    ...routeConfig,
    summary: `Upsert a dashboard`,
  });

  // Do not call getDashboardStateSchema when registering route.
  // Route is registered during setup and before all plugins have registered embeddable schemas.
  // Instead, use once to only call getDashboardStateSchema the first time a route handler is executed.
  const getCachedDashboardStateSchema = once(() => {
    return getDashboardStateSchema(false);
  });

  updateRoute.addVersion(
    {
      version: routeVersion,
      options: {
        oasOperationObject: async () =>
          (await import('../oas_examples')).updateDashboardOASOperationObject,
      },
      validate: () => ({
        request: {
          params: schema.object({
            // Can not validate id at route level
            // existing dashboards may have invalid "as code" ids
            id: schema.string({
              meta: {
                description: 'The unique ID of the dashboard to be created or updated',
              },
            }),
          }),
          body: getDashboardStateSchema(isDashboardAppRequest),
        },
        response: {
          200: {
            body: () => getUpdateResponseBodySchema(isDashboardAppRequest),
            description: 'updated',
          },
          201: {
            body: () => getUpdateResponseBodySchema(isDashboardAppRequest),
            description: 'created',
          },
          400: {
            description: 'invalid request',
          },
          403: {
            description: 'forbidden',
          },
          409: {
            description: 'conflict',
          },
        },
      }),
    },
    async (ctx, req, res) =>
      telemetryHandler(req, usageCounter, async () => {
        try {
          const { body, operation } = await update(
            ctx,
            getCachedDashboardStateSchema(),
            req.params.id,
            req.body,
            req.serverTiming,
            isDashboardAppRequest
          );
          if (operation === 'create') {
            // do not await tracking actions
            void trackCreateDashboardAction(body, req).catch(); // do nothing on throw
            return res.created({ body });
          } else {
            void trackUpdateDashboardAction(body, req).catch();
            return res.ok({ body });
          }
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
