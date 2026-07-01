/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { telemetryHandler } from '@kbn/as-code-shared-telemetry';
import { logRequest, writeErrorHandler } from '@kbn/as-code-utils';
import { schema } from '@kbn/config-schema';
import type { VersionedRouter } from '@kbn/core-http-server';
import type { Logger, RequestHandlerContext } from '@kbn/core/server';
import type { UsageCounter } from '@kbn/usage-collection-plugin/server';

import { LINKS_API_PATH, PUBLIC_API_VERSION } from '../../../common/constants';
import { commonRouteConfig, LINKS_UPDATE_DESCRIPTION } from '../constants';
import { updateLinksOASOperationObject } from '../oas_examples';
import { updateRequestBodySchema, updateResponseBodySchema } from './schemas';
import { update } from './update';

export function registerUpdateRoute(
  router: VersionedRouter<RequestHandlerContext>,
  usageCounter: UsageCounter | undefined,
  logger: Logger
) {
  const updateRoute = router.put({
    path: `${LINKS_API_PATH}/{id}`,
    summary: `Upsert links library item`,
    ...commonRouteConfig,
    description: LINKS_UPDATE_DESCRIPTION,
  });

  updateRoute.addVersion(
    {
      version: PUBLIC_API_VERSION,
      options: {
        oasOperationObject: () => updateLinksOASOperationObject,
      },
      validate: {
        request: {
          params: schema.object({
            // Can not validate id at route level
            // existing links panels may have invalid "as code" ids
            id: schema.string({
              meta: {
                description: 'The unique ID of the links library item to be created or updated',
              },
            }),
          }),
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
            description: 'invalid request',
          },
          403: {
            description: 'forbidden',
          },
          409: {
            description: 'conflict',
          },
        },
      },
    },
    async (ctx, req, res) =>
      telemetryHandler(req, usageCounter, async () => {
        try {
          const { body, operation } = await update(ctx, req.params.id, req.body);
          if (operation === 'create') {
            return res.created({ body });
          } else {
            return res.ok({ body });
          }
        } catch (e) {
          if (e.isBoom && e.output.statusCode === 403) {
            logRequest(logger, req, 'debug', e.message);
            return res.forbidden({ body: { message: e.message } });
          }
          return writeErrorHandler(e, res, logger, req);
        }
      })
  );
}
