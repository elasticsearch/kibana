/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { IKibanaResponse, Logger } from '@kbn/core/server';
import { buildRouteValidationWithZod } from '@kbn/zod-helpers/v4';
import { SIEM_RULE_MIGRATION_RULES_ENHANCE_PATH } from '../../../../../../common/siem_migrations/constants';
import type { RuleMigrationEnhanceRuleResponse } from '../../../../../../common/siem_migrations/model/api/rules/rule_migration.gen';
import {
  RuleMigrationEnhanceRuleRequestParams,
  RuleMigrationEnhanceRuleRequestBody,
} from '../../../../../../common/siem_migrations/model/api/rules/rule_migration.gen';
import type { SecuritySolutionPluginRouter } from '../../../../../types';
import { authz } from '../util/authz';
import { SiemMigrationAuditLogger } from '../../../common/api/util/audit';
import { withLicense } from '../../../common/api/util/with_license';
import { withExistingMigration } from '../../../common/api/util/with_existing_migration_id';
import { getVendorProcessor } from '../../vendors/get_vendor_processor';

export const registerSiemRuleMigrationsEnhanceRoute = (
  router: SecuritySolutionPluginRouter,
  logger: Logger
) => {
  router.versioned
    .post({
      path: SIEM_RULE_MIGRATION_RULES_ENHANCE_PATH,
      access: 'internal',
      security: { authz },
    })
    .addVersion(
      {
        version: '1',
        validate: {
          request: {
            params: buildRouteValidationWithZod(RuleMigrationEnhanceRuleRequestParams),
            body: buildRouteValidationWithZod(RuleMigrationEnhanceRuleRequestBody),
          },
        },
      },
      withLicense(
        withExistingMigration(
          async (context, req, res): Promise<IKibanaResponse<RuleMigrationEnhanceRuleResponse>> => {
            const { migration_id: migrationId } = req.params;
            const {
              vendor,
              type: enhancementType,
              data,
            } = req.body as RuleMigrationEnhanceRuleRequestBody;

            const siemMigrationAuditLogger = new SiemMigrationAuditLogger(
              context.securitySolution,
              'rules'
            );

            try {
              const ctx = await context.resolve(['securitySolution']);
              const ruleMigrationsClient = ctx.securitySolution.siemMigrations.getRulesClient();
              const dataClient = ruleMigrationsClient.data.items;

              const VendorProcessor = getVendorProcessor(vendor);
              const processor = new VendorProcessor({
                migrationId,
                dataClient,
                logger,
              }).getProcessor(enhancementType);

              await siemMigrationAuditLogger.logEnhanceRules({
                migrationId,
                vendor,
                enhancementType,
              });

              // Process the enhancement data
              const rulesToBeUpdate = await processor(data);
              if (rulesToBeUpdate.length === 0) {
                return res.badRequest({
                  body: { message: 'No rules to enhance' },
                });
              }

              await dataClient.update(migrationId, rulesToBeUpdate);

              return res.ok({
                body: {
                  updated: true,
                },
              });
            } catch (error) {
              const errorMessage = error instanceof Error ? error.message : String(error);
              logger.error(`Error enhancing rules for migration ${migrationId}: ${errorMessage}`);
              await siemMigrationAuditLogger.logEnhanceRules({
                migrationId,
                vendor,
                enhancementType,
                error,
              });
              return res.customError({
                statusCode: 500,
                body: { message: `Failed to enhance rules: ${errorMessage}` },
              });
            }
          }
        )
      )
    );
};
