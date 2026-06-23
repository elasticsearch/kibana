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
import { tagIdParamSchema, tagResponseItemSchema } from '../schemas';
import { read } from './read';

export const registerReadRoute = (router: TagsPluginRouter, usageCounter?: UsageCounter) => {
  const { basePath, routeConfig, routeVersion } = getRouteConfig();

  const readRoute = router.versioned.get({
    path: `${basePath}/{id}`,
    summary: 'Get a tag',
    ...routeConfig,
    description: 'Returns a tag by ID.',
  });

  readRoute.addVersion(
    {
      version: routeVersion,
      options: {
        oasOperationObject: async () => (await import('../oas_examples')).readTagOASOperationObject,
      },
      validate: {
        request: {
          params: tagIdParamSchema,
        },
        response: {
          200: {
            body: () => tagResponseItemSchema,
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
      telemetryHandler(req, usageCounter, async () => {
        const { id } = req.params;
        try {
          const body = await read(ctx, id);
          return res.ok({
            body,
          });
        } catch (e) {
          return handleRouteError(e as Error, res, {
            notFoundMessage: `A tag with ID [${id}] was not found.`,
          });
        }
      })
  );
};
