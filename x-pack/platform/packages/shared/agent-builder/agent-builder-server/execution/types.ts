/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Observable } from 'rxjs';
import type {
  AgentCapabilities,
  AgentExecutionMode,
  ChatEvent,
  ConverseInput,
  AgentConfigurationOverrides,
  BrowserApiToolMetadata,
  ConversationAction,
  ConversationAccessControl,
  ExecutionStatus,
  SerializedExecutionError,
} from '@kbn/agent-builder-common';
import type { KibanaRequest } from '@kbn/core-http-server';
import type { ConnectorTelemetryMetadata } from '@kbn/inference-common';

/**
 * Common execution parameters shared between conversation and standalone modes.
 */
export interface BaseExecutionParams {
  /** Id of the agent to execute. */
  agentId?: string;
  /** Id of the genAI connector to use. */
  connectorId?: string;
  /** Capabilities to use for this execution. */
  capabilities?: AgentCapabilities;
  /** The input for this execution. */
  nextInput: ConverseInput;
  /** Whether to use structured output mode. */
  structuredOutput?: boolean;
  /** Optional JSON schema for structured output. */
  outputSchema?: Record<string, unknown>;
  /** Runtime configuration overrides for this execution only. */
  configurationOverrides?: AgentConfigurationOverrides;
  /** Id of the parent execution that spawned this execution. */
  parentExecutionId?: string;
  /**
   * Connector telemetry to attribute this execution's LLM calls to a specific feature
   * (sets `metadata.connectorTelemetry` on inference calls). When omitted, the default
   * Agent Builder telemetry is used.
   */
  telemetryMetadata?: ConnectorTelemetryMetadata;
}

/**
 * Execution parameters for conversation mode — tied to a conversation with persistence.
 */
export interface ConversationExecutionParams extends BaseExecutionParams {
  /** Id of the conversation to continue. */
  conversationId?: string;
  /** When false, the conversation will not be persisted. Defaults to true. */
  storeConversation?: boolean;
  /** Create conversation with specified ID if not found. */
  autoCreateConversationWithId?: boolean;
  /** Access mode to apply when creating a new conversation. Ignored for existing conversations. */
  accessControl?: ConversationAccessControl;
  /** Browser API tools to make available to the agent. */
  browserApiTools?: BrowserApiToolMetadata[];
  /** The action to perform: "regenerate" re-executes the last round with original input (requires conversationId). */
  action?: ConversationAction;
}

/**
 * Execution parameters for standalone mode — single execution, not tied to a conversation.
 */
export type StandaloneExecutionParams = BaseExecutionParams;

/**
 * Union of all execution parameter types.
 */
export type AgentExecutionParams = ConversationExecutionParams | StandaloneExecutionParams;

/**
 * Common fields shared by all agent execution documents.
 */
interface BaseAgentExecution {
  /** Unique id of the execution. */
  executionId: string;
  /** Timestamp of the execution creation. */
  '@timestamp': string;
  /** Current status of the execution. */
  status: ExecutionStatus;
  /** Id of the agent being executed. */
  agentId: string;
  /** Id of the space the execution was performed in. */
  spaceId: string;
  /** Error details, present when status is 'failed'. */
  error?: SerializedExecutionError;
  /** Number of events stored on the document (kept in sync with `events.length`). */
  eventCount: number;
  /** Inline events emitted during the execution. The array index is the event number. */
  events: ChatEvent[];
  /** Caller-provided metadata. */
  metadata?: Record<string, string>;
  /** The ID of the parent execution that spawned this standalone execution. */
  parentExecutionId?: string;
}

/**
 * An agent execution in conversation mode — tied to a conversation with persistence.
 */
export interface ConversationAgentExecution extends BaseAgentExecution {
  executionMode: AgentExecutionMode.conversation;
  agentParams: ConversationExecutionParams;
}

/**
 * An agent execution in standalone mode — single execution, not tied to a conversation.
 */
export interface StandaloneAgentExecution extends BaseAgentExecution {
  executionMode: AgentExecutionMode.standalone;
  agentParams: StandaloneExecutionParams;
}

/**
 * The agent execution document persisted in the agent-executions index.
 * Discriminated union on `executionMode`.
 */
export type AgentExecution = ConversationAgentExecution | StandaloneAgentExecution;

