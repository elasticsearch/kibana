/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { IKibanaResponse, Logger } from '@kbn/core/server';
import { buildRouteValidationWithZod } from '@kbn/zod-helpers/v4';
import { groupBy } from 'lodash';
import { isResourceSupportedVendor } from '../../../../../../common/siem_migrations/rules/resources/types';
import { SIEM_RULE_MIGRATION_RESOURCES_PATH } from '../../../../../../common/siem_migrations/constants';
import {
  UpsertRuleMigrationResourcesRequestBody,
  UpsertRuleMigrationResourcesRequestParams,
  type UpsertRuleMigrationResourcesResponse,
} from '../../../../../../common/siem_migrations/model/api/rules/rule_migration.gen';
import { RuleResourceIdentifier } from '../../../../../../common/siem_migrations/rules/resources';
import type { SecuritySolutionPluginRouter } from '../../../../../types';
import { SiemMigrationAuditLogger } from '../../../common/api/util/audit';
import { authz } from '../util/authz';
import { processLookups } from '../util/lookups';
import { withLicense } from '../../../common/api/util/with_license';
import { withExistingMigration } from '../../../common/api/util/with_existing_migration_id';
import type { CreateSiemMigrationResourceInput } from '../../../common/data/siem_migrations_data_resources_client';
import { getVendorProcessor } from '../../vendors/get_vendor_processor';

export const registerSiemRuleMigrationsResourceUpsertRoute = (
  router: SecuritySolutionPluginRouter,
  logger: Logger
) => {
  router.versioned
    .post({
      path: SIEM_RULE_MIGRATION_RESOURCES_PATH,
      access: 'internal',
      security: { authz },
      options: { body: { maxBytes: 26214400 } }, // rise payload limit to 25MB
    })
    .addVersion(
      {
        version: '1',
        validate: {
          request: {
            params: buildRouteValidationWithZod(UpsertRuleMigrationResourcesRequestParams),
            body: buildRouteValidationWithZod(UpsertRuleMigrationResourcesRequestBody),
          },
        },
      },
      withLicense(
        withExistingMigration(
          async (
            context,
            req,
            res
          ): Promise<IKibanaResponse<UpsertRuleMigrationResourcesResponse>> => {
            const resources = req.body;
            const migrationId = req.params.migration_id;
            const siemMigrationAuditLogger = new SiemMigrationAuditLogger(
              context.securitySolution,
              'rules'
            );
            try {
              const ctx = await context.resolve(['securitySolution']);
              const ruleMigrationsClient = ctx.securitySolution.siemMigrations.getRulesClient();
              const { experimentalFeatures } = ctx.securitySolution.getConfig();

              await siemMigrationAuditLogger.logUploadResources({ migrationId });

              // Check if the migration exists
              const { data } = await ruleMigrationsClient.data.items.get(migrationId, { size: 1 });
              const [rule] = data;
              if (!rule) {
                return res.notFound({ body: { message: 'Migration not found' } });
              }

              const resourcesByType = groupBy(resources, 'type');
              const lookups = resourcesByType.lookup ?? [];
              const macros = resourcesByType.macro ?? [];
              const watchlists = resourcesByType.watchlist ?? [];

              if (watchlists.length > 0 && rule.original_rule.vendor !== 'microsoft-sentinel') {
                return res.badRequest({
                  body: {
                    message:
                      'Sentinel watchlist resources can only be uploaded to Sentinel migrations',
                  },
                });
              }

              let lookupsToProcess = lookups;
              if (watchlists.length > 0) {
                try {
                  const VendorProcessor = getVendorProcessor('microsoft-sentinel');
                  const processedWatchlists = new VendorProcessor({
                    migrationId,
                    dataClient: ruleMigrationsClient.data.items,
                    logger,
                  }).getProcessor('resources')(watchlists);
                  lookupsToProcess = [...lookups, ...processedWatchlists];
                } catch (error) {
                  return res.badRequest({
                    body: {
                      message: `Failed to process Sentinel watchlist resources: ${error.message}`,
                    },
                  });
                }
              }

              const processedLookups = await processLookups(
                lookupsToProcess,
                ruleMigrationsClient.data.lookups
              );
              const resourcesUpsert = [...macros, ...processedLookups].map((resource) => ({
                ...resource,
                migration_id: migrationId,
              }));

              // Upsert the resources
              await ruleMigrationsClient.data.resources.upsert(resourcesUpsert);

              if (!isResourceSupportedVendor(rule.original_rule.vendor)) {
                logger.debug(
                  `Identifying resources for rule migration [id=${migrationId}] and vendor [${rule.original_rule.vendor}]  is not supported. Skipping resource identification.`
                );
                return res.ok({ body: { acknowledged: true } });
              }

              if (rule.original_rule.vendor === 'splunk') {
                const resourceIdentifier = new RuleResourceIdentifier(rule.original_rule.vendor, {
                  experimentalFeatures,
                });
                const identifiedMissingResources = await resourceIdentifier.fromResources(
                  resources
                );
                const resourcesToCreate =
                  identifiedMissingResources.map<CreateSiemMigrationResourceInput>((resource) => ({
                    ...resource,
                    migration_id: migrationId,
                  }));
                await ruleMigrationsClient.data.resources.create(resourcesToCreate);
              }

              return res.ok({ body: { acknowledged: true } });
              // Create identified resource documents to keep track of them (without content)
            } catch (error) {
              logger.error(error);
              await siemMigrationAuditLogger.logUploadResources({ migrationId, error });
              return res.customError({ statusCode: 500, body: error.message });
            }
          }
        )
      )
    );
};
