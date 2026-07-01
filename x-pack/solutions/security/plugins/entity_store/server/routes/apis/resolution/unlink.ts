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
import { EntitiesNotFoundError, MixedEntityTypesError } from '../../../domain/errors';
import { ENTITY_STORE_RESOLUTION_UNLINK_EVENT } from '../../../telemetry/events';
import { reportResolutionError } from './utils/resolution_telemetry';

const bodySchema = z.object({
  entity_ids: z
    .array(z.string())
    .min(1)
    .max(1000)
    .describe('Entity identifiers to unlink from their resolution group. Minimum 1, maximum 1000.'),
});

type UnlinkRequestBody = z.infer<typeof bodySchema>;

export async function handleResolutionUnlink(
  ctx: EntityStoreRequestHandlerContext,
  req: KibanaRequest<unknown, unknown, UnlinkRequestBody>,
  res: KibanaResponseFactory
): Promise<IKibanaResponse> {
  const { logger, resolutionClient, analytics, namespace } = await ctx.entityStore;

  logger.debug('Resolution Unlink API called');

  try {
    const result = await resolutionClient.unlinkEntities(req.body.entity_ids, {
      awaitVisibility: true,
    });

    analytics.reportEvent(ENTITY_STORE_RESOLUTION_UNLINK_EVENT, {
      entityType: result.entity_type,
      entitiesUnlinked: result.unlinked.length,
      entitiesSkipped: result.skipped.length,
      namespace,
    });

    return res.ok({ body: result });
  } catch (error) {
    reportResolutionError(analytics, 'unlink', namespace, error);

    if (error instanceof EntitiesNotFoundError || error instanceof MixedEntityTypesError) {
      return res.badRequest({ body: error });
    }

    logger.error(error);
    throw error;
  }
}

export function registerResolutionUnlink(router: EntityStorePluginRouter) {
  router.versioned
    .post({
      path: ENTITY_STORE_ROUTES.public.RESOLUTION_UNLINK,
      access: 'public',
      summary: 'Unlink entities',
      description:
        'Remove one or more entities from their resolution group. Changes become ' +
        'visible on subsequent reads after the next index refresh (typically <1s). ' +
        'Requires an enterprise license.',
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
            body: buildStrictRouteValidationWithZod(bodySchema),
          },
        },
        options: {
          oasOperationObject: () => path.join(__dirname, '../examples/resolution_unlink.yaml'),
        },
      },
      wrapMiddlewares(handleResolutionUnlink, [enterpriseLicenseMiddleware])
    );
}
