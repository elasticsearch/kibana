/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { IKibanaResponse, Logger } from '@kbn/core/server';
import { buildRouteValidationWithZod } from '@kbn/zod-helpers/v4';
import type { GetRuleMigrationPrebuiltRulesResponse } from '../../../../../common/siem_migrations/model/api/rules/rule_migration.gen';
import { GetRuleMigrationPrebuiltRulesRequestParams } from '../../../../../common/siem_migrations/model/api/rules/rule_migration.gen';
import { SIEM_RULE_MIGRATIONS_PREBUILT_RULES_PATH } from '../../../../../common/siem_migrations/constants';
import type { SecuritySolutionPluginRouter } from '../../../../types';
import { authz } from './util/authz';
import { withLicense } from '../../common/api/util/with_license';
import { withExistingMigration } from '../../common/api/util/with_existing_migration_id';
import { getPrebuiltRulesForMigration } from './util/prebuilt_rules';

export const registerSiemRuleMigrationsPrebuiltRulesRoute = (
  router: SecuritySolutionPluginRouter,
  logger: Logger
) => {
  router.versioned
    .get({
      path: SIEM_RULE_MIGRATIONS_PREBUILT_RULES_PATH,
      access: 'internal',
      security: { authz },
    })
    .addVersion(
      {
        version: '1',
        validate: {
          request: {
            params: buildRouteValidationWithZod(GetRuleMigrationPrebuiltRulesRequestParams),
          },
        },
      },
      withLicense(
        withExistingMigration(
          async (
            context,
            req,
            res
          ): Promise<IKibanaResponse<GetRuleMigrationPrebuiltRulesResponse>> => {
            const { migration_id: migrationId } = req.params;
            try {
              const ctx = await context.resolve(['core', 'alerting', 'securitySolution']);
              const ruleMigrationsClient = ctx.securitySolution.siemMigrations.getRulesClient();
              const savedObjectsClient = ctx.core.savedObjects.client;
              const rulesClient = await ctx.alerting.getRulesClient();

              const prebuiltRules = await getPrebuiltRulesForMigration(
                migrationId,
                ruleMigrationsClient,
                rulesClient,
                savedObjectsClient
              );

              return res.ok({ body: prebuiltRules });
            } catch (err) {
              logger.error(err);
              return res.badRequest({ body: err.message });
            }
          }
        )
      )
    );
};
