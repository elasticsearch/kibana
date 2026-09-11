/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { asCodeSearchRequestSchema } from '@kbn/as-code-shared-schemas';
import { telemetryHandler } from '@kbn/as-code-shared-telemetry';
import { logRequest } from '@kbn/as-code-utils';
import type { VersionedRouter } from '@kbn/core-http-server';
import type { Logger, RequestHandlerContext } from '@kbn/core/server';
import type { UsageCounter } from '@kbn/usage-collection-plugin/server';

import { VEGA_API_PATH, commonRouteConfig, PUBLIC_API_VERSION } from '../constants';
import { isVegaApiEnabled } from '../is_vega_api_enabled';
import { searchVegaOASOperationObject } from '../oas_examples';
import { searchResponseBodySchema } from './schemas';
import { search } from './search';

export const registerSearchRoute = (
  router: VersionedRouter<RequestHandlerContext>,
  usageCounter: UsageCounter | undefined,
  logger: Logger
) => {
  const searchRoute = router.get({
    path: VEGA_API_PATH,
    summary: 'List Vega library items',
    ...commonRouteConfig,
    description:
      'Returns a paginated list of Vega library items. Each result includes title, description, and metadata, but not the spec. Use `GET /api/vega/{id}` to retrieve the complete state.',
  });

  searchRoute.addVersion(
    {
      version: PUBLIC_API_VERSION,
      options: {
        oasOperationObject: () => searchVegaOASOperationObject,
      },
      validate: {
        request: {
          query: asCodeSearchRequestSchema.pick({ page: true, per_page: true, query: true }),
        },
        response: {
          200: {
            body: () => searchResponseBodySchema,
            description: 'success',
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
        let result;
        try {
          result = await search(ctx, req.query);
        } catch (e) {
          if (e.isBoom && e.output.statusCode === 403) {
            logRequest(logger, req, 'debug', e.message);
            return res.forbidden({ body: { message: e.message } });
          }
          const message = e.stack ?? e.message;
          logRequest(logger, req, 'error', message);
          throw e;
        }
        return res.ok({ body: result });
      })
  );
};
