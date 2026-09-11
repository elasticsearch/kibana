/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { IKibanaResponse, Logger } from '@kbn/core/server';
import { buildRouteValidationWithZod } from '@kbn/zod-helpers/v4';
import type { SiemMigrationResourceBase } from '../../../../../../common/siem_migrations/model/common.gen';
import {
  GetRuleMigrationResourcesMissingRequestParams,
  type GetRuleMigrationResourcesMissingResponse,
} from '../../../../../../common/siem_migrations/model/api/rules/rule_migration.gen';
import { SIEM_RULE_MIGRATION_RESOURCES_MISSING_PATH } from '../../../../../../common/siem_migrations/constants';
import type { SecuritySolutionPluginRouter } from '../../../../../types';
import { authz } from '../util/authz';
import { withLicense } from '../../../common/api/util/with_license';
import { withExistingMigration } from '../../../common/api/util/with_existing_migration_id';

export const registerSiemRuleMigrationsResourceGetMissingRoute = (
  router: SecuritySolutionPluginRouter,
  logger: Logger
) => {
  router.versioned
    .get({
      path: SIEM_RULE_MIGRATION_RESOURCES_MISSING_PATH,
      access: 'internal',
      security: { authz },
    })
    .addVersion(
      {
        version: '1',
        validate: {
          request: {
            params: buildRouteValidationWithZod(GetRuleMigrationResourcesMissingRequestParams),
          },
        },
      },
      withLicense(
        withExistingMigration(
          async (
            context,
            req,
            res
          ): Promise<IKibanaResponse<GetRuleMigrationResourcesMissingResponse>> => {
            const migrationId = req.params.migration_id;
            try {
              const ctx = await context.resolve(['securitySolution']);
              const ruleMigrationsClient = ctx.securitySolution.siemMigrations.getRulesClient();

              const options = { filters: { hasContent: false } };
              const batches = ruleMigrationsClient.data.resources.searchBatches(
                migrationId,
                options
              );

              const missingResources: SiemMigrationResourceBase[] = [];
              let results = await batches.next();
              while (results.length) {
                missingResources.push(...results.map(({ type, name }) => ({ type, name })));
                results = await batches.next();
              }

              return res.ok({ body: missingResources });
            } catch (err) {
              logger.error(err);
              return res.badRequest({ body: err.message });
            }
          }
        )
      )
    );
};
