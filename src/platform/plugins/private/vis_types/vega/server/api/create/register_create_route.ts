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
import { createVegaOASOperationObject } from '../oas_examples';
import { create } from './create';
import { createRequestBodySchema, createResponseBodySchema } from './schemas';

export const registerCreateRoute = (
  router: VersionedRouter<RequestHandlerContext>,
  usageCounter: UsageCounter | undefined,
  logger: Logger
) => {
  const createRoute = router.post({
    path: VEGA_API_PATH,
    summary: 'Create a Vega library item',
    ...commonRouteConfig,
    description: 'Creates a new Vega library item and returns its ID, full state, and metadata.',
  });

  createRoute.addVersion(
    {
      version: PUBLIC_API_VERSION,
      options: {
        oasOperationObject: () => createVegaOASOperationObject,
      },
      validate: {
        request: {
          body: createRequestBodySchema,
        },
        response: {
          201: {
            body: () => createResponseBodySchema,
            description: 'created',
          },
          400: {
            description: 'invalid request',
          },
          403: {
            description: 'forbidden',
          },
          404: {
            description: 'not found',
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
          const result = await create(ctx, req.body);
          return res.created({ body: result });
        } catch (e) {
          if (e.isBoom && e.output.statusCode === 403) {
            return res.forbidden({ body: { message: e.message } });
          }
          return writeErrorHandler(e, res, logger, req);
        }
      })
  );
};
