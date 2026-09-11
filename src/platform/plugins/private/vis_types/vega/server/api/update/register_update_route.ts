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
import type { Logger, RequestHandlerContext } from '@kbn/core/server';
import type { UsageCounter } from '@kbn/usage-collection-plugin/server';

import { VEGA_API_PATH, commonRouteConfig, PUBLIC_API_VERSION } from '../constants';
import { isVegaApiEnabled } from '../is_vega_api_enabled';
import { updateVegaOASOperationObject } from '../oas_examples';
import { update } from './update';
import {
  updateRequestParamsSchema,
  updateRequestBodySchema,
  updateResponseBodySchema,
} from './schemas';

export const registerUpdateRoute = (
  router: VersionedRouter<RequestHandlerContext>,
  usageCounter: UsageCounter | undefined,
  logger: Logger
) => {
  const updateRoute = router.put({
    path: `${VEGA_API_PATH}/{id}`,
    summary: 'Upsert a Vega library item',
    ...commonRouteConfig,
    description:
      'Replaces the full state of a Vega library item. If no item exists with the specified ID, a new one is created.',
  });

  updateRoute.addVersion(
    {
      version: PUBLIC_API_VERSION,
      options: {
        oasOperationObject: () => updateVegaOASOperationObject,
      },
      validate: {
        request: {
          params: updateRequestParamsSchema,
          body: updateRequestBodySchema,
        },
        response: {
          200: {
            body: () => updateResponseBodySchema,
            description: 'updated',
          },
          201: {
            body: () => updateResponseBodySchema,
            description: 'created',
          },
          400: {
            description: 'bad request',
          },
          403: {
            description: 'forbidden',
          },
        },
      },
    },
    async (ctx, req, res) =>
      telemetryHandler(req, { usageCounter }, async () => {
        const { core } = await ctx.resolve(['core']);
        if (!(await isVegaApiEnabled(core.featureFlags))) {
          return res.notFound();
        }
        try {
          const { body, operation } = await update(ctx, req.params.id, req.body);
          if (operation === 'create') {
            return res.created({ body });
          }
          return res.ok({ body });
        } catch (e) {
          if (e.isBoom && e.output.statusCode === 403) {
            return res.forbidden({ body: { message: e.message } });
          }
          return writeErrorHandler(e, res, logger, req);
        }
      })
  );
};
