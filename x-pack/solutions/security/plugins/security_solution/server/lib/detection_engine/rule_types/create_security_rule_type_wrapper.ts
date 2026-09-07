/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { noop, partition, sum } from 'lodash';
import agent from 'elastic-apm-node';

import type { estypes } from '@elastic/elasticsearch';
import { addSpanLabels } from '@kbn/apm-utils';
import { TIMESTAMP } from '@kbn/rule-data-utils';
import { createPersistenceRuleTypeWrapper } from '@kbn/rule-registry-plugin/server';
import { buildExceptionFilter } from '@kbn/lists-plugin/server/services/exception_lists';
import { technicalRuleFieldMap } from '@kbn/rule-registry-plugin/common/assets/field_maps/technical_rule_field_map';
import type { FieldMap } from '@kbn/alerts-as-data-utils';
import { parseScheduleDates } from '@kbn/securitysolution-io-ts-utils';
import { getIndexListFromEsqlQuery } from '@kbn/securitysolution-utils';
import type { FormatAlert } from '@kbn/alerting-plugin/server/types';
import { SavedObjectsErrorHelpers } from '@kbn/core/server';
import {
  getExceptions,
  getRuleRangeTuples,
  isMachineLearningParams,
  isEsqlParams,
  getDisabledActionsWarningText,
} from './utils/utils';
import { runExecutionValidation } from './validation';
import { DEFAULT_MAX_SIGNALS, DEFAULT_SEARCH_AFTER_PAGE_SIZE } from '../../../../common/constants';
import type { CreateSecurityRuleTypeWrapper } from './types';
import { getListClient } from './utils/get_list_client';
// eslint-disable-next-line no-restricted-imports
import { getNotificationResultsLink } from '../rule_actions_legacy';
// eslint-disable-next-line no-restricted-imports
import { formatAlertForNotificationActions } from '../rule_actions_legacy/logic/notifications/schedule_notification_actions';
import { createResultObject } from './utils';
import aadFieldConversion from '../routes/index/signal_aad_mapping.json';
import { extractReferences, injectReferences } from './saved_object_references';
import { withSecuritySpan } from '../../../utils/with_security_span';
import { getInputIndex } from './utils/get_input_output_index';
import { TIMESTAMP_RUNTIME_FIELD } from './constants';
import { buildTimestampRuntimeMapping } from './utils/build_timestamp_runtime_mapping';
import { alertsFieldMap, rulesFieldMap } from '../../../../common/field_maps';
import { sendAlertSuppressionTelemetryEvent } from './utils/telemetry/send_alert_suppression_telemetry_event';
import { sendGapDetectedTelemetryEvent } from './utils/telemetry/send_gap_detected_telemetry_event';
import { createSecurityRuleParamsAuthorizer } from './utils/authorize_rule_response_actions';
import type { RuleParams } from '../rule_schema';
import {
  SECURITY_FROM,
  SECURITY_IMMUTABLE,
  SECURITY_INPUT_INDEX,
  SECURITY_MAX_SIGNALS,
  SECURITY_MERGE_STRATEGY,
  SECURITY_NUM_ALERTS_CREATED,
  SECURITY_NUM_IGNORE_FIELDS_REGEX,
  SECURITY_NUM_IGNORE_FIELDS_STANDARD,
  SECURITY_NUM_RANGE_TUPLES,
  SECURITY_PARAMS,
  SECURITY_RULE_ID,
  SECURITY_TO,
} from './utils/apm_field_names';

const aliasesFieldMap: FieldMap = {};
Object.entries(aadFieldConversion).forEach(([key, value]) => {
  aliasesFieldMap[key] = {
    type: 'alias',
    required: false,
    path: value,
  };
});

const addApmLabelsFromParams = (params: RuleParams) => {
  addSpanLabels(
    {
      [SECURITY_FROM]: params.from,
      [SECURITY_IMMUTABLE]: params.immutable,
      [SECURITY_MAX_SIGNALS]: params.maxSignals,
      [SECURITY_RULE_ID]: params.ruleId,
      [SECURITY_TO]: params.to,
    },
    { isString: false }
  );
};

export const securityRuleTypeFieldMap = {
  ...technicalRuleFieldMap,
  ...alertsFieldMap,
  ...rulesFieldMap,
  ...aliasesFieldMap,
};

