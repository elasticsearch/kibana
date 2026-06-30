/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Observable } from 'rxjs';
import { QUERY_RULE_TYPE_ID, SAVED_QUERY_RULE_TYPE_ID } from '@kbn/securitysolution-rules';
import type { Logger, LogMeta } from '@kbn/core/server';
import { SavedObjectsClient } from '@kbn/core/server';
import type { UsageCollectionSetup, UsageCounter } from '@kbn/usage-collection-plugin/server';
import { ECS_COMPONENT_TEMPLATE_NAME } from '@kbn/alerting-plugin/server';
import { mappingFromFieldMap } from '@kbn/alerting-plugin/common';
import type { IRuleDataClient } from '@kbn/rule-registry-plugin/server';
import { Dataset } from '@kbn/rule-registry-plugin/server';
import type { ListPluginSetup } from '@kbn/lists-plugin/server';
import type { ILicense } from '@kbn/licensing-types';
import type { InferenceServerStart } from '@kbn/inference-plugin/server';
import type { SpacesServiceStart } from '@kbn/spaces-plugin/server';
import type { WorkflowsServerPluginSetup } from '@kbn/workflows-management-plugin/server';
import type { NewPackagePolicy, UpdatePackagePolicy } from '@kbn/fleet-plugin/common';
import { FLEET_ENDPOINT_PACKAGE } from '@kbn/fleet-plugin/common';

import { registerScriptsLibraryRoutes } from './endpoint/routes/scripts_library';
import { registerAttachments } from './agent_builder/attachments/register_attachments';
import { registerTools } from './agent_builder/tools/register_tools';
import { registerSkills } from './agent_builder/skills/register_skills';
import { registerRoutes as registerThreatIntelligenceRoutes } from './threat_intelligence/routes';
import { ensureThreatIntelligenceBootstrap } from './threat_intelligence/setup/bootstrap_threat_intelligence';
import { installBuiltinWorkflows as installThreatIntelligenceBuiltinWorkflows } from './threat_intelligence/workflows';
import { registerThreatIntelligenceWorkflowSteps } from './threat_intelligence/workflows/step_types';
import { registerDeprecatedThreatIntelligenceFeature } from './threat_intelligence/feature_deprecation';
import {
  registerIocIndicatorSyncTask,
  scheduleIocIndicatorSyncTask,
  registerBackfillDiamondFieldsTask,
} from './threat_intelligence/tasks';
import { migrateEndpointDataToSupportSpaces } from './endpoint/migrations/space_awareness_migration';
import { SavedObjectsClientFactory } from './endpoint/services/saved_objects';
import { registerEntityStoreDataViewRefreshTask } from './lib/entity_analytics/entity_store/tasks/data_view_refresh/data_view_refresh_task';
import { ensureIndicesExistsForPolicies } from './endpoint/migrations/ensure_indices_exists_for_policies';
import { CompleteExternalResponseActionsTask } from './endpoint/lib/response_actions';
import { registerAgentRoutes } from './endpoint/routes/agent';
import { endpointPackagePoliciesStatsSearchStrategyProvider } from './search_strategy/endpoint_package_policies_stats';
import { turnOffPolicyProtectionsIfNotSupported } from './endpoint/migrations/turn_off_policy_protections';
import { endpointSearchStrategyProvider } from './search_strategy/endpoint';
import { getScheduleNotificationResponseActionsService } from './lib/detection_engine/rule_response_actions/schedule_notification_response_actions';
import {
  createEqlAlertType,
  createEsqlAlertType,
  createIndicatorMatchAlertType,
  createMlAlertType,
  createNewTermsAlertType,
  createQueryAlertType,
  createThresholdAlertType,
} from './lib/detection_engine/rule_types';
import { initRoutes } from './routes';
import { registerLimitedConcurrencyRoutes } from './routes/limited_concurrency';
import { ManifestConstants, ManifestTask } from './endpoint/lib/artifacts';
import { CheckMetadataTransformsTask } from './endpoint/lib/metadata';
import { initEncryptedSavedObjects, initSavedObjects } from './saved_objects';
import { AppClientFactory } from './client';
import type { ConfigType } from './config';
import { createConfig } from './config';
import { initUiSettings } from './ui_settings';
import { registerDeprecations } from './deprecations';
import {
  APP_ID,
  APP_UI_ID,
  DEFAULT_ALERTS_INDEX,
  DEFAULT_DETECTIONS_CLOSE_REASONS_KEY,
  EXCLUDE_COLD_AND_FROZEN_TIERS_IN_ANALYZER,
  SERVER_APP_ID,
} from '../common/constants';
import { registerCaseAttachments } from './cases/attachments/register';
import { securityAlertAttachmentType } from './cases/attachments/alert';
import { DefaultClosingReasonSchema } from '../common/types';
import { registerEndpointRoutes } from './endpoint/routes/metadata';
import { registerPolicyRoutes } from './endpoint/routes/policy';
import { registerActionRoutes } from './endpoint/routes/actions';
import { registerEndpointSuggestionsRoutes } from './endpoint/routes/suggestions';
import {
  EndpointArtifactClient,
  ManifestManager,
  securityWorkflowInsightsService,
} from './endpoint/services';
import { EndpointAppContextService } from './endpoint/endpoint_app_context_services';
import type { EndpointAppContext } from './endpoint/types';
import { initUsageCollectors } from './usage';
import { registerAssetInventoryUsageCollector } from './lib/asset_inventory/telemetry/collectors/register';
import type { SecuritySolutionRequestHandlerContext } from './types';
import { securitySolutionSearchStrategyProvider } from './search_strategy/security_solution';
import type { ITelemetryEventsSender } from './lib/telemetry/sender';
import { TelemetryEventsSender } from './lib/telemetry/sender';
import { type IAsyncTelemetryEventsSender } from './lib/telemetry/async_sender.types';
import {
  AsyncTelemetryEventsSender,
  DEFAULT_QUEUE_CONFIG,
  DEFAULT_RETRY_CONFIG,
} from './lib/telemetry/async_sender';
import type { ITelemetryReceiver } from './lib/telemetry/receiver';
import { TelemetryReceiver } from './lib/telemetry/receiver';
import { licenseService } from './lib/license';
import { PolicyWatcher } from './endpoint/lib/policy/license_watch';
import previewPolicy from './lib/detection_engine/routes/index/preview_policy.json';
import type { IRuleMonitoringService } from './lib/detection_engine/rule_monitoring';
import { createRuleMonitoringService } from './lib/detection_engine/rule_monitoring';
// eslint-disable-next-line no-restricted-imports
import {
  isLegacyNotificationRuleExecutor,
  legacyRulesNotificationRuleType,
} from './lib/detection_engine/rule_actions_legacy';
import {
  createSecurityRuleTypeWrapper,
  securityRuleTypeFieldMap,
} from './lib/detection_engine/rule_types/create_security_rule_type_wrapper';
import type { CreateSecurityRuleTypeWrapperProps } from './lib/detection_engine/rule_types/types';

import { RequestContextFactory } from './request_context_factory';

