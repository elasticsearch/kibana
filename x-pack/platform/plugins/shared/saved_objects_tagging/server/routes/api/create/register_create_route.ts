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
import { tagRequestAttributesSchema, tagResponseItemSchema } from '../schemas';
import { create } from './create';

export const registerCreateRoute = (router: TagsPluginRouter, usageCounter?: UsageCounter) => {
  const { basePath, routeConfig, routeVersion } = getRouteConfig();

  const createRoute = router.versioned.post({
    path: `${basePath}`,
    summary: 'Create a tag',
    ...routeConfig,
    description: 'Creates a new tag and returns it.',
  });

  createRoute.addVersion(
    {
      version: routeVersion,
      options: {
        oasOperationObject: async () =>
          (await import('../oas_examples')).createTagOASOperationObject,
      },
      validate: {
        request: {
          body: tagRequestAttributesSchema,
        },
        response: {
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
        try {
          const result = await create(ctx, req.body);
          if (result.outcome === 'conflict') {
            return res.conflict({ body: { message: result.message } });
          }
          return res.created({
            body: result.body,
          });
        } catch (e) {
          return handleRouteError(e as Error, res);
        }
      })
  );
};
