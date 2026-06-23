/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  AgentHandlerContext,
  ScopedRunnerRunAgentParams,
  RunAgentReturn,
  ExperimentalFeatures,
} from '@kbn/agent-builder-server';
import { getConnectorProvider } from '@kbn/inference-common';
import {
  AGENT_BUILDER_EXPERIMENTAL_FEATURES_SETTING_ID,
  AGENT_BUILDER_BASH_SUPPORT_SETTING_ID,
} from '@kbn/management-settings-ids';
import { getCurrentSpaceId } from '../../../utils/spaces';
import { withAgentSpan } from '../../../tracing';
import { createAgentHandler } from '../run_agent/create_handler';
import {
  createAgentEventEmitter,
  forkContextForAgentRun,
  createAttachmentsService,
  createToolProvider,
  createSkillsService,
  createFilesystemServices,
} from './utils';
import { createPluginsService } from './utils/plugins';
import type { RunnerManager } from './runner';

export const createAgentHandlerContext = async <TParams = Record<string, unknown>>({
  agentExecutionParams,
  manager,
}: {
  agentExecutionParams: ScopedRunnerRunAgentParams;
  manager: RunnerManager;
}): Promise<AgentHandlerContext> => {
  const { onEvent } = agentExecutionParams;
  const {
    request,
    spaces,
    elasticsearch,
    savedObjects,
    modelProvider,
    toolsService,
    attachmentsService,
    resultStore,
    skillsStore,
    attachmentStateManager,
    todoStateManager,
    logger,
    promptManager,
    stateManager,
    skillServiceStart,
    pluginsServiceStart,
    toolManager,
    analyticsService,
    trackingService,
  } = manager.deps;

  const spaceId = getCurrentSpaceId({ request, spaces });
  const toolRegistry = await toolsService.getRegistry({ request });

  const uiSettingsClient = manager.deps.uiSettings.asScopedToClient(
    manager.deps.savedObjects.getScopedClient(request)
  );
  const [isExperimentalEnabled, isBashEnabled] = await Promise.all([
    uiSettingsClient
      .get<boolean>(AGENT_BUILDER_EXPERIMENTAL_FEATURES_SETTING_ID)
      .catch(() => false),
    uiSettingsClient.get<boolean>(AGENT_BUILDER_BASH_SUPPORT_SETTING_ID).catch(() => false),
  ]);

  const experimentalFeatures: ExperimentalFeatures = {
    skills: true,
    subagents: isExperimentalEnabled,
    todos: isExperimentalEnabled,
    askUserQuestion: isExperimentalEnabled,
    bash: isBashEnabled,
  };

  const { filesystemService, bashService } = await createFilesystemServices({
    manager,
    experimentalFeatures,
    workspaceId: agentExecutionParams.agentParams?.conversation?.workspace_id,
    spaceId,
  });

  return {
    request,
    spaceId,
    defaultConnectorId: manager.deps.defaultConnectorId,
    logger,
    modelProvider,
    esClient: elasticsearch.client.asScoped(request),
    savedObjectsClient: savedObjects.getScopedClient(request),
    runner: manager.getRunner(),
    toolRegistry,
    toolProvider: createToolProvider({
      registry: toolRegistry,
      runner: manager.getRunner(),
      request,
    }),
    resultStore,
    skillsStore,
    attachmentStateManager,
    todoStateManager,
    stateManager,
    promptManager,
    attachments: createAttachmentsService({
      attachmentsStart: attachmentsService,
      toolsStart: toolsService,
      request,
      spaceId,
      runner: manager.getRunner(),
    }),
    skills: await createSkillsService({
      skillServiceStart,
      toolsServiceStart: toolsService,
      request,
      spaceId,
      runner: manager.getRunner(),
    }),
    plugins: createPluginsService({ pluginsServiceStart, request }),
    toolManager,
    events: createAgentEventEmitter({ eventHandler: onEvent, context: manager.context }),
    hooks: manager.deps.hooks,
    experimentalFeatures,
    executionMode: manager.deps.executionMode,
    subAgentExecutor: manager.deps.subAgentExecutor,
    analyticsService,
    trackingService,
    filesystemService,
    bashService,
  };
};

export const runAgent = async ({
  agentExecutionParams,
  parentManager,
}: {
  agentExecutionParams: ScopedRunnerRunAgentParams;
  parentManager: RunnerManager;
}): Promise<RunAgentReturn> => {
  const { agentId, agentParams, executionId } = agentExecutionParams;

  const forkedContext = forkContextForAgentRun({
    parentContext: parentManager.context,
    agentId,
    executionId,
    conversationId: agentParams.conversation?.id,
  });
  const manager = parentManager.createChild(forkedContext);

  const { agentsService, request } = manager.deps;
  const agentRegistry = await agentsService.getRegistry({ request });
  const agent = await agentRegistry.get(agentId, { access: 'use' });

  // Single merge point for runtime overrides — consumed by both the agent handler
  // (prompt construction, tool selection) and tool handlers (via ToolHandlerContext).
  const effectiveConfiguration = {
    ...agent.configuration,
    ...(agentParams.configurationOverrides || {}),
  };
  manager.deps.agentConfiguration = effectiveConfiguration;

  const chatModel = (await manager.deps.modelProvider.getDefaultModel()).chatModel;
  const providerName = getConnectorProvider(chatModel.getConnector());

  const agentResult = await withAgentSpan(
    { agent, conversationId: agentParams.conversation?.id, providerName },
    async () => {
      const agentHandler = createAgentHandler({ agent, effectiveConfiguration });
      const agentHandlerContext = await createAgentHandlerContext({
        agentExecutionParams,
        manager,
      });
      return await agentHandler(
        {
          runId: manager.context.runId,
          agentParams,
          abortSignal: manager.deps.abortSignal,
        },
        agentHandlerContext
      );
    }
  );

  return {
    result: agentResult.result,
  };
};
