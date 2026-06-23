/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { IKibanaResponse, Logger } from '@kbn/core/server';
import { buildRouteValidationWithZod } from '@kbn/zod-helpers/v4';
import { SIEM_RULE_MIGRATION_SENTINEL_RULES_PATH } from '../../../../../../../common/siem_migrations/constants';
import {
  CreateSentinelRuleMigrationRulesRequestBody,
  CreateSentinelRuleMigrationRulesRequestParams,
} from '../../../../../../../common/siem_migrations/model/api/rules/rule_migration.gen';
import { SentinelRulesParser } from '../../../../../../../common/siem_migrations/parsers/sentinel/rules_json';
import { RuleResourceIdentifier } from '../../../../../../../common/siem_migrations/rules/resources';
import type { SecuritySolutionPluginRouter } from '../../../../../../types';
import { SiemMigrationAuditLogger } from '../../../../common/api/util/audit';
import { authz } from '../../util/authz';
import { withExistingMigration } from '../../../../common/api/util/with_existing_migration_id';
import { withLicense } from '../../../../common/api/util/with_license';
import { getVendorProcessor } from '../../../vendors/get_vendor_processor';

export const registerSiemRuleMigrationsCreateSentinelRulesRoute = (
  router: SecuritySolutionPluginRouter,
  logger: Logger
) => {
  router.versioned
    .post({
      path: SIEM_RULE_MIGRATION_SENTINEL_RULES_PATH,
      access: 'internal',
      security: { authz },
      options: { body: { maxBytes: 25 * 1024 * 1024 } }, // raise payload limit to 25MB
    })
    .addVersion(
      {
        version: '1',
        validate: {
          request: {
            body: buildRouteValidationWithZod(CreateSentinelRuleMigrationRulesRequestBody),
            params: buildRouteValidationWithZod(CreateSentinelRuleMigrationRulesRequestParams),
          },
        },
      },
      withLicense(
        withExistingMigration(async (context, req, res): Promise<IKibanaResponse> => {
          const { migration_id: migrationId } = req.params;
          const { resources } = req.body;
          const siemMigrationAuditLogger = new SiemMigrationAuditLogger(
            context.securitySolution,
            'rules'
          );

          try {
            const ctx = await context.resolve(['securitySolution']);
            const ruleMigrationsClient = ctx.securitySolution.siemMigrations.getRulesClient();
            const { experimentalFeatures } = ctx.securitySolution.getConfig();

            // Process validated Sentinel ARM resources
            const parser = new SentinelRulesParser(resources);
            const sentinelRules = parser.getRules();

            if (!sentinelRules || sentinelRules.length === 0) {
              return res.badRequest({
                body: { message: 'No Scheduled or NRT rules found in the provided JSON export' },
              });
            }

            const rulesCount = sentinelRules.length;

            const VendorProcessor = getVendorProcessor('microsoft-sentinel');
            const rulesProcessor = new VendorProcessor({
              migrationId,
              dataClient: ruleMigrationsClient.data.items,
              logger,
            }).getProcessor('rules');

            const rulesToBeCreated = rulesProcessor(sentinelRules);

            await siemMigrationAuditLogger.logAddRules({
              migrationId,
              count: rulesCount,
            });

            await ruleMigrationsClient.data.items.create(rulesToBeCreated);

            // Identify watchlist references from KQL queries and create resource placeholder records
            const resourceIdentifier = new RuleResourceIdentifier('microsoft-sentinel', {
              experimentalFeatures,
            });
            const extractedResources = await resourceIdentifier.fromOriginals(
              rulesToBeCreated.map((r) => r.original_rule)
            );

            if (extractedResources.length > 0) {
              const resourcesWithMigrationId = extractedResources.map((resource) => ({
                ...resource,
                migration_id: migrationId,
              }));
              await ruleMigrationsClient.data.resources.create(resourcesWithMigrationId);
            }

            return res.ok({
              body: {
                message: `Successfully imported ${rulesCount} Microsoft Sentinel rule${
                  rulesCount !== 1 ? 's' : ''
                }`,
                count: rulesCount,
              },
            });
          } catch (error) {
            logger.error(`Error processing Sentinel JSON: ${error.message}`);
            await siemMigrationAuditLogger.logAddRules({
              migrationId,
              count: 0,
              error,
            });
            return res.badRequest({
              body: { message: `Failed to parse Sentinel JSON: ${error.message}` },
            });
          }
        })
      )
    );
};
