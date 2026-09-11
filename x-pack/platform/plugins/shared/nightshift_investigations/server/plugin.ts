/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  CoreSetup,
  CoreStart,
  ElasticsearchServiceStart,
  Logger,
  Plugin,
  PluginInitializerContext,
} from '@kbn/core/server';
import type { PluginStartContract as ActionsPluginStart } from '@kbn/actions-plugin/server';
import { SECURITY_EXTENSION_ID } from '@kbn/core-saved-objects-server';
import { registerRoutes } from '@kbn/server-route-repository';
import type { KibanaRequest } from '@kbn/core/server';
import { DEFAULT_SPACE_ID } from '@kbn/core-spaces-common';
import type { WorkflowsExtensionsServerPluginStart } from '@kbn/workflows-extensions/server';
import { HookLifecycle, HookExecutionMode } from '@kbn/agent-builder-server';
import type { NightshiftInvestigationsConfig } from './config';
import { NightshiftInvestigationsClient } from './client/investigations_client';
import { NIGHTSHIFT_INVESTIGATIONS_MANAGED_WORKFLOW_OWNER } from './lib/managed_workflows/constants';
import { installInvestigationWorkflow } from './lib/managed_workflows/install_investigation_workflow';
import { installCortexWorkflows } from './lib/managed_workflows/install_cortex_workflows';
import { installInvestigationAgent } from './lib/install_investigation_agent';
import { nightshiftInvestigationsRouteRepository } from './routes';
import { isInvestigationAvailable } from './is_investigation_available';
import { ensureInvestigationAgentStepDefinition } from './step_definitions/ensure_investigation_agent';
import { triggerInvestigationStepDefinition } from './step_definitions/trigger_investigation';
import { cortexHydrateStepDefinition } from './step_definitions/cortex_hydrate';
import { cortexOptimizeStepDefinition } from './step_definitions/cortex_optimize';
import { createCortexStore, registerCortexAiIndex } from './cortex/register_cortex';
import { createTriggerEmitter, type TriggerEmitter } from './workflows/triggers/emit';
import { registerInvestigationsWorkflowTriggers } from './workflows/triggers/register_triggers';
import { registerInvestigationAgentType } from './agents/investigation';
import { registerDeductiveInvestigationAgentType } from './agents/deductive_investigation';
import { createInvestigationProgressReportTool } from './tools/investigation_progress_report/tool';
import { SandboxConnectionManager } from './tools/sandbox_bash/grpc_client';
import { createSandboxBashTool } from './tools/sandbox_bash/tool';
import { createSandboxViewFileTool } from './tools/sandbox_bash/view_file_tool';
import { createSandboxStrReplaceTool } from './tools/sandbox_bash/str_replace_tool';
import { createSandboxWriteFileTool } from './tools/sandbox_bash/write_file_tool';
import { WorkspaceManager } from './tools/sandbox_bash/workspace_manager';
import { writeConnectorManifest } from './tools/sandbox_bash/connector_manifest';
import { writeElasticManifest } from './tools/sandbox_bash/elastic_manifest';
import { createConnectorCredentialResolver } from './tools/sandbox_bash/connector_credentials';
import {
  nightshiftInvestigationSavedObjectType,
  NIGHTSHIFT_INVESTIGATION_SO_TYPE,
} from './saved_objects';
import { SavedObjectInvestigationRepository } from './storage';
import {
  registerInvestigationReconciliationTask,
  scheduleInvestigationReconciliationTask,
} from './tasks/investigation_reconciliation_task';
import type {
  NightshiftInvestigationsServerSetup,
  NightshiftInvestigationsServerStart,
  NightshiftInvestigationsSetupDeps,
  NightshiftInvestigationsStartDeps,
} from './types';

