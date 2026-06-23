/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { buildSiemResponse } from '@kbn/lists-plugin/server/routes/utils';
import { transformError } from '@kbn/securitysolution-es-utils';
import { kibanaPackageJson } from '@kbn/repo-info';
import type { RunEntityAnalyticsMigrationsResponse } from '../../../../../common/api/entity_analytics/migrations/run_migrations_route.gen';
import {
  API_VERSIONS,
  APP_ID,
  ENTITY_ANALYTICS_INTERNAL_RUN_MIGRATIONS_ROUTE,
} from '../../../../../common/constants';
import type { EntityAnalyticsRoutesDeps } from '../../types';
import { scheduleEntityAnalyticsMigration } from '..';

export const entityAnalyticsRunMigrationsRoute = (
  router: EntityAnalyticsRoutesDeps['router'],
  logger: EntityAnalyticsRoutesDeps['logger'],
  getStartServices: EntityAnalyticsRoutesDeps['getStartServices'],
  config: EntityAnalyticsRoutesDeps['config'],
  hasEncryptionKey: EntityAnalyticsRoutesDeps['hasEncryptionKey']
) => {
  router.versioned
    .post({
      access: 'internal',
      path: ENTITY_ANALYTICS_INTERNAL_RUN_MIGRATIONS_ROUTE,
      security: {
        authz: {
          requiredPrivileges: ['securitySolution', `${APP_ID}-entity-analytics`],
        },
      },
    })
    .addVersion(
      { version: API_VERSIONS.internal.v1, validate: {} },
      async (context, request, response) => {
        const securitySolution = await context.securitySolution;
        const siemResponse = buildSiemResponse(response);

        try {
          await scheduleEntityAnalyticsMigration({
            /*
             * We cannot provide task manager here because the migrations require
             * the setup contract and we can only access the start contract.
             *
             * The setup contract is used to register kibana tasks.
             *
             * This means the ECS migration will not be run by calling this endpoint.
             *
             * We could modify scheduleEntityAnalyticsMigration to optionally take
             * the start contract and have scheduleEntityAnalyticsMigration call scheduleNow
             * if we wanted to test this migration in the future.
             */
            taskManager: undefined,
            logger,
            getStartServices,
            auditLogger: securitySolution.getAuditLogger(),
            kibanaVersion: kibanaPackageJson.version,
            experimentalFeatures: config.experimentalFeatures,
            hasEncryptionKey,
          });
          const body: RunEntityAnalyticsMigrationsResponse = { success: true };
          return response.ok({ body });
        } catch (e) {
          const error = transformError(e);

          return siemResponse.error({
            statusCode: error.statusCode,
            body: { message: error.message, full_error: JSON.stringify(e) },
            bypassErrorFormat: true,
          });
        }
      }
    );
};
