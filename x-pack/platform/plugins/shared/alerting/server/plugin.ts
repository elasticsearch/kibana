/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { PublicMethodsOf } from '@kbn/utility-types';
import type { Subject, Observable } from 'rxjs';
import { BehaviorSubject, ReplaySubject, map, distinctUntilChanged } from 'rxjs';
import { pick } from 'lodash';
import type { UsageCollectionSetup, UsageCounter } from '@kbn/usage-collection-plugin/server';
import type { SecurityPluginSetup, SecurityPluginStart } from '@kbn/security-plugin/server';
import type { PluginSetup as DataPluginSetup } from '@kbn/data-plugin/server';
import type { PluginStart as DataViewsPluginStart } from '@kbn/data-views-plugin/server';
import type {
  EncryptedSavedObjectsPluginSetup,
  EncryptedSavedObjectsPluginStart,
} from '@kbn/encrypted-saved-objects-plugin/server';
import type {
  TaskManagerSetupContract,
  TaskManagerStartContract,
} from '@kbn/task-manager-plugin/server';
import { DEFAULT_SPACE_ID } from '@kbn/core-spaces-common';
import type { SpacesPluginStart } from '@kbn/spaces-plugin/server';
import type {
  KibanaRequest,
  Logger,
  PluginInitializerContext,
  CoreSetup,
  CoreStart,
  IContextProvider,
  StatusServiceSetup,
  ServiceStatus,
  SavedObjectsBulkGetObject,
  CoreStatus,
} from '@kbn/core/server';
import { ServiceStatusLevels } from '@kbn/core/server';
import type { LicensingPluginSetup, LicensingPluginStart } from '@kbn/licensing-plugin/server';
import { LICENSE_TYPE } from '@kbn/licensing-types';
import type {
  PluginSetupContract as ActionsPluginSetupContract,
  PluginStartContract as ActionsPluginStartContract,
} from '@kbn/actions-plugin/server';
import type {
  IEventLogger,
  IEventLogService,
  IEventLogClientService,
} from '@kbn/event-log-plugin/server';
import type { FeaturesPluginStart, FeaturesPluginSetup } from '@kbn/features-plugin/server';
import type { PluginSetup as KQLPluginSetup } from '@kbn/kql/server';
import type { PluginStart as DataPluginStart } from '@kbn/data-plugin/server';
import type { MonitoringCollectionSetup } from '@kbn/monitoring-collection-plugin/server';
import type { SharePluginStart } from '@kbn/share-plugin/server';
import type { MaintenanceWindowsServerStart } from '@kbn/maintenance-windows-plugin/server';
import { ApiKeyType } from './task_runner/types';
import { RuleTypeRegistry } from './rule_type_registry';
import { TaskRunnerFactory } from './task_runner';
import { RulesClientFactory } from './rules_client_factory';
import { ruleQueryInspectorRoute } from './routes/rule/apis/rule_query_inspector/rule_query_inspector_route';
import type { RulesClientCreateOptions } from './rules_client_factory';
import {
  RulesSettingsClientFactory,
  RulesSettingsService,
  getRulesSettingsFeature,
} from './rules_settings';
import type { ILicenseState } from './lib/license_state';
import { LicenseState } from './lib/license_state';
import type { AlertingRequestHandlerContext, RuleAlertData } from './types';
import { ALERTING_FEATURE_ID } from './types';
import { defineRoutes } from './routes';
import type {
  AlertInstanceContext,
  AlertInstanceState,
  AlertsHealth,
  RuleType,
  RuleTypeParams,
  RuleTypeState,
  RulesClientApi,
} from './types';
import { registerAlertingUsageCollector } from './usage';
import { initializeAlertingTelemetry, scheduleAlertingTelemetry } from './usage/task';
import {
  setupSavedObjects,
  RULE_SAVED_OBJECT_TYPE,
  AD_HOC_RUN_SAVED_OBJECT_TYPE,
  GAP_AUTO_FILL_SCHEDULER_SAVED_OBJECT_TYPE,
} from './saved_objects';
import {
  initializeApiKeyInvalidator,
  scheduleApiKeyInvalidatorTask,
} from './invalidate_pending_api_keys/task';
import { scheduleAlertingHealthCheck, initializeAlertingHealth } from './health';
import type { AlertingConfig, AlertingRulesConfig } from './config';
import { getHealth } from './health/get_health';
import { AlertingAuthorizationClientFactory } from './alerting_authorization_client_factory';
import type { AlertingAuthorization } from './authorization';
import type { SecurityHealth } from './lib/get_security_health';
import { getSecurityHealth } from './lib/get_security_health';
import { registerNodeCollector, registerClusterCollector, InMemoryMetrics } from './monitoring';
import { getRuleTaskTimeout } from './lib/get_rule_task_timeout';
import { getActionsConfigMap } from './lib/get_actions_config_map';
import {
  AlertsService,
  type PublicFrameworkAlertsService,
  type InitializationPromise,
  errorResult,
} from './alerts_service';
import { ConnectorAdapterRegistry } from './connector_adapters/connector_adapter_registry';
import type { ConnectorAdapter, ConnectorAdapterParams } from './connector_adapters/types';
import type { DataStreamAdapter } from './alerts_service/lib/data_stream_adapter';
import { getDataStreamAdapter } from './alerts_service/lib/data_stream_adapter';
import type { GetAlertIndicesAlias } from './lib';
import { createGetAlertIndicesAliasFn, spaceIdToNamespace } from './lib';
import { BackfillClient } from './backfill_client/backfill_client';
import { MaintenanceWindowsService } from './task_runner/maintenance_windows';
import { AlertDeletionClient } from './alert_deletion';
import { registerGapAutoFillSchedulerTask } from './lib/rule_gaps/task/gap_auto_fill_scheduler_task';
import { ChangeTrackingService } from './rules_client/lib/change_tracking';
import { UiamApiKeyProvisioningTask } from './provisioning';
import { uiamProvisioningEvents } from './provisioning/event_based_telemetry';