import type {
  ISecuritySolutionPlugin,
  PluginInitializerContext,
  SecuritySolutionPluginCoreSetupDependencies,
  SecuritySolutionPluginCoreStartDependencies,
  SecuritySolutionPluginSetup,
  SecuritySolutionPluginSetupDependencies,
  SecuritySolutionPluginStart,
  SecuritySolutionPluginStartDependencies,
} from './plugin_contract';
import { featureUsageService } from './endpoint/services/feature_usage';
import { setIsElasticCloudDeployment } from './lib/telemetry/helpers';
import { artifactService, type CdnConfig } from './lib/telemetry/artifact';
import { events } from './lib/telemetry/event_based/events';
import { endpointFieldsProvider } from './search_strategy/endpoint_fields';
import {
  ENDPOINT_FIELDS_SEARCH_STRATEGY,
  ENDPOINT_PACKAGE_POLICIES_STATS_STRATEGY,
  ENDPOINT_SEARCH_STRATEGY,
} from '../common/endpoint/constants';

import { registerPrivilegeMonitoringTask } from './lib/entity_analytics/privilege_monitoring/tasks/privilege_monitoring_task';
import { registerLeadGenerationTask } from './lib/entity_analytics/lead_generation/tasks';
import { ProductFeaturesService } from './lib/product_features_service/product_features_service';
import { registerRiskScoringTask } from './lib/entity_analytics/risk_score/tasks/risk_scoring_task';
import { registerRiskScoreMaintainer } from './lib/entity_analytics/risk_score/maintainer/register_risk_score_maintainer';
import {
  registerEntityStoreFieldRetentionEnrichTask,
  registerEntityStoreSnapshotTask,
  registerEntityStoreHealthTask,
} from './lib/entity_analytics/entity_store/tasks';
import { accessesFrequentlyMaintainer } from './lib/entity_analytics/maintainers/accesses';
import { communicatesWithMaintainer } from './lib/entity_analytics/maintainers/communicates_with';
import { administersMaintainer } from './lib/entity_analytics/maintainers/administers';
import { registerProtectionUpdatesNoteRoutes } from './endpoint/routes/protection_updates_note';
import {
  allRiskScoreIndexPattern,
  latestRiskScoreIndexPattern,
} from '../common/entity_analytics/risk_engine';
import { isEndpointPackageV2 } from '../common/endpoint/utils/package_v2';
import { assistantTools } from './assistant/tools';
import { turnOffAgentPolicyFeatures } from './endpoint/migrations/turn_off_agent_policy_features';
import { getCriblPackagePolicyPostCreateOrUpdateCallback } from './security_integrations';
import { scheduleEntityAnalyticsMigration } from './lib/entity_analytics/migrations';
import { SiemMigrationsService } from './lib/siem_migrations/siem_migrations_service';
import { SIEM_MIGRATION_INFERENCE_FEATURE_ID } from '../common/siem_migrations/constants';
import { TelemetryConfigProvider } from '../common/telemetry_config/telemetry_config_provider';
import { TelemetryConfigWatcher } from './endpoint/lib/policy/telemetry_watch';
import { threatIntelligenceSearchStrategyProvider } from './threat_intelligence/search_strategy';
import { THREAT_INTELLIGENCE_SEARCH_STRATEGY_NAME } from '../common/threat_intelligence/constants';
import { HealthDiagnosticServiceImpl } from './lib/telemetry/diagnostic/health_diagnostic_service';
import type { HealthDiagnosticService } from './lib/telemetry/diagnostic/health_diagnostic_service.types';
import { ENTITY_RISK_SCORE_TOOL_ID } from './assistant/tools/entity_risk_score/entity_risk_score';
import type { TelemetryQueryConfiguration } from './lib/telemetry/types';
import type { TrialCompanionMilestoneService } from './lib/trial_companion/services/trial_companion_milestone_service.types';
import {
  createTrialCompanionMilestoneServiceDeps,
  TrialCompanionMilestoneServiceImpl,
} from './lib/trial_companion/services/trial_companion_milestone_service';
import { AIValueReportLocatorDefinition } from '../common/locators/ai_value_report/locator';
import type { TrialCompanionRoutesDeps } from './lib/trial_companion/types';
import { setupAlertsCapabilitiesSwitcher } from './lib/capabilities/alerts_capabilities_switcher';
import { securityAlertsProfileInitializer } from './lib/anonymization';
import { registerWorkflowSteps } from './workflows/step_types';
import { registerWatchlistMaintainer } from './lib/entity_analytics/watchlists/maintainer/register_watchlist_maintainer';
import { registerEndpointExceptionsRoutes } from './endpoint/routes/endpoint_exceptions_per_policy_opt_in';
import { initializeEndpointExceptionsPerPolicyOptInStatus } from './endpoint/lib/reference_data';

export type { SetupPlugins, StartPlugins, PluginSetup, PluginStart } from './plugin_contract';

const SECURITY_INFERENCE_PARENT_FEATURE_ID = 'security_search_inference_parent';

export class Plugin implements ISecuritySolutionPlugin {
  private readonly pluginContext: PluginInitializerContext;
  private readonly config: ConfigType;
  private readonly logger: Logger;
  private readonly appClientFactory: AppClientFactory;
  private readonly productFeaturesService: ProductFeaturesService;

  private readonly ruleMonitoringService: IRuleMonitoringService;
  private readonly endpointAppContextService = new EndpointAppContextService();
  private readonly siemMigrationsService: SiemMigrationsService;
  private readonly telemetryReceiver: ITelemetryReceiver;
  private readonly telemetryEventsSender: ITelemetryEventsSender;
  private readonly asyncTelemetryEventsSender: IAsyncTelemetryEventsSender;

  private readonly healthDiagnosticService: HealthDiagnosticService;

  private lists: ListPluginSetup | undefined; // TODO: can we create ListPluginStart?
  private licensing$!: Observable<ILicense>;
  private policyWatcher?: PolicyWatcher;
  private telemetryConfigProvider: TelemetryConfigProvider;
  private telemetryWatcher?: TelemetryConfigWatcher;

  private manifestTask: ManifestTask | undefined;
  private completeExternalResponseActionsTask: CompleteExternalResponseActionsTask;
  private checkMetadataTransformsTask: CheckMetadataTransformsTask | undefined;
  private telemetryUsageCounter?: UsageCounter;
  private endpointContext: EndpointAppContext;
  private trialCompanionMilestoneService: TrialCompanionMilestoneService;
  private usageCollection?: UsageCollectionSetup;

  // Threat-intelligence private state (migrated from the standalone
  // threat-intelligence plugin). Captured during start() so routes
  // registered in setup() can resolve the current request's space / inference
  // service at call-time without holding setup-boundary references. The
  // optional `workflowsManagement` setup contract is captured in setup() so
  // built-in workflow registration can be deferred to start() (the
  // WorkflowsManagementApi gates every method behind its own initPromise).
  private threatIntelligenceSpacesService: SpacesServiceStart | undefined;
  private threatIntelligenceInference: InferenceServerStart | undefined;
  private threatIntelligenceWorkflowsManagement: WorkflowsServerPluginSetup | undefined;
  // Actions start contract stored for the backfill task runner's connector resolution.
  private threatIntelligenceActions:
    | import('@kbn/actions-plugin/server').PluginStartContract
    | undefined;
  // Task Manager start contract stored so the backfill route can schedule tasks.
  private threatIntelligenceTaskManager:
    | import('@kbn/task-manager-plugin/server').TaskManagerStartContract
    | undefined;

