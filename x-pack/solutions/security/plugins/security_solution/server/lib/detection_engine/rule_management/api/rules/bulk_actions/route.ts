/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { IKibanaResponse } from '@kbn/core/server';
import { AbortError } from '@kbn/kibana-utils-plugin/common';
import { transformError } from '@kbn/securitysolution-es-utils';
import { buildRouteValidationWithZod } from '@kbn/zod-helpers/v4';
import type {
  BulkActionSkipResult,
  GapFillStatus,
  GapReasonType,
} from '@kbn/alerting-plugin/common';
import { RULES_API_ALL, RULES_API_READ } from '@kbn/security-solution-features/constants';
import { SecurityRuleChangeTrackingAction } from '../../../../../../../common/detection_engine/rule_management/rule_change_tracking';
import { validateRuleResponseActions } from '../../../../../../endpoint/services';
import type { PerformRulesBulkActionResponse } from '../../../../../../../common/api/detection_engine/rule_management';
import {
  BulkActionTypeEnum,
  PerformRulesBulkActionRequestBody,
  PerformRulesBulkActionRequestQuery,
} from '../../../../../../../common/api/detection_engine/rule_management';
import {
  DETECTION_ENGINE_RULES_BULK_ACTION,
  MAX_RULES_TO_UPDATE_IN_PARALLEL,
  EXCLUDED_GAP_REASONS_KEY,
} from '../../../../../../../common/constants';
import type { SetupPlugins } from '../../../../../../plugin';
import type { SecuritySolutionPluginRouter } from '../../../../../../types';
import { initPromisePool } from '../../../../../../utils/promise_pool';
import { routeLimitedConcurrencyTag } from '../../../../../../utils/route_limited_concurrency_tag';
import { buildMlAuthz } from '../../../../../machine_learning/authz';
import { buildSiemResponse } from '../../../../routes/utils';
import type { RuleAlertType } from '../../../../rule_schema';
import { duplicateExceptions } from '../../../logic/actions/duplicate_exceptions';
import { duplicateRule } from '../../../logic/actions/duplicate_rule';
import { bulkEditRules } from '../../../logic/bulk_actions/bulk_edit_rules';
import {
  dryRunValidateBulkEditRule,
  validateBulkDuplicateRule,
} from '../../../logic/bulk_actions/validations';
import { getExportByObjectIds } from '../../../logic/export/get_export_by_object_ids';
import { RULE_MANAGEMENT_BULK_ACTION_SOCKET_TIMEOUT_MS } from '../../timeouts';
import type { BulkActionError } from './bulk_actions_response';
import { buildBulkResponse } from './bulk_actions_response';
import { bulkEnableDisableRules } from './bulk_enable_disable_rules';
import { fetchRulesByQueryOrIds } from './fetch_rules_by_query_or_ids';
import { bulkScheduleBackfill } from './bulk_schedule_rule_run';
import { createPrebuiltRuleAssetsClient } from '../../../../prebuilt_rules/logic/rule_assets/prebuilt_rule_assets_client';
import { checkAlertSuppressionBulkEditSupport } from '../../../logic/bulk_actions/check_alert_suppression_bulk_edit_support';
import { bulkScheduleRuleGapFilling } from './bulk_schedule_rule_gap_filling';

const MAX_RULES_TO_PROCESS_TOTAL = 10000;
// The alerting layer converts IDs into a KQL "OR" boolean query (one should-clause per ID).
// ES maxClauseCount defaults to 1024, so all IDs-based paths are capped at 1000 to leave
// headroom for the authorization filter clauses that are ANDed in.
// The alerting-layer schemas for bulkDelete/bulkEnable/bulkDisable also enforce maxSize: 1000.
const MAX_RULES_IDS_FOR_BULK_ACTION = 1000;
// Edit has a lower cap than query-path limits because the bulk edit operation does
// heavier per-rule work and the initial edit query is not chunked like the conflict retry is.
const MAX_RULES_TO_BULK_EDIT = 2000;
const MAX_ROUTE_CONCURRENCY = 5;

interface ValidationError {
  body: string;
  statusCode: number;
}