/**
 * Result of executing an agent.
 */
export interface ExecuteAgentResult {
  /** The unique execution ID. */
  executionId: string;
  /**
   * Observable of events for this execution.
   * - Local mode: the live agent event stream (multicasted).
   * - TM mode: polls the data stream (equivalent to followExecution).
   */
  events$: Observable<ChatEvent>;
}

/**
 * Base parameters for {@link AgentExecutionService.executeAgent}.
 */
interface ExecuteAgentBaseParams {
  /** The request that initiated the execution (used to carry the API key for TM scheduling). */
  request: KibanaRequest;
  /** Optional abort signal. When aborted, the execution will be cancelled. */
  abortSignal?: AbortSignal;
  /** Optional execution ID. When provided, it will be used instead of generating a new one. Must be unique. */
  executionId?: string;
  /** Arbitrary key-value metadata stored with the execution, searchable via findExecutions. */
  metadata?: Record<string, string>;
  /**
   * Controls whether execution runs on a Task Manager node.
   * - `true`: schedule on TM.
   * - `false`: run locally.
   * - `undefined` (default): auto-decide based on context.
   */
  useTaskManager?: boolean;
}

export interface ExecuteConversationAgentParams extends ExecuteAgentBaseParams {
  mode: AgentExecutionMode.conversation;
  params: ConversationExecutionParams;
}

export interface ExecuteStandaloneAgentParams extends ExecuteAgentBaseParams {
  mode: AgentExecutionMode.standalone;
  params: StandaloneExecutionParams;
}

export type ExecuteAgentParams = ExecuteConversationAgentParams | ExecuteStandaloneAgentParams;

/**
 * Options for {@link AgentExecutionService.followExecution}.
 */
export interface FollowExecutionOptions {
  /** Only return events with event_number greater than this value. */
  since?: number;
}

/**
 * Filter criteria for {@link AgentExecutionService.findExecutions}.
 * All specified fields are ANDed together.
 */
export interface FindExecutionsFilter {
  /** Match executions whose metadata contains all specified key-value pairs. */
  metadata?: Record<string, string>;
  /** Match executions with one of these statuses. */
  status?: ExecutionStatus[];
}

/**
 * Options for {@link AgentExecutionService.findExecutions}.
 */
export interface FindExecutionsOptions {
  /** Space to scope results to. Defaults to current space from request if omitted. */
  spaceId?: string;
  /** Filter criteria. All specified fields are ANDed together. */
  filter?: FindExecutionsFilter;
  /** Maximum number of results to return. Defaults to 10. */
  size?: number;
  /**
   * Sort field and order. Defaults to `{ field: '@timestamp', order: 'desc' }`.
   * Note: field is an explicit union rather than derived from AgentExecutionProperties to avoid
   * circular dependencies and to prevent exposing snake_case ES field names to consumers.
   */
  sort?: { field: '@timestamp' | 'status'; order: 'asc' | 'desc' };
}

/**
 * The agent execution service - entry point for deferred agent execution.
 * Replaces the direct call to ChatService.converse in the request flow.
 */
export interface AgentExecutionService {
  /**
   * Execute an agent, either locally or on a Task Manager node.
   * Creates an execution document and returns the execution ID along with an events observable.
   */
  executeAgent(params: ExecuteAgentParams): Promise<ExecuteAgentResult>;

  /**
   * Retrieve an agent execution by its ID.
   */
  getExecution(executionId: string): Promise<AgentExecution | undefined>;

  /**
   * Abort an ongoing execution.
   * Sets the execution status to 'aborted', which the TM handler will detect via polling.
   */
  abortExecution(executionId: string): Promise<void>;

  /**
   * Follow an execution by polling for events.
   * Returns an observable that emits events as they are written to the data stream.
   * The observable completes when the execution reaches a terminal status.
   */
  followExecution(executionId: string, options?: FollowExecutionOptions): Observable<ChatEvent>;

  /**
   * Find executions matching the given filters. Defaults to current space unless spaceId is explicitly provided.
   * Callers that override spaceId are responsible for their own authorization.
   * Note: returned executions have `events: []` (events are excluded for performance). Use `getExecution` or `readEvents` for full events.
   */
  findExecutions(
    request: KibanaRequest,
    options?: FindExecutionsOptions
  ): Promise<AgentExecution[]>;
}