export class NightshiftInvestigationsPlugin
  implements
    Plugin<
      NightshiftInvestigationsServerSetup,
      NightshiftInvestigationsServerStart,
      NightshiftInvestigationsSetupDeps,
      NightshiftInvestigationsStartDeps
    >
{
  private readonly logger: Logger;
  private workflowsManagement?: NightshiftInvestigationsSetupDeps['workflowsManagement'];
  private workflowsExtensionsStart?: NightshiftInvestigationsStartDeps['workflowsExtensions'];
  private spaces?: NightshiftInvestigationsStartDeps['spaces'];
  private agentBuilder?: NightshiftInvestigationsStartDeps['agentBuilder'];
  private searchInferenceEndpoints?: NightshiftInvestigationsStartDeps['searchInferenceEndpoints'];
  private ruleRegistry?: NightshiftInvestigationsStartDeps['ruleRegistry'];
  private inference?: NightshiftInvestigationsStartDeps['inference'];
  private elasticsearch?: ElasticsearchServiceStart;
  private savedObjects?: CoreStart['savedObjects'];
  private sandboxConnectionManager?: SandboxConnectionManager;
  private actionsStart?: ActionsPluginStart;
  private cortexEnabled = false;

  constructor(private readonly ctx: PluginInitializerContext<NightshiftInvestigationsConfig>) {
    this.logger = ctx.logger.get();
  }

  setup(
    core: CoreSetup<NightshiftInvestigationsStartDeps, NightshiftInvestigationsServerStart>,
    plugins: NightshiftInvestigationsSetupDeps
  ): NightshiftInvestigationsServerSetup {
    // Core gates the plugin on xpack.nightshift_investigations.enabled.
    this.workflowsManagement = plugins.workflowsManagement;
    registerInvestigationsWorkflowTriggers(plugins.workflowsExtensions);

    this.cortexEnabled = this.ctx.config.get().cortex.enabled;
    if (this.cortexEnabled) {
      registerCortexAiIndex(plugins.contextEngine, this.logger.get('cortex'));
    }

    core.savedObjects.registerType(nightshiftInvestigationSavedObjectType);

    registerInvestigationReconciliationTask({
      core,
      taskManager: plugins.taskManager,
      logger: this.logger.get('investigation_reconciliation'),
      getWorkflowsManagement: () => this.workflowsManagement,
    });

    const getTriggerEmitter = (request: KibanaRequest): TriggerEmitter | undefined =>
      createTriggerEmitter({
        workflowsExtensions: this.workflowsExtensionsStart,
        request,
        logger: this.logger,
      });

    plugins.workflowsExtensions?.registerManagedWorkflowOwner(
      NIGHTSHIFT_INVESTIGATIONS_MANAGED_WORKFLOW_OWNER
    );

    if (plugins.agentBuilder) {
      const config = this.ctx.config.get();
      const telemetryConnectorId = config.sandbox?.telemetry_connector_id;
      // The significant-events investigator keeps its own prompt and Elastic tools; only the
      // deductive agent runs from the sandbox and talks to Cortex.
      registerInvestigationAgentType(plugins.agentBuilder);
      registerDeductiveInvestigationAgentType(plugins.agentBuilder, {
        sandboxEnabled: !!config.sandbox,
        cortexEnabled: this.cortexEnabled,
        telemetryConnectorId,
      });
      plugins.agentBuilder.tools.register(
        createInvestigationProgressReportTool({
          logger: this.logger.get('investigation_progress_report_tool'),
        })
      );

      if (config.sandbox) {
        const sandboxLogger = this.logger.get('sandbox_bash_tool');
        const getSpaceId = (req: KibanaRequest) =>
          this.spaces?.spacesService.getSpaceId(req) ?? DEFAULT_SPACE_ID;

        const connectionManager = new SandboxConnectionManager({
          config: config.sandbox,
          logger: sandboxLogger,
          // Both manifests are documentation only: they name the env vars the sandbox can
          // reference, never the values behind them.
          writeManifest: async (conversationId, callContext) => {
            await writeConnectorManifest({
              conversationId,
              apiClient: connectionManager.apiClient,
              callContext,
              getActionsClient: this.actionsStart
                ? (req) => this.actionsStart!.getActionsClientWithRequest(req)
                : undefined,
              logger: sandboxLogger,
            });
            if (telemetryConnectorId) {
              await writeElasticManifest({
                conversationId,
                apiClient: connectionManager.apiClient,
                connectorId: telemetryConnectorId,
                logger: sandboxLogger,
              });
            }
          },
        });
        this.sandboxConnectionManager = connectionManager;

        // Start deps are read lazily: tools are registered in setup() but only run after start().
        const resolveConnectorCredentials = createConnectorCredentialResolver({
          getDeps: () => ({ actions: this.actionsStart }),
          logger: sandboxLogger.get('connector_credentials'),
        });

        const workspaceManager = new WorkspaceManager({
          config: config.sandbox,
          connectionManager,
          logger: sandboxLogger.get('workspace'),
        });

        connectionManager.setRestoreCallback((conversationId) =>
          workspaceManager.restoreWorkspace(conversationId)
        );

        plugins.agentBuilder.tools.register(
          createSandboxBashTool({
            connectionManager,
            resolveConnectorCredentials,
            getSpaceId,
            logger: sandboxLogger,
          })
        );
        plugins.agentBuilder.tools.register(
          createSandboxViewFileTool({ connectionManager, getSpaceId, logger: sandboxLogger })
        );
        plugins.agentBuilder.tools.register(
          createSandboxStrReplaceTool({ connectionManager, getSpaceId, logger: sandboxLogger })
        );
        plugins.agentBuilder.tools.register(
          createSandboxWriteFileTool({ connectionManager, getSpaceId, logger: sandboxLogger })
        );

        plugins.agentBuilder.hooks.register({
          id: 'nightshift-sandbox-workspace-backup',
          hooks: {
            [HookLifecycle.afterExecution]: {
              mode: HookExecutionMode.nonBlocking,
              handler: (context) => {
                const { conversationId, request } = context;
                if (!conversationId) return;
                const scopedConversationId = `${getSpaceId(request)}:${conversationId}`;
                workspaceManager.backupWorkspace(scopedConversationId).catch((err) => {
                  sandboxLogger
                    .get('workspace')
                    .warn(
                      `Workspace backup failed for conversation ${scopedConversationId}: ${err}`
                    );
                });
              },
            },
          },
        });
      }
    }

    if (plugins.workflowsManagement) {
      if (plugins.workflowsExtensions) {
        plugins.workflowsExtensions.registerStepDefinition(
          triggerInvestigationStepDefinition(this.getInvestigationsClient)
        );
        // `agentBuilder` is only available from `start()`, so the step resolves it lazily.
        plugins.workflowsExtensions.registerStepDefinition(
          ensureInvestigationAgentStepDefinition(() => this.agentBuilder)
        );
        if (this.cortexEnabled) {
          plugins.workflowsExtensions.registerStepDefinition(
            cortexHydrateStepDefinition({
              getConnectionManager: () => this.sandboxConnectionManager,
              logger: this.logger.get('cortex'),
            })
          );
          plugins.workflowsExtensions.registerStepDefinition(
            cortexOptimizeStepDefinition({
              getInference: () => this.inference,
              getSearchInferenceEndpoints: () => this.searchInferenceEndpoints,
              logger: this.logger.get('cortex'),
            })
          );
        }
      }

      registerRoutes({
        repository: nightshiftInvestigationsRouteRepository,
        dependencies: {
          getInvestigationsClient: this.getInvestigationsClient,
          getTriggerEmitter,
          getAlertsClient: (request: KibanaRequest) =>
            this.ruleRegistry?.getRacClientWithRequest(request),
          isCortexEnabled: () => this.cortexEnabled,
          getCortexPageStore: (request: KibanaRequest) => {
            if (!this.elasticsearch) {
              throw new Error(
                'elasticsearch is not available — plugin start() has not been called'
              );
            }
            return createCortexStore({
              esClient: this.elasticsearch.client.asScoped(request).asCurrentUser,
              logger: this.logger.get('cortex'),
            });
          },
        },
        core,
        logger: this.logger,
        runDevModeChecks: false,
      });
    } else {
      this.logger.warn(
        'workflowsManagement is not available — nightshift investigations routes will not be registered'
      );
    }
  }

  start(
    coreStart: CoreStart,
    plugins: NightshiftInvestigationsStartDeps
  ): NightshiftInvestigationsServerStart {
    this.spaces = plugins.spaces;
    this.workflowsExtensionsStart = plugins.workflowsExtensions;
    this.agentBuilder = plugins.agentBuilder;
    this.searchInferenceEndpoints = plugins.searchInferenceEndpoints;
    this.ruleRegistry = plugins.ruleRegistry;
    this.inference = plugins.inference;
    this.elasticsearch = coreStart.elasticsearch;
    this.savedObjects = coreStart.savedObjects;
    this.actionsStart = plugins.actions;

    // The `nightshift.ensureInvestigationAgent` workflow step is the general guarantee that the
    // agent exists wherever an investigation runs. This narrower install exists so the agent is
    // visible and editable in the Agent Builder UI before the first investigation ever runs.
    if (plugins.agentBuilder) {
      void installInvestigationAgent({
        agentBuilder: plugins.agentBuilder,
        spaceId: DEFAULT_SPACE_ID,
      }).catch((err) => {
        this.logger.error(`Failed to install investigation agent in default space: ${err.message}`);
      });
    }

    if (plugins.workflowsExtensions) {
      this.installManagedWorkflows(plugins.workflowsExtensions).catch((err) => {
        this.logger.error(
          `Failed to install nightshift investigations managed workflows: ${err.message}`
        );
      });
    }

    if (this.workflowsManagement) {
      scheduleInvestigationReconciliationTask({ taskManager: plugins.taskManager }).catch((err) => {
        this.logger.error(`Failed to schedule investigation reconciliation task: ${err.message}`);
      });
    }

    return {
      getInvestigationsClient: this.getInvestigationsClient,
      isInvestigationAvailable: (request) =>
        isInvestigationAvailable({
          request,
          agentBuilder: this.agentBuilder,
          logger: this.logger,
          searchInferenceEndpoints: this.searchInferenceEndpoints,
          spaces: this.spaces,
          workflowsExtensions: this.workflowsExtensionsStart,
          workflowsManagement: this.workflowsManagement,
        }),
    };
  }

  private getInvestigationsClient = (request: KibanaRequest, spaceId?: string) => {
    const resolvedSpaceId =
      spaceId ?? this.spaces?.spacesService.getSpaceId(request) ?? DEFAULT_SPACE_ID;

    return new NightshiftInvestigationsClient({
      request,
      workflowsManagement: this.workflowsManagement,
      spaces: this.spaces,
      logger: this.logger,
      spaceIdOverride: spaceId,
      agentBuilder: this.agentBuilder,
      investigationRepository: this.createInvestigationRepository(request, resolvedSpaceId),
      isAvailable: () =>
        isInvestigationAvailable({
          request,
          agentBuilder: this.agentBuilder,
          logger: this.logger,
          searchInferenceEndpoints: this.searchInferenceEndpoints,
          spaceId: resolvedSpaceId,
          spaces: this.spaces,
          workflowsExtensions: this.workflowsExtensionsStart,
          workflowsManagement: this.workflowsManagement,
        }),
    });
  };

  private createInvestigationRepository = (
    request: KibanaRequest,
    spaceId: string
  ): SavedObjectInvestigationRepository => {
    if (!this.savedObjects) {
      throw new Error('savedObjects is not available — plugin start() has not been called');
    }
    const savedObjectsClient = this.savedObjects
      .getScopedClient(request, {
        excludedExtensions: [SECURITY_EXTENSION_ID],
        includedHiddenTypes: [NIGHTSHIFT_INVESTIGATION_SO_TYPE],
      })
      .asScopedToNamespace(spaceId);
    return new SavedObjectInvestigationRepository({ savedObjectsClient });
  };

  /**
   * Installs the static managed workflows this plugin owns and signals readiness so the
   * platform can reconcile (prune orphans / apply upgrades) for this plugin's workflows.
   */
  private async installManagedWorkflows(
    workflowsExtensions: WorkflowsExtensionsServerPluginStart
  ): Promise<void> {
    const client = await workflowsExtensions.initManagedWorkflowsClient(
      NIGHTSHIFT_INVESTIGATIONS_MANAGED_WORKFLOW_OWNER
    );
    await installInvestigationWorkflow({ client });
    if (this.cortexEnabled) {
      await installCortexWorkflows({ client });
    }
    await client.ready();
  }

  stop(): void {
    this.sandboxConnectionManager?.close();
  }
}
