/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */
import type {
  CoreSetup,
  CoreStart,
  Logger,
  Plugin,
  PluginInitializerContext,
} from '@kbn/core/server';

import { registerHitlLifecycleAuditor } from '@kbn/workflows-execution-engine/server';
import { defineRoutes } from './api/routes';
import { WorkflowManagementAuditLog } from './api/routes/utils/workflow_audit_logging';
import { WorkflowsManagementApi } from './api/workflows_management_api';
import { WorkflowsService } from './api/workflows_management_service';
import { AvailabilityUpdater } from './availability';
import {
  createManagedWorkflowsSystemApiProvider,
  createWorkflowsClientProvider,
} from './client/workflows_client';
import type { WorkflowsManagementConfig } from './config';
import {
  getWorkflowsConnectorAdapter,
  getConnectorType as getWorkflowsConnectorType,
} from './connectors/workflows';
import { ExecutionDataViewsBootstrap } from './execution_data_views_bootstrap';
import { WorkflowsManagementFeatureConfig } from './features';
import { createWorkflowsInboxProvider } from './inbox/workflows_inbox_provider';
import { registerConnectorEventTriggers } from './triggers/register_connector_event_triggers';
import type {
  WorkflowsRequestHandlerContext,
  WorkflowsServerPluginSetup,
  WorkflowsServerPluginSetupDeps,
  WorkflowsServerPluginStart,
  WorkflowsServerPluginStartDeps,
} from './types';
import { registerUISettings } from './ui_settings';
import { stepSchemas } from '../common/step_schemas';