  private isServerless: boolean;

  constructor(context: PluginInitializerContext) {
    const serverConfig = createConfig(context);

    this.pluginContext = context;
    this.config = serverConfig;
    this.logger = context.logger.get();
    this.appClientFactory = new AppClientFactory();
    this.productFeaturesService = new ProductFeaturesService(
      this.logger,
      this.config.experimentalFeatures
    );
    this.siemMigrationsService = new SiemMigrationsService(
      this.config,
      this.pluginContext.logger,
      this.pluginContext.env.packageInfo.version
    );

    this.ruleMonitoringService = createRuleMonitoringService(this.config, this.logger);
    this.telemetryEventsSender = new TelemetryEventsSender(
      this.logger,
      this.config.experimentalFeatures
    );
    this.asyncTelemetryEventsSender = new AsyncTelemetryEventsSender(this.logger);
    this.telemetryReceiver = new TelemetryReceiver(this.logger);

    this.telemetryConfigProvider = new TelemetryConfigProvider();

    this.endpointContext = {
      logFactory: this.pluginContext.logger,
      service: this.endpointAppContextService,
      config: (): Promise<ConfigType> => Promise.resolve(this.config),
      get serverConfig() {
        return serverConfig;
      },
      experimentalFeatures: this.config.experimentalFeatures,
    };
    this.completeExternalResponseActionsTask = new CompleteExternalResponseActionsTask({
      endpointAppContext: this.endpointContext,
    });
    this.isServerless = context.env.packageInfo.buildFlavor === 'serverless';

    this.logger.debug('plugin initialized');

    this.healthDiagnosticService = new HealthDiagnosticServiceImpl(this.logger);
    this.trialCompanionMilestoneService = new TrialCompanionMilestoneServiceImpl(this.logger);
  }

  private registerAgentBuilderAttachmentsAndTools(
    plugins: SecuritySolutionPluginSetupDependencies,
    core: SecuritySolutionPluginCoreSetupDependencies,
    logger: Logger,
    previewRuleDataClient: IRuleDataClient,
    securityRuleTypeOptions: CreateSecurityRuleTypeWrapperProps
  ): void {
    if (!plugins.agentBuilder) {
      return;
    }

    const agentBuilder = plugins.agentBuilder;

    const experimentalFeatures = this.config.experimentalFeatures;
    const endpointAppContextService = this.endpointAppContextService;

    registerTools(
      agentBuilder,
      core,
      logger,
      experimentalFeatures,
      plugins.ml,
      {
        config: this.config,
        ml: plugins.ml,
        security: plugins.security,
        securityRuleTypeOptions,
        previewRuleDataClient,
        getStartServices: core.getStartServices,
        logger,
        isServerless: this.isServerless,
      },
      this.isServerless
    ).catch((error) => {
      this.logger.error(`Error registering security tools: ${error}`);
    });
    registerAttachments(agentBuilder, core, logger, experimentalFeatures).catch((error) => {
      this.logger.error(`Error registering security attachments: ${error}`);
    });

    registerSkills({
      agentBuilder,
      experimentalFeatures,
      getStartServices: core.getStartServices,
      kibanaVersion: this.pluginContext.env.packageInfo.version,
      logger,
      ml: plugins.ml,
      options: { endpointAppContextService },
    }).catch((error) => {
      this.logger.error(`Error registering security skills: ${error}`);
    });
  }

  /**
   * Threat-intelligence server-side setup (migrated from the standalone
   * threat-intelligence plugin).
   *
   * Wires HTTP routes, captures the optional `workflowsManagement` setup
   * contract for later use in start(), and registers the IOC indicator-sync
   * Task Manager task.
   *
   * Gating policy:
   *  - Routes are gated on `threatIntelligenceSkillEnabled` so dark-flagged
   *    deployments do not expose the internal endpoints. The interactive
   *    `subscription-confirmation` attachment depends on
   *    `SUBMIT_SUBSCRIPTION_API_PATH`, so toggling the flag off effectively
   *    disables that attachment's form submission — acceptable for an
   *    experimental feature.
   *  - The IOC indicator-sync task is gated on the separate
   *    `iocIndicatorSyncEnabled` flag (independent operator opt-in) AND the
   *    optional `taskManager` dependency.
   *  - Saved-object type, UI settings, and agent_builder attachment-type
   *    registrations are NOT done here — they live unconditionally in
   *    `initSavedObjects` / `initUiSettings` / `registerAttachments` so user
   *    data and declarative type registrations survive flag toggles.
   */
  private setupThreatIntelligence(
    plugins: SecuritySolutionPluginSetupDependencies,
    core: SecuritySolutionPluginCoreSetupDependencies
  ): void {
    const experimentalFeatures = this.config.experimentalFeatures;

    // Capture the workflows-management setup contract (optional plugin) so
    // start() can install built-in workflows once the API's internal init
    // promise has resolved.
    this.threatIntelligenceWorkflowsManagement = plugins.workflowsManagement;

    if (experimentalFeatures.threatIntelligenceSkillEnabled) {
      const router = core.http.createRouter();
      registerThreatIntelligenceRoutes({
        router,
        logger: this.logger.get('threatIntelligence'),
        getSpacesService: () => this.threatIntelligenceSpacesService,
        getInference: () => this.threatIntelligenceInference,
        getTaskManager: () => this.threatIntelligenceTaskManager,
      });
      this.logger.info(
        'Threat Intelligence routes registered (threatIntelligenceSkillEnabled is on)'
      );

      // Register the `threat_intel.fetch_source` workflow step. The
      // step replaces the per-adapter `http` + parse + fingerprint
      // chain that used to live inline in the source-ingestion YAML
      // (see the top-of-file comment in
      // `threat_intelligence/workflows/source_ingestion.yaml`).
      // `workflowsExtensions` is an optional plugin — skip cleanly
      // when it isn't installed, mirroring the
      // `installThreatIntelligenceBuiltinWorkflows` skip in start().
      if (plugins.workflowsExtensions) {
        registerThreatIntelligenceWorkflowSteps({
          workflowsExtensions: plugins.workflowsExtensions,
          logger: this.logger.get('threatIntelligence'),
          // Lazy resolver for the actions plugin's start contract.
          // Used by the TAXII adapter when a source has a
          // `config.connector_id` referencing a `.taxii` Connectors v2
          // saved object. The thunk also serves vendor_api once that
          // adapter migrates to the same pattern. Returning `undefined`
          // makes adapters' connector path throw a clear error rather
          // than silently fall back to anonymous fetches.
          getActionsStart: async () => {
            const [, startPlugins] = await core.getStartServices();
            return startPlugins.actions;
          },
        });
      } else {
        this.logger.debug(
          'workflowsExtensions plugin not available — skipping threat_intel.fetch_source registration'
        );
      }

      // Bootstrap indices + the default feed catalog once core start services
      // (and Elasticsearch) are ready.
      void core.getStartServices().then(([coreStart]) => {
        void ensureThreatIntelligenceBootstrap({
          esClient: coreStart.elasticsearch.client.asInternalUser,
          logger: this.logger.get('threatIntelligence'),
        }).catch((err) => {
          this.logger.error(`Failed to bootstrap threat intelligence: ${(err as Error).message}`);
        });
      });
    } else {
      this.logger.debug(
        'Threat Intelligence routes not registered. Enable via xpack.securitySolution.enableExperimental: ["threatIntelligenceSkillEnabled"]'
      );
    }

    if (experimentalFeatures.iocIndicatorSyncEnabled) {
      if (!experimentalFeatures.threatIntelligenceSkillEnabled) {
        this.logger.warn(
          'iocIndicatorSyncEnabled is on but threatIntelligenceSkillEnabled is off — ' +
            'the IOC sync task depends on indices bootstrapped by the skill flag; ' +
            'the task will fail until threatIntelligenceSkillEnabled is also enabled.'
        );
      }
      if (plugins.taskManager) {
        registerIocIndicatorSyncTask({
          taskManager: plugins.taskManager,
          coreSetup: core,
          logger: this.logger.get('threatIntelligence', 'iocIndicatorSync'),
        });
        this.logger.info(
          'Threat Intelligence IOC indicator-sync task registered (iocIndicatorSyncEnabled is on)'
        );
      } else {
        this.logger.warn(
          'iocIndicatorSyncEnabled is set but the optional `taskManager` plugin is not available — skipping registration.'
        );
      }
    }

    if (experimentalFeatures.threatIntelligenceSkillEnabled && plugins.taskManager) {
      registerBackfillDiamondFieldsTask({
        taskManager: plugins.taskManager,
        coreSetup: core,
        logger: this.logger.get('threatIntelligence', 'backfillDiamond'),
        getInference: () => this.threatIntelligenceInference,
        getActions: () => this.threatIntelligenceActions,
      });
      this.logger.debug('Threat Intelligence backfill_diamond_fields task registered');
    }
  }

