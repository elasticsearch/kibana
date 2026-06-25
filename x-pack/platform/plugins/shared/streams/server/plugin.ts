/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  CoreSetup,
  CoreStart,
  FeatureFlagsStart,
  KibanaRequest,
  Logger,
  Plugin,
  PluginInitializerContext,
} from '@kbn/core/server';
import { DEFAULT_APP_CATEGORIES } from '@kbn/core/server';
import { i18n } from '@kbn/i18n';
import { OBSERVABILITY_STREAMS_ENABLE_WIRED_STREAM_VIEWS } from '@kbn/management-settings-ids';
import { STREAMS_RULE_TYPE_IDS } from '@kbn/rule-data-utils';
import { registerRoutes } from '@kbn/server-route-repository';
import { DEFAULT_SPACE_ID } from '@kbn/core-spaces-common';
import type { RulesClient, RulesClientCreateOptions } from '@kbn/alerting-plugin/server';
import { LOGS_ECS_STREAM_NAME, ROOT_STREAM_NAMES, Streams } from '@kbn/streams-schema';
import { isNotFoundError } from '@kbn/es-errors';
import type { WorkflowsExtensionsServerPluginStart } from '@kbn/workflows-extensions/server';
import type { RulesClientApi } from '@kbn/alerting-v2-plugin/server';
import { distinctUntilChanged, filter, skip } from 'rxjs';
import type { Subscription } from 'rxjs';
import { isSignificantEventsMemoryEnabled } from './lib/memory/is_significant_events_memory_enabled';
import type { StreamsConfig } from '../common/config';
import { installWorkflows } from './lib/workflows/setup/install_workflows';
import {
  STREAMS_API_PRIVILEGES,
  STREAMS_CONSUMER,
  STREAMS_FEATURE_ID,
  STREAMS_SETTINGS_DOCUMENT_ID,
  STREAMS_TIERED_FEATURES,
  STREAMS_UI_PRIVILEGES,
} from '../common/constants';
import { registerFeatureFlags } from './feature_flags';
import { ContentService } from './lib/content/content_service';
import { registerRules } from './lib/sig_events/rules/register_rules';
import { getSigEventsTuningConfig } from './lib/sig_events/helpers/get_sig_events_tuning_config';
import { AttachmentService } from './lib/streams/attachments/attachment_service';
import {
  isSignificantEventsAlertingV2Active,
  logAlertingV2PluginUnavailable,
  readSignificantEventsAlertingV2UiEnabled,
} from './lib/sig_events/significant_events_alerting_v2';
import { StreamsService } from './lib/streams/service';
import { EbtTelemetryService, StatsTelemetryService } from './lib/telemetry';
import { streamsRouteRepository } from './routes';
import type { GetScopedClients, RouteHandlerScopedClients } from './routes/types';
import type {
  StreamsPluginSetupDependencies,
  StreamsPluginStartDependencies,
  StreamsServer,
} from './types';
import { createStreamsGlobalSearchResultProvider } from './lib/streams/create_streams_global_search_result_provider';
import { backfillWiredStreamViews } from './lib/streams/esql_views/backfill_wired_stream_views';
import { KnowledgeIndicatorService, initializeKnowledgeIndicatorsTemplate } from './lib/streams/ki';
import { ProcessorSuggestionsService } from './lib/streams/ingest_pipelines/processor_suggestions_service';
import { registerStreamsSavedObjects } from './lib/saved_objects/register_saved_objects';
import { TaskService } from './lib/tasks/task_service';
import {
  createSignificantEventsClients,
  createSignificantEventsServices,
  initializeSignificantEventsTemplates,
} from './lib/sig_events/significant_events_clients';
import { baseFields } from './lib/streams/component_templates/logs_layer';
import { ecsBaseFields } from './lib/streams/component_templates/logs_ecs_layer';
import { createMemoryToolsOptions, registerStreamsAgentBuilder } from './agent_builder/register';
import { registerAgentBuilderSmlTypes } from './agent_builder/sml/register_sml_types';
import { registerStreamsMemoryAgentBuilder } from './agent_builder/skills/register_memory_skills';
import { registerSignificantEventsInferenceFeatures } from './register_significant_events_inference_features';
import { registerSuggestionsInferenceFeatures } from './register_suggestions_inference_features';
import { PatternExtractionService } from './lib/pattern_extraction/pattern_extraction_service';
import { registerFieldsMetadataExtractors } from './register_fields_metadata_extractors';
import { createStreamsSettingsStorageClient } from './lib/streams/storage/streams_settings_storage_client';
import {
  createContinuousKiOnboardingWorkflowService,
  type ContinuousKiOnboardingWorkflowService,
} from './lib/workflows/continuous_onboarding_workflow';
import { createWorkflowClients } from './lib/workflows/create_workflow_clients';
import { installMemoryWorkflows } from './lib/memory/install_managed_workflows';
import { isInvestigationEnabled } from './lib/investigations/is_investigation_enabled';
import { installInvestigationWorkflow } from './lib/investigations/install_investigation_workflow';
import {
  STREAMS_INVESTIGATION_ENABLED_FLAG,
  STREAMS_SIGNIFICANT_EVENTS_MEMORY_ENABLED_FLAG,
} from '../common/feature_flags';