/* eslint-disable complexity */
export const createSecurityRuleTypeWrapper: CreateSecurityRuleTypeWrapper =
  ({
    lists,
    actions,
    docLinks,
    logger,
    config,
    publicBaseUrl,
    ruleDataClient,
    ruleExecutionLoggerFactory,
    version,
    isPreview,
    isServerless,
    experimentalFeatures,
    alerting,
    analytics,
    eventsTelemetry,
    licensing,
    scheduleNotificationResponseActionsService,
    endpointAppContextService,
    getEntityStore,
    getRulesAuthz,
    getOsqueryResponseActionsAuthzChecker,
  }) =>
  (type) => {
    const { alertIgnoreFields: ignoreFields, alertMergeStrategy: mergeStrategy } = config;
    // Rule preview must stay non-operational, similar to regular actions
    const responseActionsService = isPreview ? noop : scheduleNotificationResponseActionsService;
    const persistenceRuleType = createPersistenceRuleTypeWrapper({
      ruleDataClient,
      logger,
      formatAlert: formatAlertForNotificationActions,
    });

    return persistenceRuleType({
      ...type,
      // Authorize privileged params on every rule write path, including the generic
      // Alerting APIs.
      authorize: {
        params: createSecurityRuleParamsAuthorizer({
          endpointAppContextService,
          getRulesAuthz,
          getOsqueryResponseActionsAuthzChecker,
        }),
      },
      cancelAlertsOnRuleTimeout: false,
      useSavedObjectReferences: {
        extractReferences: (params) => extractReferences({ logger, params }),
        injectReferences: (params, savedObjectReferences) =>
          injectReferences({ logger, params, savedObjectReferences }),
      },
      autoRecoverAlerts: false,
      getViewInAppRelativeUrl: ({ rule, start, end }) => {
        let startTime = null;
        let endTime = null;

        if (start && end) {
          startTime = new Date(start).toISOString();
          endTime = new Date(end).toISOString();
        } else if (rule.schedule?.interval) {
          startTime = `now-${rule.schedule?.interval}`;
          endTime = 'now';
        }
        if (!startTime || !endTime) {
          return '';
        }

        const fromInMs = parseScheduleDates(startTime)?.format('x');
        const toInMs = parseScheduleDates(endTime)?.format('x');

        return getNotificationResultsLink({
          from: fromInMs,
          to: toInMs,
          id: rule.id,
        });
      },
      async executor(options) {
        agent.setTransactionName(`${options.rule.ruleTypeId} execution`);
        return withSecuritySpan('securityRuleTypeExecutor', async () => {
          const {
            executionId,
            params,
            previousStartedAt,
            startedAt,
            startedAtOverridden,
            services,
            spaceId,
            state,
            rule,
          } = options;
          addApmLabelsFromParams(params);
          agent.setCustomContext({ [SECURITY_MERGE_STRATEGY]: mergeStrategy });
          agent.setCustomContext({ [SECURITY_PARAMS]: params });
          let runState = state;
          let inputIndex: string[] = [];
          let runtimeMappings: estypes.MappingRuntimeFields | undefined;
          const { from, maxSignals, timestampOverride, timestampOverrideFallbackDisabled, to } =
            params;
          const { savedObjectsClient, ruleMonitoringService, ruleResultService } = services;
          const searchAfterSize = Math.min(maxSignals, DEFAULT_SEARCH_AFTER_PAGE_SIZE);
          const entityStoreCrudClient = experimentalFeatures.entityAnalyticsEntityStoreV2
            ? (await getEntityStore()).createCRUDClient(
                services.scopedClusterClient.asCurrentUser,
                spaceId
              )
            : undefined;
          const ruleExecutionLogger = await ruleExecutionLoggerFactory({
            savedObjectsClient,
            ruleMonitoringService,
            ruleResultService,
            context: {
              executionId,
              ruleId: rule.id,
              ruleUuid: params.ruleId,
              ruleName: rule.name,
              ruleRevision: rule.revision,
              ruleType: rule.ruleTypeId,
              spaceId,
              cpsData: options.cpsData,
            },
          });

          const completeRule = {
            ruleConfig: rule,
            ruleParams: params,
            alertId: rule.id,
          };

          const {
            schedule: { interval },
          } = completeRule.ruleConfig;

          const refresh = isPreview ? false : true;

          ruleExecutionLogger.debug(`Starting execution with interval: ${interval}`);

          let result = createResultObject(state);

          const primaryTimestamp = timestampOverride ?? TIMESTAMP;
          const secondaryTimestamp =
            primaryTimestamp !== TIMESTAMP && !timestampOverrideFallbackDisabled
              ? TIMESTAMP
              : undefined;

          // If we have a timestampOverride, we'll compute a runtime field that emits the override for each document if it exists,
          // otherwise it emits @timestamp. If we don't have a timestamp override we don't want to pay the cost of using a
          // runtime field, so we just use @timestamp directly.
          const { aggregatableTimestampField, timestampRuntimeMappings } =
            secondaryTimestamp && timestampOverride
              ? {
                  aggregatableTimestampField: TIMESTAMP_RUNTIME_FIELD,
                  timestampRuntimeMappings: buildTimestampRuntimeMapping({
                    timestampOverride,
                  }),
                }
              : {
                  aggregatableTimestampField: primaryTimestamp,
                  timestampRuntimeMappings: undefined,
                };

          /**
           * Data Views Logic
           * Use of data views is supported for all rules other than ML and Esql.
           * Rules can define both a data view and index pattern, but on execution:
           *  - Data view is used if it is defined
           *    - Rule exits early if data view defined is not found (ie: it's been deleted)
           *  - If no data view defined, falls to using existing index logic
           * Esql rules has index in query, which can be retrieved
           */
          if (isEsqlParams(params)) {
            inputIndex = getIndexListFromEsqlQuery(params.query);
          } else if (!isMachineLearningParams(params)) {
            try {
              const { index, runtimeMappings: dataViewRuntimeMappings } = await getInputIndex({
                index: params.index,
                services,
                version,
                logger,
                ruleId: params.ruleId,
                dataViewId: params.dataViewId,
              });

              inputIndex = index ?? [];
              runtimeMappings = dataViewRuntimeMappings;
            } catch (exc) {
              if (SavedObjectsErrorHelpers.isNotFoundError(exc)) {
                ruleExecutionLogger.error(`Data view is not found.\nError: ${exc}`, {
                  userError: true,
                });
              } else {
                ruleExecutionLogger.error(`Check for indices to search failed.\nError: ${exc}`);
              }

              // Closing the logger due to early exit
              await ruleExecutionLogger.close();

              return { state: result.state };
            }
          }

          // Make a copy of `inputIndex` or else the APM agent reports it as [Circular] for most rule types because it's the same object
          // as `index`
          agent.setCustomContext({ [SECURITY_INPUT_INDEX]: [...inputIndex] });

          const { skipExecution, warnings, frozenIndicesQueriedCount } =
            await runExecutionValidation({
              params,
              inputIndex,
              ruleName: rule.name,
              scopedClusterClient: services.scopedClusterClient,
              runtimeMappings,
              primaryTimestamp,
              secondaryTimestamp,
              ruleExecutionLogger,
              isServerless: isServerless ?? false,
            });

          warnings.forEach((warningMessage) => ruleExecutionLogger.warn(warningMessage));

          const {
            tuples,
            remainingGap,
            warningStatusMessage: rangeTuplesWarningMessage,
            gap,
            gapReason: detectedGapReason,
            originalFrom,
            originalTo,
          } = await getRuleRangeTuples({
            startedAt,
            previousStartedAt,
            from,
            to,
            interval,
            maxSignals: maxSignals ?? DEFAULT_MAX_SIGNALS,
            ruleExecutionLogger,
            alerting,
            lastEnabledAt: rule.lastEnabledAt,
          });
          if (rangeTuplesWarningMessage != null) {
            ruleExecutionLogger.warn(rangeTuplesWarningMessage);
          }

          agent.setCustomContext({ [SECURITY_NUM_RANGE_TUPLES]: tuples.length });

          const gapReason = experimentalFeatures.gapReasonDetectionEnabled
            ? detectedGapReason
            : undefined;

          if (remainingGap.asMilliseconds() > 0) {
            const gapDuration = `${remainingGap.humanize()} (${remainingGap.asMilliseconds()}ms)`;
            const gapErrorMessage = `${gapDuration} were not queried between this rule execution and the last execution, so signals may have been missed. Consider increasing your look behind time or adding more Kibana instances`;
            if (analytics) {
              try {
                sendGapDetectedTelemetryEvent({
                  analytics,
                  interval,
                  gapDuration: remainingGap,
                  originalFrom,
                  originalTo,
                  ruleParams: params,
                  gapReasonType: gapReason?.type,
                });
              } catch (error) {
                // Catching here to prevent telemetry errors from propagating to the Alerting Framework.
                // The framework would catch the error and mark the rule run as failed.
                // We don't want the rule to be marked as failed, if only telemetry failed.
                logger.info(`Failed to send gap detected telemetry event: ${error}`);
              }
            }
            ruleExecutionLogger.error(gapErrorMessage, { userError: true });
          }

          try {
            const { listClient, exceptionsClient } = getListClient({
              esClient: services.scopedClusterClient.asCurrentUser,
              updatedByUser: rule.updatedBy,
              spaceId,
              lists,
              savedObjectClient: options.services.savedObjectsClient,
            });

            const exceptionItems = await getExceptions({
              client: exceptionsClient,
              lists: params.exceptionsList,
              shouldFilterOutEndpointExceptions:
                await endpointAppContextService.isEndpointExceptionsPerPolicyEnabled(),
            });

            const alertTimestampOverride = isPreview ? startedAt : undefined;

            const legacySignalFields: string[] = Object.keys(aadFieldConversion);
            const [ignoreFieldsRegexes, ignoreFieldsStandard] = partition(
              [...ignoreFields, ...legacySignalFields],
              (field: string) => field.startsWith('/') && field.endsWith('/')
            );
            const ignoreFieldsObject: Record<string, boolean> = {};
            ignoreFieldsStandard.forEach((field) => {
              ignoreFieldsObject[field] = true;
            });

            agent.setCustomContext({
              [SECURITY_NUM_IGNORE_FIELDS_STANDARD]: ignoreFieldsStandard.length,
              [SECURITY_NUM_IGNORE_FIELDS_REGEX]: ignoreFieldsRegexes.length,
            });

            const intendedTimestamp = startedAtOverridden ? startedAt : undefined;

            const { filter: exceptionFilter, unprocessedExceptions } = await buildExceptionFilter({
              startedAt,
              alias: null,
              excludeExceptions: true,
              chunkSize: 10,
              lists: exceptionItems,
              listClient,
            });

            if (!skipExecution) {
              for (const tuple of tuples) {
                const runResult = await type.executor({
                  ...options,
                  services,
                  state: runState,
                  sharedParams: {
                    completeRule,
                    inputIndex,
                    exceptionFilter,
                    unprocessedExceptions,
                    runtimeMappings: {
                      ...runtimeMappings,
                      ...timestampRuntimeMappings,
                    },
                    searchAfterSize,
                    tuple,
                    listClient,
                    ruleDataClient,
                    mergeStrategy,
                    primaryTimestamp,
                    secondaryTimestamp,
                    ruleExecutionLogger,
                    aggregatableTimestampField,
                    alertTimestampOverride,
                    refreshOnIndexingAlerts: refresh,
                    publicBaseUrl,
                    experimentalFeatures,
                    intendedTimestamp,
                    spaceId,
                    entityStoreCrudClient,
                    ignoreFields: ignoreFieldsObject,
                    ignoreFieldsRegexes,
                    eventsTelemetry,
                    licensing,
                    scheduleNotificationResponseActionsService: responseActionsService,
                  },
                });

                // Log rule run result errors and warnings explicitly here.
                // This may lead to the same errors or warnings logged twice.
                // Duplicates issue will be address in https://github.com/elastic/kibana/issues/259389.
                runResult.errors.forEach((message) =>
                  ruleExecutionLogger.error(message, { userError: runResult.userError })
                );
                runResult.warningMessages.forEach((message) => ruleExecutionLogger.warn(message));

                const createdSignals = result.createdSignals.concat(runResult.createdSignals);
                const warningMessages = result.warningMessages.concat(runResult.warningMessages);
                result = {
                  bulkCreateTimes: result.bulkCreateTimes.concat(runResult.bulkCreateTimes),
                  enrichmentTimes: result.enrichmentTimes.concat(runResult.enrichmentTimes),
                  createdSignals,
                  createdSignalsCount: createdSignals.length,
                  alertsCandidateCount: runResult.alertsCandidateCount,
                  suppressedAlertsCount: runResult.suppressedAlertsCount,
                  totalEventsFound:
                    (result.totalEventsFound ?? 0) + (runResult.totalEventsFound ?? 0),
                  errors: result.errors.concat(runResult.errors),
                  searchAfterTimes: result.searchAfterTimes.concat(runResult.searchAfterTimes),
                  state: runResult.state,
                  success: result.success && runResult.success,
                  warning: warningMessages.length > 0,
                  warningMessages,
                  userError: runResult.userError,
                  ...(runResult.loggedRequests ? { loggedRequests: runResult.loggedRequests } : {}),
                };
                runState = runResult.state;
              }
            } else {
              result = {
                bulkCreateTimes: [],
                enrichmentTimes: [],
                createdSignals: [],
                createdSignalsCount: 0,
                suppressedAlertsCount: 0,
                errors: [],
                searchAfterTimes: [],
                state,
                success: true,
                warning: false,
                warningMessages: [],
              };
            }

            const disabledActions = rule.actions.filter(
              (action) => !actions.isActionTypeEnabled(action.actionTypeId)
            );
            const suppressedAlertsCount = result.suppressedAlertsCount ?? 0;

            // Using Math.ceil() to prevent the event log from showing 0ms for sub-millisecond durations.
            ruleExecutionLogger.logMetrics({
              total_search_duration_ms:
                result.searchAfterTimes.length > 0
                  ? Math.ceil(sum(result.searchAfterTimes.map(Number)))
                  : undefined,
              total_indexing_duration_ms:
                result.bulkCreateTimes.length > 0
                  ? Math.ceil(sum(result.bulkCreateTimes.map(Number)))
                  : undefined,
              total_enrichment_duration_ms:
                result.enrichmentTimes.length > 0
                  ? Math.ceil(sum(result.enrichmentTimes.map(Number)))
                  : undefined,
              frozen_indices_queried_count: frozenIndicesQueriedCount,
              alerts_candidate_count: result.alertsCandidateCount,
              alerts_suppressed_count: suppressedAlertsCount,
              gap_duration_s:
                gap && remainingGap ? Math.round(remainingGap.asSeconds()) : undefined,
              gap_range: gap,
              gap_reason: gapReason,
            });

            const createdSignalsCount = result.createdSignals.length;

            agent.setCustomContext({ [SECURITY_NUM_ALERTS_CREATED]: createdSignalsCount });

            if (disabledActions.length > 0) {
              const disabledActionsWarning = getDisabledActionsWarningText({
                alertsCreated: createdSignalsCount > 0,
                disabledActions,
              });
              ruleExecutionLogger.warn(disabledActionsWarning);
            }
          } catch (error) {
            ruleExecutionLogger.error(error.message ?? '(no error message given)');
          } finally {
            await ruleExecutionLogger.close();
          }

          if (!isPreview && analytics) {
            try {
              sendAlertSuppressionTelemetryEvent({
                analytics,
                suppressedAlertsCount: result.suppressedAlertsCount ?? 0,
                createdAlertsCount: result.createdSignalsCount,
                ruleAttributes: rule,
                ruleParams: params,
              });
            } catch (error) {
              // Catching here to prevent telemetry errors from propagating to the Alerting Framework.
              // The framework would catch the error and mark the rule run as failed.
              // We don't want the rule to be marked as failed, if only telemetry failed.
              logger.info(`Failed to send alert suppression telemetry event: ${error}`);
            }
          }

          return {
            state: result.state,
            ...(result.loggedRequests ? { loggedRequests: result.loggedRequests } : {}),
          };
        });
      },
      alerts: {
        context: 'security',
        mappings: {
          dynamic: false,
          fieldMap: securityRuleTypeFieldMap,
        },
        useEcs: true,
        useLegacyAlerts: true,
        isSpaceAware: true,
        secondaryAlias: config.signalsIndex,
        formatAlert: formatAlertForNotificationActions as unknown as FormatAlert<never>,
      },
    });
  };