const validateBulkAction = (
  body: PerformRulesBulkActionRequestBody
): ValidationError | undefined => {
  if (body?.ids && body.ids.length > MAX_RULES_IDS_FOR_BULK_ACTION) {
    return {
      body: `More than ${MAX_RULES_IDS_FOR_BULK_ACTION} ids sent for bulk action.`,
      statusCode: 400,
    };
  }

  if (body?.ids && body.query !== undefined) {
    return {
      body: `Both query and ids are sent. Define either ids or query in request payload.`,
      statusCode: 400,
    };
  }

  const ruleExecutionGapBodyParamsSet = new Set([
    Array.isArray(body.gap_fill_statuses) && body.gap_fill_statuses.length > 0,
    Boolean(body.gaps_range_start),
    Boolean(body.gaps_range_end),
  ]);

  if (ruleExecutionGapBodyParamsSet.size > 1) {
    return {
      body: `gaps_range_start, gaps_range_end and gap_fill_statuses must be provided together.`,
      statusCode: 400,
    };
  }

  // Validate that ids and gap range params are not used together
  if (body?.ids && ruleExecutionGapBodyParamsSet.has(true)) {
    return {
      body: `Cannot use both ids and gaps_range_start/gaps_range_end in request payload.`,
      statusCode: 400,
    };
  }

  return undefined;
};

const prepareGapParams = ({
  gapFillStatuses,
  gapsRangeStart,
  gapsRangeEnd,
}: {
  gapFillStatuses: GapFillStatus[] | undefined;
  gapsRangeStart: string | undefined;
  gapsRangeEnd: string | undefined;
}): {
  gapRange: { start: string; end: string } | undefined;
  gapFillStatuses: GapFillStatus[] | undefined;
} => {
  const hasGapStatuses = Array.isArray(gapFillStatuses) && gapFillStatuses.length > 0;

  if (gapsRangeStart && gapsRangeEnd && hasGapStatuses) {
    return {
      gapRange: {
        start: gapsRangeStart,
        end: gapsRangeEnd,
      },
      gapFillStatuses,
    };
  }

  return {
    gapRange: undefined,
    gapFillStatuses: undefined,
  };
};