const STREAMS_MANAGED_WORKFLOW_OWNER = 'streams';

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface StreamsPluginSetup {}
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface StreamsPluginStart {}

export class StreamsPlugin
  implements
    Plugin<
      StreamsPluginSetup,
      StreamsPluginStart,
      StreamsPluginSetupDependencies,
      StreamsPluginStartDependencies
    >
{
  public config: StreamsConfig;
  public logger: Logger;
  public server?: StreamsServer;
  private isDev: boolean;
  private ebtTelemetryService = new EbtTelemetryService();
  private statsTelemetryService = new StatsTelemetryService();
  private processorSuggestionsService: ProcessorSuggestionsService;
  private patternExtractionService?: PatternExtractionService;
  private streamsGetScopedClients?: GetScopedClients;
  private subscriptions: Subscription[] = [];

  constructor(context: PluginInitializerContext<StreamsConfig>) {
    this.isDev = context.env.mode.dev;
    this.config = context.config.get();
    this.logger = context.logger.get();
    this.processorSuggestionsService = new ProcessorSuggestionsService();
  }

  public setup(
    core: CoreSetup<StreamsPluginStartDependencies>,
    plugins: StreamsPluginSetupDependencies
  ): StreamsPluginSetup {
    this.server = {
      config: this.config,
      logger: this.logger,
      workflowsManagement: plugins.workflowsManagement,
    } as StreamsServer;
    // workflowsManagement is only available as a setup dependency; capture its
    // presence here so significant events availability checks can read it.
    this.server.workflowsManagement = plugins.workflowsManagement;

    this.patternExtractionService = new PatternExtractionService(
      this.config.workers.patternExtraction,
      this.logger.get('patternExtraction')
    );

    this.ebtTelemetryService.setup(core.analytics);
    this.statsTelemetryService.setup(
      core,
      this.logger.get('streams-stats-telemetry'),
      plugins.usageCollection
    );

    const alertingFeatures = STREAMS_RULE_TYPE_IDS.map((ruleTypeId) => ({
      ruleTypeId,
      consumers: [STREAMS_CONSUMER],
    }));

    registerRules({ plugins, logger: this.logger.get('rules') });
    registerStreamsSavedObjects(core.savedObjects);
    registerSignificantEventsInferenceFeatures(
      plugins.searchInferenceEndpoints,
      this.logger.get('inference-features')
    );
    registerSuggestionsInferenceFeatures(
      plugins.searchInferenceEndpoints,
      this.logger.get('inference-features')
    );

    const significantEventsServices = createSignificantEventsServices();
    const attachmentService = new AttachmentService(core, this.logger);
    const streamsService = new StreamsService(core, this.logger, this.isDev);
    const knowledgeIndicatorService = new KnowledgeIndicatorService(core, this.logger);
    const contentService = new ContentService(core, this.logger);
    const taskService = new TaskService(plugins.taskManager);
    this.streamsGetScopedClients = async ({
      request,
      rulesClientOptions,
    }: {
      request: KibanaRequest;
      rulesClientOptions?: RulesClientCreateOptions;
    }): Promise<RouteHandlerScopedClients> => {
      const [coreStart, pluginsStart] = await core.getStartServices();

      const scopedSoClient = coreStart.savedObjects.getScopedClient(request);
      const uiSettingsClient = coreStart.uiSettings.asScopedToClient(scopedSoClient);
      const globalUiSettingsClient = coreStart.uiSettings.globalAsScopedToClient(scopedSoClient);

      const scopedClusterClient = coreStart.elasticsearch.client.asScoped(request);
      const soClient = scopedSoClient;
      const inferenceClient = pluginsStart.inference.getClient({ request });
      const licensing = pluginsStart.licensing;
      const fieldsMetadataClient = await pluginsStart.fieldsMetadata.getClient(request);
      const taskClient = await taskService.getClient(
        coreStart,
        pluginsStart.taskManager,
        this.logger
      );

      const [attachmentClient, contentClient, tuningConfig] = await Promise.all([
        attachmentService.getClient({
          soClient,
          rulesClient: await pluginsStart.alerting.getRulesClientWithRequest(request),
        }),
        contentService.getClient(),
        getSigEventsTuningConfig(globalUiSettingsClient, this.logger),
      ]);

      const space = pluginsStart.spaces?.spacesService.getSpaceId(request) ?? DEFAULT_SPACE_ID;

      const significantEventsClients = createSignificantEventsClients({
        services: significantEventsServices,
        esClient: scopedClusterClient.asCurrentUser,
        space,
      });

      let significantEventsAlertingV2StatePromise:
        | Promise<{
            alertingV2UiEnabled: boolean;
            alertingV2Active: boolean;
            alertingV2RulesClient?: RulesClientApi;
          }>
        | undefined;

      const getSignificantEventsAlertingV2State = () => {
        significantEventsAlertingV2StatePromise ??= (async () => {
          const alertingV2UiEnabled = await readSignificantEventsAlertingV2UiEnabled(
            uiSettingsClient,
            this.logger
          );
          const alertingV2RulesClient = pluginsStart.alertingVTwo
            ? await pluginsStart.alertingVTwo.getRulesClientWithRequestInSpace(
                request,
                DEFAULT_SPACE_ID
              )
            : undefined;

          if (alertingV2UiEnabled && !alertingV2RulesClient) {
            logAlertingV2PluginUnavailable(this.logger);
          }

          return {
            alertingV2UiEnabled,
            alertingV2Active: isSignificantEventsAlertingV2Active(
              alertingV2UiEnabled,
              alertingV2RulesClient
            ),
            alertingV2RulesClient,
          };
        })();
        return significantEventsAlertingV2StatePromise;
      };

      let kiClientPromise: ReturnType<typeof knowledgeIndicatorService.getClient> | undefined;
      const getKnowledgeIndicatorClient = () => {
        kiClientPromise ??= (async () => {
          const { alertingV2RulesClient } = await getSignificantEventsAlertingV2State();
          const rulesClient = await pluginsStart.alerting.getRulesClientWithRequestInSpace(
            request,
            DEFAULT_SPACE_ID,
            rulesClientOptions
          );
          return knowledgeIndicatorService.getClient({
            esClient: scopedClusterClient.asInternalUser,
            soClient,
            alertingRulesClient: rulesClient,
            alertingV2RulesClient,
            config: tuningConfig,
          });
        })();
        return kiClientPromise;
      };

      const getAlertingV2RulesClient = async (): Promise<RulesClientApi | undefined> => {
        const { alertingV2RulesClient } = await getSignificantEventsAlertingV2State();
        return alertingV2RulesClient;
      };

      const license = await licensing.getLicense();
      const isSecurityEnabled = license.getFeature('security').isEnabled;

      const streamsClient = await streamsService.getClient({
        attachmentClient,
        getKnowledgeIndicatorClient,
        esClient: scopedClusterClient.asCurrentUser,
        esClientAsInternalUser: coreStart.elasticsearch.client.asInternalUser,
        uiSettingsClient,
        isSecurityEnabled,
      });

      const streamsSettingsStorageClient = createStreamsSettingsStorageClient(
        coreStart.elasticsearch.client.asInternalUser,
        this.logger
      );

      return {
        scopedClusterClient,
        soClient,
        attachmentClient,
        streamsClient,
        getKnowledgeIndicatorClient,
        ...significantEventsClients,
        inferenceClient,
        contentClient,
        getAlertingV2RulesClient,
        fieldsMetadataClient,
        licensing,
        uiSettingsClient,
        globalUiSettingsClient,
        taskClient,
        streamsSettingsStorageClient,
        isSecurityEnabled,
        tuningConfig,
      };
    };

    const telemetryClient = this.ebtTelemetryService.getClient();

    // Build workflow clients once and reuse the shared onboarding client instance
    // everywhere, rather than constructing a second one from the same management API.
    const workflowClients = createWorkflowClients(
      plugins.workflowsManagement?.management,
      telemetryClient
    );
    const streamsKIsOnboardingClient = workflowClients.streamsKIsOnboardingClient;

    // Register SML types synchronously during setup so agent_context_layer can schedule
    // their crawler tasks during its start phase. Must happen in setup() — scheduling
    // snapshots the registry at start() and types registered later are never crawled.
    // Matches the contract followed by alerting_v2 and agent_builder_dashboards.
    if (plugins.agentContextLayer && this.streamsGetScopedClients) {
      registerAgentBuilderSmlTypes({
        agentContextLayer: plugins.agentContextLayer,
        getScopedClients: this.streamsGetScopedClients,
      });
    }

    if (plugins.agentBuilder) {
      void core
        .getStartServices()
        .then(async ([coreStart]) => {
          const { streamsGetScopedClients, server } = this;
          if (!streamsGetScopedClients || !server) return;
          const investigationEnabled = await isInvestigationEnabled(coreStart.featureFlags);

          await registerStreamsAgentBuilder({
            agentBuilder: plugins.agentBuilder!,
            getScopedClients: streamsGetScopedClients,
            server,
            logger: this.logger,
            telemetry: telemetryClient,
            streamsKIsOnboardingClient,
            investigationEnabled,
          });
        })
        .catch((err) => {
          this.logger.error(`Failed to register agent builder: ${err.message}`);
        });
    }

    let continuousKiOnboardingWorkflowService: ContinuousKiOnboardingWorkflowService | undefined;

    if (plugins.workflowsManagement && streamsKIsOnboardingClient) {
      continuousKiOnboardingWorkflowService = createContinuousKiOnboardingWorkflowService({
        logger: this.logger,
        managementApi: plugins.workflowsManagement.management,
        streamsKIsOnboardingClient,
      });
    }

    plugins.workflowsExtensions?.registerManagedWorkflowOwner(STREAMS_MANAGED_WORKFLOW_OWNER);

    taskService.registerTasks({
      getScopedClients: this.streamsGetScopedClients,
      logger: this.logger,
      telemetry: telemetryClient,
      getInternalEsClient: () => this.server!.core.elasticsearch.client.asInternalUser,
      getConversationsClient: async (request) => {
        const [, startPlugins] = await core.getStartServices();
        if (!startPlugins.agentBuilder) {
          return undefined;
        }
        return startPlugins.agentBuilder.conversations.getScopedClient({ request });
      },
      server: this.server,
    });

    plugins.features.registerKibanaFeature({
      id: STREAMS_FEATURE_ID,
      name: i18n.translate('xpack.streams.featureRegistry.streamsFeatureName', {
        defaultMessage: 'Streams',
      }),
      order: 600,
      category: DEFAULT_APP_CATEGORIES.management,
      app: [STREAMS_FEATURE_ID],
      alerting: alertingFeatures,
      privileges: {
        all: {
          app: [STREAMS_FEATURE_ID],
          savedObject: {
            all: [],
            read: [],
          },
          alerting: {
            rule: {
              all: alertingFeatures,
              enable: alertingFeatures,
              manual_run: alertingFeatures,
              manage_rule_settings: alertingFeatures,
            },
            alert: {
              all: alertingFeatures,
            },
          },
          api: [STREAMS_API_PRIVILEGES.read, STREAMS_API_PRIVILEGES.manage],
          ui: [STREAMS_UI_PRIVILEGES.show, STREAMS_UI_PRIVILEGES.manage],
        },
        read: {
          app: [STREAMS_FEATURE_ID],
          savedObject: {
            all: [],
            read: [],
          },
          alerting: {
            rule: {
              read: alertingFeatures,
            },
            alert: {
              read: alertingFeatures,
            },
          },
          api: [STREAMS_API_PRIVILEGES.read],
          ui: [STREAMS_UI_PRIVILEGES.show],
        },
      },
    });

    core.pricing.registerProductFeatures(STREAMS_TIERED_FEATURES);

    const routeRegistrationOptions = {
      dependencies: {
        server: this.server,
        telemetry: telemetryClient,
        processorSuggestions: this.processorSuggestionsService,
        patternExtractionService: this.patternExtractionService,
        getScopedClients: this.streamsGetScopedClients,
        continuousKiOnboardingWorkflowService,
        workflowClients,
        getSpaceId: async (request: KibanaRequest) => {
          const [, pluginsStart] = await core.getStartServices();
          return pluginsStart.spaces?.spacesService.getSpaceId(request) ?? DEFAULT_SPACE_ID;
        },
      },
      core,
      logger: this.logger,
      runDevModeChecks: this.isDev,
    };

    registerRoutes({ repository: streamsRouteRepository, ...routeRegistrationOptions });

    registerFeatureFlags(core, this.logger, {
      isAlertingV2PluginAvailable: 'alertingVTwo' in plugins,
    });

    if (plugins.globalSearch) {
      plugins.globalSearch.registerResultProvider(
        createStreamsGlobalSearchResultProvider(core, this.logger, async () => {
          const [, pluginsStart] = await core.getStartServices();
          const license = await pluginsStart.licensing.getLicense();
          return license.getFeature('security').isEnabled;
        })
      );
    }

    core
      .getStartServices()
      .then(async ([coreStart]) => {
        const soClient = coreStart.savedObjects.getUnsafeInternalClient();
        const startupUiSettingsClient = coreStart.uiSettings.asScopedToClient(soClient);
        const esClient = coreStart.elasticsearch.client.asInternalUser;

        if (this.config.preconfigured.enabled) {
          const streamsSettingsStorageClient = createStreamsSettingsStorageClient(
            esClient,
            this.logger
          );

          const streamsSettings = await streamsSettingsStorageClient
            .get({ id: STREAMS_SETTINGS_DOCUMENT_ID })
            .then((response) => response._source)
            .catch((error) => {
              if (isNotFoundError(error)) {
                // This is an expected error that gets thrown when the settings
                // document doesn't exist, which is the case on the initial startup.
                return;
              }
              throw error;
            });

          if (streamsSettings?.wired_streams_disabled_by_user) {
            this.logger.info('Wired streams are disabled by user, skipping preconfiguration');
          } else {
            // Since the RulesClient cannot be unscoped, we provide a stub client that
            // will throw an error if rules or queries exist in the stream definition.
            // This is a limitation of the config-based streams for now.
            const rulesClient = {
              bulkGetRules() {
                throw new Error('Not implemented');
              },
              create() {
                throw new Error('Not implemented');
              },
              update() {
                throw new Error('Not implemented');
              },
            } as unknown as RulesClient;

            const attachmentClient = await attachmentService.getClient({ soClient, rulesClient });

            // featureClient and queryClient are not needed for enableStreams()
            // and bulkUpsert() during preconfiguration, so we don't create them here.
            const streamsClient = await streamsService.getClient({
              attachmentClient,
              esClient,
              esClientAsInternalUser: esClient,
              uiSettingsClient: coreStart.uiSettings.asScopedToClient(soClient),
              isSecurityEnabled: false,
            });

            const streamDefinitions = this.config.preconfigured.stream_definitions.map(
              ({ name, ...definition }) => ({
                name,
                request: Streams.all.UpsertRequest.parse(
                  ROOT_STREAM_NAMES.includes(name)
                    ? {
                        ...definition,
                        stream: {
                          ...definition.stream,
                          ingest: {
                            ...definition.stream.ingest,
                            wired: {
                              ...definition.stream.ingest.wired,
                              fields: name === LOGS_ECS_STREAM_NAME ? ecsBaseFields : baseFields,
                            },
                          },
                        },
                      }
                    : definition
                ),
              })
            );

            if (streamDefinitions.length > 0) {
              await streamsClient.enableStreams();

              await streamsClient.bulkUpsert(streamDefinitions);
            } else {
              await streamsClient.enableStreams({ defer: true });
            }

            this.logger.info('Streams preconfigured successfully');
          }
        }

        startupUiSettingsClient
          .get<boolean>(OBSERVABILITY_STREAMS_ENABLE_WIRED_STREAM_VIEWS)
          .then((isWiredStreamViewsEnabled) =>
            backfillWiredStreamViews({
              esClient,
              logger: this.logger,
              isWiredStreamViewsEnabled,
            })
          )
          .catch((err: Error) => {
            this.logger.error(`Failed to backfill wired stream views on startup: ${err?.message}`, {
              error: err,
            });
          });
      })
      .catch((error) => {
        this.logger.error(`Error preconfiguring streams: ${error}`);
      });

    registerFieldsMetadataExtractors({
      fieldsMetadata: plugins.fieldsMetadata,
      logger: this.logger,
    });

    return {};
  }

  public start(core: CoreStart, plugins: StreamsPluginStartDependencies): StreamsPluginStart {
    if (this.server) {
      this.server.core = core;
      this.server.isServerless = core.elasticsearch.getCapabilities().serverless;
      this.server.security = plugins.security;
      this.server.actions = plugins.actions;
      this.server.encryptedSavedObjects = plugins.encryptedSavedObjects;
      this.server.inference = plugins.inference;
      this.server.licensing = plugins.licensing;
      this.server.taskManager = plugins.taskManager;
      this.server.searchInferenceEndpoints = plugins.searchInferenceEndpoints;
      this.server.spaces = plugins.spaces;
      this.server.workflowsExtensions = plugins.workflowsExtensions;
      this.server.agentBuilder = plugins.agentBuilder;
    }

    initializeSignificantEventsTemplates({
      esClient: core.elasticsearch.client.asInternalUser,
      logger: this.logger,
    }).catch((error) => {
      this.logger.error(
        `Failed to initialize significant events templates: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    });

    // Emits once when the memory feature flag transitions to enabled at runtime.
    // The initial flag state is handled by the startup install/registration below,
    // hence `skip(1)`.
    const memoryEnabled$ = core.featureFlags
      .getBooleanValue$(STREAMS_SIGNIFICANT_EVENTS_MEMORY_ENABLED_FLAG, false)
      .pipe(
        distinctUntilChanged(),
        skip(1),
        filter((enabled) => enabled)
      );

    const investigationEnabled$ = core.featureFlags
      .getBooleanValue$(STREAMS_INVESTIGATION_ENABLED_FLAG, false)
      .pipe(
        distinctUntilChanged(),
        skip(1),
        filter((enabled) => enabled)
      );

    initializeKnowledgeIndicatorsTemplate({
      esClient: core.elasticsearch.client.asInternalUser,
      logger: this.logger,
    }).catch((error) => {
      this.logger.error(
        `Failed to initialize knowledge indicators template: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    });

    if (plugins.workflowsExtensions) {
      const { workflowsExtensions } = plugins;

      void this.installManagedWorkflows(workflowsExtensions, core.featureFlags).catch(
        (error: unknown) => {
          this.logger.error(
            `streams: Failed to install managed workflows: ${
              error instanceof Error ? error.message : String(error)
            }`
          );
        }
      );

      this.subscriptions.push(
        memoryEnabled$.subscribe(() => {
          void this.installMemoryWorkflowsIfEnabled(workflowsExtensions, core.featureFlags).catch(
            (error: unknown) => {
              this.logger.error(
                `streams: Failed to install memory managed workflows after feature flag change: ${
                  error instanceof Error ? error.message : String(error)
                }`
              );
            }
          );
        })
      );

      this.subscriptions.push(
        investigationEnabled$.subscribe(() => {
          void this.installInvestigationWorkflowIfEnabled(
            workflowsExtensions,
            core.featureFlags
          ).catch((error: unknown) => {
            this.logger.error(
              `streams: Failed to install investigation managed workflow after feature flag change: ${
                error instanceof Error ? error.message : String(error)
              }`
            );
          });
        })
      );
    }

    if (plugins.agentBuilder && this.server && this.streamsGetScopedClients) {
      const isMemoryEnabled = () => isSignificantEventsMemoryEnabled(core.featureFlags);

      const memoryToolsOptions = createMemoryToolsOptions({
        getScopedClients: this.streamsGetScopedClients,
        server: this.server,
        logger: this.logger,
      });

      registerStreamsMemoryAgentBuilder({
        agentBuilder: plugins.agentBuilder,
        memoryToolsOptions,
        logger: this.logger,
        isMemoryEnabled,
      })
        .then(({ onMemoryEnabled }) => {
          memoryEnabled$.subscribe(() => {
            void onMemoryEnabled();
          });
        })
        .catch((err) => {
          this.logger.error(`Failed to register streams memory skills: ${err.message}`);
        });
    }

    this.processorSuggestionsService.setConsoleStart(plugins.console);

    return {};
  }

  private async installMemoryWorkflowsIfEnabled(
    workflowsExtensions: WorkflowsExtensionsServerPluginStart,
    featureFlags: FeatureFlagsStart
  ): Promise<void> {
    if (!(await isSignificantEventsMemoryEnabled(featureFlags))) {
      this.logger.debug('streams: memory is disabled, skipping memory workflow installation');
      return;
    }

    const client = await workflowsExtensions.initManagedWorkflowsClient(
      STREAMS_MANAGED_WORKFLOW_OWNER
    );
    await installMemoryWorkflows({ client });
    await client.ready();
  }

  private async installInvestigationWorkflowIfEnabled(
    workflowsExtensions: WorkflowsExtensionsServerPluginStart,
    featureFlags: FeatureFlagsStart
  ): Promise<void> {
    if (!(await isInvestigationEnabled(featureFlags))) {
      this.logger.debug(
        'streams: investigation is disabled, skipping investigation workflow installation'
      );
      return;
    }

    const client = await workflowsExtensions.initManagedWorkflowsClient(
      STREAMS_MANAGED_WORKFLOW_OWNER
    );
    await installInvestigationWorkflow({ client });
    await client.ready();
  }

  private async installManagedWorkflows(
    workflowsExtensions: WorkflowsExtensionsServerPluginStart,
    featureFlags: FeatureFlagsStart
  ): Promise<void> {
    try {
      const client = await workflowsExtensions.initManagedWorkflowsClient(
        STREAMS_MANAGED_WORKFLOW_OWNER
      );

      await installWorkflows({
        client,
        isSignificantEventsMemoryEnabled: await isSignificantEventsMemoryEnabled(featureFlags),
      });

      if (await isInvestigationEnabled(featureFlags)) {
        await installInvestigationWorkflow({ client });
      } else {
        this.logger.debug(
          'streams: investigation is disabled, skipping investigation workflow installation'
        );
      }

      this.logger.info('Streams managed workflows installed');

      await client.ready();
    } catch (error) {
      this.logger.warn(
        `Failed to install streams managed workflows: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  public async stop() {
    this.subscriptions.forEach((s) => s.unsubscribe());
    await this.patternExtractionService?.stop();
  }
}
