/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { IAsyncSearchRequestParams } from '@kbn/data-plugin/server/search';
import type { ESQLSearchParams } from '@kbn/es-types';
import type { MappingDynamicTemplate } from '@elastic/elasticsearch/lib/api/types';
import type { SqlQueryRequest } from '@elastic/elasticsearch/lib/api/types';
import type {
  IRouter,
  CustomRequestHandlerContext,
  SavedObjectReference,
  IUiSettingsClient,
  KibanaRequest,
} from '@kbn/core/server';
import type { z } from '@kbn/zod/v4';
import type { DataViewsContract } from '@kbn/data-views-plugin/common';
import type {
  ENHANCED_ES_SEARCH_STRATEGY,
  EQL_SEARCH_STRATEGY,
  ESQL_ASYNC_SEARCH_STRATEGY,
  EqlRequestParams,
  ISearchStartSearchSource,
} from '@kbn/data-plugin/common';
import type { LicenseType } from '@kbn/licensing-types';
import type { SpaceId } from '@kbn/core-spaces-common';
import type {
  IScopedClusterClient,
  SavedObjectAttributes,
  SavedObjectsClientContract,
  Logger,
} from '@kbn/core/server';
import type { ObjectType } from '@kbn/config-schema';
import type { PublicMethodsOf } from '@kbn/utility-types';
import type { SharePluginStart } from '@kbn/share-plugin/server';
import type { DefaultAlert, FieldMap } from '@kbn/alerts-as-data-utils';
import type { Alert } from '@kbn/alerts-as-data-utils';
import type { ActionsApiRequestHandlerContext, ActionsClient } from '@kbn/actions-plugin/server';
import type { AlertsHealth, RuleTypeSolution } from '@kbn/alerting-types';
import type { TaskPriority } from '@kbn/task-manager-plugin/server';
import type { RuleTypeRegistry as OrigruleTypeRegistry } from './rule_type_registry';
import type { AlertingServerSetup, AlertingServerStart } from './plugin';
import type { RulesClient } from './rules_client';
import type { RuleQueryInspectorFn } from './rule_query_inspector/types';
import type {
  RulesSettingsClient,
  RulesSettingsFlappingClient,
  RulesSettingsQueryDelayClient,
} from './rules_settings';
export * from '../common';
import type {
  Rule,
  RuleTypeParams,
  RuleTypeState,
  ActionGroup,
  AlertInstanceContext,
  AlertInstanceState,
  WithoutReservedActionGroups,
  ActionVariable,
  SanitizedRuleConfig,
  SanitizedRule,
  RuleAlertData,
  Artifacts,
  GapReason,
} from '../common';
import type { PublicAlertFactory } from './alert/create_alert_factory';
import type { RulesSettingsFlappingProperties } from '../common/rules_settings';
import type { PublicAlertsClient } from './alerts_client/types';
import type { GetTimeRangeResult } from './lib/get_time_range';
import type { AlertDeletionClient } from './alert_deletion';
import type { PublicAsyncSearchClient } from './task_runner/types';

export type WithoutQueryAndParams<T> = Pick<T, Exclude<keyof T, 'query' | 'params'>>;
export type SpaceIdToNamespaceFunction = (spaceId?: string) => string | undefined;
export type { RuleTypeParams };
export type { Artifacts };

export interface HasRequiredPrivilegeGrantedInAllSpaces {
  spaceIds: string[];
  requiredPrivilege: string;
  request: KibanaRequest;
}

/**
 * @public
 */
export interface AlertingApiRequestHandlerContext {
  getAlertDeletionClient: () => AlertDeletionClient;
  getRulesClient: () => Promise<RulesClient>;
  getRulesSettingsClient: (withoutAuth?: boolean) => RulesSettingsClient;
  listTypes: RuleTypeRegistry['list'];
  getFrameworkHealth: () => Promise<AlertsHealth>;
  areApiKeysEnabled: () => Promise<boolean>;
}

/**
 * @internal
 */
export type AlertingRequestHandlerContext = CustomRequestHandlerContext<{
  alerting: AlertingApiRequestHandlerContext;
  actions: ActionsApiRequestHandlerContext;
}>;

/**
 * @internal
 */
export type AlertingRouter = IRouter<AlertingRequestHandlerContext>;
export interface RuleExecutorServices<
  State extends AlertInstanceState = AlertInstanceState,
  Context extends AlertInstanceContext = AlertInstanceContext,
  ActionGroupIds extends string = never,
  AlertData extends RuleAlertData = RuleAlertData