export const performBulkActionRoute = (
  router: SecuritySolutionPluginRouter,
  ml: SetupPlugins['ml']
) => {
  router.versioned
    .post({
      access: 'public',
      path: DETECTION_ENGINE_RULES_BULK_ACTION,
      security: {
        authz: {
          requiredPrivileges: [{ anyRequired: [RULES_API_READ, RULES_API_ALL] }],
        },
      },
      options: {
        tags: [routeLimitedConcurrencyTag(MAX_ROUTE_CONCURRENCY)],
        timeout: {
          idleSocket: RULE_MANAGEMENT_BULK_ACTION_SOCKET_TIMEOUT_MS,
        },
      },
    })
    .addVersion(
      {
        version: '2023-10-31',
        validate: {
          request: {
            body: buildRouteValidationWithZod(PerformRulesBulkActionRequestBody),
            query: buildRouteValidationWithZod(PerformRulesBulkActionRequestQuery),
          },
        },
      },
      async (
        context,
        request,
        response
      ): Promise<IKibanaResponse<PerformRulesBulkActionResponse>> => {
        const { body } = request;
        const siemResponse = buildSiemResponse(response);

        const validationError = validateBulkAction(body);
        if (validationError) {
          return siemResponse.error(validationError);
        }

        const isDryRun = request.query.dry_run;

        // dry run is not supported for export, as it doesn't change ES state and has different response format(exported JSON file)
        if (isDryRun && body.action === BulkActionTypeEnum.export) {
          return siemResponse.error({
            body: `Export action doesn't support dry_run mode`,
            statusCode: 400,
          });
        }

        const abortController = new AbortController();

        // subscribing to completed$, because it handles both cases when request was completed and aborted.
        // when route is finished by timeout, aborted$ is not getting fired
        request.events.completed$.subscribe(() => abortController.abort());
        try {
          const ctx = await context.resolve([
            'core',
            'securitySolution',
            'alerting',
            'licensing',
            'lists',
            'actions',
          ]);

          const rulesClient = await ctx.alerting.getRulesClient();
          const exceptionsClient = ctx.lists?.getExceptionListClient();
          const savedObjectsClient = ctx.core.savedObjects.client;
          const actionsClient = ctx.actions.getActionsClient();
          const detectionRulesClient = ctx.securitySolution.getDetectionRulesClient();
          const prebuiltRuleAssetClient = createPrebuiltRuleAssetsClient(savedObjectsClient);
          const rulesAuthz = ctx.securitySolution.getRulesAuthz();
          const endpointAuthz = await ctx.securitySolution.getEndpointAuthz();
          const endpointService = ctx.securitySolution.getEndpointService();
          const spaceId = ctx.securitySolution.getSpaceId();

          const { getExporter, getClient } = ctx.core.savedObjects;
          const client = getClient({ includedHiddenTypes: ['action'] });

          const exporter = getExporter(client);

          const mlAuthz = buildMlAuthz({
            license: ctx.licensing.license,
            ml,
            request,
            savedObjectsClient,
          });

          const query = body.query !== '' ? body.query : undefined;
          const gapParams = prepareGapParams({
            gapFillStatuses: body.gap_fill_statuses,
            gapsRangeStart: body.gaps_range_start,
            gapsRangeEnd: body.gaps_range_end,
          });
          const fetchRulesOutcome = await fetchRulesByQueryOrIds({
            rulesClient,
            query,
            ids: body.ids,
            maxRules:
              body.action === BulkActionTypeEnum.edit
                ? MAX_RULES_TO_BULK_EDIT
                : MAX_RULES_TO_PROCESS_TOTAL,
            gapRange: gapParams.gapRange,
            gapFillStatuses: gapParams.gapFillStatuses,
            schedulerId: body.gap_auto_fill_scheduler_id,
          });

          const rules = fetchRulesOutcome.results.map(({ result }) => result);
          const errors: BulkActionError[] = [...fetchRulesOutcome.errors];
          let updated: RuleAlertType[] = [];
          let created: RuleAlertType[] = [];
          let deleted: RuleAlertType[] = [];
          let skipped: BulkActionSkipResult[] = [];

          switch (body.action) {
            case BulkActionTypeEnum.enable: {
              const { updatedRules, errors: bulkActionErrors } = await bulkEnableDisableRules({
                rules,
                isDryRun,
                rulesClient,
                action: 'enable',
                mlAuthz,
                rulesAuthz,
              });
              errors.push(...bulkActionErrors);
              updated = updatedRules;
              break;
            }
            case BulkActionTypeEnum.disable: {
              const { updatedRules, errors: bulkActionErrors } = await bulkEnableDisableRules({
                rules,
                isDryRun,
                rulesClient,
                action: 'disable',
                mlAuthz,
                rulesAuthz,
              });
              errors.push(...bulkActionErrors);
              updated = updatedRules;
              break;
            }
            case BulkActionTypeEnum.delete: {
              // during dry run return early for delete, as no validations needed for this action
              if (isDryRun) {
                // Populate `deleted` so the summary reflects the correct count of affected rules
                deleted = rules;
                break;
              }

              const ruleIds = rules.map((rule) => rule.id);
              const bulkDeleteResult = await detectionRulesClient.bulkDeleteRules({ ruleIds });

              errors.push(...bulkDeleteResult.errors);
              deleted = bulkDeleteResult.rules;
              break;
            }
            case BulkActionTypeEnum.duplicate: {
              const bulkActionOutcome = await initPromisePool({
                concurrency: MAX_RULES_TO_UPDATE_IN_PARALLEL,
                items: rules,
                executor: async (rule) => {
                  await validateBulkDuplicateRule({ mlAuthz, rule });

                  await validateRuleResponseActions({
                    endpointAuthz,
                    endpointService,
                    rulePayload: {},
                    spaceId,
                    existingRule: rule,
                    checkOsqueryResponseActionAuthz:
                      ctx.securitySolution.getCheckOsqueryResponseActionAuthz(),
                  });

                  // during dry run only validation is getting performed and rule is not saved in ES, thus return early
                  if (isDryRun) {
                    return rule;
                  }

                  let shouldDuplicateExceptions = true;
                  let shouldDuplicateExpiredExceptions = true;
                  if (body.duplicate !== undefined) {
                    shouldDuplicateExceptions = body.duplicate.include_exceptions;
                    shouldDuplicateExpiredExceptions = body.duplicate.include_expired_exceptions;
                  }

                  // Clone exceptions first so the rule can be created with them already
                  // attached, avoiding a follow-up update. If this throws, no rule is created.
                  const exceptions = shouldDuplicateExceptions
                    ? await duplicateExceptions({
                        ruleId: rule.params.ruleId,
                        exceptionLists: rule.params.exceptionsList,
                        includeExpiredExceptions: shouldDuplicateExpiredExceptions,
                        exceptionsClient,
                      })
                    : [];

                  const duplicateRuleToCreate = await duplicateRule({
                    rule,
                  });

                  const createdRule = await rulesClient.create({
                    data: {
                      ...duplicateRuleToCreate,
                      params: {
                        ...duplicateRuleToCreate.params,
                        exceptionsList: exceptions,
                      },
                    },
                    changeTracking: {
                      action: SecurityRuleChangeTrackingAction.ruleDuplicate,
                      metadata: {
                        bulkCount: rules.length,
                        originalRuleSoId: rule.id,
                      },
                    },
                  });

                  return createdRule;
                },
                abortSignal: abortController.signal,
              });
              errors.push(...bulkActionOutcome.errors);
              created = bulkActionOutcome.results
                .map(({ result }) => result)
                .filter((rule): rule is RuleAlertType => rule !== null);
              break;
            }
            case BulkActionTypeEnum.export: {
              const exported = await getExportByObjectIds(
                rulesClient,
                exceptionsClient,
                rules.map(({ params }) => params.ruleId),
                exporter,
                request,
                actionsClient
              );

              const responseBody = `${exported.rulesNdjson}${exported.exceptionLists}${exported.actionConnectors}${exported.exportDetails}`;

              return response.ok({
                headers: {
                  'Content-Disposition': `attachment; filename="rules_export.ndjson"`,
                  'Content-Type': 'application/ndjson',
                },
                body: responseBody,
              });
            }

            case BulkActionTypeEnum.edit: {
              const suppressionSupportError = await checkAlertSuppressionBulkEditSupport({
                editActions: body.edit,
                licensing: ctx.licensing,
              });

              if (suppressionSupportError) {
                return siemResponse.error(suppressionSupportError);
              }

              if (isDryRun) {
                // during dry run only validation is getting performed and rule is not saved in ES
                const bulkActionOutcome = await initPromisePool({
                  concurrency: MAX_RULES_TO_UPDATE_IN_PARALLEL,
                  items: rules,
                  executor: async (rule) => {
                    await dryRunValidateBulkEditRule({
                      mlAuthz,
                      rulesAuthz,
                      rule,
                      edit: body.edit,
                      ruleCustomizationStatus: detectionRulesClient.getRuleCustomizationStatus(),
                    });

                    return rule;
                  },
                  abortSignal: abortController.signal,
                });
                errors.push(...bulkActionOutcome.errors);
                updated = bulkActionOutcome.results
                  .map(({ result }) => result)
                  .filter((rule): rule is RuleAlertType => rule !== null);
              } else {
                const bulkEditResult = await bulkEditRules({
                  actionsClient,
                  rulesClient,
                  prebuiltRuleAssetClient,
                  rules,
                  actions: body.edit,
                  rulesAuthz,
                  mlAuthz,
                  ruleCustomizationStatus: detectionRulesClient.getRuleCustomizationStatus(),
                });
                updated = bulkEditResult.rules;
                skipped = bulkEditResult.skipped;
                errors.push(...bulkEditResult.errors);
              }
              break;
            }

            case BulkActionTypeEnum.run: {
              const { backfilled, errors: bulkActionErrors } = await bulkScheduleBackfill({
                rules,
                isDryRun,
                rulesClient,
                mlAuthz,
                rulesAuthz,
                runPayload: body.run,
              });
              errors.push(...bulkActionErrors);
              updated = backfilled.filter((rule): rule is RuleAlertType => rule !== null);
              break;
            }

            case BulkActionTypeEnum.fill_gaps: {
              const uiSettingsClient = ctx.core.uiSettings.client;
              const excludedReasons = await uiSettingsClient.get<GapReasonType[]>(
                EXCLUDED_GAP_REASONS_KEY
              );

              const {
                backfilled,
                errors: bulkActionErrors,
                skipped: skippedRules,
              } = await bulkScheduleRuleGapFilling({
                rules,
                isDryRun,
                rulesClient,
                mlAuthz,
                rulesAuthz,
                fillGapsPayload: body.fill_gaps,
                excludedReasons,
              });
              errors.push(...bulkActionErrors);
              updated = backfilled;
              skipped = skippedRules.map((rule) => {
                return {
                  ...rule,
                  skip_reason: 'NO_GAPS_TO_FILL',
                };
              });
            }
          }

          if (abortController.signal.aborted === true) {
            throw new AbortError('Bulk action was aborted');
          }

          return buildBulkResponse(response, {
            bulkAction: body.action,
            updated,
            deleted,
            created,
            skipped,
            errors,
            isDryRun,
          });
        } catch (err) {
          const error = transformError(err);
          return siemResponse.error({
            body: error.message,
            statusCode: error.statusCode,
          });
        }
      }
    );
};
