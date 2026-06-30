/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Observable } from 'rxjs';
import type { Logger } from '@kbn/logging';
import type {
  Conversation,
  ConversationRound,
  ConverseInput,
  ChatAgentEvent,
  AgentCapabilities,
  AgentConfigurationOverrides,
  ConversationAction,
  AgentExecutionMode,
  ChatEvent,
  ExecutionStatus,
  SerializedExecutionError,
} from '@kbn/agent-builder-common';
import type { IScopedClusterClient } from '@kbn/core-elasticsearch-server';
import type { KibanaRequest } from '@kbn/core-http-server';
import type { SavedObjectsClientContract } from '@kbn/core-saved-objects-api-server';
import type { BrowserApiToolMetadata } from '@kbn/agent-builder-common';
import type {
  ModelProvider,
  ScopedRunner,
  ToolProvider,
  WritableToolResultStore,
  WritableSkillsStore,
  AttachmentsService,
  PromptManager,
  ConversationStateManager,
  SkillsService,
  PluginsService,
  ToolManager,
  TodoStateManager,
  IFilesystemService,
  IBashService,
} from '../runner';
import type { AttachmentStateManager } from '../attachments';
import type { AgentBuilderHooks } from '../hooks/types';
import type { ToolRegistry } from '../tools';
import type { AgentBuilderAnalytics, AgentBuilderTracking } from '../telemetry';

export type AgentHandlerFn = (
  params: AgentHandlerParams,
  context: AgentHandlerContext
) => Promise<AgentHandlerReturn>;

export interface AgentHandlerParams {
  /** The params that the agent execution API was called with */
  agentParams: AgentParams;
  /** ID of this run */
  runId: string;
  /** optional signal to abort the execution of the agent */
  abortSignal?: AbortSignal;
}

export interface AgentHandlerReturn {
  /** The plain result of the agent */
  result: AgentResponse;
}

/**
 * Pre-scoped executor for spawning sub-agent executions.
 * The `request` is already bound — callers don't need to provide it.
 */
export interface SubAgentExecutor {
  /** Execute a sub-agent and return the execution ID and events observable. */
  executeSubAgent(params: {
    agentId: string;
    connectorId?: string;
    capabilities?: AgentCapabilities;
    parentExecutionId: string;
    prompt: string;
    abortSignal?: AbortSignal;
  }): Promise<{
    executionId: string;
    events$: Observable<ChatEvent>;
  }>;

  /** Retrieve a sub-agent execution by ID. Returns undefined if not found. */
  getExecution(executionId: string): Promise<SubAgentExecution | undefined>;
}

export interface SubAgentExecution {
  executionId: string;
  status: ExecutionStatus;
  error?: SerializedExecutionError;
  events: ChatEvent[];
}

/**
 * Experimental features configuration for agent builder.
 */
export interface ExperimentalFeatures {
  /** Whether the skills feature is enabled */
  skills: boolean;
  /** Whether the sub-agent execution feature is enabled */
  subagents: boolean;
  /** Whether the todo list tool and task-management prompt are enabled */
  todos: boolean;
  /** Whether external ES|QL datasets are surfaced to data-source tools */
  datasets: boolean;
  /** Whether the ask_user_question HITL tool is enabled */
  askUserQuestion: boolean;
  /** Whether the bash tool (and the just-bash runtime) is enabled */
  bash: boolean;
}

