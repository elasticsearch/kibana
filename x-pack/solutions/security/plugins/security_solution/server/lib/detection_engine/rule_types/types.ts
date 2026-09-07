/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Moment } from 'moment';

import type { Logger } from '@kbn/logging';
import type { ExceptionListItemSchema } from '@kbn/securitysolution-io-ts-list-types';
import type { estypes } from '@elastic/elasticsearch';
import type { SuppressionFieldsLatest } from '@kbn/rule-registry-plugin/common/schemas';
import type { AnalyticsServiceSetup } from '@kbn/core-analytics-server';

import type { QUERY_RULE_TYPE_ID, SAVED_QUERY_RULE_TYPE_ID } from '@kbn/securitysolution-rules';

import type {
  RuleExecutorOptions,
  RuleType,
  RuleTypeState,
  AlertInstanceState,
  AlertInstanceContext,
  RuleExecutorServices,
} from '@kbn/alerting-plugin/server';
import type { WithoutReservedActionGroups } from '@kbn/alerting-plugin/common';
import type { ListClient } from '@kbn/lists-plugin/server';
import type { PersistenceServices, IRuleDataClient } from '@kbn/rule-registry-plugin/server';
import type { EcsFieldMap } from '@kbn/rule-registry-plugin/common/assets/field_maps/ecs_field_map';
import type { TypeOfFieldMap } from '@kbn/rule-registry-plugin/common/field_map';
import type { Filter } from '@kbn/es-query';

import type { LicensingPluginSetup } from '@kbn/licensing-plugin/server';
import type { DocLinksServiceSetup, KibanaRequest } from '@kbn/core/server';
import type { EntityStoreStartContract, EntityStoreCRUDClient } from '@kbn/entity-store/server';
import type { DetectionRulesAuthz } from '../../../../common/detection_engine/rule_management/authz';
import type { EndpointAppContextService } from '../../../endpoint/endpoint_app_context_services';
import type { CheckOsqueryResponseActionAuthz } from '../../../endpoint/services/actions/utils/rule_response_actions_validators';
import type { RulePreviewLoggedRequest } from '../../../../common/api/detection_engine/rule_preview/rule_preview.gen';
import type { RuleResponseAction } from '../../../../common/api/detection_engine/model/rule_response_actions';
import type { ConfigType } from '../../../config';
import type { SetupPlugins } from '../../../plugin';
import type { CompleteRule, RuleParams } from '../rule_schema';
import type { ExperimentalFeatures } from '../../../../common/experimental_features';
import type { ITelemetryEventsSender } from '../../telemetry/sender';
import type { IRuleExecutionLogForExecutors, IRuleMonitoringService } from '../rule_monitoring';
import type { RefreshTypes } from '../types';

import type { Status } from '../../../../common/api/detection_engine';
import type { BaseHit, SearchTypes } from '../../../../common/detection_engine/types';
import type { BuildReasonMessage } from './utils/reason_formatters';
import type {
  DetectionAlertLatest,
  DetectionAlert800,
  WrappedAlert,
} from '../../../../common/api/detection_engine/model/alerts';
import type {
  RuleAction,
  RuleResponse,
} from '../../../../common/api/detection_engine/model/rule_schema';
import type { ThresholdResult } from './threshold/types';
import type { ScheduleNotificationResponseActionsService } from '../rule_response_actions/schedule_notification_response_actions';

export interface SecurityAlertTypeReturnValue<TState extends RuleTypeState> {
  bulkCreateTimes: string[];
  enrichmentTimes: string[];
  createdSignalsCount: number;
  createdSignals: unknown[];
  errors: string[];
  userError?: boolean;
  searchAfterTimes: string[];
  state: TState;
  success: boolean;
  warning: boolean;
  warningMessages: string[];
  alertsCandidateCount?: number;
  suppressedAlertsCount?: number;
  totalEventsFound?: number;
  loggedRequests?: RulePreviewLoggedRequest[];
}

export interface SecuritySharedParams<TParams extends RuleParams = RuleParams> {
  completeRule: CompleteRule<TParams>;
  tuple: {
    to: Moment;
    from: Moment;
    maxSignals: number;
  };
  ruleExecutionLogger: IRuleExecutionLogForExecutors;
  listClient: ListClient;
  searchAfterSize: number;
  ruleDataClient: IRuleDataClient;
  inputIndex: string[];
  runtimeMappings: estypes.MappingRuntimeFields | undefined;
  mergeStrategy: ConfigType['alertMergeStrategy'];
  primaryTimestamp: string;
  secondaryTimestamp?: string;
  aggregatableTimestampField: string;
  unprocessedExceptions: ExceptionListItemSchema[];
  exceptionFilter: Filter | undefined;
  alertTimestampOverride: Date | undefined;
  refreshOnIndexingAlerts: RefreshTypes;
  publicBaseUrl: string | undefined;
  experimentalFeatures: ExperimentalFeatures;
  intendedTimestamp: Date | undefined;
  spaceId: string;
  entityStoreCrudClient?: EntityStoreCRUDClient;
  ignoreFields: Record<string, boolean>;
  ignoreFieldsRegexes: string[];
  eventsTelemetry: ITelemetryEventsSender | undefined;
  licensing: LicensingPluginSetup;
  scheduleNotificationResponseActionsService: ScheduleNotificationResponseActionsService;
}