export const EVENT_LOG_PROVIDER = 'alerting';
export const EVENT_LOG_ACTIONS = {
  execute: 'execute',
  executeStart: 'execute-start',
  executeAction: 'execute-action',
  executeBackfill: 'execute-backfill',
  newInstance: 'new-instance',
  recoveredInstance: 'recovered-instance',
  activeInstance: 'active-instance',
  executeTimeout: 'execute-timeout',
  untrackedInstance: 'untracked-instance',
  gap: 'gap',
  deleteAlerts: 'delete-alerts',
  gapAutoFillSchedule: 'gap-auto-fill-schedule',
};
export const LEGACY_EVENT_LOG_ACTIONS = {
  resolvedInstance: 'resolved-instance',
};

export interface AlertingServerSetup {
  registerConnectorAdapter<
    RuleActionParams extends ConnectorAdapterParams = ConnectorAdapterParams,
    ConnectorParams extends ConnectorAdapterParams = ConnectorAdapterParams
  >(
    adapter: ConnectorAdapter<RuleActionParams, ConnectorParams>
  ): void;
  registerType<
    Params extends RuleTypeParams = RuleTypeParams,
    ExtractedParams extends RuleTypeParams = RuleTypeParams,
    State extends RuleTypeState = RuleTypeState,
    InstanceState extends AlertInstanceState = AlertInstanceState,
    InstanceContext extends AlertInstanceContext = AlertInstanceContext,
    ActionGroupIds extends string = never,
    RecoveryActionGroupId extends string = never,
    AlertData extends RuleAlertData = never
  >(
    ruleType: RuleType<
      Params,
      ExtractedParams,
      State,
      InstanceState,
      InstanceContext,
      ActionGroupIds,
      RecoveryActionGroupId,
      AlertData
    >
  ): void;

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
  getRulesClientWithRequest(
    request: KibanaRequest,
    options?: RulesClientCreateOptions
  ): Promise<RulesClientApi>;
  /**
   * Creates a RulesClient that is bound to the provided spaceId (namespace) while preserving
   * the original request (and its auth context).
   */
  getRulesClientWithRequestInSpace(
    request: KibanaRequest,
    spaceId: string,
    options?: RulesClientCreateOptions
  ): Promise<RulesClientApi>;
  getAlertingAuthorizationWithRequest(
    request: KibanaRequest
  ): Promise<PublicMethodsOf<AlertingAuthorization>>;
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

export class AlertingPlugin {
  private readonly config: AlertingConfig;
  private readonly logger: Logger;
  private ruleTypeRegistry?: RuleTypeRegistry;
  private readonly taskRunnerFactory: TaskRunnerFactory;
  private licenseState: ILicenseState | null = null;
  private isESOCanEncrypt?: boolean;
  private security?: SecurityPluginSetup;
  private readonly rulesClientFactory: RulesClientFactory;
  private readonly alertingAuthorizationClientFactory: AlertingAuthorizationClientFactory;
  private readonly rulesSettingsClientFactory: RulesSettingsClientFactory;
  private readonly telemetryLogger: Logger;
  private readonly kibanaVersion: PluginInitializerContext['env']['packageInfo']['version'];
  private eventLogService?: IEventLogService;
  private eventLogger?: IEventLogger;
  private kibanaBaseUrl: string | undefined;
  private usageCounter: UsageCounter | undefined;
  private inMemoryMetrics: InMemoryMetrics;
  private alertsService: AlertsService | null;
  private pluginStop$: Subject<void>;
  private dataStreamAdapter?: DataStreamAdapter;
  private backfillClient?: BackfillClient;
  private alertDeletionClient?: AlertDeletionClient;
  private readonly isServerless: boolean;
  private nodeRoles: PluginInitializerContext['node']['roles'];
  private readonly connectorAdapterRegistry = new ConnectorAdapterRegistry();
  private readonly disabledRuleTypes: Set<string>;
  private readonly enabledRuleTypes: Set<string> | null = null;
  private getRulesClientWithRequest?: (request: KibanaRequest) => Promise<RulesClientApi>;
  private changeTrackingService?: ChangeTrackingService;
  private uiamApiKeyProvisioningTask?: UiamApiKeyProvisioningTask;

