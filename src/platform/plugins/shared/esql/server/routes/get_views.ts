/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { IRouter, PluginInitializerContext } from '@kbn/core/server';
import { VIEWS_ROUTE } from '@kbn/esql-types';
import { EsqlService } from '@kbn/esql-server-utils';
import { esqlRouteRequestCounter, getErrorStatusCode } from '../metrics';

export const registerGetViewsRoute = (router: IRouter, { logger }: PluginInitializerContext) => {
  router.get(
    {
      path: VIEWS_ROUTE,
      validate: {},
      security: {
        authz: {
          enabled: false,
          reason: 'This route delegates authorization to the scoped ES client',
        },
      },
    },
    async (requestHandlerContext, request, response) => {
      try {
        const core = await requestHandlerContext.core;
        const service = new EsqlService({ client: core.elasticsearch.client.asCurrentUser });
        const result = await service.getViews();

        esqlRouteRequestCounter.add(1, {
          route: 'views',
          outcome: 'success',
          'http.response.status_code': 200,
        });
        return response.ok({
          body: result,
        });
      } catch (error) {
        esqlRouteRequestCounter.add(1, {
          route: 'views',
          outcome: 'failure',
          'http.response.status_code': getErrorStatusCode(error),
        });
        const message = error instanceof Error ? error.message : String(error);
        logger.get().error(`Failed to fetch ES|QL views: ${message}`, {
          tags: ['esql', 'views'],
          error: { stack_trace: error instanceof Error ? error.stack : undefined },
        });
        return response.ok({
          body: { views: [] },
        });
      }
    }
  );
};
