/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { buildRouteValidationWithZod, stringifyZodError } from '@kbn/zod-helpers/v4';
import { z } from '@kbn/zod/v4';
import type { IKibanaResponse, Logger } from '@kbn/core/server';
import type { UpsertEntityResponse } from '../../../../../../common/api/entity_analytics/entity_store/entities/upsert_entity.gen';
import {
  UpsertEntityRequestParams,
  UpsertEntityRequestQuery,
} from '../../../../../../common/api/entity_analytics/entity_store/entities/upsert_entity.gen';
import {
  HostEntity,
  UserEntity,
  ServiceEntity,
  GenericEntity,
} from '../../../../../../common/api/entity_analytics/entity_store/entities/common.gen';
import type { EntityAnalyticsRoutesDeps } from '../../../types';
import { API_VERSIONS, APP_ID } from '../../../../../../common/constants';
import {
  BadCRUDRequestError,
  EngineNotRunningError,
  DocumentVersionConflictError,
} from '../../errors';
import { CapabilityNotEnabledError } from '../../errors/capability_not_enabled_error';
import { ENTITY_STORE_API_CALL_EVENT } from '../../../../telemetry/event_based/events';
import type { ITelemetryEventsSender } from '../../../../telemetry/sender';

/** Permissive body schema so we validate in the handler with the schema that matches entityType (union order would otherwise reject valid host/user bodies). */
const UpsertBodyPermissive = z.record(z.string(), z.unknown());

const ENTITY_TYPE_SCHEMAS: Record<
  'host' | 'user' | 'service' | 'generic',
  z.ZodType<HostEntity | UserEntity | ServiceEntity | GenericEntity>
> = {
  host: HostEntity,
  user: UserEntity,
  service: ServiceEntity,
  generic: GenericEntity,
};

export const upsertEntity = (
  router: EntityAnalyticsRoutesDeps['router'],
  telemetry: ITelemetryEventsSender,
  logger: Logger
) => {
  router.versioned
    .put({
      access: 'public',
      path: '/api/entity_store/entities/{entityType}',
      options: {
        availability: {
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
            query: buildRouteValidationWithZod(UpsertEntityRequestQuery),
            params: buildRouteValidationWithZod(UpsertEntityRequestParams),
            body: buildRouteValidationWithZod(UpsertBodyPermissive),
          },
        },
      },
      async (context, request, response): Promise<IKibanaResponse<UpsertEntityResponse>> => {
        const { entityType } = request.params;
        const schema = ENTITY_TYPE_SCHEMAS[entityType];
        const parsed = schema.safeParse(request.body);
        if (!parsed.success) {
          return response.badRequest({
            body: { message: stringifyZodError(parsed.error) },
          });
        }

        const secSol = await context.securitySolution;

        try {
          await secSol
            .getEntityStoreCrudClient()
            .upsertEntity(request.params.entityType, parsed.data, request.query.force);

          telemetry.reportEBT(ENTITY_STORE_API_CALL_EVENT, {
            endpoint: request.route.path,
          });
          return response.ok();
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

          if (error instanceof BadCRUDRequestError) {
            return response.badRequest({ body: error as BadCRUDRequestError });
          }

          if (error instanceof DocumentVersionConflictError) {
            return response.customError({
              statusCode: 409,
              body: error as DocumentVersionConflictError,
            });
          }

          logger.error(error);
          throw error;
        }
      }
    );
};
