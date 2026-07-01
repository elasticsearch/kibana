/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Runner } from '@kbn/agent-builder-server';
import type { AgentExecutionService } from '@kbn/agent-builder-server/execution';
import type { AgentBuilderConfig } from '../config';
import type {
  InternalSetupServices,
  InternalStartServices,
  ServicesStartDeps,
  ServiceSetupDeps,
} from './types';
import { ToolsService } from './tools';
import { AgentsService } from './agents';
import { RunnerFactoryImpl } from './execution/runner';
import { ConversationServiceImpl } from './conversation';
import { type AttachmentService, createAttachmentService } from './attachments';
import { type RendererService, createRendererService } from './renderers';
import { HooksService } from './hooks';
import { type SkillService, createSkillService } from './skills';
import { AuditLogService } from '../audit';
import { createAgentExecutionService, createTaskHandler } from './execution';
import {
  createMeteringService,
  type MeteringService,
  createConsumptionService,
  type ConsumptionService,
} from './metering';
import { type PluginsService, createPluginsService } from './plugins';

interface ServiceInstances {
  tools: ToolsService;
  agents: AgentsService;
  attachments: AttachmentService;
  renderers: RendererService;
  hooks: HooksService;
  skills: SkillService;
  plugins: PluginsService;
  metering: MeteringService;
  consumption: ConsumptionService;
}

export class ServiceManager {
  private services?: ServiceInstances;
  public internalSetup?: InternalSetupServices;
  public internalStart?: InternalStartServices;
  private readonly config: AgentBuilderConfig;

  constructor(config: AgentBuilderConfig) {
    this.config = config;
  }

  setupServices({
    logger,
    workflowsManagement,
    cloud,
    usageApi,
  }: ServiceSetupDeps): InternalSetupServices {
    this.services = {
      tools: new ToolsService(),
      agents: new AgentsService(),
      attachments: createAttachmentService(),
      renderers: createRendererService(),
      hooks: new HooksService(),
      skills: createSkillService(),
      plugins: createPluginsService(),
      metering: createMeteringService({ cloud, usageApi, logger: logger.get('metering') }),
      consumption: createConsumptionService(),
    };

    const skillsSetup = this.services.skills.setup();

    this.internalSetup = {
      tools: this.services.tools.setup({
        logger: logger.get('tools'),
        workflowsManagement,
        config: this.config,
      }),
      agents: this.services.agents.setup({ logger: logger.get('agents') }),
      attachments: this.services.attachments.setup(),
      renderers: this.services.renderers.setup(),
      hooks: this.services.hooks.setup({ logger: logger.get('hooks') }),
      skills: skillsSetup,
      plugins: this.services.plugins.setup({ skillsSetup }),
      metering: this.services.metering,
    };

    return this.internalSetup;
  }

  startServices({
    logger,
    security,
    spaces,
    elasticsearch,
    inference,
    uiSettings,
    savedObjects,
    featureFlags,
    actions,
    taskManager,
    securityPlugin,
    trackingService,
    analyticsService,
    searchInferenceEndpoints,
  }: ServicesStartDeps): InternalStartServices {
    if (!this.services) {
      throw new Error('#startServices called before #setupServices');
    }

    // eslint-disable-next-line prefer-const
    let runner: Runner | undefined;
    const getRunner = () => {
      if (!runner) {
        throw new Error('Trying to access runner before initialization');
      }
      return runner;
    };

    // eslint-disable-next-line prefer-const
    let executionService: AgentExecutionService | undefined;
    const getExecutionService = () => {
      if (!executionService) {
        throw new Error('Execution service not yet initialized');
      }
      return executionService;
    };

    const attachments = this.services.attachments.start({
      spaces,
      savedObjects,
    });

    const renderers = this.services.renderers.start();

    const tools = this.services.tools.start({
      getRunner,
      spaces,
      elasticsearch,
      uiSettings,
      savedObjects,
      actions,
    });

    const skillsServiceStart = this.services.skills.start({
      elasticsearch,
      spaces,
      logger: logger.get('skills'),
      getToolRegistry: tools.getRegistry,
      uiSettings,
      savedObjects,
    });

    const agents = this.services.agents.start({
      spaces,
      security,
      elasticsearch,
      uiSettings,
      savedObjects,
      toolsService: tools,
    });

    const hooks = this.services.hooks.start();

    const plugins = this.services.plugins.start({
      logger: logger.get('plugins'),
      elasticsearch,
      spaces,
      config: this.config,
      getToolRegistry: tools.getRegistry,
      analyticsService,
      trackingService,
    });

    const runnerFactory = new RunnerFactoryImpl({
      logger: logger.get('runnerFactory'),
      security,
      elasticsearch,
      uiSettings,
      savedObjects,
      inference,
      spaces,
      actions,
      toolsService: tools,
      agentsService: agents,
      attachmentsService: attachments,
      skillServiceStart: skillsServiceStart,
      pluginsServiceStart: plugins,
      trackingService,
      analyticsService,
      hooks,
      getExecutionService,
      searchInferenceEndpoints,
    });
    runner = runnerFactory.getRunner();

    const conversations = new ConversationServiceImpl({
      logger: logger.get('conversations'),
      security,
      elasticsearch,
      spaces,
      agents,
    });

    const auditLogService = new AuditLogService({
      security,
      logger: logger.get('audit'),
    });

    const taskHandler = createTaskHandler({
      logger: logger.get('task-handler'),
      elasticsearch,
      inference,
      conversationService: conversations,
      agentService: agents,
      runAgent: runner.runAgent,
      uiSettings,
      savedObjects,
      spaces,
      trackingService,
      analyticsService,
      meteringService: this.services.metering,
      searchInferenceEndpoints,
    });

    executionService = createAgentExecutionService({
      logger: logger.get('execution'),
      elasticsearch,
      taskManager,
      spaces,
      inference,
      conversationService: conversations,
      agentService: agents,
      runAgent: runner.runAgent,
      attachmentsService: attachments,
      uiSettings,
      savedObjects,
      trackingService,
      analyticsService,
      meteringService: this.services.metering,
      searchInferenceEndpoints,
    });

    const consumption = this.services.consumption.start({ elasticsearch, spaces });

    this.internalStart = {
      tools,
      agents,
      attachments,
      renderers,
      skills: skillsServiceStart,
      conversations,
      runnerFactory,
      auditLogService,
      execution: executionService,
      taskHandler,
      hooks,
      spaces,
      featureFlags,
      uiSettings,
      savedObjects,
      plugins,
      consumption,
    };

    return this.internalStart;
  }
}
