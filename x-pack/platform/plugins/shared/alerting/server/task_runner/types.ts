/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  Logger,
  KibanaRequest,
  ExecutionContextStart,
  SavedObjectsServiceStart,
  ElasticsearchServiceStart,
  UiSettingsServiceStart,
} from '@kbn/core/server';
import type { ConcreteTaskInstance, DecoratedError } from '@kbn/task-manager-plugin/server';
import type { PublicMethodsOf } from '@kbn/utility-types';
import type { AuditServiceSetup } from '@kbn/security-plugin-types-server';
import type { PluginStartContract as ActionsPluginStartContract } from '@kbn/actions-plugin/server';
import type { ActionsClient } from '@kbn/actions-plugin/server/actions_client';
import type { PluginStart as DataPluginStart } from '@kbn/data-plugin/server';
import type { PluginStart as DataViewsPluginStart } from '@kbn/data-views-plugin/server';
import type { EncryptedSavedObjectsClient } from '@kbn/encrypted-saved-objects-plugin/server';
import type { IEventLogClient, IEventLogger } from '@kbn/event-log-plugin/server';
import type { SharePluginStart } from '@kbn/share-plugin/server';
import type { UsageCounter } from '@kbn/usage-collection-plugin/server';
import type { IKibanaSearchRequest, IKibanaSearchResponse } from '@kbn/search-types';
import type { IAsyncSearchOptions } from '@kbn/data-plugin/common';
import type { IAlertsClient } from '../alerts_client/types';
import type { Alert } from '../alert';
import type { AlertsService } from '../alerts_service/alerts_service';
import type {
  AlertInstanceContext,
  AlertInstanceState,
  RuleTypeParams,
  IntervalSchedule,
  RuleTaskState,
  SanitizedRule,
  RuleTypeState,
  RuleAction,
  RuleAlertData,
  RuleSystemAction,
  RulesSettingsFlappingProperties,
} from '../../common';
import type { ActionsConfigMap } from '../lib/get_actions_config_map';
import type { NormalizedRuleType } from '../rule_type_registry';
import type {
  AsyncSearchParams,
  CombinedSummarizedAlerts,
  RawRule,
  RuleTypeRegistry,
  SpaceIdToNamespaceFunction,
} from '../types';
import type { RuleRunMetrics, RuleRunMetricsStore } from '../lib/rule_run_metrics_store';
import type { AlertingEventLogger } from '../lib/alerting_event_logger/alerting_event_logger';
import type { BackfillClient } from '../backfill_client/backfill_client';
import type { ElasticsearchError } from '../lib';
import type { ConnectorAdapterRegistry } from '../connector_adapters/connector_adapter_registry';
import type { RulesSettingsService } from '../rules_settings';
import type { MaintenanceWindowsService } from './maintenance_windows';
import type { RawRuleSnoozedInstance } from '../saved_objects/schemas/raw_rule';

export interface RuleTaskRunResult {
  state: RuleTaskState;
  schedule: IntervalSchedule | undefined;
  taskRunError?: DecoratedError;
  shouldDeleteTask?: boolean;
  shouldDisableTask?: boolean;
}

export const getDeleteRuleTaskRunResult = (): RuleTaskRunResult => ({
  state: {},
  schedule: undefined,
  shouldDeleteTask: true,
});

// This is the state of the alerting task after rule execution, which includes run metrics plus the task state
export interface RunRuleResult {
  metrics: RuleRunMetrics;
  state: RuleTaskState;
  /**
   * Per-alert snooze entries that expired (TTL or condition met) during this run,
   * as (instanceId, snoozedAt) pairs for identity-aware atomic removal.
   */
  expiredSnoozedInstances?: Array<{ instanceId: string; snoozedAt: string }>;
  /**
   * Audit context for `alert_auto_unsnooze`
   */
  autoUnsnoozeAudit?: {
    expired: RawRuleSnoozedInstance[];
    conditionExpired: RawRuleSnoozedInstance[];
    ruleName: string;
  };
}

export interface RunRuleParams<Params extends RuleTypeParams> {
  /**
   * Resolved credential the rule run executes under, ready to use after
   * `ApiKey ` in an `Authorization` header. For ES rules this is the
   * base64-encoded `id:secret` stored on the rule SO as `apiKey`; for UIAM
   * rules it is the decoded raw `essu_…` UIAM secret. Computed once by
   * `validateRuleAndCreateFakeRequest` so the rest of the rule run never has
   * to look at the raw `apiKey`/`uiamApiKey` fields again.
   */
  effectiveApiKey: string | null;
  fakeRequest: KibanaRequest;
  rule: SanitizedRule<Params> & { snoozedInstances: RawRuleSnoozedInstance[] };
  validatedParams: Params;
  version: string | undefined;
}