> {
  /**
   * Only available when framework alerts are enabled and rule
   * type has registered alert context with the framework with shouldWrite set to true
   */
  alertsClient: PublicAlertsClient<AlertData, State, Context, ActionGroupIds> | null;
  /**
   * Deprecate alertFactory and remove when all rules are onboarded to
   * the alertsClient
   * @deprecated
   */
  alertFactory: PublicAlertFactory<State, Context, ActionGroupIds>;
  /**
   * Only available for Attack Discovery
   */
  actionsClient?: PublicMethodsOf<ActionsClient>;
  getDataViews: () => Promise<DataViewsContract>;
  getMaintenanceWindowIds: () => Promise<string[]>;
  getMaintenanceWindowNames: () => Promise<string[]>;
  getSearchSourceClient: () => Promise<ISearchStartSearchSource>;
  ruleMonitoringService?: PublicRuleMonitoringService;
  ruleResultService?: PublicRuleResultService;
  savedObjectsClient: SavedObjectsClientContract;
  scopedClusterClient: IScopedClusterClient;
  share: SharePluginStart;
  shouldStopExecution: () => boolean;
  shouldWriteAlerts: () => boolean;
  uiSettingsClient: IUiSettingsClient;
  getAsyncSearchClient: <T extends AsyncSearchParams>(
    strategy: AsyncSearchStrategies
  ) => PublicAsyncSearchClient<T>;
}

export type AsyncSearchStrategies =
  | typeof ESQL_ASYNC_SEARCH_STRATEGY // ESQL
  | typeof EQL_SEARCH_STRATEGY // EQL
  | typeof ENHANCED_ES_SEARCH_STRATEGY; // search

export type ESQLQueryRequest = ESQLSearchParams & Omit<SqlQueryRequest, 'filter'>;
export type AsyncSearchParams = ESQLQueryRequest | IAsyncSearchRequestParams | EqlRequestParams;

export interface RuleExecutorOptions<
  Params extends RuleTypeParams = never,
  State extends RuleTypeState = never,
  InstanceState extends AlertInstanceState = never,
  InstanceContext extends AlertInstanceContext = never,
  ActionGroupIds extends string = never,
  AlertData extends RuleAlertData = never
> {
  executionId: string;
  logger: Logger;
  params: Params;
  previousStartedAt: Date | null;
  rule: SanitizedRuleConfig;
  services: RuleExecutorServices<InstanceState, InstanceContext, ActionGroupIds, AlertData>;
  spaceId: SpaceId;
  startedAt: Date;
  startedAtOverridden: boolean;
  state: State;
  namespace?: string;
  flappingSettings: RulesSettingsFlappingProperties;
  getTimeRange: (timeWindow?: string) => GetTimeRangeResult;
  isServerless: boolean;
  ruleExecutionTimeout?: string;
  cpsData?: CpsData;
}

export interface RuleParamsAndRefs<Params extends RuleTypeParams> {
  references: SavedObjectReference[];
  params: Params;
}

export type ExecutorType<
  Params extends RuleTypeParams = never,
  State extends RuleTypeState = never,
  InstanceState extends AlertInstanceState = never,
  InstanceContext extends AlertInstanceContext = never,
  ActionGroupIds extends string = never,
  AlertData extends RuleAlertData = never
> = (
  options: RuleExecutorOptions<
    Params,
    State,
    InstanceState,
    InstanceContext,
    ActionGroupIds,
    AlertData
  >
) => Promise<{ state: State }>;

export interface RuleTypeParamsValidator<Params extends RuleTypeParams> {
  validate: (object: Partial<Params>) => Params;
  validateMutatedParams?: (mutatedOject: Params, origObject?: Params) => Params;
}

export type AlertHit = Alert & {
  _id: string;
  _index: string;
};
export interface SummarizedAlertsChunk {
  count: number;
  data: AlertHit[];
}

export type ScopedQueryAlerts = Record<string, string[]>;

export interface SummarizedAlerts {
  new: SummarizedAlertsChunk;
  ongoing: SummarizedAlertsChunk;
  recovered: SummarizedAlertsChunk;
}
export interface CombinedSummarizedAlerts extends SummarizedAlerts {
  all: SummarizedAlertsChunk;
}
export interface GetViewInAppRelativeUrlFnOpts<Params extends RuleTypeParams> {
  rule: Pick<SanitizedRule<Params>, 'id'> &
    Omit<Partial<SanitizedRule<Params>>, 'viewInAppRelativeUrl'>;
  // Optional time bounds
  start?: number;
  end?: number;
}
export type GetViewInAppRelativeUrlFn<Params extends RuleTypeParams> = (
  opts: GetViewInAppRelativeUrlFnOpts<Params>
) => string;

