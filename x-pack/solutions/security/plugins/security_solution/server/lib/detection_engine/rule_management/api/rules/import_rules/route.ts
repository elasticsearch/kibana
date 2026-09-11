/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema } from '@kbn/config-schema';
import type { IKibanaResponse, Logger } from '@kbn/core/server';
import { transformError } from '@kbn/securitysolution-es-utils';
import { partition } from 'lodash/fp';
import { extname } from 'path';
import { buildRouteValidationWithZod } from '@kbn/zod-helpers/v4';
import { RULES_API_ALL } from '@kbn/security-solution-features/constants';
import { validateRuleImportResponseActions } from '../../../../../../endpoint/services';
import {
  ImportRulesRequestQuery,
  ImportRulesResponse,
} from '../../../../../../../common/api/detection_engine/rule_management';
import { DETECTION_ENGINE_RULES_IMPORT_URL } from '../../../../../../../common/constants';
import type { ConfigType } from '../../../../../../config';
import type { HapiReadableStream, SecuritySolutionPluginRouter } from '../../../../../../types';
import { buildSiemResponse, createBulkErrorObject } from '../../../../routes/utils';
import { createPrebuiltRuleAssetsClient } from '../../../../prebuilt_rules/logic/rule_assets/prebuilt_rule_assets_client';
import { importRuleActionConnectors } from '../../../logic/import/action_connectors/import_rule_action_connectors';
import { validateRuleActions } from '../../../logic/import/action_connectors/validate_rule_actions';
import { importRules } from '../../../logic/import/import_rules';

import { createPromiseFromRuleImportStream } from '../../../logic/import/create_promise_from_rule_import_stream';
import { importRuleExceptions } from '../../../logic/import/import_rule_exceptions';
import { isRuleToImport } from '../../../logic/import/utils';
import {
  getTupleDuplicateErrorsAndUniqueRules,
  migrateLegacyActionsIds,
} from '../../../utils/utils';
import { RULE_MANAGEMENT_IMPORT_EXPORT_SOCKET_TIMEOUT_MS } from '../../constants';
import { SecurityRuleChangeTrackingAction } from '../../../../../../../common/detection_engine/rule_management/rule_change_tracking';
import { ensureLatestRulesPackageInstalled } from '../../../../prebuilt_rules/logic/integrations/ensure_latest_rules_package_installed';

