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
import { tagsSearchRequestQuerySchema, tagsSearchResponseBodySchema } from '../schemas';
import { search } from './search';

export const registerSearchRoute = (router: TagsPluginRouter, usageCounter?: UsageCounter) => {
  const { basePath, routeConfig, routeVersion } = getRouteConfig();

  const searchRoute = router.versioned.get({
    path: `${basePath}`,
    summary: 'Search tags',
    ...routeConfig,
    description: 'Returns a paginated list of tags matching the optional `query` text.',
  });

  searchRoute.addVersion(
    {
      version: routeVersion,
      options: {
        oasOperationObject: async () =>
          (await import('../oas_examples')).searchTagsOASOperationObject,
      },
      validate: {
        request: {
          query: tagsSearchRequestQuerySchema,
        },
        response: {
          200: {
            body: () => tagsSearchResponseBodySchema,
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
        try {
          return res.ok({
            body: await search(ctx, req.query),
          });
        } catch (e) {
          return handleRouteError(e as Error, res);
        }
      })
  );
};