  constructor(initializerContext: PluginInitializerContext) {
    this.config = initializerContext.config.get();
    this.logger = initializerContext.logger.get();
    this.taskRunnerFactory = new TaskRunnerFactory();
    this.rulesClientFactory = new RulesClientFactory();
    this.alertsService = null;
    this.nodeRoles = initializerContext.node.roles;
    this.alertingAuthorizationClientFactory = new AlertingAuthorizationClientFactory();
    this.rulesSettingsClientFactory = new RulesSettingsClientFactory();
    this.telemetryLogger = initializerContext.logger.get('usage');
    this.kibanaVersion = initializerContext.env.packageInfo.version;
    this.inMemoryMetrics = new InMemoryMetrics(initializerContext.logger.get('in_memory_metrics'));
    this.pluginStop$ = new ReplaySubject(1);
    this.isServerless = initializerContext.env.packageInfo.buildFlavor === 'serverless';
    this.disabledRuleTypes = new Set(this.config.disabledRuleTypes || []);
    this.enabledRuleTypes =
      this.config.enabledRuleTypes != null ? new Set(this.config.enabledRuleTypes) : null;
    if (this.config.ruleChangeTracking.enabled) {
      this.changeTrackingService = new ChangeTrackingService(this.logger, this.kibanaVersion);
    }
  }

