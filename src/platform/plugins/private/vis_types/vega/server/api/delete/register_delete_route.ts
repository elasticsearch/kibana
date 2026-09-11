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
import { z } from '@kbn/zod';
import type { VersionedRouter } from '@kbn/core-http-server';
import type { Logger, RequestHandlerContext } from '@kbn/core/server';
import type { UsageCounter } from '@kbn/usage-collection-plugin/server';

import {
  VEGA_API_PATH,
  commonRouteConfig,
  PUBLIC_API_VERSION,
  VEGA_LIBRARY_ITEM_PARAMS_ID_DESCRIPTION,
} from '../constants';
import { isVegaApiEnabled } from '../is_vega_api_enabled';
import { deleteVegaOASOperationObject } from '../oas_examples';
import { deleteItem } from './delete';

const deleteRequestParamsSchema = z.object({
  id: z.string().meta({ description: VEGA_LIBRARY_ITEM_PARAMS_ID_DESCRIPTION }),
});

export const registerDeleteRoute = (
  router: VersionedRouter<RequestHandlerContext>,
  usageCounter: UsageCounter | undefined,
  logger: Logger
) => {
  const deleteRoute = router.delete({
    path: `${VEGA_API_PATH}/{id}`,
    summary: 'Delete a Vega library item',
    ...commonRouteConfig,
    description: 'Deletes a Vega library item by its ID.',
  });

  deleteRoute.addVersion(
    {
      version: PUBLIC_API_VERSION,
      options: {
        oasOperationObject: () => deleteVegaOASOperationObject,
      },
      validate: {
        request: {
          params: deleteRequestParamsSchema,
        },
        response: {
          204: {
            description: 'no content',
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
          await deleteItem(ctx, req.params.id);
          return res.noContent();
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
