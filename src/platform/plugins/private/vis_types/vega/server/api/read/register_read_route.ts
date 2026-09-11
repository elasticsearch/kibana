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
import { readVegaOASOperationObject } from '../oas_examples';
import { read } from './read';
import { readRequestParamsSchema, readResponseBodySchema } from './schemas';

export const registerReadRoute = (
  router: VersionedRouter<RequestHandlerContext>,
  usageCounter: UsageCounter | undefined,
  logger: Logger
) => {
  const readRoute = router.get({
    path: `${VEGA_API_PATH}/{id}`,
    summary: 'Get a Vega library item',
    ...commonRouteConfig,
    description: 'Returns a single Vega library item by its ID.',
  });

  readRoute.addVersion(
    {
      version: PUBLIC_API_VERSION,
      options: {
        oasOperationObject: () => readVegaOASOperationObject,
      },
      validate: {
        request: {
          params: readRequestParamsSchema,
        },
        response: {
          200: {
            body: () => readResponseBodySchema,
            description: 'ok',
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
          const result = await read(ctx, req.params.id);
          return res.ok({ body: result });
        } catch (e) {
          if (e.isBoom && e.output.statusCode === 404) {
            return res.notFound({ body: { message: e.message } });
          }
          if (e.isBoom && e.output.statusCode === 403) {
            return res.forbidden({ body: { message: e.message } });
          }
          return writeErrorHandler(e, res, logger, req);
        }
      })
  );
};