  /**
   * Threat-intelligence server-side start (migrated from the standalone
   * threat-intelligence plugin).
   *
   * Captures optional `spaces` and `inference` start contracts for the
   * routes registered in setup(), re-checks the feed catalog bootstrap when
   * empty, and registers built-in workflows. Gated on
   * `threatIntelligenceSkillEnabled`.
   *
   * The IOC indicator-sync task is scheduled here (its type was registered
   * in setup) when its independent `iocIndicatorSyncEnabled` flag is on and
   * `taskManager` is available.
   */
  private startThreatIntelligence(
    plugins: SecuritySolutionPluginStartDependencies,
    core: SecuritySolutionPluginCoreStartDependencies
  ): void {
    const experimentalFeatures = this.config.experimentalFeatures;

    // Always capture spaces / inference / actions / taskManager references so they're
    // available to any threat-intelligence handler that already started (e.g. routes
    // registered earlier in setup). Cheap, no side effects.
    this.threatIntelligenceSpacesService = plugins.spaces?.spacesService;
    this.threatIntelligenceInference = plugins.inference;
    this.threatIntelligenceActions = plugins.actions;
    this.threatIntelligenceTaskManager = plugins.taskManager;

    if (experimentalFeatures.threatIntelligenceSkillEnabled) {
      const esClient = core.elasticsearch.client.asInternalUser;
      const logger = this.logger.get('threatIntelligence');

      // Heal an empty catalog after Elasticsearch was reset or if setup-time
      // bootstrap failed while the cluster was still starting.
      void ensureThreatIntelligenceBootstrap({ esClient, logger }).catch((err) => {
        logger.error(
          `Failed to ensure threat intelligence bootstrap on start: ${(err as Error).message}`
        );
      });

      if (this.threatIntelligenceWorkflowsManagement) {
        // Built-in workflows are upserted idempotently by stable id at every
        // plugin start. See `./threat_intelligence/workflows/index.ts` for
        // the rationale behind keeping `owner: 'threatIntelligence'`.
        installThreatIntelligenceBuiltinWorkflows({
          workflowsManagement: this.threatIntelligenceWorkflowsManagement,
          logger,
        }).catch((err) => {
          logger.error(`Failed to install threat-intelligence built-in workflows: ${err.message}`);
        });
      } else {
        logger.debug(
          'workflowsManagement plugin not available — skipping built-in workflow registration'
        );
      }
    }

    if (experimentalFeatures.iocIndicatorSyncEnabled && plugins.taskManager) {
      void scheduleIocIndicatorSyncTask({
        taskManager: plugins.taskManager,
        logger: this.logger.get('threatIntelligence', 'iocIndicatorSync'),
      }).catch((err) => {
        this.logger.error(`Failed to schedule IOC indicator sync task: ${err.message}`);
      });
    }
  }

