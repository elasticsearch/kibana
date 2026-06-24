/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { UsageCounter } from '@kbn/usage-collection-plugin/server';
import { telemetryHandler } from '@kbn/as-code-shared-telemetry';
import type { TagsPluginRouter } from '../../../types';
import { handleRouteError } from '../error_handler';
import { getRouteConfig } from '../get_route_config';
import { tagIdParamSchema, tagRequestAttributesSchema, tagResponseItemSchema } from '../schemas';
import { upsert } from './upsert';

export const registerUpsertRoute = (router: TagsPluginRouter, usageCounter?: UsageCounter) => {
  const { basePath, routeConfig, routeVersion } = getRouteConfig();

  const upsertRoute = router.versioned.put({
    path: `${basePath}/{id}`,
    summary: 'Upsert a tag',
    ...routeConfig,
    description: 'Updates a tag if it exists, or creates it at the provided ID.',
  });

  upsertRoute.addVersion(
    {
      version: routeVersion,
      options: {
        oasOperationObject: async () =>
          (await import('../oas_examples')).upsertTagOASOperationObject,
      },
      validate: {
        request: {
          params: tagIdParamSchema,
          body: tagRequestAttributesSchema,
        },
        response: {
          200: {
            body: () => tagResponseItemSchema,
            description: 'updated',
          },
          201: {
            body: () => tagResponseItemSchema,
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
        const { id } = req.params;
        try {
          const body = await upsert(ctx, id, req.body);
          return body.meta.updated_at === body.meta.created_at
            ? res.created({ body })
            : res.ok({ body });
        } catch (e) {
          return handleRouteError(e as Error, res);
        }
      })
  );
};