type SecurityActionGroupId = 'default';

export type SecurityExecutorOptions<
  TParams extends RuleParams,
  TState extends RuleTypeState
> = RuleExecutorOptions<
  TParams,
  TState,
  AlertInstanceState,
  AlertInstanceContext,
  WithoutReservedActionGroups<SecurityActionGroupId, never>
> & {
  services: PersistenceServices;
  sharedParams: SecuritySharedParams<TParams>;
};

export type SecurityAlertType<TParams extends RuleParams, TState extends RuleTypeState> = Omit<
  RuleType<
    TParams,
    TParams,
    TState,
    AlertInstanceState,
    AlertInstanceContext,
    SecurityActionGroupId
  >,
  'executor'
> & {
  executor: (options: SecurityExecutorOptions<TParams, TState>) => Promise<
    SearchAfterAndBulkCreateReturnType & {
      state: TState;
      loggedRequests?: RulePreviewLoggedRequest[];
    }
  >;
};

export interface CreateSecurityRuleTypeWrapperProps {
  lists: SetupPlugins['lists'];
  actions: SetupPlugins['actions'];
  docLinks: DocLinksServiceSetup;
  logger: Logger;
  config: ConfigType;
  publicBaseUrl: string | undefined;
  ruleDataClient: IRuleDataClient;
  ruleExecutionLoggerFactory: IRuleMonitoringService['createRuleExecutionLogClientForExecutors'];
  version: string;
  isPreview?: boolean;
  isServerless?: boolean;
  experimentalFeatures: ExperimentalFeatures;
  alerting: SetupPlugins['alerting'];
  analytics?: AnalyticsServiceSetup;
  eventsTelemetry: ITelemetryEventsSender | undefined;
  licensing: LicensingPluginSetup;
  scheduleNotificationResponseActionsService: ScheduleNotificationResponseActionsService;
  endpointAppContextService: EndpointAppContextService;
  getEntityStore: () => Promise<EntityStoreStartContract>;
  getRulesAuthz: (request: KibanaRequest) => Promise<DetectionRulesAuthz>;
  /**
   * Returns a request-scoped osquery response action authorization checker, used
   * when authorizing rule `responseActions` on write paths. Optional because
   * osquery may be unavailable.
   */
  getOsqueryResponseActionsAuthzChecker?: (
    request: KibanaRequest
  ) => CheckOsqueryResponseActionAuthz;
}

export type CreateSecurityRuleTypeWrapper = (
  options: CreateSecurityRuleTypeWrapperProps
) => <TParams extends RuleParams, TState extends RuleTypeState>(
  type: SecurityAlertType<TParams, TState>
) => RuleType<TParams, TParams, TState, AlertInstanceState, AlertInstanceContext, 'default'>;

export interface ScheduleNotificationActions {
  signals: unknown[];
  signalsCount: number;
  responseActions: RuleResponseAction[] | undefined;
}

export interface CreateQueryRuleOptions {
  id: typeof QUERY_RULE_TYPE_ID | typeof SAVED_QUERY_RULE_TYPE_ID;
  name: 'Custom Query Rule' | 'Saved Query Rule';
}

export interface RuleRangeTuple {
  to: moment.Moment;
  from: moment.Moment;
  maxSignals: number;
}

/**
 * SignalSource is being used as both a type for documents that match detection engine queries as well as
 * for queries that could be on top of signals. In cases where it is matched against detection engine queries,
 * '@timestamp' might not be there since it is not required and we have timestamp override capabilities. Also
 * the signal addition object, "signal?: {" will not be there unless it's a conflicting field when we are running
 * queries on events.
 *
 * For cases where we are running queries against signals (signals on signals) "@timestamp" should always be there
 * and the "signal?: {" sub-object should always be there.
 */
export interface SignalSource {
  [key: string]: SearchTypes;

