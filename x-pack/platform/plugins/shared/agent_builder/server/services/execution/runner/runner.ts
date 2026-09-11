/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Logger } from '@kbn/logging';
import type { ElasticsearchServiceStart } from '@kbn/core-elasticsearch-server';
import type { HttpServiceStart, KibanaRequest } from '@kbn/core-http-server';
import type { SecurityServiceStart } from '@kbn/core-security-server';
import type { SavedObjectsServiceStart } from '@kbn/core-saved-objects-server';
import type { UiSettingsServiceStart } from '@kbn/core-ui-settings-server';
import type { SpacesPluginStart } from '@kbn/spaces-plugin/server';
import type { PluginStartContract as ActionsPluginStart } from '@kbn/actions-plugin/server';
import type {
  ChatCompletionReasoningEffort,
  ConnectorTelemetryMetadata,
} from '@kbn/inference-common';
import type { AgentConfiguration, Conversation, ConverseInput } from '@kbn/agent-builder-common';
import {
  AgentExecutionMode,
  createBadRequestError,
  createInternalError,
  createNonInteractiveConfig,
  isAgentBuilderError,
  normalizeInteractive,
} from '@kbn/agent-builder-common';
import type { InteractivityConfig } from '@kbn/agent-builder-common';
import { findUnknownApis, formatUnknownApis } from '@kbn/agent-builder-common/apis/known_apis';
import type { PromptStorageState } from '@kbn/agent-builder-common/agents/prompts';
import type {
  ExperimentalFeatures,
  HooksServiceStart,
  ModelProvider,
  RunAgentReturn,
  RunContext,
  RunApprovals,
  Runner,
  RunToolReturn,
  ScopedRunner,
  ScopedRunnerRunAgentParams,
  SubAgentExecutor,
  WritableToolResultStore,
} from '@kbn/agent-builder-server';
import {
  AGENT_BUILDER_EXPERIMENTAL_FEATURES_SETTING_ID,
  AGENT_BUILDER_BASH_SUPPORT_SETTING_ID,
  CONTEXT_ENGINE_ENABLED_SETTING_ID,
} from '@kbn/management-settings-ids';
import type {
  ConversationStateManager,
  PromptManager,
  ScopedRunnerRunInternalToolParams,
  ScopedRunnerRunToolsParams,
  ToolManager,
  WritableSkillsStore,
} from '@kbn/agent-builder-server/runner';
import type { AttachmentStateManager } from '@kbn/agent-builder-server/attachments';
import { createAttachmentStateManager } from '@kbn/agent-builder-server/attachments';
import type { TodoStateManager } from '@kbn/agent-builder-server/runner';
import { createTodoStateManager } from '@kbn/agent-builder-server/runner';
import type { AgentExecutionService } from '@kbn/agent-builder-server/execution';
import type { ToolsServiceStart } from '../../tools';
import type { AgentsServiceStart } from '../../agents';
import type { ConversationService } from '../../conversation';
import type { AttachmentServiceStart } from '../../attachments';
import type { RendererServiceStart } from '../../renderers';
import type { ModelProviderFactoryFn } from './model_provider';
import type { AnalyticsService, TrackingService } from '../../../telemetry';
import {
  createConversationStateManager,
  createEmptyRunContext,
  createSubAgentExecutor,
  createToolManager,
} from './utils';
import { createPromptManager, getAgentPromptStorageState } from './utils/prompts';
import { runInternalTool, runTool } from './run_tool';
import { runAgent } from './run_agent';
import { createResultStore } from './store/volumes/tool_results/tool_result_store';
import { createSkillsStore } from './store/volumes/skills/skills_store';
import type { SkillServiceStart } from '../../skills';
import type { PluginsServiceStart } from '../../plugins/plugin_service';
import type { ConversationTemplatesServiceStart } from '../../conversation/templates';

