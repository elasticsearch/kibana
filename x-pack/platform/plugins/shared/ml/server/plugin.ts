/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';
import type {
  CoreSetup,
  CoreStart,
  Plugin,
  KibanaRequest,
  Logger,
  PluginInitializerContext,
  CapabilitiesStart,
  IClusterClient,
  SavedObjectsServiceStart,
  UiSettingsServiceStart,
  CoreAuditService,
} from '@kbn/core/server';
import { DEFAULT_APP_CATEGORIES } from '@kbn/core/server';
import type { SecurityPluginSetup } from '@kbn/security-plugin/server';
import type { PluginStart as DataViewsPluginStart } from '@kbn/data-views-plugin/server';
import type { SpacesPluginSetup } from '@kbn/spaces-plugin/server';
import type { FieldFormatsStart } from '@kbn/field-formats-plugin/server';
import type { HomeServerPluginSetup } from '@kbn/home-plugin/server';
import type { CasesServerSetup } from '@kbn/cases-plugin/server';
import { type MlCapabilities, alertingFeatures } from '@kbn/ml-common-types/capabilities';
import { getPluginPrivileges } from '@kbn/ml-common-types/capabilities';
import type { PluginsSetup, PluginsStart, RouteInitialization, ServerlessInfo } from './types';
import { notificationsRoutes } from './routes/notifications';
import {
  type MlFeatures,
  PLUGIN_ID,
  type ConfigSchema,
  initEnabledFeatures,
  type CompatibleModule,
} from '../common/constants/app';
import { initMlServerLog } from './lib/log';
import { annotationRoutes } from './routes/annotations';
import { calendars } from './routes/calendars';
import { dataFeedRoutes } from './routes/datafeeds';
import { dataFrameAnalyticsRoutes } from './routes/data_frame_analytics';
import { dataRecognizer } from './routes/modules';
import { dataVisualizerRoutes } from './routes/data_visualizer';
import { fieldsService } from './routes/fields_service';
import { filtersRoutes } from './routes/filters';
import { jobAuditMessagesRoutes } from './routes/job_audit_messages';
import { jobRoutes } from './routes/anomaly_detectors';
import { jobServiceRoutes } from './routes/job_service';
import { savedObjectsRoutes } from './routes/saved_objects';
import { jobValidationRoutes } from './routes/job_validation';
import { resultsServiceRoutes } from './routes/results_service';
import { modelManagementRoutes } from './routes/model_management';
import { systemRoutes } from './routes/system';
import { MlLicense } from '../common/license';
import type { SharedServices } from './shared_services';
import { createSharedServices } from './shared_services';
import { setupCapabilitiesSwitcher } from './lib/capabilities';
import { registerKibanaSettings } from './lib/register_settings';
import { trainedModelsRoutes } from './routes/trained_models';
import {
  setupSavedObjects,
  jobSavedObjectsInitializationFactory,
  savedObjectClientsFactory,
} from './saved_objects';
import { RouteGuard } from './lib/route_guard';
import { registerMlAlerts } from './lib/alerts/register_ml_alerts';
import { alertingRoutes } from './routes/alerting';
import { registerCollector } from './usage';
import { SavedObjectsSyncService } from './saved_objects/sync_task';
import { registerCasesPersistableState } from './lib/register_cases';
import { registerSampleDataSetLinks } from './lib/register_sample_data_set_links';
import { inferenceModelRoutes } from './routes/inference_models';
import { registerAnomalyDetectionAgentBuilder } from './agent_builder/register_anomaly_detection';
import { registerEmbeddables } from './lib/register_embeddables';

export type MlPluginSetup = SharedServices;
export type MlPluginStart = void;