export const importRulesRoute = (
  router: SecuritySolutionPluginRouter,
  config: ConfigType,
  logger: Logger
) => {
  router.versioned
    .post({
      access: 'public',
      path: DETECTION_ENGINE_RULES_IMPORT_URL,
      security: {
        authz: {
          requiredPrivileges: [RULES_API_ALL],
        },
      },
      options: {
        body: {
          maxBytes: config.maxRuleImportPayloadBytes,
          output: 'stream',
        },
        timeout: {
          idleSocket: RULE_MANAGEMENT_IMPORT_EXPORT_SOCKET_TIMEOUT_MS,
        },
      },
    })
    .addVersion(
      {
        version: '2023-10-31',
        validate: {
          request: {
            query: buildRouteValidationWithZod(ImportRulesRequestQuery),
            body: schema.any(), // validation on file object is accomplished later in the handler.
          },
        },
      },
      async (context, request, response): Promise<IKibanaResponse<ImportRulesResponse>> => {
        const siemResponse = buildSiemResponse(response);

        try {
          const ctx = await context.resolve([
            'core',
            'securitySolution',
            'actions',
            'lists',
            'licensing',
          ]);

          const detectionRulesClient = ctx.securitySolution.getDetectionRulesClient();
          const actionsClient = ctx.actions.getActionsClient();
          const actionSOClient = ctx.core.savedObjects.getClient({
            includedHiddenTypes: ['action'],
          });
          const actionsImporter = ctx.core.savedObjects.getImporter(actionSOClient);

          const savedObjectsClient = ctx.core.savedObjects.client;
          const exceptionsClient = ctx.lists?.getExceptionListClient();
          const endpointAuthz = await ctx.securitySolution.getEndpointAuthz();
          const endpointService = ctx.securitySolution.getEndpointService();
          const spaceId = ctx.securitySolution.getSpaceId();

          const { filename } = (request.body.file as HapiReadableStream).hapi;
          const fileExtension = extname(filename).toLowerCase();
          if (fileExtension !== '.ndjson') {
            return siemResponse.error({
              statusCode: 400,
              body: `Invalid file extension ${fileExtension}`,
            });
          }

          const objectLimit = config.maxRuleImportExportSize;

          // parse file to separate out exceptions from rules
          const [{ exceptions, rules, actionConnectors }] = await createPromiseFromRuleImportStream(
            { stream: request.body.file as HapiReadableStream, objectLimit }
          );

          // import exceptions, includes validation
          const {
            errors: exceptionsErrors,
            successCount: exceptionsSuccessCount,
            success: exceptionsSuccess,
          } = await importRuleExceptions({
            exceptions,
            exceptionsClient,
            overwrite: request.query.overwrite_exceptions,
            maxExceptionsImportSize: objectLimit,
          });
          // report on duplicate rules
          const [duplicateIdErrors, rulesToImportOrErrors] = getTupleDuplicateErrorsAndUniqueRules(
            rules,
            request.query.overwrite
          );

          // import actions-connectors
          const {
            successCount: actionConnectorSuccessCount,
            success: actionConnectorSuccess,
            warnings: actionConnectorWarnings,
            errors: actionConnectorErrors,
          } = await importRuleActionConnectors({
            actionConnectors,
            actionsImporter,
            overwrite: request.query.overwrite_action_connectors,
          });

          const migratedRulesToImportOrErrors = await migrateLegacyActionsIds(
            rulesToImportOrErrors,
            actionSOClient,
            actionsClient
          );

          // Ensure the prebuilt rules package is installed once per request so
          // the import path can look up prebuilt assets during rule_source calc.
          await ensureLatestRulesPackageInstalled(
            createPrebuiltRuleAssetsClient(savedObjectsClient),
            ctx.securitySolution,
            logger
          );

          const [parsedRules, parsedRuleErrors] = partition(
            isRuleToImport,
            migratedRulesToImportOrErrors
          );

          // After importing the actions and migrating action IDs on rules to import,
          // validate that all actions referenced by rules exist
          // Filter out rules that reference non-existent actions
          const { validatedActionRules, missingActionErrors } = await validateRuleActions({
            actionsClient,
            rules: parsedRules,
          });

          // Validate that Response Actions are valid
          const { valid: validatedResponseActionsRules, errors: responseActionsErrors } =
            await validateRuleImportResponseActions({
              endpointAuthz,
              endpointService,
              spaceId,
              rulesToImport: validatedActionRules,
              checkOsqueryResponseActionAuthz:
                ctx.securitySolution.getCheckOsqueryResponseActionAuthz(),
            });

          const { successes, errors: importErrors } = await importRules({
            rules: validatedResponseActionsRules,
            changeTracking: {
              action: SecurityRuleChangeTrackingAction.ruleImport,
              metadata: {
                bulkCount: validatedResponseActionsRules.length,
              },
            },
            overwriteRules: request.query.overwrite,
            allowMissingConnectorSecrets: !!actionConnectors.length,
            detectionRulesClient,
          });

          const parseErrors = parsedRuleErrors.map((error) =>
            createBulkErrorObject({
              statusCode: 400,
              message: error.message,
            })
          );
          const errors = [
            ...parseErrors,
            ...duplicateIdErrors,
            ...importErrors,
            ...missingActionErrors,
            ...responseActionsErrors,
          ];

          const importRulesResponse: ImportRulesResponse = {
            success: errors.length === 0,
            success_count: successes.length,
            rules_count: rules.length,
            errors,
            exceptions_errors: exceptionsErrors,
            exceptions_success: exceptionsSuccess,
            exceptions_success_count: exceptionsSuccessCount,
            action_connectors_success: actionConnectorSuccess,
            action_connectors_success_count: actionConnectorSuccessCount,
            action_connectors_errors: actionConnectorErrors,
            action_connectors_warnings: actionConnectorWarnings,
          };

          return response.ok({ body: ImportRulesResponse.parse(importRulesResponse) });
        } catch (err) {
          logger.error(`importRulesRoute: Caught error: ${err.message}`, err);
          const error = transformError(err);
          return siemResponse.error({
            body: error.message,
            statusCode: error.statusCode,
          });
        }
      }
    );
};