export class WorkflowsPlugin
  implements
    Plugin<
      WorkflowsServerPluginSetup,
      WorkflowsServerPluginStart,
      WorkflowsServerPluginSetupDeps,
      WorkflowsServerPluginStartDeps
    >
{
  private readonly logger: Logger;
  private config: WorkflowsManagementConfig;
  private readonly kibanaVersion: string;
  private availabilityUpdater: AvailabilityUpdater | null = null;
  private api: WorkflowsManagementApi | null = null;
  private workflowsService: WorkflowsService | null = null;
  private executionDataViewsBootstrap: ExecutionDataViewsBootstrap | null = null;
  private audit: WorkflowManagementAuditLog | null = null;
  private unregisterHitlLifecycleAuditor: (() => void) | null = null;

  constructor(initializerContext: PluginInitializerContext<WorkflowsManagementConfig>) {
    this.logger = initializerContext.logger.get();
    this.config = initializerContext.config.get<WorkflowsManagementConfig>();
    this.kibanaVersion = initializerContext.env.packageInfo.version;
  }

  public setup(
    core: CoreSetup<WorkflowsServerPluginStartDeps>,
    plugins: WorkflowsServerPluginSetupDeps
  ) {
    this.logger.debug('Workflows Management: Setup');

    registerUISettings(core, plugins);

    plugins.features?.registerKibanaFeature(WorkflowsManagementFeatureConfig);

    this.logger.debug('Workflows Management: Creating workflows service');

    const workflowsService = new WorkflowsService(core, plugins, this.logger, this.kibanaVersion);
    this.workflowsService = workflowsService;

    const api = new WorkflowsManagementApi(workflowsService, this.config.available, this.logger);
    this.api = api;

    if (plugins.actions) {
      plugins.actions.registerType(getWorkflowsConnectorType(api));

      if (plugins.alerting) {
        plugins.alerting.registerConnectorAdapter(getWorkflowsConnectorAdapter());
      }

      registerConnectorEventTriggers({
        inboundEventsEnabled: plugins.actions
          .getActionsConfigurationUtilities()
          .isInboundEventsEnabled(),
        registerTriggerDefinition: (definition) =>
          plugins.workflowsExtensions.registerTriggerDefinition(definition),
      });
    }

    plugins.workflowsExtensions.registerWorkflowsClientProvider(
      createWorkflowsClientProvider(workflowsService, this.config, this.logger)
    );
    plugins.workflowsExtensions.registerManagedWorkflowsSystemApiProvider(
      createManagedWorkflowsSystemApiProvider(workflowsService, this.config, this.logger)
    );

    const spaces = plugins.spaces.spacesService;

    const router = core.http.createRouter<WorkflowsRequestHandlerContext>();
    const audit = new WorkflowManagementAuditLog({ service: workflowsService });
    this.audit = audit;
    api.setAuditLog(audit);

    defineRoutes({
      router,
      config: this.config,
      logger: this.logger,
      api,
      spaces,
      workflowsService,
      audit,
    });

    core.http.registerRouteHandlerContext<WorkflowsRequestHandlerContext, 'workflowsManagement'>(
      'workflowsManagement',
      async (_context, request) => {
        const [coreStart, startPlugins] = await core.getStartServices();
        if (this.executionDataViewsBootstrap === null) {
          this.executionDataViewsBootstrap = new ExecutionDataViewsBootstrap(
            startPlugins.dataViews,
            this.logger.get('executionDataViewsBootstrap')
          );
        }

        const spaceId = spaces.getSpaceId(request);

        this.executionDataViewsBootstrap.ensureForSpaceFireAndForget(
          spaceId,
          coreStart.savedObjects.getScopedClient(request),
          coreStart.elasticsearch.client.asScoped(request).asCurrentUser,
          request
        );
      }
    );

    if (plugins.inbox) {
      this.logger.debug('Workflows Management: registering inbox provider');
      plugins.inbox.registerActionProvider(
        createWorkflowsInboxProvider({ api, logger: this.logger })
      );
    }

    return {
      management: api,
    };
  }

  public start(core: CoreStart, plugins: WorkflowsServerPluginStartDeps) {
    this.logger.debug('Workflows Management: Start');
    this.workflowsService?.setStopping(false);

    stepSchemas.initialize(plugins.workflowsExtensions);

    if (this.api) {
      this.availabilityUpdater = new AvailabilityUpdater({
        licensing: plugins.licensing,
        config: this.config,
        api: this.api,
        logger: this.logger,
      });
    }

    if (this.audit) {
      const audit = this.audit;
      this.unregisterHitlLifecycleAuditor = registerHitlLifecycleAuditor((event) => {
        switch (event.type) {
          case 'waiting':
            audit.logHitlWaiting(undefined, {
              executionId: event.executionId,
              stepExecutionId: event.stepExecutionId,
              stepType: event.stepType,
            });
            break;
          case 'timed_out':
            audit.logHitlTimedOut(undefined, {
              executionId: event.executionId,
              stepExecutionId: event.stepExecutionId,
              stepType: event.stepType,
            });
            break;
          case 'canceled':
            audit.logExecutionCanceled(undefined, {
              executionId: event.executionId,
              channel: 'system',
            });
            break;
        }
      });
    }

    if (this.workflowsService) {
      // Managed workflow owners register through workflows_extensions because owner
      // plugins cannot depend on workflows_management. Pass the setup-time owner
      // snapshot into workflows_management for storage reconciliation.
      const registeredOwnerPluginIds = plugins.workflowsExtensions.getManagedWorkflowPluginIds();
      // Safe to run in the background: this cleanup only removes docs for owners
      // missing from the setup-time registry, so it cannot race valid start installs.
      void this.runGlobalOrphanCleanup(registeredOwnerPluginIds);
    }

    this.logger.debug('Workflows Management: Started');

    return {};
  }

  private async runGlobalOrphanCleanup(registeredOwnerPluginIds: string[]): Promise<void> {
    try {
      await this.workflowsService?.cleanupUnregisteredOrphans(registeredOwnerPluginIds);
    } catch (error) {
      this.logger.warn(
        'Workflows Management: Failed to complete global orphan cleanup for unregistered workflows',
        { error }
      );
    }
  }

  public stop() {
    this.unregisterHitlLifecycleAuditor?.();
    this.unregisterHitlLifecycleAuditor = null;
    this.workflowsService?.setStopping(true);
    this.availabilityUpdater?.stop();
  }
}
