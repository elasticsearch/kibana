/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { IKibanaResponse, Logger } from '@kbn/core/server';

import { buildSiemResponse } from '@kbn/lists-plugin/server/routes';
import { transformError } from '@kbn/securitysolution-es-utils';
import { buildRouteValidationWithZod } from '@kbn/zod-helpers/v4';
import {
  DeleteMonitoringEngineRequestQuery,
  type DeleteMonitoringEngineResponse,
} from '../../../../../common/api/entity_analytics';
import {
  API_VERSIONS,
  APP_ID,
  MONITORING_ENGINE_DELETE_URL,
} from '../../../../../common/constants';
import type { EntityAnalyticsRoutesDeps } from '../../types';
import { createEngineCrudService } from '../engine/crud_service';
import { withMinimumLicense } from '../../utils/with_minimum_license';

export const deletePrivilegeMonitoringEngineRoute = (
  router: EntityAnalyticsRoutesDeps['router'],
  logger: Logger
) => {
  router.versioned
    .delete({
      access: 'public',
      path: MONITORING_ENGINE_DELETE_URL,
      security: {
        authz: {
          requiredPrivileges: ['securitySolution', `${APP_ID}-entity-analytics`],
        },
      },
      options: {
        availability: {
          since: '9.1.0',
          stability: 'stable',
        },
      },
    })
    .addVersion(
      {
        version: API_VERSIONS.public.v1,
        validate: {
          request: {
            query: buildRouteValidationWithZod(DeleteMonitoringEngineRequestQuery),
          },
        },
      },
      withMinimumLicense(
        async (
          context,
          request,
          response
        ): Promise<IKibanaResponse<DeleteMonitoringEngineResponse>> => {
          const siemResponse = buildSiemResponse(response);
          const secSol = await context.securitySolution;

          try {
            const dataClient = secSol.getPrivilegeMonitoringDataClient();
            const soClient = dataClient.getScopedSoClient(request);
            const service = createEngineCrudService(dataClient, soClient);
            const body = await service.delete(request.query.data);
            return response.ok({ body });
          } catch (e) {
            const error = transformError(e);
            logger.error(`Error deleting privilege monitoring engine: ${error.message}`);
            return siemResponse.error({
              statusCode: error.statusCode,
              body: error.message,
            });
          }
        },
        'platinum'
      )
    );
};