  public setup(
    core: SecuritySolutionPluginCoreSetupDependencies,
    plugins: SecuritySolutionPluginSetupDependencies
  ): SecuritySolutionPluginSetup {
    this.logger.debug('plugin setup');

    if (plugins.share) {
      plugins.share.url.locators.create(new AIValueReportLocatorDefinition());
    }

    const { appClientFactory, productFeaturesService, pluginContext, config, logger } = this;
    const experimentalFeatures = config.experimentalFeatures;

    initSavedObjects(core.savedObjects, experimentalFeatures, this.logger.get('initSavedObjects'));
    initEncryptedSavedObjects({
      encryptedSavedObjects: plugins.encryptedSavedObjects,
      logger: this.logger,
    });

    initUiSettings(core.uiSettings, experimentalFeatures, config.enableUiSettingsValidations);
    productFeaturesService.setup(core, plugins);

    // Register the deprecated standalone `threatIntelligence` Kibana feature
    // AFTER `productFeaturesService.setup` so the replacement sub-feature on
    // the Security Solution feature already exists when the features plugin
    // validates `replacedBy`. This is what lets role assignments that still
    // reference the standalone feature lazy-migrate to the new sub-feature on
    // next save (see the `kibana-privilege-deprecation` skill).
    registerDeprecatedThreatIntelligenceFeature({ features: plugins.features });

    events.forEach((eventConfig) => {
      core.analytics.registerEventType(eventConfig);
    });

    this.ruleMonitoringService.setup(core, plugins);

    registerDeprecations({ core, config: this.config, logger: this.logger });

    if (experimentalFeatures.entityAnalyticsEntityStoreV2) {
      registerRiskScoreMaintainer({
        entityStore: plugins.entityStore,
        getStartServices: core.getStartServices,
        kibanaVersion: pluginContext.env.packageInfo.version,
        logger: this.logger,
        auditLogger: plugins.security?.audit.withoutRequest,
        productFeaturesService,
        entityAnalyticsConfig: config.entityAnalytics,
        telemetry: core.analytics,
      });
      if (experimentalFeatures.entityAnalyticsWatchlistEnabled) {
        registerWatchlistMaintainer({
          entityStore: plugins.entityStore,
          getStartServices: core.getStartServices,
          logger: this.logger,
          hasEncryptionKey: plugins.encryptedSavedObjects?.canEncrypt === true,
        });
      }
    } else {
      registerRiskScoringTask({
        getStartServices: core.getStartServices,
        kibanaVersion: pluginContext.env.packageInfo.version,
        logger: this.logger,
        auditLogger: plugins.security?.audit.withoutRequest,
        taskManager: plugins.taskManager,
        telemetry: core.analytics,
        entityAnalyticsConfig: config.entityAnalytics,
        experimentalFeatures,
      });
    }

    scheduleEntityAnalyticsMigration({
      getStartServices: core.getStartServices,
      taskManager: plugins.taskManager,
      logger: this.logger,
      auditLogger: plugins.security?.audit.withoutRequest,
      kibanaVersion: pluginContext.env.packageInfo.version,
      experimentalFeatures,
      hasEncryptionKey: plugins.encryptedSavedObjects?.canEncrypt === true,
    }).catch((err) => {
      logger.error(`Error scheduling entity analytics migration: ${err}`);
    });

    if (!experimentalFeatures.entityStoreDisabled) {
      plugins.entityStore?.registerEntityMaintainer(accessesFrequentlyMaintainer);
      plugins.entityStore?.registerEntityMaintainer(communicatesWithMaintainer);
      plugins.entityStore?.registerEntityMaintainer(administersMaintainer);

      registerEntityStoreFieldRetentionEnrichTask({
        getStartServices: core.getStartServices,
        logger: this.logger,
        telemetry: core.analytics,
        taskManager: plugins.taskManager,
      });

      registerEntityStoreDataViewRefreshTask({
        getStartServices: core.getStartServices,
        appClientFactory,
        logger: this.logger,
        telemetry: core.analytics,
        taskManager: plugins.taskManager,
        auditLogger: plugins.security?.audit.withoutRequest,
        entityStoreConfig: config.entityAnalytics.entityStore,
        experimentalFeatures,
        kibanaVersion: pluginContext.env.packageInfo.version,
        isServerless: this.isServerless,
      });

      registerEntityStoreSnapshotTask({
        getStartServices: core.getStartServices,
        logger: this.logger,
        telemetry: core.analytics,
        taskManager: plugins.taskManager,
      });

      registerEntityStoreHealthTask({
        getStartServices: core.getStartServices,
        appClientFactory,
        logger: this.logger,
        telemetry: core.analytics,
        taskManager: plugins.taskManager,
        auditLogger: plugins.security?.audit.withoutRequest,
        entityStoreConfig: config.entityAnalytics.entityStore,
        experimentalFeatures,
        kibanaVersion: pluginContext.env.packageInfo.version,
        isServerless: this.isServerless,
      });
    }

    registerPrivilegeMonitoringTask({
      getStartServices: core.getStartServices,
      taskManager: plugins.taskManager,
      logger: this.logger,
      telemetry: core.analytics,
      kibanaVersion: pluginContext.env.packageInfo.version,
      experimentalFeatures,
      config: this.config,
    });

    registerLeadGenerationTask({
      getStartServices: core.getStartServices,
      taskManager: plugins.taskManager,
      logger: this.logger,
      telemetry: core.analytics,
      kibanaVersion: pluginContext.env.packageInfo.version,
      experimentalFeatures,
      config: this.config,
    });

    if (plugins.searchInferenceEndpoints) {
      // The `SECURITY_INFERENCE_PARENT_FEATURE_ID` parent is registered by
      // `elastic_assistant`, which `security_solution` depends on (so it sets up
      // first). We only register child features here.
      plugins.searchInferenceEndpoints.features.register({
        parentFeatureId: SECURITY_INFERENCE_PARENT_FEATURE_ID,
        featureId: 'entity_ai_highlight_summary',
        featureName: 'Entity AI Highlight Summary',
        featureDescription: 'Entity AI Highlight Summary inference endpoint configuration',
        taskType: 'chat_completion',
        recommendedEndpoints: [],
      });

      if (!experimentalFeatures.siemMigrationsDisabled) {
        plugins.searchInferenceEndpoints.features.register({
          parentFeatureId: SECURITY_INFERENCE_PARENT_FEATURE_ID,
          featureId: SIEM_MIGRATION_INFERENCE_FEATURE_ID,
          featureName: 'Automatic migration',
          featureDescription: 'Automatic migration inference endpoint configuration',
          taskType: 'chat_completion',
          recommendedEndpoints: [],
        });
      }

      plugins.searchInferenceEndpoints.features.register({
        parentFeatureId: SECURITY_INFERENCE_PARENT_FEATURE_ID,
        featureId: 'defend_insights',
        featureName: 'Automatic Troubleshooting',
        featureDescription: 'Automatic Troubleshooting inference endpoint configuration',
        taskType: 'chat_completion',
        recommendedEndpoints: [],
      });

      plugins.searchInferenceEndpoints.features.register({
        parentFeatureId: SECURITY_INFERENCE_PARENT_FEATURE_ID,
        featureId: 'attack_discovery',
        featureName: 'Attack Discovery',
        featureDescription: 'Attack Discovery inference endpoint configuration',
        taskType: 'chat_completion',
        recommendedEndpoints: [],
      });

      if (experimentalFeatures.leadGenerationEnabled) {
        plugins.searchInferenceEndpoints.features.register({
          parentFeatureId: SECURITY_INFERENCE_PARENT_FEATURE_ID,
          featureId: 'lead_generation',
          featureName: 'Threat Hunting Lead Generation',
          featureDescription: 'Lead generation inference endpoint configuration',
          taskType: 'chat_completion',
          recommendedEndpoints: [],
        });
      }

      plugins.searchInferenceEndpoints.features.register({
        parentFeatureId: 'security_search_inference_parent',
        featureId: 'ai_value_report',
        featureName: 'AI Value Report',
        featureDescription: 'AI Value Report inference endpoint configuration',
        taskType: 'chat_completion',
        recommendedEndpoints: [],
      });
    }

    const requestContextFactory = new RequestContextFactory({
      config,
      logger,
      core,
      plugins,
      endpointAppContextService: this.endpointAppContextService,
      ruleMonitoringService: this.ruleMonitoringService,
      siemMigrationsService: this.siemMigrationsService,
      kibanaVersion: pluginContext.env.packageInfo.version,
      kibanaBranch: pluginContext.env.packageInfo.branch,
      buildFlavor: pluginContext.env.packageInfo.buildFlavor,
      productFeaturesService,
    });

    const router = core.http.createRouter<SecuritySolutionRequestHandlerContext>();
    core.http.registerRouteHandlerContext<SecuritySolutionRequestHandlerContext, typeof APP_ID>(
      APP_ID,
      (context, request) => requestContextFactory.create(context, request)
    );

    this.endpointAppContextService.setup({
      securitySolutionRequestContextFactory: requestContextFactory,
      cloud: plugins.cloud,
      loggerFactory: this.pluginContext.logger,
      telemetry: core.analytics,
    });

    initUsageCollectors({
      core,
      eventLogIndex: plugins.eventLog.getIndexPattern(),
      signalsIndex: DEFAULT_ALERTS_INDEX,
      ml: plugins.ml,
      usageCollection: plugins.usageCollection,
      logger,
      riskEngineIndexPatterns: {
        all: allRiskScoreIndexPattern,
        latest: latestRiskScoreIndexPattern,
      },
      legacySignalsIndex: config.signalsIndex,
    });

    registerAssetInventoryUsageCollector(
      this.logger,
      core.getStartServices(),
      plugins.usageCollection
    );

    this.telemetryUsageCounter = plugins.usageCollection?.createUsageCounter(APP_ID);
    this.usageCollection = plugins.usageCollection;
    registerCaseAttachments(plugins.cases.attachmentFramework);
    plugins.cases.attachmentFramework.registerUnified(securityAlertAttachmentType);

    plugins.cases.registerCloseReasonValidator(APP_ID, async (closeReason, request) => {
      const [coreStart] = await core.getStartServices();
      const soClient = coreStart.savedObjects.getScopedClient(request);
      const uiSettingsClient = coreStart.uiSettings.asScopedToClient(soClient);
      const customReasons =
        (await uiSettingsClient.get<string[]>(DEFAULT_DETECTIONS_CLOSE_REASONS_KEY)) ?? [];
      const allowedReasons = new Set([...DefaultClosingReasonSchema.options, ...customReasons]);
      return allowedReasons.has(closeReason);
    });

    const { ruleDataService } = plugins.ruleRegistry;
    let ruleDataClient: IRuleDataClient | null = null;
    let previewRuleDataClient: IRuleDataClient | null = null;

    const ruleDataServiceOptions = {
      feature: SERVER_APP_ID,
      registrationContext: 'security',
      dataset: Dataset.alerts,
      componentTemplateRefs: [ECS_COMPONENT_TEMPLATE_NAME],
      componentTemplates: [
        {
          name: 'mappings',
          mappings: mappingFromFieldMap(securityRuleTypeFieldMap, false),
        },
      ],
      secondaryAlias: config.signalsIndex,
    };

    ruleDataClient = ruleDataService.initializeIndex(ruleDataServiceOptions);
    const previewIlmPolicy = previewPolicy.policy;

    previewRuleDataClient = ruleDataService.initializeIndex({
      ...ruleDataServiceOptions,
      additionalPrefix: '.preview',
      ilmPolicy: previewIlmPolicy,
      secondaryAlias: undefined,
    });

    const securityRuleTypeOptions = {
      lists: plugins.lists,
      docLinks: core.docLinks,
      actions: plugins.actions,
      logger: this.logger,
      config: this.config,
      publicBaseUrl: core.http.basePath.publicBaseUrl,
      ruleDataClient,
      ruleExecutionLoggerFactory:
        this.ruleMonitoringService.createRuleExecutionLogClientForExecutors,
      version: pluginContext.env.packageInfo.version,
      experimentalFeatures: config.experimentalFeatures,
      alerting: plugins.alerting,
      analytics: core.analytics,
      isServerless: this.isServerless,
      eventsTelemetry: this.telemetryEventsSender,
      licensing: plugins.licensing,
      scheduleNotificationResponseActionsService: getScheduleNotificationResponseActionsService({
        endpointAppContextService: this.endpointAppContextService,
        osqueryCreateActionService: plugins.osquery?.createActionService,
      }),
      endpointAppContextService: this.endpointAppContextService,
      getEntityStore: async () => {
        const [, startPlugins] = await core.getStartServices();
        return startPlugins.entityStore;
      },
    };

    const securityRuleTypeWrapper = createSecurityRuleTypeWrapper(securityRuleTypeOptions);

    plugins.alerting.registerType(securityRuleTypeWrapper(createEqlAlertType()));
    if (!experimentalFeatures.esqlRulesDisabled) {
      plugins.alerting.registerType(securityRuleTypeWrapper(createEsqlAlertType()));
    }
    plugins.alerting.registerType(
      securityRuleTypeWrapper(
        createQueryAlertType({
          id: SAVED_QUERY_RULE_TYPE_ID,
          name: 'Saved Query Rule',
        })
      )
    );
    plugins.alerting.registerType(securityRuleTypeWrapper(createIndicatorMatchAlertType()));
    plugins.alerting.registerType(securityRuleTypeWrapper(createMlAlertType(plugins.ml)));
    plugins.alerting.registerType(
      securityRuleTypeWrapper(
        createQueryAlertType({
          id: QUERY_RULE_TYPE_ID,
          name: 'Custom Query Rule',
        })
      )
    );
    plugins.alerting.registerType(securityRuleTypeWrapper(createThresholdAlertType()));
    plugins.alerting.registerType(securityRuleTypeWrapper(createNewTermsAlertType()));

    const trialCompanionDeps: TrialCompanionRoutesDeps = {
      router,
      logger,
      enabled: config.experimentalFeatures.trialCompanionEnabled && plugins.cloud?.isInTrial(),
    };

    // TODO We need to get the endpoint routes inside of initRoutes
    const enableDataGeneratorRoutes =
      pluginContext.env.mode.dev || plugins.cloud.isElasticStaffOwned === true;
    initRoutes(
      router,
      config,
      plugins.encryptedSavedObjects?.canEncrypt === true,
      plugins.security,
      this.telemetryEventsSender,
      plugins.ml,
      ruleDataService,
      logger,
      ruleDataClient,
      core.getStartServices,
      securityRuleTypeOptions,
      previewRuleDataClient,
      this.telemetryReceiver,
      this.isServerless,
      core.docLinks,
      this.endpointContext,
      trialCompanionDeps,
      enableDataGeneratorRoutes
    );

    registerEndpointRoutes(router, this.endpointContext);
    registerEndpointSuggestionsRoutes(
      router,
      plugins.kql.autocomplete.getInitializerContextConfig().create(),
      this.endpointContext
    );
    registerLimitedConcurrencyRoutes(core);
    registerPolicyRoutes(router, this.endpointContext);
    registerProtectionUpdatesNoteRoutes(router, this.endpointContext);
    registerActionRoutes(
      router,
      this.endpointContext,
      plugins.encryptedSavedObjects?.canEncrypt === true
    );
    registerAgentRoutes(router, this.endpointContext);
    registerEndpointExceptionsRoutes(router, this.endpointContext);
    registerScriptsLibraryRoutes(router, this.endpointContext);

    if (plugins.alerting != null) {
      const ruleNotificationType = legacyRulesNotificationRuleType({ logger });

      if (isLegacyNotificationRuleExecutor(ruleNotificationType)) {
        plugins.alerting.registerType(ruleNotificationType);
      }
    }

    const exceptionListsSetupEnabled = () => {
      return plugins.taskManager && plugins.lists;
    };

    if (exceptionListsSetupEnabled()) {
      this.lists = plugins.lists;
      this.manifestTask = new ManifestTask({
        endpointAppContext: this.endpointContext,
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        taskManager: plugins.taskManager!,
      });
    }

    if (plugins.taskManager) {
      this.completeExternalResponseActionsTask.setup({ taskManager: plugins.taskManager });
    }

    core
      .getStartServices()
      .then(async ([coreStart, depsStart]) => {
        appClientFactory.setup({
          getSpaceId: depsStart.spaces?.spacesService?.getSpaceId,
          config,
          kibanaVersion: pluginContext.env.packageInfo.version,
          kibanaBranch: pluginContext.env.packageInfo.branch,
          buildFlavor: pluginContext.env.packageInfo.buildFlavor,
        });

        const endpointFieldsStrategy = endpointFieldsProvider(
          this.endpointAppContextService,
          depsStart.data.indexPatterns
        );
        plugins.data.search.registerSearchStrategy(
          ENDPOINT_FIELDS_SEARCH_STRATEGY,
          endpointFieldsStrategy
        );

        const endpointPackagePoliciesStatsStrategy =
          endpointPackagePoliciesStatsSearchStrategyProvider(this.endpointAppContextService);
        plugins.data.search.registerSearchStrategy(
          ENDPOINT_PACKAGE_POLICIES_STATS_STRATEGY,
          endpointPackagePoliciesStatsStrategy
        );

        const securitySolutionSearchStrategy = securitySolutionSearchStrategyProvider(
          depsStart.data,
          this.endpointContext,
          depsStart.spaces?.spacesService?.getSpaceId,
          ruleDataClient
        );

        plugins.data.search.registerSearchStrategy(
          'securitySolutionSearchStrategy',
          securitySolutionSearchStrategy
        );
        const endpointSearchStrategy = endpointSearchStrategyProvider(
          depsStart.data,
          this.endpointContext
        );

        plugins.data.search.registerSearchStrategy(
          ENDPOINT_SEARCH_STRATEGY,
          endpointSearchStrategy
        );

        const threatIntelligenceSearchStrategy = threatIntelligenceSearchStrategyProvider(
          depsStart.data
        );

        plugins.data.search.registerSearchStrategy(
          THREAT_INTELLIGENCE_SEARCH_STRATEGY_NAME,
          threatIntelligenceSearchStrategy
        );

        this.siemMigrationsService.setup({ esClusterClient: coreStart.elasticsearch.client });
      })
      .catch(() => {}); // it shouldn't reject, but just in case

    setIsElasticCloudDeployment(plugins.cloud.isCloudEnabled ?? false);

    this.asyncTelemetryEventsSender.setup(
      DEFAULT_RETRY_CONFIG,
      DEFAULT_QUEUE_CONFIG,
      this.telemetryReceiver,
      plugins.telemetry,
      this.telemetryUsageCounter,
      core.analytics
    );

    this.telemetryEventsSender.setup(
      this.telemetryReceiver,
      plugins.telemetry,
      plugins.taskManager,
      this.telemetryUsageCounter,
      this.asyncTelemetryEventsSender
    );

    this.checkMetadataTransformsTask = new CheckMetadataTransformsTask({
      endpointAppContext: this.endpointContext,
      core,
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      taskManager: plugins.taskManager!,
    });

    featureUsageService.setup(plugins.licensing);

    securityWorkflowInsightsService.setup({
      kibanaVersion: pluginContext.env.packageInfo.version,
      logger: this.logger,
      endpointContext: this.endpointContext.service,
    });

    if (plugins.taskManager) {
      this.healthDiagnosticService.setup({
        taskManager: plugins.taskManager,
        isServerless: this.isServerless,
      });

      this.trialCompanionMilestoneService.setup({
        taskManager: plugins.taskManager,
        enabled: trialCompanionDeps.enabled,
        telemetry: core.analytics,
      });
    } else {
      this.logger.warn('Task Manager not available, health diagnostic task not registered.');
    }

    this.registerAgentBuilderAttachmentsAndTools(
      plugins,
      core,
      this.logger,
      previewRuleDataClient,
      securityRuleTypeOptions
    );

    if (plugins.workflowsExtensions) {
      registerWorkflowSteps(plugins.workflowsExtensions, core);
    }

    // Threat-intelligence server-side setup. Migrated from the standalone
    // threat-intelligence plugin — see the method JSDoc for the gating
    // policy and the reasoning behind it.
    this.setupThreatIntelligence(plugins, core);

    setupAlertsCapabilitiesSwitcher({
      core,
      logger: this.logger,
      getSecurityStart: async () => {
        const [, startPlugins] = await core.getStartServices();
        return startPlugins.security;
      },
    });

    return {
      setProductFeaturesConfigurator:
        productFeaturesService.setProductFeaturesConfigurator.bind(productFeaturesService),
      experimentalFeatures: { ...config.experimentalFeatures },
    };
  }

