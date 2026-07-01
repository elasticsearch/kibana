/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import type {
  PluginInitializerContext,
  CoreStart,
  CoreSetup,
  Plugin as PluginType,
  Logger,
  SavedObjectsClientContract,
  KibanaRequest,
} from '@kbn/core/server';
import { SavedObjectsClient } from '@kbn/core/server';
import { mappingFromFieldMap } from '@kbn/alerting-plugin/common';
import { Dataset } from '@kbn/rule-registry-plugin/server';
import { SyncGlobalParamsPrivateLocationsTask } from './tasks/sync_global_params_task';
import type {
  SyntheticsPluginsSetupDependencies,
  SyntheticsPluginsStartDependencies,
  SyntheticsServerSetup,
} from './types';
import { TelemetryEventsSender } from './telemetry/sender';
import { SyntheticsMonitorClient } from './synthetics_service/synthetics_monitor/synthetics_monitor_client';
import { initSyntheticsServer } from './server';
import { syntheticsFeature } from './feature';
import { registerSyntheticsSavedObjects } from './saved_objects/saved_objects';
import type { UptimeConfig } from './config';
import { SyntheticsService } from './synthetics_service/synthetics_service';
import { syntheticsServiceApiKey } from './saved_objects/service_api_key';
import { SYNTHETICS_RULE_TYPES_ALERT_CONTEXT } from '../common/constants/synthetics_alerts';
import { syntheticsRuleTypeFieldMap } from './alert_rules/common';
import { SyncPrivateLocationMonitorsTask } from './tasks/sync_private_locations_monitors_task';
import { getTransforms as getStatsTransforms } from '../common/embeddables/stats_overview/get_transforms';
import { SYNTHETICS_STATS_OVERVIEW_EMBEDDABLE } from '../common/embeddables/stats_overview/constants';
import { getTransforms as getMonitorsTransforms } from '../common/embeddables/monitors_overview/get_transforms';
import { SYNTHETICS_MONITORS_EMBEDDABLE } from '../common/embeddables/monitors_overview/constants';
import { getStatsOverviewEmbeddableSchema, syntheticsMonitorsEmbeddableSchema } from './schemas';
import { registerDataProviders } from './agent_builder/register_data_provider';
import { bindAgentBuilder } from './agent_builder/bind_agent_builder';

export class Plugin implements PluginType {
  private savedObjectsClient?: SavedObjectsClientContract;
  private readonly logger: Logger;
  private server?: SyntheticsServerSetup;
  private syntheticsService?: SyntheticsService;
  private syntheticsMonitorClient?: SyntheticsMonitorClient;
  private readonly telemetryEventsSender: TelemetryEventsSender;
  private syncPrivateLocationMonitorsTask?: SyncPrivateLocationMonitorsTask;
  private syncGlobalParamsTask?: SyncGlobalParamsPrivateLocationsTask;

  constructor(private readonly initContext: PluginInitializerContext<UptimeConfig>) {
    this.logger = initContext.logger.get();
    this.telemetryEventsSender = new TelemetryEventsSender(this.logger);
  }

  public setup(core: CoreSetup, plugins: SyntheticsPluginsSetupDependencies) {
    const config = this.initContext.config.get<UptimeConfig>();

    const { ruleDataService } = plugins.ruleRegistry;

    const ruleDataClient = ruleDataService.initializeIndex({
      feature: 'uptime',
      registrationContext: SYNTHETICS_RULE_TYPES_ALERT_CONTEXT,
      dataset: Dataset.alerts,
      componentTemplateRefs: [],
      componentTemplates: [
        {
          name: 'mappings',
          mappings: mappingFromFieldMap(syntheticsRuleTypeFieldMap, 'strict'),
        },
      ],
    });

    this.server = {
      config,
      router: core.http.createRouter(),
      cloud: plugins.cloud,
      stackVersion: this.initContext.env.packageInfo.version,
      basePath: core.http.basePath,
      logger: this.logger,
      telemetry: this.telemetryEventsSender,
      isDev: this.initContext.env.mode.dev,
      share: plugins.share,
      alerting: plugins.alerting,
    } as SyntheticsServerSetup;

    this.syntheticsService = new SyntheticsService(this.server);

    this.syntheticsService.setup(plugins.taskManager).catch(() => {});

    this.syntheticsMonitorClient = new SyntheticsMonitorClient(this.syntheticsService, this.server);

    this.telemetryEventsSender.setup(plugins.telemetry);

    plugins.features.registerKibanaFeature(syntheticsFeature);

    initSyntheticsServer(this.server, this.syntheticsMonitorClient, plugins, ruleDataClient);

    registerSyntheticsSavedObjects(core.savedObjects, plugins.encryptedSavedObjects);

    this.syncPrivateLocationMonitorsTask = new SyncPrivateLocationMonitorsTask(
      this.server,
      this.syntheticsMonitorClient
    );
    this.syncPrivateLocationMonitorsTask.registerTaskDefinition(plugins.taskManager);

    this.syncGlobalParamsTask = new SyncGlobalParamsPrivateLocationsTask(
      this.server,
      plugins.taskManager,
      this.syntheticsMonitorClient
    );

    this.syncGlobalParamsTask.registerTaskDefinition(plugins.taskManager);

    // Register transforms and schema for SYNTHETICS_STATS_OVERVIEW_EMBEDDABLE
    plugins.embeddable.registerEmbeddableServerDefinition(SYNTHETICS_STATS_OVERVIEW_EMBEDDABLE, {
      title: 'Synthetics stats overview',
      getTransforms: getStatsTransforms,
      getSchema: getStatsOverviewEmbeddableSchema,
    });

    // Register transforms and schema for SYNTHETICS_MONITORS_EMBEDDABLE
    plugins.embeddable.registerEmbeddableServerDefinition(SYNTHETICS_MONITORS_EMBEDDABLE, {
      title: 'Synthetics monitors',
      getTransforms: getMonitorsTransforms,
      getSchema: () => syntheticsMonitorsEmbeddableSchema,
    });

    registerDataProviders({ core, plugins });

    bindAgentBuilder({ logger: this.logger, plugins });

    return {};
  }

  public start(coreStart: CoreStart, pluginsStart: SyntheticsPluginsStartDependencies) {
    this.savedObjectsClient = new SavedObjectsClient(
      coreStart.savedObjects.createInternalRepository([syntheticsServiceApiKey.name])
    );

    const getMaintenanceWindowClientInternal = (request: KibanaRequest) => {
      if (!pluginsStart.maintenanceWindows) {
        return;
      }

      return pluginsStart.maintenanceWindows?.getMaintenanceWindowClientInternal(request);
    };

    if (this.server) {
      this.server.coreStart = coreStart;
      this.server.pluginsStart = pluginsStart;
      this.server.security = pluginsStart.security;
      this.server.fleet = pluginsStart.fleet;
      this.server.encryptedSavedObjects = pluginsStart.encryptedSavedObjects;
      this.server.savedObjectsClient = this.savedObjectsClient;
      this.server.spaces = pluginsStart.spaces;
      this.server.isElasticsearchServerless = coreStart.elasticsearch.getCapabilities().serverless;
      this.server.getMaintenanceWindowClientInternal = getMaintenanceWindowClientInternal;
    }
    this.syncPrivateLocationMonitorsTask?.start().catch((e) => {
      this.logger.error('Failed to start sync private location monitors task', { error: e });
    });

    this.syntheticsService?.start(pluginsStart.taskManager);

    this.telemetryEventsSender.start(pluginsStart.telemetry, coreStart).catch(() => {});
  }

  public stop() {}
}
