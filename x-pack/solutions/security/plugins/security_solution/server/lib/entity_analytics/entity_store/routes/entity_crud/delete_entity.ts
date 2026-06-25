/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { buildRouteValidationWithZod } from '@kbn/zod-helpers/v4';
import type { IKibanaResponse, Logger } from '@kbn/core/server';
import type { DeleteSingleEntityResponse } from '../../../../../../common/api/entity_analytics/entity_store/entities/delete_entity.gen';
import {
  DeleteSingleEntityRequestParams,
  DeleteSingleEntityRequestBody,
} from '../../../../../../common/api/entity_analytics/entity_store/entities/delete_entity.gen';
import type { EntityAnalyticsRoutesDeps } from '../../../types';
import { API_VERSIONS, APP_ID } from '../../../../../../common/constants';
import {
  BadCRUDRequestError,
  EngineNotRunningError,
  DocumentVersionConflictError,
  EntityNotFoundError,
} from '../../errors';
import { CapabilityNotEnabledError } from '../../errors/capability_not_enabled_error';
import type { ITelemetryEventsSender } from '../../../../telemetry/sender';
import { ENTITY_STORE_API_CALL_EVENT } from '../../../../telemetry/event_based/events';

export const deleteEntity = (
  router: EntityAnalyticsRoutesDeps['router'],
  telemetry: ITelemetryEventsSender,
  logger: Logger
) => {
  router.versioned
    .delete({
      access: 'public',
      path: '/api/entity_store/entities/{entityType}',
      options: {
        availability: {
          since: '9.3.0',
          stability: 'tech_preview',
        },
      },
      security: {
        authz: {
          requiredPrivileges: ['securitySolution', `${APP_ID}-entity-analytics`],
        },
      },
    })
    .addVersion(
      {
        version: API_VERSIONS.public.v1,
        validate: {
          request: {
            params: buildRouteValidationWithZod(DeleteSingleEntityRequestParams),
            body: buildRouteValidationWithZod(DeleteSingleEntityRequestBody),
          },
        },
      },
      async (context, request, response): Promise<IKibanaResponse<DeleteSingleEntityResponse>> => {
        const secSol = await context.securitySolution;

        try {
          await secSol
            .getEntityStoreCrudClient()
            .deleteEntity(request.params.entityType, request.body);
          telemetry.reportEBT(ENTITY_STORE_API_CALL_EVENT, {
            endpoint: request.route.path,
          });
          return response.ok({
            body: {
              deleted: true,
            },
          });
        } catch (error) {
          telemetry.reportEBT(ENTITY_STORE_API_CALL_EVENT, {
            endpoint: request.route.path,
            error: (error as Error).message,
          });
          if (
            error instanceof EngineNotRunningError ||
            error instanceof CapabilityNotEnabledError
          ) {
            // Service Unavailable 503
            return response.customError({ statusCode: 503, body: error as EngineNotRunningError });
          }

          if (error instanceof EntityNotFoundError) {
            return response.customError({
              statusCode: 404,
              body: error as EntityNotFoundError,
            });
          }

          if (error instanceof BadCRUDRequestError) {
            return response.badRequest({ body: error as BadCRUDRequestError });
          }

          if (error instanceof DocumentVersionConflictError) {
            return response.customError({
              statusCode: 409,
              body: error as DocumentVersionConflictError,
            });
          }

          if (error instanceof Error) {
            return response.badRequest({ body: error as Error });
          }

          logger.error(error);
          throw error;
        }
      }
    );
};