  '@timestamp'?: string;
  signal?: {
    /**
     * "parent" is deprecated: new signals should populate "parents" instead. Both are optional
     * until all signals with parent are gone and we can safely remove it.
     * @deprecated Use parents instead
     */
    parent?: Ancestor;
    parents?: Ancestor[];
    ancestors: Ancestor[];
    group?: {
      id: string;
      index?: number;
    };
    rule: {
      id: string;
      description?: string;
      false_positives?: string[];
      immutable?: boolean;
    };
    /** signal.depth was introduced in 7.10 and pre-7.10 signals do not have it. */
    depth?: number;
    original_time?: string;
    /** signal.reason was introduced in 7.15 and pre-7.15 signals do not have it. */
    reason?: string;
    status?: string;
    threshold_result?: ThresholdResult;
  };
  kibana?: SearchTypes;
}

export type EventHit = Exclude<TypeOfFieldMap<EcsFieldMap>, '@timestamp'> & {
  '@timestamp': string;
  [key: string]: SearchTypes;
};
export type WrappedEventHit = BaseHit<EventHit>;

export type SignalSearchResponse<
  TAggregations = Record<estypes.AggregateName, estypes.AggregationsAggregate>
> = estypes.SearchResponse<SignalSource, TAggregations>;
export type SignalSourceHit = estypes.SearchHit<SignalSource>;
export type AlertSourceHit = estypes.SearchHit<DetectionAlert800>;
export type WrappedSignalHit = BaseHit<SignalHit>;
export type BaseSignalHit = estypes.SearchHit<SignalSource>;

export interface Ancestor {
  rule?: string;
  id: string;
  type: string;
  index: string;
  depth: number;
}

export interface Signal {
  _meta?: {
    version: number;
  };
  rule: RuleResponse;
  /**
   * @deprecated Use "parents" instead of "parent"
   */
  parent?: Ancestor;
  parents: Ancestor[];
  ancestors: Ancestor[];
  group?: {
    id: string;
    index?: number;
  };
  original_time?: string;
  original_event?: SearchTypes;
  reason?: string;
  status: Status;
  threshold_result?: ThresholdResult;
  original_signal?: SearchTypes;
  depth: number;
}

export interface SignalHit {
  '@timestamp': string;
  event: object;
  signal: Signal;

  [key: string]: SearchTypes;
}

export interface AlertAttributes<T extends RuleParams = RuleParams> {
  actions: RuleAction[];
  alertTypeId: string;
  enabled: boolean;
  name: string;
  tags: string[];
  createdBy: string;
  createdAt: string;
  updatedBy: string;
  schedule: {
    interval: string;
  };
  throttle: string;
  params: T;
}

export type SignalsEnrichment = (signals: SignalSourceHit[]) => Promise<SignalSourceHit[]>;

export type SimpleHit = BaseHit<{ '@timestamp'?: string }>;

export type WrapSuppressedHits = (
  hits: Array<estypes.SearchHit<SignalSource>>,
  buildReasonMessage: BuildReasonMessage
) => Array<WrappedAlert<DetectionAlertLatest & SuppressionFieldsLatest>>;

export type SecurityRuleServices = RuleExecutorServices<
  AlertInstanceState,
  AlertInstanceContext,
  'default'
> &
  PersistenceServices;

export interface SearchAfterAndBulkCreateParams {
  sharedParams: SecuritySharedParams;
  services: SecurityRuleServices;
  eventsTelemetry: ITelemetryEventsSender | undefined;
  filter: estypes.QueryDslQueryContainer;
  buildReasonMessage: BuildReasonMessage;
  enrichment?: SignalsEnrichment;
  trackTotalHits?: boolean;
  sortOrder?: estypes.SortOrder;
  additionalFilters?: estypes.QueryDslQueryContainer[];
  isLoggedRequestsEnabled?: boolean;
  /**
   * If defined, will override the value of max_signals found in sharedParams.tuple
   */
  maxSignalsOverride?: number;
}

export interface SearchAfterAndBulkCreateReturnType {
  success: boolean;
  warning: boolean;
  searchAfterTimes: string[];
  enrichmentTimes: string[];
  bulkCreateTimes: string[];
  /**
   * The number of detected alerts. Suppression hasn't been applied yet.
   */
  alertsCandidateCount?: number;
  suppressedAlertsCount?: number;
  createdSignalsCount: number;
  createdSignals: unknown[];
  errors: string[];
  userError?: boolean;
  warningMessages: string[];
  totalEventsFound?: number;
  loggedRequests?: RulePreviewLoggedRequest[];
}

export interface LoggedRequestsConfig {
  type: string;
  description: string;
  skipRequestQuery?: boolean;
}

// the new fields can be added later if needed
export interface OverrideBodyQuery {
  _source?: estypes.SearchSourceConfig;
  fields?: Array<estypes.QueryDslFieldAndFormat | estypes.Field>;
}
