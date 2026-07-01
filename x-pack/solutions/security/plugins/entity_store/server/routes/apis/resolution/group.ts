/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import path from 'node:path';
import { z } from '@kbn/zod/v4';
import type { IKibanaResponse, KibanaRequest, KibanaResponseFactory } from '@kbn/core-http-server';
import { buildStrictRouteValidationWithZod } from '../utils/build_strict_route_validation';
import { API_VERSIONS, ENTITY_STORE_ROUTES } from '../../../../common';
import { RESOLUTION_ENTITY_STORE_PERMISSIONS } from '../../constants';
import type { EntityStorePluginRouter, EntityStoreRequestHandlerContext } from '../../../types';
import { wrapMiddlewares } from '../../middleware';
import { enterpriseLicenseMiddleware } from '../../middleware/enterprise_license';
import { EntitiesNotFoundError, ResolutionSearchTruncatedError } from '../../../domain/errors';
import { ENTITY_STORE_RESOLUTION_GROUP_VIEW_EVENT } from '../../../telemetry/events';
import { reportResolutionError } from './utils/resolution_telemetry';

const querySchema = z.object({
  entity_id: z.string().describe('The entity identifier to look up the resolution group for.'),
});

type GroupRequestQuery = z.infer<typeof querySchema>;

export async function handleResolutionGroup(
  ctx: EntityStoreRequestHandlerContext,
  req: KibanaRequest<unknown, GroupRequestQuery, unknown>,
  res: KibanaResponseFactory
): Promise<IKibanaResponse> {
  const { logger, resolutionClient, analytics, namespace } = await ctx.entityStore;

  logger.debug('Resolution Group API called');

  try {
    const result = await resolutionClient.getResolutionGroup(req.query.entity_id);

    analytics.reportEvent(ENTITY_STORE_RESOLUTION_GROUP_VIEW_EVENT, {
      entityType: result.entity_type,
      groupSize: result.group_size,
      namespace,
    });

    return res.ok({ body: result });
  } catch (error) {
    reportResolutionError(analytics, 'group', namespace, error);

    if (error instanceof EntitiesNotFoundError) {
      return res.notFound({ body: error });
    }
    if (error instanceof ResolutionSearchTruncatedError) {
      return res.badRequest({ body: error });
    }

    logger.error(error);
    throw error;
  }
}

export function registerResolutionGroup(router: EntityStorePluginRouter) {
  router.versioned
    .get({
      path: ENTITY_STORE_ROUTES.public.RESOLUTION_GROUP,
      access: 'public',
      summary: 'Get resolution group',
      description:
        'Get the resolution group for a given entity, returning all linked entities. Requires an enterprise license.',
      options: {
        tags: ['oas-tag:Security entity store'],
      },
      security: {
        authz: RESOLUTION_ENTITY_STORE_PERMISSIONS,
      },
      enableQueryVersion: true,
    })
    .addVersion(
      {
        version: API_VERSIONS.public.v1,
        validate: {
          request: {
            query: buildStrictRouteValidationWithZod(querySchema),
          },
        },
        options: {
          oasOperationObject: () => path.join(__dirname, '../examples/resolution_group.yaml'),
        },
      },
      wrapMiddlewares(handleResolutionGroup, [enterpriseLicenseMiddleware])
    );
}