export interface RuleTaskInstance extends ConcreteTaskInstance {
  state: RuleTaskState;
}

// ActionScheduler
export interface ActionSchedulerOptions<
  Params extends RuleTypeParams,
  ExtractedParams extends RuleTypeParams,
  RuleState extends RuleTypeState,
  State extends AlertInstanceState,
  Context extends AlertInstanceContext,
  ActionGroupIds extends string,
  RecoveryActionGroupId extends string,
  AlertData extends RuleAlertData
> {
  ruleType: NormalizedRuleType<
    Params,
    ExtractedParams,
    RuleState,
    State,
    Context,
    ActionGroupIds,
    RecoveryActionGroupId,
    AlertData
  >;
  logger: Logger;
  alertingEventLogger: PublicMethodsOf<AlertingEventLogger>;
  rule: SanitizedRule<Params>;
  taskRunnerContext: TaskRunnerContext;
  taskInstance: RuleTaskInstance;
  ruleRunMetricsStore: RuleRunMetricsStore;
  apiKey: RawRule['apiKey'];
  ruleConsumer: string;
  executionId: string;
  ruleLabel: string;
  previousStartedAt: Date | null;
  actionsClient: PublicMethodsOf<ActionsClient>;
  alertsClient: IAlertsClient<AlertData, State, Context, ActionGroupIds, RecoveryActionGroupId>;
}

export type Executable<
  State extends AlertInstanceState,
  Context extends AlertInstanceContext,
  ActionGroupIds extends string,
  RecoveryActionGroupId extends string
> = {
  action: RuleAction | RuleSystemAction;
} & (
  | {
      alert: Alert<State, Context, ActionGroupIds | RecoveryActionGroupId>;
      summarizedAlerts?: never;
    }
  | {
      alert?: never;
      summarizedAlerts: CombinedSummarizedAlerts;
    }
);

export interface RuleTypeRunnerContext {
  alertingEventLogger: AlertingEventLogger;
  flappingSettings?: RulesSettingsFlappingProperties;
  logger: Logger;
  maintenanceWindowsService?: MaintenanceWindowsService;
  namespace?: string;
  queryDelaySec?: number;
  request: KibanaRequest;
  ruleId: string;
  ruleLogPrefix: string;
  ruleRunMetricsStore: RuleRunMetricsStore;
  spaceId: string;
  isServerless: boolean;
  shouldGrantUiam?: boolean;
}

export interface RuleRunnerErrorStackTraceLog {
  message: ElasticsearchError;
  stackTrace?: string;
}

export enum ApiKeyType {
  ES = 'es',
  UIAM = 'uiam',
}

export interface TaskRunnerContext {
  actionsConfigMap: ActionsConfigMap;
  actionsPlugin: ActionsPluginStartContract;
  alertsService: AlertsService | null;
  auditService?: AuditServiceSetup;
  backfillClient: BackfillClient;
  cancelAlertsOnRuleTimeout: boolean;
  connectorAdapterRegistry: ConnectorAdapterRegistry;
  data: DataPluginStart;
  dataViews: DataViewsPluginStart;
  elasticsearch: ElasticsearchServiceStart;
  encryptedSavedObjectsClient: EncryptedSavedObjectsClient;
  eventLogger: IEventLogger;
  executionContext: ExecutionContextStart;
  kibanaBaseUrl: string | undefined;
  logger: Logger;
  maintenanceWindowsService: MaintenanceWindowsService;
  maxAlerts: number;
  ruleTypeRegistry: RuleTypeRegistry;
  rulesSettingsService: RulesSettingsService;
  apiKeyType: ApiKeyType;
  savedObjects: SavedObjectsServiceStart;
  share: SharePluginStart;
  spaceIdToNamespace: SpaceIdToNamespaceFunction;
  uiSettings: UiSettingsServiceStart;
  usageCounter?: UsageCounter;
  getEventLogClient: (request: KibanaRequest) => IEventLogClient;
  isServerless: boolean;
  shouldGrantUiam?: boolean;
}

export interface AsyncSearchClient<T extends AsyncSearchParams> {
  getMetrics: () => {
    numSearches: number;
    esSearchDurationMs: number;
    totalSearchDurationMs: number;
  };
  search: ({
    request,
    options,
  }: {
    request: IKibanaSearchRequest<T>;
    options?: IAsyncSearchOptions;
  }) => Promise<IKibanaSearchResponse['rawResponse']>;
}

export type PublicAsyncSearchClient<T extends AsyncSearchParams> = Omit<
  AsyncSearchClient<T>,
  'getMetrics'
>;
