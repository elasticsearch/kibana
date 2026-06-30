/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import moment from 'moment';
import { v4 as uuidv4 } from 'uuid';
import type {
  Logger,
  StartServicesAccessor,
  KibanaRequest,
  SavedObjectsClientContract,
  IUiSettingsClient,
} from '@kbn/core/server';
import type { ActionsClient } from '@kbn/actions-plugin/server';
import type { ILicense } from '@kbn/licensing-types';
import type { SpaceId } from '@kbn/core-spaces-common';
import type { IRuleDataClient } from '@kbn/rule-registry-plugin/server';
import type {
  AlertInstanceContext,
  AlertInstanceState,
  RuleAction,
  RuleTypeState,
} from '@kbn/alerting-plugin/common';
import { parseDuration, DISABLE_FLAPPING_SETTINGS } from '@kbn/alerting-plugin/common';
import { QUERY_RULE_TYPE_ID, SAVED_QUERY_RULE_TYPE_ID } from '@kbn/securitysolution-rules';
import { wrapAsyncSearchClient } from '@kbn/alerting-plugin/server/lib';
import { DEFAULT_PREVIEW_INDEX, SERVER_APP_ID } from '../../../../../../common/constants';
import { RuleExecutionStatusEnum } from '../../../../../../common/api/detection_engine/rule_monitoring';
import type {
  RulePreviewResponse,
  RulePreviewLogs,
  RulePreviewRequestBody,
} from '../../../../../../common/api/detection_engine';
import type { RulePreviewLoggedRequest } from '../../../../../../common/api/detection_engine/rule_preview/rule_preview.gen';

import type { StartPlugins, SetupPlugins } from '../../../../../plugin';
import type { RuleParams } from '../../../rule_schema';
import { createPreviewRuleExecutionLogger } from './preview_rule_execution_logger';
import { parseInterval } from '../../../rule_types/utils/utils';
import { buildMlAuthz } from '../../../../machine_learning/authz';
import { throwAuthzError } from '../../../../machine_learning/validation';
import type { ConfigType } from '../../../../../config';
import { alertInstanceFactoryStub } from './alert_instance_factory_stub';
import type {
  CreateSecurityRuleTypeWrapperProps,
  SecurityAlertType,
} from '../../../rule_types/types';
import {
  createEqlAlertType,
  createEsqlAlertType,
  createIndicatorMatchAlertType,
  createMlAlertType,
  createQueryAlertType,
  createThresholdAlertType,
  createNewTermsAlertType,
} from '../../../rule_types';
import { createSecurityRuleTypeWrapper } from '../../../rule_types/create_security_rule_type_wrapper';
import { assertUnreachable } from '../../../../../../common/utility_types';
import { wrapScopedClusterClient } from './wrap_scoped_cluster_client';
import { wrapSearchSourceClient } from './wrap_search_source_client';
import { applyRuleDefaults } from '../../../rule_management/logic/detection_rules_client/mergers/apply_rule_defaults';
import { convertRuleResponseToAlertingRule } from '../../../rule_management/logic/detection_rules_client/converters/convert_rule_response_to_alerting_rule';

export const PREVIEW_TIMEOUT_SECONDS = 60;

/**
 * Plugin-level dependencies needed to run a rule preview. These mirror the
 * dependencies wired into the rule preview route at plugin setup time and are
 * intentionally request-agnostic so the same logic can be reused both from the
 * HTTP route and from server-side callers (e.g. agent builder tools).
 */
export interface RunRulePreviewDeps {
  config: ConfigType;
  ml: SetupPlugins['ml'];
  security: SetupPlugins['security'];
  securityRuleTypeOptions: CreateSecurityRuleTypeWrapperProps;
  previewRuleDataClient: IRuleDataClient;
  getStartServices: StartServicesAccessor<StartPlugins>;
  logger: Logger;
  isServerless: boolean;
}

/**
 * Per-request inputs for running a rule preview. Callers are responsible for
 * resolving the request-scoped clients (the HTTP route from its request handler
 * context, other callers from start services + request).
 */
export interface RunRulePreviewParams {
  body: RulePreviewRequestBody;
  enableLoggedRequests: boolean | undefined;
  request: KibanaRequest;
  spaceId: SpaceId;
  actionsClient: ActionsClient;
  license: ILicense;
  savedObjectsClient: SavedObjectsClientContract;
  uiSettingsClient: IUiSettingsClient;
}

/**
 * Runs a security rule preview by executing the rule's executors in-process
 * against the preview rule data client, returning the generated preview id and
 * execution logs.
 *
 * NOTE: This is a behavior-preserving extraction of the rule preview route
 * handler. Any change here affects the public rule preview API.
 */
