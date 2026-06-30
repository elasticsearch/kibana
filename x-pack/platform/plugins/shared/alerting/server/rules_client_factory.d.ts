import type { KibanaRequest, Logger, SavedObjectsServiceStart, PluginInitializerContext, ISavedObjectsRepository, CoreStart } from '@kbn/core/server';
import type { PluginStartContract as ActionsPluginStartContract } from '@kbn/actions-plugin/server';
import type { SecurityPluginSetup, SecurityPluginStart } from '@kbn/security-plugin/server';
import type { EncryptedSavedObjectsClient } from '@kbn/encrypted-saved-objects-plugin/server';
import type { TaskManagerStartContract } from '@kbn/task-manager-plugin/server';
import type { IEventLogClientService, IEventLogger } from '@kbn/event-log-plugin/server';
import type { RuleTypeRegistry, SpaceIdToNamespaceFunction } from './types';
import { RulesClient } from './rules_client';
import type { AlertingAuthorizationClientFactory } from './alerting_authorization_client_factory';
import type { AlertingRulesConfig } from './config';
import type { GetAlertIndicesAlias } from './lib';
import type { AlertsService } from './alerts_service/alerts_service';
import type { BackfillClient } from './backfill_client/backfill_client';
import type { ConnectorAdapterRegistry } from './connector_adapters/connector_adapter_registry';
import { type IChangeTrackingService } from './rules_client/lib/change_tracking';
export interface RulesClientCreateOptions {
    /**
     * When true, clone the request's API key for each newly created rule.
     * The cloned key is independent, non-expiring, and managed by alerting
     * (invalidated on rule delete/update). Only applies to rule creation.
     */
    cloneApiKeysOnCreate?: boolean;
}
export interface RulesClientFactoryOpts {
    logger: Logger;
    taskManager: TaskManagerStartContract;
    ruleTypeRegistry: RuleTypeRegistry;
    securityPluginSetup?: SecurityPluginSetup;
    securityPluginStart?: SecurityPluginStart;
    getSpaceId: (request: KibanaRequest) => string;
    spaceIdToNamespace: SpaceIdToNamespaceFunction;
    encryptedSavedObjectsClient: EncryptedSavedObjectsClient;
    internalSavedObjectsRepository: ISavedObjectsRepository;
    actions: ActionsPluginStartContract;
    eventLog: IEventLogClientService;
    changeTrackingService?: IChangeTrackingService;
    kibanaVersion: PluginInitializerContext['env']['packageInfo']['version'];
    authorization: AlertingAuthorizationClientFactory;
    eventLogger?: IEventLogger;
    minimumScheduleInterval: AlertingRulesConfig['minimumScheduleInterval'];
    maxScheduledPerMinute: AlertingRulesConfig['maxScheduledPerMinute'];
    getAlertIndicesAlias: GetAlertIndicesAlias;
    alertsService: AlertsService | null;
    backfillClient: BackfillClient;
    connectorAdapterRegistry: ConnectorAdapterRegistry;
    uiSettings: CoreStart['uiSettings'];
    securityService: CoreStart['security'];
    shouldGrantUiam: boolean;
    isServerless: boolean;
    featureFlags: CoreStart['featureFlags'];
}
export declare class RulesClientFactory {
    private isInitialized;
    private logger;
    private taskManager;
    private ruleTypeRegistry;
    private securityPluginSetup?;
    private securityPluginStart?;
    private getSpaceId;
    private spaceIdToNamespace;
    private encryptedSavedObjectsClient;
    private internalSavedObjectsRepository;
    private actions;
    private eventLog;
    private changeTrackingService?;
    private kibanaVersion;
    private authorization;
    private eventLogger?;
    private minimumScheduleInterval;
    private maxScheduledPerMinute;
    private getAlertIndicesAlias;
    private alertsService;
    private backfillClient;
    private connectorAdapterRegistry;
    private uiSettings;
    private securityService;
    private shouldGrantUiam;
    private isServerless;
    private featureFlags;
    initialize(options: RulesClientFactoryOpts): void;
    /**
     * Creates a RulesClient bound to the space derived from the provided request (default behavior).
     */
    create(request: KibanaRequest, savedObjects: SavedObjectsServiceStart, options?: RulesClientCreateOptions): Promise<RulesClient>;
    /**
     * Creates a RulesClient bound to an explicit spaceId while preserving the original request
     * (and its auth context). This avoids forging fake requests, which can break auth under UIAM.
     */
    createWithSpaceId(request: KibanaRequest, savedObjects: SavedObjectsServiceStart, spaceId: string, options?: RulesClientCreateOptions): Promise<RulesClient>;
    /**
     * Attempts to create a UIAM API key when shouldGrantUiam is true and the request has UIAM credentials.
     * Logs errors and returns undefined if grant fails or credentials are missing/invalid.
     */
    private createUiamApiKey;
    /**
     * Invalidates a UIAM API key by id. Logs an error if invalidation fails.
     */
    private invalidateUiamApiKey;
    /**
     * Synchronously invalidates the rule's ES and/or UIAM API keys, bypassing the pending
     * invalidation queue. Errors are logged but never rethrown so that this cannot break
     * the surrounding rule delete operation.
     *
     * Mirrors the decode logic of {@link bulkMarkApiKeysForInvalidation}: each input is
     * `base64(id:value)`; for UIAM keys the value is a UIAM credential, for ES keys we
     * only need the id.
     */
    private invalidateApiKeyNow;
    private createInternal;
}
