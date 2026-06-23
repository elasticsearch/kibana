/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Logger } from '@kbn/logging';
import type { ElasticsearchServiceStart } from '@kbn/core-elasticsearch-server';
import type { KibanaRequest } from '@kbn/core-http-server';
import type { SecurityServiceStart } from '@kbn/core-security-server';
import type { SavedObjectsServiceStart } from '@kbn/core-saved-objects-server';
import type { UiSettingsServiceStart } from '@kbn/core-ui-settings-server';
import type { SpacesPluginStart } from '@kbn/spaces-plugin/server';
import type { PluginStartContract as ActionsPluginStart } from '@kbn/actions-plugin/server';
import type { ConnectorTelemetryMetadata } from '@kbn/inference-common';
import type { AgentConfiguration, Conversation, ConverseInput } from '@kbn/agent-builder-common';
import {
  AgentExecutionMode,
  createInternalError,
  isAgentBuilderError,
} from '@kbn/agent-builder-common';
import type { PromptStorageState } from '@kbn/agent-builder-common/agents/prompts';
import type {
  HooksServiceStart,
  ModelProvider,
  RunAgentReturn,
  RunContext,
  Runner,
  RunToolReturn,
  ScopedRunner,
  ScopedRunnerRunAgentParams,
  SubAgentExecutor,
  WritableToolResultStore,
} from '@kbn/agent-builder-server';
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
import type { AttachmentServiceStart } from '../../attachments';
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

export interface CreateScopedRunnerDeps {
  // core services
  elasticsearch: ElasticsearchServiceStart;
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
  attachmentsService: AttachmentServiceStart;
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
  /** Sub-agent executor for spawning child executions. */
  subAgentExecutor: SubAgentExecutor;
  /** The effective agent configuration for the current run (with overrides applied). */
  agentConfiguration?: AgentConfiguration;
}

export type CreateRunnerDeps = Omit<
  CreateScopedRunnerDeps,
  | 'request'
  | 'defaultConnectorId'
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
> & {
  modelProviderFactory: ModelProviderFactoryFn;
  /** Lazy getter for the execution service (breaks circular dep with runner). */
  getExecutionService: () => AgentExecutionService;
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
    telemetryMetadata,
    conversation,
    nextInput,
    promptState,
    abortSignal,
    executionMode,
  }: {
    request: KibanaRequest;
    defaultConnectorId?: string;
    telemetryMetadata?: ConnectorTelemetryMetadata;
    conversation?: Conversation;
    nextInput?: ConverseInput;
    promptState?: PromptStorageState;
    abortSignal?: AbortSignal;
    executionMode: AgentExecutionMode;
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

    const modelProvider = modelProviderFactory({ request, defaultConnectorId, telemetryMetadata });

    const subAgentExecutor = createSubAgentExecutor({ request, getExecutionService });

    const allDeps = {
      ...runnerDeps,
      modelProvider,
      request,
      defaultConnectorId,
      abortSignal,
      resultStore,
      skillsStore,
      attachmentStateManager,
      todoStateManager,
      stateManager,
      promptManager,
      toolManager,
      executionMode,
      subAgentExecutor,
    };
    return createScopedRunner(allDeps);
  };

  return {
    runTool: async (runToolParams) => {
      const { request, defaultConnectorId, promptState, abortSignal, ...otherParams } =
        runToolParams;
      const runner = await createScopedRunnerWithDeps({
        request,
        promptState,
        defaultConnectorId,
        abortSignal,
        // tools always executed in standalone context
        executionMode: AgentExecutionMode.standalone,
      });
      return runner.runTool(otherParams);
    },
    runInternalTool: async (runToolParams) => {
      const { request, defaultConnectorId, promptState, abortSignal, ...otherParams } =
        runToolParams;
      const runner = await createScopedRunnerWithDeps({
        request,
        promptState,
        defaultConnectorId,
        abortSignal,
        // tools always executed in standalone context
        executionMode: AgentExecutionMode.standalone,
      });
      return runner.runInternalTool(otherParams);
    },
    runAgent: async (params) => {
      const {
        request,
        defaultConnectorId,
        telemetryMetadata,
        abortSignal,
        executionMode = AgentExecutionMode.conversation,
        ...otherParams
      } = params;
      const { nextInput, conversation } = params.agentParams;
      const runner = await createScopedRunnerWithDeps({
        request,
        defaultConnectorId,
        telemetryMetadata,
        conversation,
        nextInput,
        abortSignal,
        executionMode,
        promptState: getAgentPromptStorageState({
          input: nextInput,
          conversation,
        }),
      });
      return runner.runAgent(otherParams);
    },
  };
};