export const runRulePreview = async (
  deps: RunRulePreviewDeps,
  {
    body,
    enableLoggedRequests,
    request,
    spaceId,
    actionsClient,
    license,
    savedObjectsClient,
    uiSettingsClient,
  }: RunRulePreviewParams
): Promise<RulePreviewResponse> => {
  const {
    config,
    ml,
    security,
    securityRuleTypeOptions,
    previewRuleDataClient,
    getStartServices,
    logger,
    isServerless,
  } = deps;

  const [coreStart, { data, security: securityService, share, dataViews }] =
    await getStartServices();
  const searchSourceClientWithCps = await data.search.searchSource.asScoped(request, {
    projectRouting: 'space',
  });
  const scopedClusterClientWithCps = coreStart.elasticsearch.client.asScoped(request, {
    projectRouting: 'space',
  });
  const internalUserEsClient = coreStart.elasticsearch.client.asInternalUser;

  const timeframeEnd = body.timeframeEnd;
  let invocationCount = body.invocationCount;
  if (invocationCount < 1) {
    return {
      logs: [{ errors: ['Invalid invocation count'], warnings: [], duration: 0 }],
      previewId: undefined,
      isAborted: undefined,
    };
  }

  const internalRule = convertRuleResponseToAlertingRule(applyRuleDefaults(body), actionsClient);
  const previewRuleParams = internalRule.params;

  const mlAuthz = buildMlAuthz({
    license,
    ml,
    request,
    savedObjectsClient,
  });
  throwAuthzError(await mlAuthz.validateRuleType(internalRule.params.type));

  const previewId = uuidv4();
  const username = security?.authc.getCurrentUser(request)?.username;
  const previewRuleExecutionLogger = createPreviewRuleExecutionLogger();
  const runState: Record<string, unknown> = {
    isLoggedRequestsEnabled: enableLoggedRequests,
  };
  const logs: RulePreviewLogs[] = [];
  let isAborted = false;

  const { hasAllRequested } = await securityService.authz
    .checkPrivilegesWithRequest(request)
    .atSpace(spaceId, {
      elasticsearch: {
        index: {
          [`${DEFAULT_PREVIEW_INDEX}-${spaceId}`]: ['read'],
          [`.internal${DEFAULT_PREVIEW_INDEX}-${spaceId}-*`]: ['read'],
        },
        cluster: [],
      },
    });

  if (!hasAllRequested) {
    return {
      logs: [
        {
          errors: [
            'Missing "read" privileges for the ".preview.alerts-security.alerts" or ".internal.preview.alerts-security.alerts" indices. Without these privileges you cannot use the Rule Preview feature.',
          ],
          warnings: [],
          duration: 0,
        },
      ],
      previewId: undefined,
      isAborted: undefined,
    };
  }

  // Create the preview index so the Lens histogram can resolve field
  // mappings even when no preview alerts have been generated yet.
  try {
    await previewRuleDataClient.getWriter({ namespace: spaceId });
  } catch (err) {
    logger.warn(`Failed to bootstrap preview index for space "${spaceId}": ${err.message}`);
  }

  const previewRuleTypeWrapper = createSecurityRuleTypeWrapper({
    ...securityRuleTypeOptions,
    ruleDataClient: previewRuleDataClient,
    ruleExecutionLoggerFactory: previewRuleExecutionLogger.factory,
    isPreview: true,
  });

  const runExecutors = async <TParams extends RuleParams, TState extends RuleTypeState>(
    securityRuleType: SecurityAlertType<TParams, TState>,
    params: TParams
  ) => {
    const ruleType = previewRuleTypeWrapper(securityRuleType);
    let statePreview = runState as TState;
    let loggedRequests = [];

    const abortController = new AbortController();
    const abortTimeout = setTimeout(() => {
      abortController.abort();
      isAborted = true;
    }, PREVIEW_TIMEOUT_SECONDS * 1000);

    const startedAt = moment(timeframeEnd);
    const parsedDuration = parseDuration(internalRule.schedule.interval) ?? 0;
    startedAt.subtract(moment.duration(parsedDuration * (invocationCount - 1)));

    let previousStartedAt = null;

    const rule = {
      ...internalRule,
      id: previewId,
      createdAt: new Date(),
      createdBy: username ?? 'preview-created-by',
      producer: 'preview-producer',
      consumer: SERVER_APP_ID,
      enabled: true,
      revision: 0,
      ruleTypeId: ruleType.id,
      ruleTypeName: ruleType.name,
      updatedAt: new Date(),
      updatedBy: username ?? 'preview-updated-by',
      muteAll: false,
      snoozeSchedule: [],
      // In Security Solution, action params are typed as Record<string,
      // unknown>, which is a correct type for action params, but we
      // need to cast here to comply with the alerting types
      actions: internalRule.actions as RuleAction[],
    };

    let invocationStartTime;

    const dataViewsService = await dataViews.dataViewsServiceFactory(
      savedObjectsClient,
      internalUserEsClient
    );

    while (invocationCount > 0 && !isAborted) {
      invocationStartTime = moment();

      ({ state: statePreview, loggedRequests } = (await ruleType.executor({
        executionId: uuidv4(),
        params,
        previousStartedAt,
        rule,
        services: {
          shouldWriteAlerts: () => true,
          shouldStopExecution: () => isAborted,
          alertsClient: null,
          alertFactory: {
            create: alertInstanceFactoryStub<
              TParams,
              TState,
              AlertInstanceState,
              AlertInstanceContext,
              'default'
            >,
            alertLimit: {
              getValue: () => 1000,
              setLimitReached: () => {},
            },
            done: () => ({ getRecoveredAlerts: () => [] }),
          },
          savedObjectsClient,
          scopedClusterClient: wrapScopedClusterClient({
            abortController,
            scopedClusterClient: scopedClusterClientWithCps,
          }),
          getSearchSourceClient: async () =>
            wrapSearchSourceClient({
              abortController,
              searchSourceClient: searchSourceClientWithCps,
            }),
          getMaintenanceWindowIds: async () => [],
          getMaintenanceWindowNames: async () => [],
          uiSettingsClient,
          getDataViews: async () => dataViewsService,
          share,
          getAsyncSearchClient: (strategy) => {
            const clientWithCps = data.search.asScoped(request, {
              projectRouting: 'space',
            });
            return wrapAsyncSearchClient({
              rule: {
                name: rule.name,
                id: rule.id,
                alertTypeId: rule.ruleTypeId,
                spaceId,
              },
              logger,
              strategy,
              client: clientWithCps,
              abortController,
            });
          },
        },
        spaceId,
        startedAt: startedAt.toDate(),
        startedAtOverridden: true,
        state: statePreview,
        logger,
        flappingSettings: DISABLE_FLAPPING_SETTINGS,
        getTimeRange: () => {
          const date = startedAt.toISOString();
          return { dateStart: date, dateEnd: date };
        },
        isServerless,
        ruleExecutionTimeout: `${PREVIEW_TIMEOUT_SECONDS}s`,
      })) as { state: TState; loggedRequests: RulePreviewLoggedRequest[] });

      const executionResult = previewRuleExecutionLogger.getExecutionResult();

      logs.push({
        errors:
          executionResult?.status === RuleExecutionStatusEnum.failed
            ? [executionResult?.message, ...previewRuleExecutionLogger.getErrors()]
            : previewRuleExecutionLogger.getErrors(),
        warnings:
          executionResult?.status === RuleExecutionStatusEnum['partial failure']
            ? [executionResult?.message, ...previewRuleExecutionLogger.getWarnings()]
            : previewRuleExecutionLogger.getWarnings(),
        startedAt: startedAt.toDate().toISOString(),
        duration: moment().diff(invocationStartTime, 'milliseconds'),
        ...(loggedRequests ? { requests: loggedRequests } : {}),
      });

      if (executionResult?.status === RuleExecutionStatusEnum.failed) {
        break;
      }

      previousStartedAt = startedAt.toDate();
      startedAt.add(parseInterval(internalRule.schedule.interval));
      invocationCount--;
    }
    clearTimeout(abortTimeout);
  };

  switch (previewRuleParams.type) {
    case 'query':
      const queryAlertType = createQueryAlertType({
        id: QUERY_RULE_TYPE_ID,
        name: 'Custom Query Rule',
      });
      await runExecutors(queryAlertType, previewRuleParams);
      break;
    case 'saved_query':
      const savedQueryAlertType = createQueryAlertType({
        id: SAVED_QUERY_RULE_TYPE_ID,
        name: 'Saved Query Rule',
      });
      await runExecutors(savedQueryAlertType, previewRuleParams);
      break;
    case 'threshold':
      const thresholdAlertType = createThresholdAlertType();
      await runExecutors(thresholdAlertType, previewRuleParams);
      break;
    case 'threat_match':
      const threatMatchAlertType = createIndicatorMatchAlertType();
      await runExecutors(threatMatchAlertType, previewRuleParams);
      break;
    case 'eql':
      const eqlAlertType = createEqlAlertType();
      await runExecutors(eqlAlertType, previewRuleParams);
      break;
    case 'esql':
      if (config.experimentalFeatures.esqlRulesDisabled) {
        throw Error('ES|QL rule type is not supported');
      }
      const esqlAlertType = createEsqlAlertType();
      await runExecutors(esqlAlertType, previewRuleParams);
      break;
    case 'machine_learning':
      const mlAlertType = createMlAlertType(ml);
      await runExecutors(mlAlertType, previewRuleParams);
      break;
    case 'new_terms':
      const newTermsAlertType = createNewTermsAlertType();
      await runExecutors(newTermsAlertType, previewRuleParams);
      break;
    default:
      assertUnreachable(previewRuleParams);
  }

  // Refreshes alias to ensure index is able to be read before returning
  await internalUserEsClient.indices.refresh(
    {
      index: previewRuleDataClient.indexNameWithNamespace(spaceId),
    },
    { ignore: [404] }
  );

  return {
    previewId,
    logs,
    isAborted,
  };
};