export interface AgentHandlerContext {
  /**
   * The request that was provided when initiating that tool execution.
   * Can be used to create scoped services not directly exposed by this context.
   */
  request: KibanaRequest;
  /**
   * Id of the space associated with the request
   */
  spaceId: string;
  /**
   * The resolved connector ID for this execution, if any.
   */
  defaultConnectorId?: string;
  /**
   * A cluster client scoped to the current user.
   * Can be used to access ES on behalf of either the current user or the system user.
   */
  esClient: IScopedClusterClient;
  /**
   * Saved objects client scoped to the current user.
   */
  savedObjectsClient?: SavedObjectsClientContract;
  /**
   * Inference model provider scoped to the current user.
   * Can be used to access the inference APIs or chatModel.
   */
  modelProvider: ModelProvider;
  /**
   * Tool provider that can be used to list or execute tools.
   */
  toolProvider: ToolProvider;
  /**
   * Tool registry for accessing internal tool definitions.
   * Used for features like tool-specific result summarization.
   */
  toolRegistry: ToolRegistry;
  /**
   * AgentBuilder runner scoped to the current execution.
   */
  runner: ScopedRunner;
  /**
   * Attachment service to interact with attachments.
   */
  attachments: AttachmentsService;
  /**
   * Skills service to interact with skills.
   */
  skills: SkillsService;
  /**
   * Plugins service to resolve plugin-contributed skill IDs during execution.
   */
  plugins: PluginsService;
  /**
   * Tool manager to manage active tools for the agent.
   */
  toolManager: ToolManager;
  /**
   * Result store to access and add tool results during execution.
   */
  resultStore: WritableToolResultStore;
  /**
   * Skills store to populate with filtered skills during execution.
   * Backs the skills volume in the virtual filesystem.
   */
  skillsStore: WritableSkillsStore;
  /**
   * Attachment state manager to manage conversation attachments during execution.
   */
  attachmentStateManager: AttachmentStateManager;
  /**
   * Manages the active todo list for this conversation execution.
   */
  todoStateManager: TodoStateManager;
  /**
   * Used to manage interruptions.
   */
  promptManager: PromptManager;
  /**
   * Used to access and store state during interrupted executions.
   */
  stateManager: ConversationStateManager;
  /**
   * Event emitter that can be used to emits custom events
   */
  events: AgentEventEmitter;
  /**
   * Logger scoped to this execution
   */
  logger: Logger;
  /**
   * Hooks service for agent lifecycle interception.
   */
  hooks: AgentBuilderHooks;
  /**
   * Unified virtual filesystem service.
   */
  filesystemService: IFilesystemService;
  /**
   * Bash runtime service. Present only when `experimentalFeatures.bash` is on.
   */
  bashService?: IBashService;
  /**
   * Experimental features configuration for this agent execution.
   * Determined by the UI setting at the start of execution.
   */
  experimentalFeatures: ExperimentalFeatures;
  /**
   * The execution mode for this agent run.
   * NOTE: atm, when 'standalone', the execution is non-interactive (HITL disabled).
   */
  executionMode: AgentExecutionMode;
  /**
   * Sub-agent executor for spawning child agent executions.
   */
  subAgentExecutor: SubAgentExecutor;
  /**
   * Optional analytics surface for emitting agent-runtime events such as
   * SkillInvoked. Provided by the plugin when telemetry is wired.
   */
  analyticsService?: AgentBuilderAnalytics;
  /**
   * Optional tracking surface for emitting agent-runtime counters such as
   * skill-invocation counts. Provided by the plugin when telemetry is wired.
   */
  trackingService?: AgentBuilderTracking;
}

/**
 * Event handler function to listen to run events during execution of tools, agents or other agentBuilder primitives.
 */
export type AgentEventEmitterFn = (event: ChatAgentEvent) => void;

export interface AgentEventEmitter {
  emit: AgentEventEmitterFn;
}

// conversational

export interface AgentParams {
  /**
   * Current conversation
   */
  conversation?: Conversation;
  /**
   * The input triggering this round.
   */
  nextInput: ConverseInput;
  /**
   * Agent capabilities to enable.
   */
  capabilities?: AgentCapabilities;
  browserApiTools?: BrowserApiToolMetadata[];
  /**
   * Whether to use structured output mode. When true, the agent will return structured data instead of plain text.
   */
  structuredOutput?: boolean;
  /**
   * Optional JSON schema for structured output. Only used when structuredOutput is true.
   * If not provided, uses a default schema.
   */
  outputSchema?: Record<string, unknown>;
  /**
   * Optional runtime configuration overrides.
   * These override the stored agent configuration for this execution only.
   */
  configurationOverrides?: AgentConfigurationOverrides;
  /**
   * The action to perform: "regenerate" re-executes the last round with original input (requires conversation_id).
   */
  action?: ConversationAction;
  /**
   * The execution ID for this run. Used for sub-agent parent tracking.
   */
  executionId?: string;
}

export interface AgentResponse {
  /**
   * The full round of conversation, can be used for persistence for example.
   */
  round: ConversationRound;
}