  public start(
    core: SecuritySolutionPluginCoreStartDependencies,
    plugins: SecuritySolutionPluginStartDependencies
  ): SecuritySolutionPluginStart {
    const { config, logger, productFeaturesService } = this;

    initializeEndpointExceptionsPerPolicyOptInStatus(
      core.savedObjects,
      config.experimentalFeatures,
      logger
    ).catch(() => {});

    this.ruleMonitoringService.start(core, plugins);

    const savedObjectsClient = new SavedObjectsClient(
      core.savedObjects.createInternalRepository([
        ManifestConstants.SAVED_OBJECT_TYPE,
        ManifestConstants.UNIFIED_SAVED_OBJECT_TYPE,
      ])
    );

    const registerIngestCallback = plugins.fleet?.registerExternalCallback;
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const exceptionListClient = this.lists!.getExceptionListClient(
      savedObjectsClient,
      'kibana',
      // execution of Lists plugin server extension points callbacks should be turned off
      // here because most of the uses of this client will be in contexts where some endpoint
      // validations (specifically those around authz) can not be done (due ot the lack of a `KibanaRequest`
      // from where authz can be derived)
      false
    );
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const fleetStartServices = plugins.fleet!;

    const { packageService } = fleetStartServices;

    this.licensing$ = plugins.licensing.license$;

    this.telemetryConfigProvider.start(plugins.telemetry.isOptedIn$);
    plugins.anonymization.registerProfileInitializer(securityAlertsProfileInitializer);

    // Assistant Tool and Feature Registration
    const filteredTools = config.experimentalFeatures.riskScoreAssistantToolDisabled
      ? assistantTools.filter(({ id }) => id !== ENTITY_RISK_SCORE_TOOL_ID)
      : assistantTools;

    plugins.elasticAssistant.registerTools(APP_UI_ID, filteredTools);
    const features = {
      assistantModelEvaluation: config.experimentalFeatures.assistantModelEvaluation,
      defendInsightsPolicyResponseFailure:
        config.experimentalFeatures.defendInsightsPolicyResponseFailure,
    };
    plugins.elasticAssistant.registerFeatures(APP_UI_ID, features);
    plugins.elasticAssistant.registerFeatures('management', features);

    const manifestManager = new ManifestManager({
      savedObjectsClientFactory: new SavedObjectsClientFactory(core.savedObjects),
      savedObjectsClient,
      exceptionListClient,
      artifactClient: new EndpointArtifactClient(
        fleetStartServices.createArtifactsClient('endpoint')
      ),
      packagePolicyService: fleetStartServices.packagePolicyService,
      logger: this.pluginContext.logger.get('ManifestManager'),
      experimentalFeatures: config.experimentalFeatures,
      packagerTaskPackagePolicyUpdateBatchSize: config.packagerTaskPackagePolicyUpdateBatchSize,
      esClient: core.elasticsearch.client.asInternalUser,
      productFeaturesService,
      licenseService,
    });

    this.endpointAppContextService.start({
      fleetStartServices,
      security: core.security,
      alerting: plugins.alerting,
      config,
      cases: plugins.cases,
      manifestManager,
      licenseService,
      telemetryConfigProvider: this.telemetryConfigProvider,
      exceptionListsClient: exceptionListClient,
      registerListsServerExtension: this.lists?.registerExtension,
      featureUsageService,
      experimentalFeatures: config.experimentalFeatures,
      esClient: core.elasticsearch.client.asInternalUser,
      productFeaturesService,
      savedObjectsServiceStart: core.savedObjects,
      connectorActions: plugins.actions,
      spacesService: plugins.spaces?.spacesService,
      agentBuilder: plugins.agentBuilder,
      getExceptionListClient: this.lists?.getExceptionListClient,
    });

    if (this.lists && plugins.taskManager && plugins.fleet) {
      // Exceptions, Artifacts and Manifests start
      const taskManager = plugins.taskManager;

      plugins.fleet
        .fleetSetupCompleted()
        .then(async () => {
          logger.info('Dependent plugin setup complete');

          if (this.manifestTask) {
            logger.info('Starting ManifestTask');
            await this.manifestTask.start({
              taskManager,
            });
          } else {
            logger.error(new Error('User artifacts task not available.'));
          }

          const fleetServices = this.endpointAppContextService.getInternalFleetServices();

          await turnOffPolicyProtectionsIfNotSupported(
            core.elasticsearch.client.asInternalUser,
            fleetServices,
            productFeaturesService,
            logger
          );

          await turnOffAgentPolicyFeatures(fleetServices, productFeaturesService, logger);

          // Ensure policies have backing DOT indices (We don't need to `await` this.
          // It can run in the background)
          ensureIndicesExistsForPolicies(this.endpointAppContextService).catch(() => {});

          // Migrate endpoint data if space awareness is enabled
          // (We don't need to `await` this. It can run in the background)
          migrateEndpointDataToSupportSpaces(this.endpointAppContextService).catch((e) => {
            logger.error(e);
          });
        })
        .catch(() => {});

      // License related start
      licenseService.start(this.licensing$);

      featureUsageService.start(plugins.licensing);

      this.policyWatcher = new PolicyWatcher(this.endpointAppContextService);
      this.policyWatcher.start(licenseService);

      this.telemetryWatcher = new TelemetryConfigWatcher(
        plugins.fleet.packagePolicyService,
        core.elasticsearch,
        this.endpointAppContextService
      );
      this.telemetryWatcher.start(this.telemetryConfigProvider);
    }

    if (plugins.taskManager) {
      this.completeExternalResponseActionsTask
        .start({
          taskManager: plugins.taskManager,
          esClient: core.elasticsearch.client.asInternalUser,
        })
        .catch(() => {}); // it shouldn't refuse, but just in case
    }

    const uiSettingsClient = core.uiSettings.asScopedToClient(
      new SavedObjectsClient(core.savedObjects.createInternalRepository())
    );

    const queryConfig: TelemetryQueryConfiguration = {
      pageSize: this.config.telemetry?.queryConfig.pageSize,
      maxResponseSize: this.config.telemetry?.queryConfig.maxResponseSize,
      maxCompressedResponseSize: this.config.telemetry?.queryConfig.maxCompressedResponseSize,
      excludeColdAndFrozenTiers: async () => {
        try {
          return await uiSettingsClient.get<boolean>(EXCLUDE_COLD_AND_FROZEN_TIERS_IN_ANALYZER);
        } catch (error) {
          this.logger.error('Error getting telemetry query config from uiSettings', { error });
          return false;
        }
      },
    };

    this.telemetryReceiver
      .start(
        core,
        (type: string) => core.savedObjects.getIndexForType(type),
        DEFAULT_ALERTS_INDEX,
        this.endpointAppContextService,
        exceptionListClient,
        packageService,
        queryConfig
      )
      .catch(() => {});

    if (this.config.cdn?.url && this.config.cdn?.publicKey) {
      const cdnConfig: CdnConfig = {
        url: this.config.cdn.url,
        pubKey: this.config.cdn.publicKey,
      };
      this.logger.info('Starting artifact service with custom CDN config');
      artifactService.start(this.telemetryReceiver, cdnConfig).catch(() => {});
    } else {
      this.logger.info('Starting artifact service with default CDN config');
      artifactService.start(this.telemetryReceiver).catch(() => {});
    }

    this.asyncTelemetryEventsSender.start(plugins.telemetry);

    this.telemetryEventsSender.start(
      plugins.telemetry,
      plugins.taskManager,
      this.telemetryReceiver
    );

    securityWorkflowInsightsService
      .start({
        esClient: core.elasticsearch.client.asInternalUser,
        registerDefendInsightsCallback: plugins.elasticAssistant.registerCallback,
      })
      .catch(() => {});

    const endpointPkgInstallationPromise = this.endpointContext.service
      .getInternalFleetServices()
      .packages.getInstallation(FLEET_ENDPOINT_PACKAGE);
    Promise.all([endpointPkgInstallationPromise, plugins.fleet?.fleetSetupCompleted()])
      .then(async ([endpointPkgInstallation]) => {
        if (plugins.taskManager) {
          if (
            endpointPkgInstallation?.version &&
            isEndpointPackageV2(endpointPkgInstallation.version)
          ) {
            return;
          }

          await this.checkMetadataTransformsTask?.start({ taskManager: plugins.taskManager });
        }
      })
      .catch(() => {}); // it shouldn't reject, but just in case

    if (registerIngestCallback) {
      registerIngestCallback(
        'packagePolicyCreate',
        async (packagePolicy: NewPackagePolicy): Promise<NewPackagePolicy> => {
          await getCriblPackagePolicyPostCreateOrUpdateCallback(
            core.elasticsearch.client.asInternalUser,
            packagePolicy,
            this.logger
          );
          return packagePolicy;
        }
      );

      registerIngestCallback(
        'packagePolicyUpdate',
        async (packagePolicy: UpdatePackagePolicy): Promise<UpdatePackagePolicy> => {
          await getCriblPackagePolicyPostCreateOrUpdateCallback(
            core.elasticsearch.client.asInternalUser,
            packagePolicy,
            this.logger
          );
          return packagePolicy;
        }
      );
    }

    if (plugins.taskManager) {
      const esInternalUserClient = core.elasticsearch.client.asInternalUser;
      const serviceStart = {
        taskManager: plugins.taskManager,
        esClient: esInternalUserClient,
        analytics: core.analytics,
        receiver: this.telemetryReceiver,
        telemetryConfigProvider: this.telemetryConfigProvider,
        packageService,
      };

      this.healthDiagnosticService.start(serviceStart).catch((e) => {
        this.logger.warn('Error starting health diagnostic task', {
          error: e.message,
        } as LogMeta);
      });

      this.trialCompanionMilestoneService
        .start(
          createTrialCompanionMilestoneServiceDeps(
            logger,
            plugins.taskManager,
            packageService,
            core.savedObjects,
            esInternalUserClient,
            this.usageCollection
          )
        )
        .catch((e) => {
          this.logger.warn('Error starting trialCompanionMilestoneService', {
            error: e.message,
          } as LogMeta);
        });
    } else {
      this.logger.warn('Task Manager not available, health diagnostic task not started.');
    }

    // Threat-intelligence server-side start. Captures optional spaces +
    // inference contracts, installs index templates / seed data / built-in
    // workflows, and schedules the IOC indicator-sync task.
    this.startThreatIntelligence(plugins, core);

    return {};
  }

  public stop() {
    this.logger.debug('Stopping plugin');
    this.asyncTelemetryEventsSender.stop().catch(() => {});
    this.telemetryEventsSender.stop();
    this.endpointAppContextService.stop();
    this.policyWatcher?.stop();
    this.telemetryWatcher?.stop();
    this.completeExternalResponseActionsTask.stop().catch(() => {});
    this.siemMigrationsService.stop();
    securityWorkflowInsightsService.stop();
    licenseService.stop();
  }
}