export class MlServerPlugin
  implements Plugin<MlPluginSetup, MlPluginStart, PluginsSetup, PluginsStart>
{
  private log: Logger;
  private mlLicense: MlLicense;
  private capabilities: CapabilitiesStart | null = null;
  private clusterClient: IClusterClient | null = null;
  private fieldsFormat: FieldFormatsStart | null = null;
  private uiSettings: UiSettingsServiceStart | null = null;
  private savedObjectsStart: SavedObjectsServiceStart | null = null;
  private spacesPlugin: SpacesPluginSetup | undefined;
  private security: SecurityPluginSetup | undefined;
  private home: HomeServerPluginSetup | null = null;
  private cases: CasesServerSetup | null | undefined = null;
  private dataViews: DataViewsPluginStart | null = null;
  private auditService: CoreAuditService | null = null;
  private isMlReady: Promise<void>;
  private setMlReady: () => void = () => {};
  private savedObjectsSyncService: SavedObjectsSyncService;
  private enabledFeatures: MlFeatures = {
    ad: true,
    dfa: true,
    nlp: true,
  };
  private compatibleModuleType: CompatibleModule | null = null;
  private anomalyDetectionSkillEnabled: boolean;
  private serverless: ServerlessInfo;
  constructor(ctx: PluginInitializerContext<ConfigSchema>) {
    this.log = ctx.logger.get();
    this.mlLicense = new MlLicense();
    this.isMlReady = new Promise((resolve) => (this.setMlReady = resolve));
    this.savedObjectsSyncService = new SavedObjectsSyncService(this.log);

    const config = ctx.config.get();

    this.serverless = {
      isServerless: ctx.env.packageInfo.buildFlavor === 'serverless',
      cpsEnabled: false,
    };
    initEnabledFeatures(this.enabledFeatures, config);
    this.compatibleModuleType = config.compatibleModuleType ?? null;
    this.anomalyDetectionSkillEnabled =
      config.experimental?.anomalyDetectionSkill?.enabled === true;
    this.enabledFeatures = Object.freeze(this.enabledFeatures);
  }

  public setup(coreSetup: CoreSetup<PluginsStart>, plugins: PluginsSetup): MlPluginSetup {
    this.spacesPlugin = plugins.spaces;
    this.security = plugins.security;
    this.home = plugins.home;
    this.cases = plugins.cases;
    this.serverless.cpsEnabled = plugins.cps?.getCpsEnabled() ?? false;
    const { admin, user, apmUser } = getPluginPrivileges();

    plugins.features.registerKibanaFeature({
      id: PLUGIN_ID,
      name: i18n.translate('xpack.ml.featureRegistry.mlFeatureName', {
        defaultMessage: 'Machine Learning',
      }),
      order: 500,
      category: DEFAULT_APP_CATEGORIES.kibana,
      app: [PLUGIN_ID, 'kibana'],
      catalogue: [PLUGIN_ID, `${PLUGIN_ID}_file_data_visualizer`],
      privilegesTooltip: i18n.translate('xpack.ml.featureRegistry.privilegesTooltip', {
        defaultMessage:
          'Granting All or Read feature privilege for Machine Learning will also grant the equivalent feature privileges to certain types of Kibana saved objects, namely index patterns, dashboards, saved Discover sessions and visualizations as well as machine learning job, trained model and module saved objects.',
      }),
      management: {
        insightsAndAlerting: ['jobsListLink', 'triggersActions'],
      },
      alerting: alertingFeatures,
      privileges: {
        all: admin,
        read: user,
      },
      reserved: {
        description: i18n.translate('xpack.ml.feature.reserved.description', {
          defaultMessage:
            'To grant users access, you should also assign either the machine_learning_user or machine_learning_admin role.',
        }),
        privileges: [
          {
            id: 'ml_user',
            privilege: user,
          },
          {
            id: 'ml_admin',
            privilege: admin,
          },
          {
            id: 'ml_apm_user',
            privilege: apmUser,
          },
        ],
      },
    });

    // initialize capabilities switcher to add license filter to ml capabilities
    setupCapabilitiesSwitcher(
      coreSetup,
      plugins.licensing.license$,
      this.enabledFeatures,
      this.log
    );
    setupSavedObjects(coreSetup.savedObjects);
    this.savedObjectsSyncService.registerSyncTask(
      plugins.taskManager,
      plugins.security,
      this.spacesPlugin !== undefined,
      () => this.isMlReady
    );

    const { getInternalSavedObjectsClient, getMlSavedObjectsClient } = savedObjectClientsFactory(
      () => this.savedObjectsStart
    );

    const getSpaces = plugins.spaces
      ? () => coreSetup.getStartServices().then(([, { spaces }]) => spaces!)
      : undefined;

    const getDataViews = () => {
      if (this.dataViews === null) {
        throw Error('Data views plugin not initialized');
      }
      return this.dataViews;
    };

    const resolveMlCapabilities = async (request: KibanaRequest) => {
      if (this.capabilities === null) {
        return null;
      }
      const capabilities = await this.capabilities.resolveCapabilities(request, {
        capabilityPath: 'ml.*',
      });
      return capabilities.ml as MlCapabilities;
    };

    const { internalServicesProviders, sharedServicesProviders } = createSharedServices(
      this.mlLicense,
      getSpaces,
      plugins.cloud,
      plugins.security?.authz,
      resolveMlCapabilities,
      () => this.clusterClient,
      () => getInternalSavedObjectsClient(),
      () => this.uiSettings,
      () => this.fieldsFormat,
      getDataViews,
      () => this.auditService,
      () => this.isMlReady,
      this.compatibleModuleType,
      this.enabledFeatures,
      this.serverless
    );

    const routeInit: RouteInitialization = {
      router: coreSetup.http.createRouter(),
      routeGuard: new RouteGuard(
        this.mlLicense,
        getMlSavedObjectsClient,
        getInternalSavedObjectsClient,
        plugins.spaces,
        plugins.security?.authz,
        () => this.isMlReady,
        () => this.dataViews,
        coreSetup.getStartServices,
        this.serverless
      ),
      mlLicense: this.mlLicense,
      getEnabledFeatures: () => this.enabledFeatures,
    };

    // Register Anomaly Detection routes
    if (this.enabledFeatures.ad) {
      annotationRoutes(routeInit, plugins.security);
      calendars(routeInit);
      dataFeedRoutes(routeInit);
      dataRecognizer(routeInit, this.compatibleModuleType);
      filtersRoutes(routeInit);
      jobAuditMessagesRoutes(routeInit);
      jobRoutes(routeInit);
      jobServiceRoutes(routeInit);
      resultsServiceRoutes(routeInit);
      jobValidationRoutes(routeInit);
    }

    // Register Data Frame Analytics routes
    if (this.enabledFeatures.dfa) {
      dataFrameAnalyticsRoutes(routeInit, plugins.cloud);
    }

    // Register Trained Model Management routes
    if (this.enabledFeatures.dfa || this.enabledFeatures.nlp) {
      trainedModelsRoutes(routeInit, plugins.cloud);
    }

    // Register Miscellaneous routes
    inferenceModelRoutes(routeInit, plugins.cloud);
    modelManagementRoutes(routeInit);
    dataVisualizerRoutes(routeInit);
    fieldsService(routeInit);
    savedObjectsRoutes(routeInit, {
      getSpaces,
      resolveMlCapabilities,
    });
    systemRoutes(routeInit, {
      getSpaces,
      cloud: plugins.cloud,
      resolveMlCapabilities,
      serverless: this.serverless,
    });
    notificationsRoutes(routeInit);
    alertingRoutes(routeInit, sharedServicesProviders);

    initMlServerLog({ log: this.log });

    if (plugins.alerting) {
      registerMlAlerts(
        {
          alerting: plugins.alerting,
          logger: this.log,
          mlSharedServices: sharedServicesProviders,
          mlServicesProviders: internalServicesProviders,
        },
        this.enabledFeatures
      );
    }

    registerKibanaSettings(coreSetup);

    registerEmbeddables(plugins.embeddable, this.enabledFeatures);

    if (plugins.usageCollection) {
      const getIndexForType = (type: string) =>
        coreSetup
          .getStartServices()
          .then(([coreStart]) => coreStart.savedObjects.getIndexForType(type));
      registerCollector(plugins.usageCollection, getIndexForType);
    }

    if (plugins.agentBuilder && this.anomalyDetectionSkillEnabled) {
      registerAnomalyDetectionAgentBuilder({
        agentBuilder: plugins.agentBuilder,
        resolveMlCapabilities,
        authorization: plugins.security?.authz,
        mlLicense: this.mlLicense,
      });
    }

    return { ...sharedServicesProviders };
  }

  public start(coreStart: CoreStart, plugins: PluginsStart): MlPluginStart {
    this.uiSettings = coreStart.uiSettings;
    this.fieldsFormat = plugins.fieldFormats;
    this.capabilities = coreStart.capabilities;
    this.clusterClient = coreStart.elasticsearch.client;
    this.savedObjectsStart = coreStart.savedObjects;
    this.auditService = coreStart.security.audit;
    this.dataViews = plugins.dataViews;

    this.mlLicense.setup(plugins.licensing.license$, async (mlLicense: MlLicense) => {
      if (mlLicense.isMlEnabled() === false || mlLicense.isFullLicense() === false) {
        try {
          await this.savedObjectsSyncService.unscheduleSyncTask(plugins.taskManager);
        } catch (e) {
          this.log.debug(`Error unscheduling saved objects sync task`, e);
        }
        return;
      }

      if (mlLicense.isMlEnabled() && mlLicense.isFullLicense()) {
        if (this.cases) {
          registerCasesPersistableState(this.cases, this.enabledFeatures, this.log);
        }
        if (this.home) {
          registerSampleDataSetLinks(this.home, this.enabledFeatures, this.log);
        }
      }
      // check whether the job saved objects exist
      // and create them if needed.
      const { initializeJobs } = jobSavedObjectsInitializationFactory(
        coreStart,
        this.security,
        this.spacesPlugin !== undefined
      );
      initializeJobs()
        .catch((err) => {
          this.log.debug(`Error initializing jobs`, err);
        })
        .finally(() => {
          this.setMlReady();
        });
      this.savedObjectsSyncService.scheduleSyncTask(plugins.taskManager, coreStart).catch((err) => {
        this.log.debug(`Error scheduling saved objects sync task`, err);
      });
    });
  }

  public stop() {
    this.mlLicense.unsubscribe();
  }
}
