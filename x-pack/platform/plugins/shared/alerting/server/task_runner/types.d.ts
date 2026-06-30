import type { Logger, KibanaRequest, ExecutionContextStart, SavedObjectsServiceStart, ElasticsearchServiceStart, UiSettingsServiceStart } from '@kbn/core/server';
import type { ConcreteTaskInstance, DecoratedError } from '@kbn/task-manager-plugin/server';
import type { PublicMethodsOf } from '@kbn/utility-types';
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
import type { AlertInstanceContext, AlertInstanceState, RuleTypeParams, IntervalSchedule, RuleTaskState, SanitizedRule, RuleTypeState, RuleAction, RuleAlertData, RuleSystemAction, RulesSettingsFlappingProperties } from '../../common';
import type { ActionsConfigMap } from '../lib/get_actions_config_map';
import type { NormalizedRuleType } from '../rule_type_registry';
import type { AsyncSearchParams, CombinedSummarizedAlerts, RawRule, RuleTypeRegistry, SpaceIdToNamespaceFunction } from '../types';
import type { RuleRunMetrics, RuleRunMetricsStore } from '../lib/rule_run_metrics_store';
import type { AlertingEventLogger } from '../lib/alerting_event_logger/alerting_event_logger';
import type { BackfillClient } from '../backfill_client/backfill_client';
import type { ElasticsearchError } from '../lib';
import type { ConnectorAdapterRegistry } from '../connector_adapters/connector_adapter_registry';
import type { RulesSettingsService } from '../rules_settings';
import type { MaintenanceWindowsService } from './maintenance_windows';
export interface RuleTaskRunResult {
    state: RuleTaskState;
    schedule: IntervalSchedule | undefined;
    taskRunError?: DecoratedError;
    shouldDeleteTask?: boolean;
    shouldDisableTask?: boolean;
}
export declare const getDeleteRuleTaskRunResult: () => RuleTaskRunResult;
export interface RunRuleResult {
    metrics: RuleRunMetrics;
    state: RuleTaskState;
}
export interface RunRuleParams<Params extends RuleTypeParams> {
    apiKey: RawRule['apiKey'];
    uiamApiKey?: RawRule['uiamApiKey'];
    fakeRequest: KibanaRequest;
    rule: SanitizedRule<Params>;
    validatedParams: Params;
    version: string | undefined;
}
export interface RuleTaskInstance extends ConcreteTaskInstance {
    state: RuleTaskState;
}
export interface ActionSchedulerOptions<Params extends RuleTypeParams, ExtractedParams extends RuleTypeParams, RuleState extends RuleTypeState, State extends AlertInstanceState, Context extends AlertInstanceContext, ActionGroupIds extends string, RecoveryActionGroupId extends string, AlertData extends RuleAlertData> {
    ruleType: NormalizedRuleType<Params, ExtractedParams, RuleState, State, Context, ActionGroupIds, RecoveryActionGroupId, AlertData>;
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
export type Executable<State extends AlertInstanceState, Context extends AlertInstanceContext, ActionGroupIds extends string, RecoveryActionGroupId extends string> = {
    action: RuleAction | RuleSystemAction;
} & ({
    alert: Alert<State, Context, ActionGroupIds | RecoveryActionGroupId>;
    summarizedAlerts?: never;
} | {
    alert?: never;
    summarizedAlerts: CombinedSummarizedAlerts;
});
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
export declare enum ApiKeyType {
    ES = "es",
    UIAM = "uiam"
}
export interface TaskRunnerContext {
    actionsConfigMap: ActionsConfigMap;
    actionsPlugin: ActionsPluginStartContract;
    alertsService: AlertsService | null;
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
    search: ({ request, options, }: {
        request: IKibanaSearchRequest<T>;
        options?: IAsyncSearchOptions;
    }) => Promise<IKibanaSearchResponse['rawResponse']>;
}
export type PublicAsyncSearchClient<T extends AsyncSearchParams> = Omit<AsyncSearchClient<T>, 'getMetrics'>;