interface ComponentTemplateSpec {
  dynamic?: 'strict' | false; // defaults to 'strict'
  fieldMap: FieldMap;
  dynamicTemplates?: Array<Record<string, MappingDynamicTemplate>>;
}

export type FormatAlert<AlertData extends RuleAlertData> = (
  alert: Partial<AlertData>
) => Partial<AlertData>;

export const DEFAULT_AAD_CONFIG: IRuleTypeAlerts<DefaultAlert> = {
  context: `default`,
  mappings: { fieldMap: {} },
  shouldWrite: true,
};

export interface IRuleTypeAlerts<AlertData extends RuleAlertData = never> {
  /**
   * Specifies the target alerts-as-data resource
   * for this rule type. All alerts created with the same
   * context are written to the same alerts-as-data index.
   *
   * All custom mappings defined for a context must be the same!
   */
  context: string;

  /**
   * Specifies custom mappings for the target alerts-as-data
   * index. These mappings will be translated into a component template
   * and used in the index template for the index.
   */
  mappings: ComponentTemplateSpec;

  /**
   * Optional flag to opt into writing alerts as data. When not specified
   * defaults to false. We need this because we needed all previous rule
   * registry rules to register with the framework in order to install
   * Elasticsearch assets but we don't want to migrate them to using
   * the framework for writing alerts as data until all the pieces are ready
   */
  shouldWrite?: boolean;

  /**
   * Optional flag to include a reference to the ECS component template.
   */
  useEcs?: boolean;

  /**
   * Optional flag to include a reference to the legacy alert component template.
   * Any rule type that is migrating from the rule registry should set this
   * flag to true to ensure their alerts-as-data indices are backwards compatible.
   */
  useLegacyAlerts?: boolean;

  /**
   * Optional flag to indicate that resources should be space-aware. When set to
   * true, alerts-as-data resources will be created for every space where a rule
   * of this type runs.
   */
  isSpaceAware?: boolean;

  /**
   * Optional flag to indicate that these alerts should not be space aware. When set
   * to true, alerts for this rule type will be created with the `*` space id.
   */
  dangerouslyCreateAlertsInAllSpaces?: boolean;

  /**
   * Optional secondary alias to use. This alias should not include the namespace.
   */
  secondaryAlias?: string;

  /**
   * Optional function to format each alert in summarizedAlerts right after fetching them.
   */
  formatAlert?: FormatAlert<AlertData>;
}

export interface RuleType<
  Params extends RuleTypeParams = never,
  ExtractedParams extends RuleTypeParams = never,
  State extends RuleTypeState = never,
  InstanceState extends AlertInstanceState = never,
  InstanceContext extends AlertInstanceContext = never,
  ActionGroupIds extends string = never,
  RecoveryActionGroupId extends string = never,
  AlertData extends RuleAlertData = never
> {
  id: string;
  name: string;
  validate: {
    params: RuleTypeParamsValidator<Params>;
  };
  schemas?: {
    params?:
      | {
          type: 'zod';
          schema: z.ZodObject<z.ZodRawShape> | z.ZodIntersection<z.ZodTypeAny, z.ZodTypeAny>;
        }
      | {
          type: 'config-schema';
          schema: ObjectType;
        };
  };
  actionGroups: Array<ActionGroup<ActionGroupIds>>;
  defaultActionGroupId: ActionGroup<ActionGroupIds>['id'];
  recoveryActionGroup?: ActionGroup<RecoveryActionGroupId>;
  executor: ExecutorType<
    Params,
    State,
    InstanceState,
    InstanceContext,
    /**
     * Ensure that the reserved ActionGroups (such as `Recovered`) are not
     * available for scheduling in the Executor
     */
    WithoutReservedActionGroups<ActionGroupIds, RecoveryActionGroupId>,
    AlertData
  >;
  category: string;
  producer: string;
  solution: RuleTypeSolution;
  actionVariables?: {
    context?: ActionVariable[];
    state?: ActionVariable[];
    params?: ActionVariable[];
  };
  minimumLicenseRequired: LicenseType;
  useSavedObjectReferences?: {
    extractReferences: (params: Params) => RuleParamsAndRefs<ExtractedParams>;
    injectReferences: (params: ExtractedParams, references: SavedObjectReference[]) => Params;
  };
  isExportable: boolean;
  defaultScheduleInterval?: string;
  ruleTaskTimeout?: string;
  cancelAlertsOnRuleTimeout?: boolean;
  doesSetRecoveryContext?: boolean;
  /**
   * When true, the alerting framework records change history events for this
   * rule type via the registered `IChangeTrackingService`. Rule types must
   * opt in (typically gated behind a config setting) before any history is
   * tracked.
   */
  trackChanges?: boolean;
  alerts?: IRuleTypeAlerts<AlertData>;
  /**
   * Determines whether framework should
   * automatically make recovery determination. Defaults to true.
   */
  autoRecoverAlerts?: boolean;
  getViewInAppRelativeUrl?: GetViewInAppRelativeUrlFn<Params>;
  /**
   * Task priority allowing for tasks to be ran at lower priority (NormalLongRunning vs Normal), defaults to
   * normal priority.
   */
  priority?: TaskPriority.Normal | TaskPriority.NormalLongRunning;
  /**
   * Indicates that the rule type is managed internally by a Kibana plugin.
   * Alerts of internally managed rule types are not returned by the APIs and thus not shown in the alerts table.
   */
  internallyManaged?: boolean;
  /**
   * Optional function that returns the Elasticsearch query this rule type executes.
   * When provided, the query inspector API exposes the query (and optionally its response)
   * for debugging and investigation purposes.
   */
  queryInspector?: RuleQueryInspectorFn;
}
export type UntypedRuleType = RuleType<
  RuleTypeParams,
  RuleTypeState,
  AlertInstanceState,
  AlertInstanceContext