export interface CreateScopedRunnerDeps {
  // core services
  elasticsearch: ElasticsearchServiceStart;
  http: HttpServiceStart;
  security: SecurityServiceStart;
  savedObjects: SavedObjectsServiceStart;
  uiSettings: UiSettingsServiceStart;
  // external plugin deps
  spaces: SpacesPluginStart | undefined;
  actions: ActionsPluginStart;
  // internal service deps
  modelProvider: ModelProvider;
  toolsService: ToolsServiceStart;
  agentsService: AgentsServiceStart;
  conversationService: ConversationService;
  attachmentsService: AttachmentServiceStart;
  renderersService: RendererServiceStart;
  conversationTemplates: ConversationTemplatesServiceStart;
  promptManager: PromptManager;
  stateManager: ConversationStateManager;
  trackingService?: TrackingService;
  analyticsService?: AnalyticsService;
  hooks: HooksServiceStart;
  // other deps
  logger: Logger;
  request: KibanaRequest;
  defaultConnectorId?: string;
  /**
   * Optional CPS project routing expression scoping this run's search tools to a set of projects
   * Defaults to space-level routing (all linked projects in the current space) when omitted.
   */
  projectRouting?: string;
  /**
   * Optional abort signal for the run (e.g. from the request).
   * Propagated to hooks so they can respect cancellation.
   */
  abortSignal?: AbortSignal;
  // context-aware deps
  resultStore: WritableToolResultStore;
  skillsStore: WritableSkillsStore;
  attachmentStateManager: AttachmentStateManager;
  todoStateManager: TodoStateManager;
  skillServiceStart: SkillServiceStart;
  pluginsServiceStart: PluginsServiceStart;
  toolManager: ToolManager;
  /** Execution mode for this runner context. */
  executionMode: AgentExecutionMode;
  /** Canonical interactivity config for this runner context. */
  interactivity: InteractivityConfig;
  /** Id of the parent execution that spawned this one, if any. */
  parentExecutionId?: string;
  /** Sub-agent executor for spawning child executions. */
  subAgentExecutor: SubAgentExecutor;
  /** Experimental features enabled for this runner context. */
  experimentalFeatures: ExperimentalFeatures;
  /** The effective agent configuration for the current run (with overrides applied). */
  agentConfiguration?: AgentConfiguration;
}

export type CreateRunnerDeps = Omit<
  CreateScopedRunnerDeps,
  | 'request'
  | 'defaultConnectorId'
  | 'projectRouting'
  | 'resultStore'
  | 'skillsStore'
  | 'attachmentStateManager'
  | 'todoStateManager'
  | 'modelProvider'
  | 'promptManager'
  | 'stateManager'
  | 'toolManager'
  | 'subAgentExecutor'
  | 'executionMode'
  | 'interactivity'
  | 'parentExecutionId'
  | 'experimentalFeatures'
> & {
  modelProviderFactory: ModelProviderFactoryFn;
  /** Lazy getter for the execution service (breaks circular dep with runner). */
  getExecutionService: () => AgentExecutionService;
};

const toToolRunInteractivity = (approvals?: RunApprovals): InteractivityConfig => {
  const unknownApis = findUnknownApis(approvals?.autoApprovedApis ?? []);
  if (unknownApis.length > 0) {
    throw createBadRequestError(
      `Unknown auto_approved_apis: ${formatUnknownApis(
        unknownApis
      )}. Each entry must name an API that exists on its target.`
    );
  }
  return createNonInteractiveConfig(approvals?.autoApprovedApis);
};

export class RunnerManager {
  public readonly deps: CreateScopedRunnerDeps;
  public readonly context: RunContext;

  constructor(deps: CreateScopedRunnerDeps, context?: RunContext) {
    this.deps = deps;
    this.context = context ?? createEmptyRunContext();
  }

  // arrow function is required, risks of loosing context when passed down as handler.
  getRunner = (): ScopedRunner => {
    return {
      runTool: <TParams = Record<string, unknown>>(
        toolExecutionParams: ScopedRunnerRunToolsParams<TParams>
      ): Promise<RunToolReturn> => {
        try {
          return runTool<TParams>({ toolExecutionParams, parentManager: this });
        } catch (e) {
          if (isAgentBuilderError(e)) {
            throw e;
          } else {
            throw createInternalError(e.message);
          }
        }
      },
      runInternalTool: <TParams = Record<string, unknown>>(
        toolExecutionParams: ScopedRunnerRunInternalToolParams<TParams>
      ): Promise<RunToolReturn> => {
        try {
          return runInternalTool<TParams>({ toolExecutionParams, parentManager: this });
        } catch (e) {
          if (isAgentBuilderError(e)) {
            throw e;
          } else {
            throw createInternalError(e.message);
          }
        }
      },
      runAgent: (agentExecutionParams: ScopedRunnerRunAgentParams): Promise<RunAgentReturn> => {
        try {
          return runAgent({ agentExecutionParams, parentManager: this });
        } catch (e) {
          if (isAgentBuilderError(e)) {
            throw e;
          } else {
            throw createInternalError(e.message);
          }
        }
      },
    };
  };

  createChild(childContext: RunContext): RunnerManager {
    return new RunnerManager(this.deps, childContext);
  }
}

export const createScopedRunner = (deps: CreateScopedRunnerDeps): ScopedRunner => {
  const manager = new RunnerManager(deps, createEmptyRunContext());
  return manager.getRunner();
};

