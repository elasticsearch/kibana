/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import path from 'node:path';
import { z } from '@kbn/zod/v4';
import type { IKibanaResponse } from '@kbn/core-http-server';
import { buildStrictRouteValidationWithZod } from './utils/build_strict_route_validation';
import { API_VERSIONS, ENTITY_STORE_ROUTES } from '../../../common';
import { DEFAULT_ENTITY_STORE_PERMISSIONS } from '../constants';
import type { EntityStorePluginRouter } from '../../types';
import { wrapMiddlewares } from '../middleware';
import { ALL_ENTITY_TYPES, EntityType } from '../../../common/domain/definitions/entity_schema';
import { ENGINE_STATUS } from '../../domain/constants';

const bodySchema = z.object({
  entityTypes: z
    .array(EntityType)
    .optional()
    .default(ALL_ENTITY_TYPES)
    .describe('Entity types to start. Defaults to all installed types.'),
});

export function registerStart(router: EntityStorePluginRouter) {
  router.versioned
    .put({
      path: ENTITY_STORE_ROUTES.public.START,
      access: 'public',
      summary: 'Start Entity Store engines',
      description:
        'Start previously stopped entity engines, resuming data processing for the specified entity types.',
      options: {
        tags: ['oas-tag:Security entity store'],
      },
      security: {
        authz: DEFAULT_ENTITY_STORE_PERMISSIONS,
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
          oasOperationObject: () => path.join(__dirname, 'examples/entity_store_start.yaml'),
        },
      },
      wrapMiddlewares(async (ctx, req, res): Promise<IKibanaResponse> => {
        const entityStoreCtx = await ctx.entityStore;
        const {
          logger,
          assetManagerClient: assetManager,
          entityMaintainersClient,
        } = entityStoreCtx;
        const { entityTypes } = req.body;
        logger.debug('Start API invoked');

        const { engines } = await assetManager.getStatus();
        const stoppedTypes = new Set(
          engines.filter((e) => e.status === ENGINE_STATUS.STOPPED).map((e) => e.type)
        );
        const toStart = entityTypes.filter((type) => stoppedTypes.has(type));

        const logsExtraction = await assetManager.getLogExtractionConfig();
        await Promise.all(toStart.map((type) => assetManager.start(req, type, logsExtraction)));

        if (toStart.length > 0) {
          await entityMaintainersClient.startAll(req);
        }

        return res.ok({
          body: {
            ok: true,
          },
        });
      })
    );
}