  public setup(
    core: CoreSetup<AlertingPluginsStart, unknown>,
    plugins: AlertingPluginsSetup
  ): AlertingServerSetup {
    this.kibanaBaseUrl = core.http.basePath.publicBaseUrl;
    this.licenseState = new LicenseState(plugins.licensing.license$);
    this.security = plugins.security;

    const elasticsearchAndSOAvailability$ = getElasticsearchAndSOAvailability(core.status.core$);

    const useDataStreamForAlerts = this.isServerless;
    this.dataStreamAdapter = getDataStreamAdapter({ useDataStreamForAlerts });

    core.capabilities.registerProvider(() => {
      return {
        management: {
          insightsAndAlerting: {
            triggersActions: true,
          },
        },
      };
    });

    if (this.config.rulesSettings.enabled) {
      plugins.features.registerKibanaFeature(getRulesSettingsFeature(this.isServerless));
    }

    if (this.config.cancelAlertsOnRuleTimeout === false) {
      this.logger.warn(
        `Setting xpack.alerting.cancelAlertsOnRuleTimeout=false can lead to unexpected behavior for certain rule types. This setting will be deprecated in a future version and will be ignored for rule types that do not support it.`
      );
    }

    if (this.config.enabledRuleTypes && this.config.enabledRuleTypes.length === 0) {
      this.logger.warn(
        `xpack.alerting.enabledRuleTypes is empty. No rule types will be enabled in the configuration.`
      );
    }

    this.isESOCanEncrypt = plugins.encryptedSavedObjects.canEncrypt;

    if (!this.isESOCanEncrypt) {
      this.logger.warn(
        'APIs are disabled because the Encrypted Saved Objects plugin is missing encryption key. Please set xpack.encryptedSavedObjects.encryptionKey in the kibana.yml or use the bin/kibana-encryption-keys command.'
      );
    }

    const taskManagerStartPromise = core
      .getStartServices()
      .then(([_, alertingStart]) => alertingStart.taskManager);

    this.backfillClient = new BackfillClient({
      logger: this.logger,
      taskManagerSetup: plugins.taskManager,
      taskManagerStartPromise,
      taskRunnerFactory: this.taskRunnerFactory,
    });

    this.eventLogger = plugins.eventLog.getLogger({
      event: { provider: EVENT_LOG_PROVIDER },
    });

    this.eventLogService = plugins.eventLog;
    plugins.eventLog.registerProviderActions(EVENT_LOG_PROVIDER, Object.values(EVENT_LOG_ACTIONS));

    if (this.config.enableFrameworkAlerts) {
      if (this.nodeRoles.migrator) {
        this.logger.info(`Skipping initialization of AlertsService on migrator node`);
      } else {
        this.logger.info(
          `using ${
            this.dataStreamAdapter.isUsingDataStreams() ? 'datastreams' : 'indexes and aliases'
          } for persisting alerts`
        );
        this.alertsService = new AlertsService({
          logger: this.logger,
          pluginStop$: this.pluginStop$,
          kibanaVersion: this.kibanaVersion,
          dataStreamAdapter: this.dataStreamAdapter!,
          elasticsearchClientPromise: core
            .getStartServices()
            .then(([{ elasticsearch }]) => elasticsearch.client.asInternalUser),
          elasticsearchAndSOAvailability$,
          isServerless: this.isServerless,
          totalFieldsLimit: this.config.alertsService.totalFieldsLimit,
        });
      }
    }

    const ruleTypeRegistry: RuleTypeRegistry = new RuleTypeRegistry({
      config: this.config,
      logger: this.logger,
      taskManager: plugins.taskManager,
      taskRunnerFactory: this.taskRunnerFactory,
      licenseState: this.licenseState,
      licensing: plugins.licensing,
      alertsService: this.alertsService,
      minimumScheduleInterval: this.config.rules.minimumScheduleInterval,
      inMemoryMetrics: this.inMemoryMetrics,
    });
    this.ruleTypeRegistry = ruleTypeRegistry;

    this.alertDeletionClient = new AlertDeletionClient({
      auditService: plugins.security?.audit,
      elasticsearchClientPromise: core
        .getStartServices()
        .then(([{ elasticsearch }]) => elasticsearch.client.asInternalUser),
      eventLogger: this.eventLogger,
      getAlertIndicesAlias: createGetAlertIndicesAliasFn(this.ruleTypeRegistry!),
      logger: this.logger,
      ruleTypeRegistry: this.ruleTypeRegistry!,
      securityService: core.getStartServices().then(([{ security }]) => security),
      spacesService: core.getStartServices().then(([_, { spaces }]) => spaces?.spacesService),
      taskManagerSetup: plugins.taskManager,
      taskManagerStartPromise,
    });

    const usageCollection = plugins.usageCollection;
    if (usageCollection) {
      registerAlertingUsageCollector(usageCollection, taskManagerStartPromise);
      const eventLogIndex = this.eventLogService.getIndexPattern();
      initializeAlertingTelemetry(this.telemetryLogger, core, plugins.taskManager, eventLogIndex);
    }

    // Usage counter for telemetry
    this.usageCounter = plugins.usageCollection?.createUsageCounter(ALERTING_FEATURE_ID);

    const getSearchSourceMigrations = plugins.data.search.searchSource.getAllMigrations.bind(
      plugins.data.search.searchSource
    );
    setupSavedObjects(
      core.savedObjects,
      plugins.encryptedSavedObjects,
      this.ruleTypeRegistry,
      this.logger,
      plugins.actions.isPreconfiguredConnector,
      getSearchSourceMigrations
    );

    initializeApiKeyInvalidator(
      this.logger,
      core.getStartServices(),
      plugins.taskManager,
      this.config
    );

    uiamProvisioningEvents.forEach((eventConfig) => core.analytics.registerEventType(eventConfig));

    this.uiamApiKeyProvisioningTask = new UiamApiKeyProvisioningTask({
      logger: this.logger,
      isServerless: this.isServerless,
      analytics: core.analytics,
    });
    this.uiamApiKeyProvisioningTask.register({ core, taskManager: plugins.taskManager });

    const serviceStatus$ = new BehaviorSubject<ServiceStatus>({
      level: ServiceStatusLevels.available,
      summary: 'Alerting is (probably) ready',
    });
    core.status.set(serviceStatus$);

    initializeAlertingHealth(this.logger, plugins.taskManager, core.getStartServices());

    core.http.registerRouteHandlerContext<AlertingRequestHandlerContext, 'alerting'>(
      'alerting',
      this.createRouteHandlerContext(core)
    );

    if (plugins.monitoringCollection) {
      registerNodeCollector({
        monitoringCollection: plugins.monitoringCollection,
        inMemoryMetrics: this.inMemoryMetrics,
      });
      registerClusterCollector({
        monitoringCollection: plugins.monitoringCollection,
        core,
      });
    }

    registerGapAutoFillSchedulerTask({
      taskManager: plugins.taskManager,
      logger: this.logger,
      getRulesClientWithRequest: (request) => this?.getRulesClientWithRequest?.(request),
      eventLogger: this.eventLogger!,
      schedulerConfig: this.config.gapAutoFillScheduler,
    });

    // Routes
    const router = core.http.createRouter<AlertingRequestHandlerContext>();
    // Register routes
    defineRoutes({
      router,
      licenseState: this.licenseState,
      usageCounter: this.usageCounter,
      getAlertIndicesAlias: createGetAlertIndicesAliasFn(this.ruleTypeRegistry!),
      encryptedSavedObjects: plugins.encryptedSavedObjects,
      config$: plugins.kql.autocomplete.getInitializerContextConfig().create(),
      isServerless: this.isServerless,
      docLinks: core.docLinks,
      alertingConfig: this.config,
      core,
    });

    ruleQueryInspectorRoute(
      router,
      this.licenseState,
      this.ruleTypeRegistry!,
      createGetAlertIndicesAliasFn(this.ruleTypeRegistry!),
      core
    );

    return {
      registerConnectorAdapter: <
        RuleActionParams extends ConnectorAdapterParams = ConnectorAdapterParams,
        ConnectorParams extends ConnectorAdapterParams = ConnectorAdapterParams
      >(
        adapter: ConnectorAdapter<RuleActionParams, ConnectorParams>
      ) => {
        this.connectorAdapterRegistry.register(adapter);
      },
      registerType: <
        Params extends RuleTypeParams = never,
        ExtractedParams extends RuleTypeParams = never,
        State extends RuleTypeState = never,
        InstanceState extends AlertInstanceState = never,
        InstanceContext extends AlertInstanceContext = never,
        ActionGroupIds extends string = never,
        RecoveryActionGroupId extends string = never,
        AlertData extends RuleAlertData = never
      >(
        ruleType: RuleType<
          Params,
          ExtractedParams,
          State,
          InstanceState,
          InstanceContext,
          ActionGroupIds,
          RecoveryActionGroupId,
          AlertData
        >
      ) => {
        if (this.disabledRuleTypes.has(ruleType.id)) {
          this.logger.info(`rule type "${ruleType.id}" disabled by configuration`);

          if (this.enabledRuleTypes && this.enabledRuleTypes.has(ruleType.id)) {
            this.logger.warn(
              `rule type "${ruleType.id}" is both disabled and enabled allow-list. rule type will be disabled.`
            );
          }
          return;
        }

        if (
          this.enabledRuleTypes &&
          this.enabledRuleTypes.size > 0 &&
          !this.enabledRuleTypes.has(ruleType.id)
        ) {
          this.logger.info(`rule type "${ruleType.id}" is not enabled in configuration`);
        }

        // Register the rule type if enabledRuleTypes is not defined or if it is defined and it contains the rule type id
        if (
          this.enabledRuleTypes == null ||
          (this.enabledRuleTypes.size > 0 && this.enabledRuleTypes.has(ruleType.id))
        ) {
          if (!(ruleType.minimumLicenseRequired in LICENSE_TYPE)) {
            throw new Error(`"${ruleType.minimumLicenseRequired}" is not a valid license type`);
          }

          // validate cancelAlertsOnTimeout if set explicitly on the rule type definition
          if (
            ruleType.cancelAlertsOnRuleTimeout === false &&
            (ruleType.autoRecoverAlerts == null || ruleType.autoRecoverAlerts === true)
          ) {
            throw new Error(
              `Rule type "${ruleType.id}" cannot have both cancelAlertsOnRuleTimeout set to false and autoRecoverAlerts set to true.`
            );
          }

          ruleType.ruleTaskTimeout = getRuleTaskTimeout({
            config: this.config.rules,
            ruleTaskTimeout: ruleType.ruleTaskTimeout,
            ruleTypeId: ruleType.id,
          });
          ruleType.doesSetRecoveryContext = ruleType.doesSetRecoveryContext ?? false;
          ruleType.autoRecoverAlerts = ruleType.autoRecoverAlerts ?? true;

          if (
            ruleType.autoRecoverAlerts === true &&
            this.config.cancelAlertsOnRuleTimeout === false
          ) {
            this.logger.debug(
              `Setting xpack.alerting.cancelAlertsOnRuleTimeout=false is incompatible with rule type "${ruleType.id}" and will be ignored.`
            );
            ruleType.cancelAlertsOnRuleTimeout = true;
          } else {
            ruleType.cancelAlertsOnRuleTimeout =
              ruleType.cancelAlertsOnRuleTimeout ?? this.config.cancelAlertsOnRuleTimeout;
          }

          // Rule Change Tracking
          // There are many alerting rule types but they all belong to a specific solution
          // (security, stack, observability).
          if (this.changeTrackingService) {
            const { scope } = this.config.ruleChangeTracking;
            if (scope.includes('all') || scope.includes(ruleType.solution)) {
              ruleType.trackChanges = true;
              this.changeTrackingService.register(ruleType.solution);
            }
          }

          ruleTypeRegistry.register(ruleType);
        }
      },
      getSecurityHealth: async () => {
        return await getSecurityHealth(
          async () => (this.licenseState ? this.licenseState.getIsSecurityEnabled() : null),
          async () => plugins.encryptedSavedObjects.canEncrypt,
          async () => {
            const [, { security }] = await core.getStartServices();
            return security?.authc.apiKeys.areAPIKeysEnabled() ?? false;
          }
        );
      },
      getConfig: () => {
        return {
          ...pick(this.config.rules, [
            'minimumScheduleInterval',
            'maxScheduledPerMinute',
            'run',
            'apiKeyType',
          ]),
          isUsingSecurity: this.licenseState ? !!this.licenseState.getIsSecurityEnabled() : false,
        };
      },
      frameworkAlerts: {
        enabled: () => this.config.enableFrameworkAlerts,
        getTotalFieldsLimit: () => this.config.alertsService.totalFieldsLimit,
        getContextInitializationPromise: (
          context: string,
          namespace: string
        ): Promise<InitializationPromise> => {
          if (this.alertsService) {
            return this.alertsService.getContextInitializationPromise(context, namespace);
          }

          return Promise.resolve(errorResult(`Framework alerts service not available`));
        },
      },
      getDataStreamAdapter: () => this.dataStreamAdapter!,
    };
  }