>;

export type UntypedRuleTypeAlerts = IRuleTypeAlerts<RuleAlertData>;

export interface RuleMeta extends SavedObjectAttributes {
  versionApiKeyLastmodified?: string;
}

export type PartialRule<Params extends RuleTypeParams = never> = Pick<Rule<Params>, 'id'> &
  Partial<Omit<Rule<Params>, 'id'>>;

export interface RuleWithLegacyId<Params extends RuleTypeParams = never> extends Rule<Params> {
  legacyId: string | null;
}

export type SanitizedRuleWithLegacyId<Params extends RuleTypeParams = never> = Omit<
  RuleWithLegacyId<Params>,
  'apiKey'
>;

export type PartialRuleWithLegacyId<Params extends RuleTypeParams = never> = Pick<
  RuleWithLegacyId<Params>,
  'id'
> &
  Partial<Omit<RuleWithLegacyId<Params>, 'id'>>;

export interface AlertingPlugin {
  setup: AlertingServerSetup;
  start: AlertingServerStart;
}

export interface AlertsConfigType {
  healthCheck: {
    interval: string;
  };
}

export interface AlertsConfigType {
  invalidateApiKeysTask: {
    interval: string;
    removalDelay: string;
  };
}

export interface InvalidatePendingApiKey {
  apiKeyId: string;
  createdAt: string;
}

export type RuleTypeRegistry = PublicMethodsOf<OrigruleTypeRegistry>;

export type RulesClientApi = PublicMethodsOf<RulesClient>;

export type RulesSettingsClientApi = PublicMethodsOf<RulesSettingsClient>;
export type RulesSettingsFlappingClientApi = PublicMethodsOf<RulesSettingsFlappingClient>;
export type RulesSettingsQueryDelayClientApi = PublicMethodsOf<RulesSettingsQueryDelayClient>;

export interface CpsLinkedProject {
  id: string;
  alias: string;
  type: string;
  organization: string;
}

export interface CpsData {
  resolvedExpression?: string;
  linkedProjects: CpsLinkedProject[];
}

export interface ConsumerExecutionMetrics {
  total_indexing_duration_ms: number;
  total_enrichment_duration_ms: number;
  gap_duration_s: number;
  gap_range: { lte: string; gte: string };
  matched_indices_count: number;
  alerts_candidate_count: number;
  alerts_suppressed_count: number;
  frozen_indices_queried_count: number;
  gap_reason?: GapReason;
}

export interface PublicRuleMonitoringService {
  setMetric: <MetricName extends keyof ConsumerExecutionMetrics>(
    metricName: MetricName,
    value: ConsumerExecutionMetrics[MetricName]
  ) => void;
  setMetrics: (metrics: Partial<ConsumerExecutionMetrics>) => void;
  clearGap: () => void;
}

export interface PublicLastRunSetters {
  addLastRunError: (message: string, userError?: boolean) => void;
  addLastRunWarning: (outcomeMsg: string) => void;
  setLastRunOutcomeMessage: (warning: string) => void;
}

export type PublicRuleResultService = PublicLastRunSetters;

export type {
  RawRule,
  RawRuleAction,
  RawRuleExecutionStatus,
  RawRuleAlertsFilter,
  RawRuleLastRun,
  RawRuleMonitoring,
} from './saved_objects/schemas/raw_rule';

export type { RawRuleTemplate } from './saved_objects/schemas/raw_rule_template';

export type { DataStreamAdapter } from './alerts_service/lib/data_stream_adapter';
