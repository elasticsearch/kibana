/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */
import { telemetryHandler } from '@kbn/as-code-shared-telemetry';
import { MAX_ID_LENGTH } from '@kbn/as-code-shared-schemas';
import { logRequest } from '@kbn/as-code-utils';
import { schema } from '@kbn/config-schema';
import type { VersionedRouter } from '@kbn/core-http-server';
import type { Logger, RequestHandlerContext } from '@kbn/core/server';
import type { UsageCounter } from '@kbn/usage-collection-plugin/server';

import { LINKS_API_PATH, PUBLIC_API_VERSION } from '../../../common/constants';
import { commonRouteConfig, LINKS_DELETE_DESCRIPTION, LINKS_ID_DESCRIPTION } from '../constants';
import { deleteLinksOASOperationObject } from '../oas_examples';
import { deleteLinks } from './delete';

export function registerDeleteRoute(
  router: VersionedRouter<RequestHandlerContext>,
  usageCounter: UsageCounter | undefined,
  logger: Logger
) {
  const deleteRoute = router.delete({
    path: `${LINKS_API_PATH}/{id}`,
    summary: `Delete a links library item`,
    ...commonRouteConfig,
    description: LINKS_DELETE_DESCRIPTION,
  });

  deleteRoute.addVersion(
    {
      version: PUBLIC_API_VERSION,
      options: {
        oasOperationObject: () => deleteLinksOASOperationObject,
      },
      validate: {
        request: {
          params: schema.object({
            id: schema.string({
              maxLength: MAX_ID_LENGTH,
              meta: {
                description: LINKS_ID_DESCRIPTION,
              },
            }),
          }),
        },
        response: {
          204: {
            description: 'deleted',
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
      telemetryHandler(req, usageCounter, async () => {
        try {
          await deleteLinks(ctx, req.params.id);
        } catch (e) {
          if (e.isBoom && e.output.statusCode === 404) {
            const message = `A links library item with ID [${req.params.id}] was not found.`;
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
          throw e;
        }

        return res.noContent();
      })
  );
}