  public start(core: CoreStart, plugins: AlertingPluginsStart): AlertingServerStart {
    const {
      isESOCanEncrypt,
      logger,
      taskRunnerFactory,
      ruleTypeRegistry,
      rulesClientFactory,
      changeTrackingService,
      alertingAuthorizationClientFactory,
      rulesSettingsClientFactory,
      security,
      licenseState,
    } = this;
    licenseState?.setNotifyUsage(plugins.licensing.featureUsage.notifyUsage);

    const shouldGrantUiam = this.getShouldGrantUiam(core);

    const encryptedSavedObjectsClient = plugins.encryptedSavedObjects.getClient({
      includedHiddenTypes: [
        RULE_SAVED_OBJECT_TYPE,
        AD_HOC_RUN_SAVED_OBJECT_TYPE,
        GAP_AUTO_FILL_SCHEDULER_SAVED_OBJECT_TYPE,
      ],
    });

    alertingAuthorizationClientFactory.initialize({
      ruleTypeRegistry: ruleTypeRegistry!,
      securityPluginStart: plugins.security,
      logger,
      async getSpace(request: KibanaRequest) {
        return plugins.spaces?.spacesService.getActiveSpace(request);
      },
      async getSpaceById(request: KibanaRequest, spaceId: string) {
        return plugins.spaces?.spacesService.createSpacesClient(request).get(spaceId);
      },
      getSpaceId(request: KibanaRequest) {
        return plugins.spaces?.spacesService.getSpaceId(request) ?? DEFAULT_SPACE_ID;
      },
      features: plugins.features,
    });

    changeTrackingService?.initialize({
      elasticsearchClient: core.elasticsearch.client.asInternalUser,
      authService: core.security.authc,
    });

    rulesClientFactory.initialize({
      ruleTypeRegistry: ruleTypeRegistry!,
      logger,
      taskManager: plugins.taskManager,
      securityPluginSetup: security,
      securityPluginStart: plugins.security,
      internalSavedObjectsRepository: core.savedObjects.createInternalRepository([
        RULE_SAVED_OBJECT_TYPE,
        AD_HOC_RUN_SAVED_OBJECT_TYPE,
        GAP_AUTO_FILL_SCHEDULER_SAVED_OBJECT_TYPE,
      ]),
      encryptedSavedObjectsClient,
      spaceIdToNamespace: (spaceId?: string) => spaceIdToNamespace(plugins.spaces, spaceId),
      getSpaceId(request: KibanaRequest) {
        return plugins.spaces?.spacesService.getSpaceId(request) ?? DEFAULT_SPACE_ID;
      },
      actions: plugins.actions,
      eventLog: plugins.eventLog,
      changeTrackingService: this.changeTrackingService,
      kibanaVersion: this.kibanaVersion,
      authorization: alertingAuthorizationClientFactory,
      eventLogger: this.eventLogger,
      minimumScheduleInterval: this.config.rules.minimumScheduleInterval,
      maxScheduledPerMinute: this.config.rules.maxScheduledPerMinute,
      getAlertIndicesAlias: createGetAlertIndicesAliasFn(this.ruleTypeRegistry!),
      alertsService: this.alertsService,
      backfillClient: this.backfillClient!,
      connectorAdapterRegistry: this.connectorAdapterRegistry,
      uiSettings: core.uiSettings,
      securityService: core.security,
      shouldGrantUiam,
      isServerless: this.isServerless,
      featureFlags: core.featureFlags,
    });

    rulesSettingsClientFactory.initialize({
      logger: this.logger,
      savedObjectsService: core.savedObjects,
      securityService: core.security,
      isServerless: this.isServerless,
    });

    const getRulesClientWithRequest = async (
      request: KibanaRequest,
      options?: RulesClientCreateOptions
    ) => {
      if (isESOCanEncrypt !== true) {
        throw new Error(
          `Unable to create alerts client because the Encrypted Saved Objects plugin is missing encryption key. Please set xpack.encryptedSavedObjects.encryptionKey in the kibana.yml or use the bin/kibana-encryption-keys command.`
        );
      }
      return rulesClientFactory!.create(request, core.savedObjects, options);
    };

    const getRulesClientWithRequestInSpace = async (
      request: KibanaRequest,
      spaceId: string,
      options?: RulesClientCreateOptions
    ) => {
      if (isESOCanEncrypt !== true) {
        throw new Error(
          `Unable to create alerts client because the Encrypted Saved Objects plugin is missing encryption key. Please set xpack.encryptedSavedObjects.encryptionKey in the kibana.yml or use the bin/kibana-encryption-keys command.`
        );
      }
      return rulesClientFactory!.createWithSpaceId(request, core.savedObjects, spaceId, options);
    };

    this.getRulesClientWithRequest = getRulesClientWithRequest;

    const getAlertingAuthorizationWithRequest = async (request: KibanaRequest) => {
      return alertingAuthorizationClientFactory!.create(request);
    };

    const getRulesSettingsClientWithRequest = (request: KibanaRequest) => {
      return rulesSettingsClientFactory!.create(request);
    };

    const getMaintenanceWindowClient = (request: KibanaRequest) => {
      if (!plugins.maintenanceWindows) {
        return;
      }
      return plugins.maintenanceWindows.getMaintenanceWindowClientWithoutAuth(request);
    };

    taskRunnerFactory.initialize({
      actionsConfigMap: getActionsConfigMap(this.config.rules.run.actions),
      actionsPlugin: plugins.actions,
      alertsService: this.alertsService,
      backfillClient: this.backfillClient!,
      cancelAlertsOnRuleTimeout: this.config.cancelAlertsOnRuleTimeout,
      connectorAdapterRegistry: this.connectorAdapterRegistry,
      data: plugins.data,
      dataViews: plugins.dataViews,
      elasticsearch: core.elasticsearch,
      encryptedSavedObjectsClient,
      eventLogger: this.eventLogger!,
      executionContext: core.executionContext,
      kibanaBaseUrl: this.kibanaBaseUrl,
      logger,
      maintenanceWindowsService: new MaintenanceWindowsService({
        cacheInterval: this.config.rulesSettings.cacheInterval,
        logger,
        getMaintenanceWindowClient,
      }),
      maxAlerts: this.config.rules.run.alerts.max,
      ruleTypeRegistry: this.ruleTypeRegistry!,
      rulesSettingsService: new RulesSettingsService({
        cacheInterval: this.config.rulesSettings.cacheInterval,
        getRulesSettingsClientWithRequest,
        isServerless: this.isServerless,
        logger,
      }),
      savedObjects: core.savedObjects,
      share: plugins.share,
      spaceIdToNamespace: (spaceId?: string) => spaceIdToNamespace(plugins.spaces, spaceId),
      uiSettings: core.uiSettings,
      usageCounter: this.usageCounter,
      getEventLogClient: (request: KibanaRequest) => plugins.eventLog.getClient(request),
      isServerless: this.isServerless,
      apiKeyType: (this.config.rules.apiKeyType as ApiKeyType) ?? ApiKeyType.ES,
      shouldGrantUiam,
    });

    this.eventLogService!.registerSavedObjectProvider(
      RULE_SAVED_OBJECT_TYPE,
      (request, spaceId) => {
        return async (objects?: SavedObjectsBulkGetObject[]) => {
          const client = spaceId
            ? await getRulesClientWithRequestInSpace(request, spaceId)
            : await getRulesClientWithRequest(request);

          return objects
            ? Promise.all(
                objects.map(async (objectItem) => await client.get({ id: objectItem.id }))
              )
            : Promise.resolve([]);
        };
      }
    );

    this.eventLogService!.isEsContextReady()
      .then(() => {
        scheduleAlertingTelemetry(this.telemetryLogger, plugins.taskManager);
      })
      .catch(() => {}); // it shouldn't reject, but just in case

    scheduleAlertingHealthCheck(this.logger, this.config, plugins.taskManager).catch(() => {}); // it shouldn't reject, but just in case
    scheduleApiKeyInvalidatorTask(this.telemetryLogger, this.config, plugins.taskManager).catch(
      () => {}
    ); // it shouldn't reject, but just in case

    this.uiamApiKeyProvisioningTask
      ?.start({ core, taskManager: plugins.taskManager })
      .catch(() => {});

    return {
      listTypes: ruleTypeRegistry!.list.bind(this.ruleTypeRegistry!),
      getType: ruleTypeRegistry!.get.bind(this.ruleTypeRegistry),
      getAllTypes: ruleTypeRegistry!.getAllTypes.bind(this.ruleTypeRegistry!),
      getAlertIndicesAlias: createGetAlertIndicesAliasFn(this.ruleTypeRegistry!),
      getAlertingAuthorizationWithRequest,
      getRulesClientWithRequest,
      getRulesClientWithRequestInSpace,
      getFrameworkHealth: async () =>
        await getHealth(core.savedObjects.createInternalRepository([RULE_SAVED_OBJECT_TYPE])),
    };
  }

