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

import { LINKS_API_PATH, PUBLIC_API_VERSION } from '../../../common/constants';
import { commonRouteConfig, LINKS_SEARCH_DESCRIPTION } from '../constants';
import { searchLinksOASOperationObject } from '../oas_examples';
import { searchResponseBodySchema } from './schemas';
import { search } from './search';

export function registerSearchRoute(
  router: VersionedRouter<RequestHandlerContext>,
  usageCounter: UsageCounter | undefined,
  logger: Logger
) {
  const searchRoute = router.get({
    path: LINKS_API_PATH,
    summary: `List links library items`,
    ...commonRouteConfig,
    description: LINKS_SEARCH_DESCRIPTION,
  });

  searchRoute.addVersion(
    {
      version: PUBLIC_API_VERSION,
      options: {
        oasOperationObject: () => searchLinksOASOperationObject,
      },
      validate: {
        request: { query: asCodeSearchRequestSchema },
        response: {
          200: {
            body: () => searchResponseBodySchema,
            description: 'success',
          },
          403: {
            description: 'forbidden',
          },
        },
      },
    },
    async (ctx, req, res) =>
      telemetryHandler(req, usageCounter, async () => {
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
}
