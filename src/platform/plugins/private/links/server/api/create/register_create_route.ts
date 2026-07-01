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

import { LINKS_API_PATH, PUBLIC_API_VERSION } from '../../../common/constants';
import { commonRouteConfig, LINKS_CREATE_DESCRIPTION } from '../constants';
import { createLinksOASOperationObject } from '../oas_examples';
import { create } from './create';
import { createRequestBodySchema, createResponseBodySchema } from './schemas';

export function registerCreateRoute(
  router: VersionedRouter<RequestHandlerContext>,
  usageCounter: UsageCounter | undefined,
  logger: Logger
) {
  const createRoute = router.post({
    path: LINKS_API_PATH,
    summary: 'Create a links library item',
    ...commonRouteConfig,
    description: LINKS_CREATE_DESCRIPTION,
  });

  createRoute.addVersion(
    {
      version: PUBLIC_API_VERSION,
      options: {
        oasOperationObject: () => createLinksOASOperationObject,
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
        },
      },
    },
    async (ctx, req, res) =>
      telemetryHandler(req, usageCounter, async () => {
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
}
