/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { IKibanaResponse, Logger } from '@kbn/core/server';
import { buildRouteValidationWithZod } from '@kbn/zod-helpers/v4';
import { SIEM_RULE_MIGRATION_RESOURCES_PATH } from '../../../../../../common/siem_migrations/constants';
import {
  GetRuleMigrationResourcesRequestParams,
  GetRuleMigrationResourcesRequestQuery,
  type GetRuleMigrationResourcesResponse,
} from '../../../../../../common/siem_migrations/model/api/rules/rule_migration.gen';
import type { SecuritySolutionPluginRouter } from '../../../../../types';
import { SiemMigrationAuditLogger } from '../../../common/api/util/audit';
import { authz } from '../util/authz';
import { withLicense } from '../../../common/api/util/with_license';
import { withExistingMigration } from '../../../common/api/util/with_existing_migration_id';

export const registerSiemRuleMigrationsResourceGetRoute = (
  router: SecuritySolutionPluginRouter,
  logger: Logger
) => {
  router.versioned
    .get({
      path: SIEM_RULE_MIGRATION_RESOURCES_PATH,
      access: 'internal',
      security: { authz },
    })
    .addVersion(
      {
        version: '1',
        validate: {
          request: {
            params: buildRouteValidationWithZod(GetRuleMigrationResourcesRequestParams),
            query: buildRouteValidationWithZod(GetRuleMigrationResourcesRequestQuery),
          },
        },
      },
      withLicense(
        withExistingMigration(
          async (
            context,
            req,
            res
          ): Promise<IKibanaResponse<GetRuleMigrationResourcesResponse>> => {
            const migrationId = req.params.migration_id;
            const { type, names, from, size } = req.query;
            const siemMigrationAuditLogger = new SiemMigrationAuditLogger(
              context.securitySolution,
              'rules'
            );
            try {
              const ctx = await context.resolve(['securitySolution']);
              const ruleMigrationsClient = ctx.securitySolution.siemMigrations.getRulesClient();

              const options = { filters: { type, names }, from, size };
              const resources = await ruleMigrationsClient.data.resources.get(migrationId, options);

              await siemMigrationAuditLogger.logGetResources({ migrationId });

              return res.ok({ body: resources });
            } catch (error) {
              logger.error(error);
              await siemMigrationAuditLogger.logGetResources({ migrationId, error });
              return res.badRequest({ body: error.message });
            }
          }
        )
      )
    );
};