export const createRunner = (deps: CreateRunnerDeps): Runner => {
  const { modelProviderFactory, getExecutionService, ...runnerDeps } = deps;

  const createScopedRunnerWithDeps = async ({
    request,
    defaultConnectorId,
    projectRouting,
    telemetryMetadata,
    agentId,
    maxContentLength,
    reasoningLevel,
    conversation,
    nextInput,
    promptState,
    abortSignal,
    executionMode,
    interactivity,
    parentExecutionId,
  }: {
    request: KibanaRequest;
    defaultConnectorId?: string;
    projectRouting?: string;
    telemetryMetadata?: ConnectorTelemetryMetadata;
    agentId?: string;
    maxContentLength?: number;
    reasoningLevel?: ChatCompletionReasoningEffort;
    conversation?: Conversation;
    nextInput?: ConverseInput;
    promptState?: PromptStorageState;
    abortSignal?: AbortSignal;
    executionMode: AgentExecutionMode;
    interactivity: InteractivityConfig;
    parentExecutionId?: string;
  }): Promise<ScopedRunner> => {
    const resultStore = createResultStore({ conversation });
    const skillsStore = createSkillsStore({ skills: [] });

    const attachmentStateManager = createAttachmentStateManager(conversation?.attachments ?? [], {
      getTypeDefinition: runnerDeps.attachmentsService.getTypeDefinition,
    });

    const todoStateManager = createTodoStateManager(conversation?.state?.todos);

    const stateManager = createConversationStateManager(conversation);
    const promptManager = createPromptManager({ state: promptState });
    const toolManager = createToolManager();

    const modelProvider = modelProviderFactory({
      request,
      defaultConnectorId,
      telemetryMetadata,
      agentId,
      maxContentLength,
      reasoningLevel,
    });

    const subAgentExecutor = createSubAgentExecutor({
      request,
      getExecutionService,
      projectRouting,
      interactivity,
    });

    const uiSettingsClient = runnerDeps.uiSettings.asScopedToClient(
      runnerDeps.savedObjects.getScopedClient(request)
    );
    const [experimentalEnabled, bashEnabled, contextEngineEnabled] = await Promise.all([
      uiSettingsClient
        .get<boolean>(AGENT_BUILDER_EXPERIMENTAL_FEATURES_SETTING_ID)
        .catch(() => false),
      uiSettingsClient.get<boolean>(AGENT_BUILDER_BASH_SUPPORT_SETTING_ID).catch(() => false),
      uiSettingsClient.get<boolean>(CONTEXT_ENGINE_ENABLED_SETTING_ID).catch(() => false),
    ]);
    const experimentalFeatures: ExperimentalFeatures = {
      skills: true,
      aiIndices: experimentalEnabled && contextEngineEnabled,
      relevantSkills: experimentalEnabled,
      subagents: experimentalEnabled,
      todos: experimentalEnabled,
      datasets: experimentalEnabled,
      // forcefully disabled until the UI is implemented
      askUserQuestion: false, // isExperimentalEnabled,
      bash: bashEnabled,
      apiTools: experimentalEnabled,
    };

    const allDeps = {
      ...runnerDeps,
      modelProvider,
      request,
      defaultConnectorId,
      projectRouting,
      abortSignal,
      resultStore,
      skillsStore,
      attachmentStateManager,
      todoStateManager,
      stateManager,
      promptManager,
      toolManager,
      executionMode,
      interactivity,
      parentExecutionId,
      subAgentExecutor,
      experimentalFeatures,
    };
    return createScopedRunner(allDeps);
  };

  return {
    runTool: async (runToolParams) => {
      const { request, defaultConnectorId, promptState, abortSignal, approvals, ...otherParams } =
        runToolParams;
      const runner = await createScopedRunnerWithDeps({
        request,
        promptState,
        defaultConnectorId,
        abortSignal,
        // tools always executed in standalone context
        executionMode: AgentExecutionMode.standalone,
        interactivity: toToolRunInteractivity(approvals),
      });
      return runner.runTool(otherParams);
    },
    runInternalTool: async (runToolParams) => {
      const { request, defaultConnectorId, promptState, abortSignal, approvals, ...otherParams } =
        runToolParams;
      const runner = await createScopedRunnerWithDeps({
        request,
        promptState,
        defaultConnectorId,
        abortSignal,
        // tools always executed in standalone context
        executionMode: AgentExecutionMode.standalone,
        interactivity: toToolRunInteractivity(approvals),
      });
      return runner.runInternalTool(otherParams);
    },
    runAgent: async (params) => {
      const {
        request,
        defaultConnectorId,
        projectRouting,
        telemetryMetadata,
        maxContentLength,
        reasoningLevel,
        abortSignal,
        executionMode = AgentExecutionMode.conversation,
        interactive,
        parentExecutionId,
        ...otherParams
      } = params;
      const { nextInput, conversation } = params.agentParams;
      const interactivity = normalizeInteractive(interactive, executionMode);
      const runner = await createScopedRunnerWithDeps({
        request,
        defaultConnectorId,
        projectRouting,
        telemetryMetadata,
        agentId: otherParams.agentId,
        maxContentLength,
        reasoningLevel,
        conversation,
        nextInput,
        abortSignal,
        executionMode,
        interactivity,
        parentExecutionId,
        promptState: getAgentPromptStorageState({
          input: nextInput,
          conversation,
        }),
      });
      return runner.runAgent(otherParams);
    },
  };
};