  private getShouldGrantUiam(core: CoreStart): boolean {
    return !!core.security.authc.apiKeys.uiam;
  }

  private createRouteHandlerContext = (
    core: CoreSetup<AlertingPluginsStart, unknown>
  ): IContextProvider<AlertingRequestHandlerContext, 'alerting'> => {
    const {
      alertDeletionClient,
      ruleTypeRegistry,
      rulesClientFactory,
      rulesSettingsClientFactory,
    } = this;
    return async function alertsRouteHandlerContext(context, request) {
      const [{ savedObjects }] = await core.getStartServices();
      return {
        getAlertDeletionClient: () => {
          return alertDeletionClient!;
        },
        getRulesClient: () => {
          return rulesClientFactory!.create(request, savedObjects);
        },
        getRulesSettingsClient: (withoutAuth?: boolean) => {
          if (withoutAuth) {
            return rulesSettingsClientFactory.create(request);
          }
          return rulesSettingsClientFactory.createWithAuthorization(request);
        },
        listTypes: ruleTypeRegistry!.list.bind(ruleTypeRegistry!),
        getFrameworkHealth: async () =>
          await getHealth(savedObjects.createInternalRepository([RULE_SAVED_OBJECT_TYPE])),
        areApiKeysEnabled: async () => {
          const [, { security }] = await core.getStartServices();
          return security?.authc.apiKeys.areAPIKeysEnabled() ?? false;
        },
      };
    };
  };

  public stop() {
    if (this.licenseState) {
      this.licenseState.clean();
    }
    this.uiamApiKeyProvisioningTask?.stop();
    this.pluginStop$.next();
    this.pluginStop$.complete();
  }
}

export function getElasticsearchAndSOAvailability(
  core$: Observable<CoreStatus>
): Observable<boolean> {
  return core$.pipe(
    map(
      ({ elasticsearch, savedObjects }) =>
        elasticsearch.level === ServiceStatusLevels.available &&
        savedObjects.level === ServiceStatusLevels.available
    ),
    distinctUntilChanged()
  );
}
