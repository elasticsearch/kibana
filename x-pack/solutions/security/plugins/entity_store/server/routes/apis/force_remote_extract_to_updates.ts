/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';
import type { IKibanaResponse } from '@kbn/core-http-server';
import { buildStrictRouteValidationWithZod } from './utils/build_strict_route_validation';
import { API_VERSIONS, ENTITY_STORE_ROUTES } from '../../../common';
import { DEFAULT_ENTITY_STORE_PERMISSIONS } from '../constants';
import type { EntityStorePluginRouter } from '../../types';
import { wrapMiddlewares } from '../middleware';
import { EntityType } from '../../../common/domain/definitions/entity_schema';
import { getEntityDefinition } from '../../../common/domain/definitions/registry';
import {
  LOG_EXTRACTION_CAP_BEHAVIOR_DEFAULT,
  LOG_EXTRACTION_DELAY_DEFAULT,
  LOG_EXTRACTION_FREQUENCY_DEFAULT,
  LOG_EXTRACTION_LOOKBACK_PERIOD_DEFAULT,
  LOG_EXTRACTION_MAX_LOGS_PER_PAGE_DEFAULT,
  LOG_EXTRACTION_MAX_LOGS_PER_WINDOW_DEFAULT,
  LOG_EXTRACTION_MAX_TIME_WINDOW_SIZE_DEFAULT,
} from '../../domain/saved_objects/global_state/constants';

const DEFAULT_DOCS_LIMIT = 10000;

const paramsSchema = z.object({
  entityType: EntityType,
});

const bodySchema = z.object({
  indexPatterns: z.array(z.string()).min(1),
  fromDateISO: z.string().datetime(),
  toDateISO: z.string().datetime(),
  docsLimit: z.number().int().min(1).optional(),
  maxLogsPerPage: z.number().int().min(1).optional(),
  maxLogsPerWindow: z.number().int().min(0).default(LOG_EXTRACTION_MAX_LOGS_PER_WINDOW_DEFAULT),
  maxLogsPerWindowCapBehavior: z
    .enum(['defer', 'drop'])
    .default(LOG_EXTRACTION_CAP_BEHAVIOR_DEFAULT),
});

export function registerForceRemoteExtractToUpdates(router: EntityStorePluginRouter) {
  router.versioned
    .post({
      path: ENTITY_STORE_ROUTES.internal.FORCE_REMOTE_EXTRACT_TO_UPDATES,
      access: 'internal',
      summary: 'Force remote log extraction',
      description:
        'Trigger an immediate remote extraction (CCS or CPS, depending on deployment) for the specified entity type, index patterns, and date range.',
      security: {
        authz: DEFAULT_ENTITY_STORE_PERMISSIONS,
      },
      enableQueryVersion: true,
    })
    .addVersion(
      {
        version: API_VERSIONS.internal.v2,
        validate: {
          request: {
            params: buildStrictRouteValidationWithZod(paramsSchema),
            body: buildStrictRouteValidationWithZod(bodySchema),
          },
        },
      },
      wrapMiddlewares(async (ctx, req, res): Promise<IKibanaResponse> => {
        const entityStoreCtx = await ctx.entityStore;
        const { logger: baseLogger, remoteLogsExtractionClient, namespace } = entityStoreCtx;
        const { entityType } = req.params;
        const {
          indexPatterns,
          fromDateISO,
          toDateISO,
          docsLimit,
          maxLogsPerPage,
          maxLogsPerWindow,
          maxLogsPerWindowCapBehavior,
        } = req.body;

        const logger = baseLogger.get('forceRemoteExtractToUpdates').get(entityType);
        logger.debug(
          `Force remote extract to updates API called for entity type: ${entityType}, index patterns: ${indexPatterns.join(
            ', '
          )}`
        );

        const entityDefinition = getEntityDefinition(entityType, namespace);
        const result = await remoteLogsExtractionClient.extractToUpdates({
          type: entityType,
          remoteIndexPatterns: indexPatterns,
          docsLimit: docsLimit ?? DEFAULT_DOCS_LIMIT,
          maxLogsPerPage: maxLogsPerPage ?? LOG_EXTRACTION_MAX_LOGS_PER_PAGE_DEFAULT,
          lookbackPeriod: LOG_EXTRACTION_LOOKBACK_PERIOD_DEFAULT,
          delay: LOG_EXTRACTION_DELAY_DEFAULT,
          frequency: LOG_EXTRACTION_FREQUENCY_DEFAULT,
          entityDefinition,
          windowOverride: { fromDateISO, toDateISO },
          maxTimeWindowSize: LOG_EXTRACTION_MAX_TIME_WINDOW_SIZE_DEFAULT,
          maxLogsPerWindow,
          maxLogsPerWindowCapBehavior,
        });

        if (result.error) {
          return res.customError({
            statusCode: 500,
            body: {
              message: result.error.message,
            },
          });
        }

        return res.ok({
          body: { count: result.count, pages: result.pages },
        });
      })
    );
}
