import type { PublicMethodsOf } from '@kbn/utility-types';
import type { Observable } from 'rxjs';
import type { UsageCollectionSetup } from '@kbn/usage-collection-plugin/server';
import type { SecurityPluginSetup, SecurityPluginStart } from '@kbn/security-plugin/server';
import type { PluginSetup as DataPluginSetup } from '@kbn/data-plugin/server';
import type { PluginStart as DataViewsPluginStart } from '@kbn/data-views-plugin/server';
import type { EncryptedSavedObjectsPluginSetup, EncryptedSavedObjectsPluginStart } from '@kbn/encrypted-saved-objects-plugin/server';
import type { TaskManagerSetupContract, TaskManagerStartContract } from '@kbn/task-manager-plugin/server';
import type { SpacesPluginStart } from '@kbn/spaces-plugin/server';
import type { KibanaRequest, PluginInitializerContext, CoreSetup, CoreStart, StatusServiceSetup, CoreStatus } from '@kbn/core/server';
import type { LicensingPluginSetup, LicensingPluginStart } from '@kbn/licensing-plugin/server';
import type { PluginSetupContract as ActionsPluginSetupContract, PluginStartContract as ActionsPluginStartContract } from '@kbn/actions-plugin/server';
import type { IEventLogService, IEventLogClientService } from '@kbn/event-log-plugin/server';
import type { FeaturesPluginStart, FeaturesPluginSetup } from '@kbn/features-plugin/server';
import type { PluginSetup as KQLPluginSetup } from '@kbn/kql/server';
import type { PluginStart as DataPluginStart } from '@kbn/data-plugin/server';
import type { MonitoringCollectionSetup } from '@kbn/monitoring-collection-plugin/server';
import type { SharePluginStart } from '@kbn/share-plugin/server';
import type { MaintenanceWindowsServerStart } from '@kbn/maintenance-windows-plugin/server';
import type { CloudSetup } from '@kbn/cloud-plugin/server';
import { RuleTypeRegistry } from './rule_type_registry';
import type { RulesClientCreateOptions } from './rules_client_factory';
import type { RuleAlertData } from './types';
import type { AlertInstanceContext, AlertInstanceState, AlertsHealth, RuleType, RuleTypeParams, RuleTypeState, RulesClientApi } from './types';
import type { AlertingRulesConfig } from './config';
import type { AlertingAuthorization } from './authorization';
import type { SecurityHealth } from './lib/get_security_health';
import { type PublicFrameworkAlertsService } from './alerts_service';
import type { ConnectorAdapter, ConnectorAdapterParams } from './connector_adapters/types';
import type { DataStreamAdapter } from './alerts_service/lib/data_stream_adapter';
import type { GetAlertIndicesAlias } from './lib';
export declare const EVENT_LOG_PROVIDER = "alerting";
export declare const EVENT_LOG_ACTIONS: {
    execute: string;
    executeStart: string;
    executeAction: string;
    executeBackfill: string;
    newInstance: string;
    recoveredInstance: string;
    activeInstance: string;
    executeTimeout: string;
    untrackedInstance: string;
    gap: string;
    deleteAlerts: string;
    gapAutoFillSchedule: string;
};
export declare const LEGACY_EVENT_LOG_ACTIONS: {
    resolvedInstance: string;
};
export interface AlertingServerSetup {
    registerConnectorAdapter<RuleActionParams extends ConnectorAdapterParams = ConnectorAdapterParams, ConnectorParams extends ConnectorAdapterParams = ConnectorAdapterParams>(adapter: ConnectorAdapter<RuleActionParams, ConnectorParams>): void;
    registerType<Params extends RuleTypeParams = RuleTypeParams, ExtractedParams extends RuleTypeParams = RuleTypeParams, State extends RuleTypeState = RuleTypeState, InstanceState extends AlertInstanceState = AlertInstanceState, InstanceContext extends AlertInstanceContext = AlertInstanceContext, ActionGroupIds extends string = never, RecoveryActionGroupId extends string = never, AlertData extends RuleAlertData = never>(ruleType: RuleType<Params, ExtractedParams, State, InstanceState, InstanceContext, ActionGroupIds, RecoveryActionGroupId, AlertData>): void;
    getSecurityHealth: () => Promise<SecurityHealth>;
    getConfig: () => AlertingRulesConfig;
    frameworkAlerts: PublicFrameworkAlertsService;
    getDataStreamAdapter: () => DataStreamAdapter;
}
export interface AlertingServerStart {
    listTypes: RuleTypeRegistry['list'];
    getAllTypes: RuleTypeRegistry['getAllTypes'];
    getType: RuleTypeRegistry['get'];
    getAlertIndicesAlias: GetAlertIndicesAlias;
    getRulesClientWithRequest(request: KibanaRequest, options?: RulesClientCreateOptions): Promise<RulesClientApi>;
    /**
     * Creates a RulesClient that is bound to the provided spaceId (namespace) while preserving
     * the original request (and its auth context).
     */
    getRulesClientWithRequestInSpace(request: KibanaRequest, spaceId: string, options?: RulesClientCreateOptions): Promise<RulesClientApi>;
    getAlertingAuthorizationWithRequest(request: KibanaRequest): Promise<PublicMethodsOf<AlertingAuthorization>>;
    getFrameworkHealth: () => Promise<AlertsHealth>;
}
export interface AlertingPluginsSetup {
    security?: SecurityPluginSetup;
    taskManager: TaskManagerSetupContract;
    actions: ActionsPluginSetupContract;
    encryptedSavedObjects: EncryptedSavedObjectsPluginSetup;
    licensing: LicensingPluginSetup;
    usageCollection?: UsageCollectionSetup;
    eventLog: IEventLogService;
    statusService: StatusServiceSetup;
    monitoringCollection: MonitoringCollectionSetup;
    data: DataPluginSetup;
    features: FeaturesPluginSetup;
    kql: KQLPluginSetup;
    cloud?: CloudSetup;
}
export interface AlertingPluginsStart {
    actions: ActionsPluginStartContract;
    taskManager: TaskManagerStartContract;
    encryptedSavedObjects: EncryptedSavedObjectsPluginStart;
    features: FeaturesPluginStart;
    eventLog: IEventLogClientService;
    licensing: LicensingPluginStart;
    spaces?: SpacesPluginStart;
    security?: SecurityPluginStart;
    data: DataPluginStart;
    dataViews: DataViewsPluginStart;
    share: SharePluginStart;
    maintenanceWindows?: MaintenanceWindowsServerStart;
}
export declare class AlertingPlugin {
    private readonly config;
    private readonly logger;
    private ruleTypeRegistry?;
    private readonly taskRunnerFactory;
    private licenseState;
    private isESOCanEncrypt?;
    private security?;
    private readonly rulesClientFactory;
    private readonly alertingAuthorizationClientFactory;
    private readonly rulesSettingsClientFactory;
    private readonly telemetryLogger;
    private readonly kibanaVersion;
    private eventLogService?;
    private eventLogger?;
    private kibanaBaseUrl;
    private usageCounter;
    private inMemoryMetrics;
    private alertsService;
    private pluginStop$;
    private dataStreamAdapter?;
    private backfillClient?;
    private alertDeletionClient?;
    private readonly isServerless;
    private nodeRoles;
    private readonly connectorAdapterRegistry;
    private readonly disabledRuleTypes;
    private readonly enabledRuleTypes;
    private getRulesClientWithRequest?;
    private changeTrackingService?;
    private uiamApiKeyProvisioningTask?;
    private clearStaleUiamApiKeysTask?;
    constructor(initializerContext: PluginInitializerContext);
    setup(core: CoreSetup<AlertingPluginsStart, unknown>, plugins: AlertingPluginsSetup): AlertingServerSetup;
    start(core: CoreStart, plugins: AlertingPluginsStart): AlertingServerStart;
    private getShouldGrantUiam;
    private createRouteHandlerContext;
    stop(): void;
}
export declare function getElasticsearchAndSOAvailability(core$: Observable<CoreStatus>): Observable<boolean>;
