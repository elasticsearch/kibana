/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { MaybePromise } from '@kbn/utility-types';
import type { Logger } from '@kbn/logging';
import type { IScopedClusterClient } from '@kbn/core-elasticsearch-server';
import type { KibanaRequest } from '@kbn/core-http-server';
import type { SavedObjectsClientContract } from '@kbn/core-saved-objects-api-server';
import type { ToolResult } from '@kbn/agent-builder-common/tools/tool_result';
import type { PromptRequest } from '@kbn/agent-builder-common/agents/prompts';
import type { AgentExecutionMode } from '@kbn/agent-builder-common';
import type { AgentConfiguration } from '@kbn/agent-builder-common';
import type { ExperimentalFeatures } from '../agents/provider';
import type {
  ToolEventEmitter,
  ModelProvider,
  ScopedRunner,
  ToolProvider,
  ToolResultStore,
  SkillsStore,
  ToolPromptManager,
  ToolStateManager,
  ToolManager,
  RunContext,
} from '../runner';
import type { SkillsService } from '../runner/skills_service';
import type { ToolCallSource } from '../runner/runner';
import type { AttachmentStateManager } from '../attachments';

/**
 * Tool result as returned by the tool handler.
 */
export type ToolHandlerResult<TResult extends ToolResult = ToolResult> = Omit<
  TResult,
  'tool_result_id'
> & { tool_result_id?: string };

export interface ToolHandlerPromptReturn {
  prompt: PromptRequest;
}

/**
 * Return value for {@link ToolHandlerFn} / {@link BuiltinToolDefinition}
 */
export interface ToolHandlerStandardReturn<TResult extends ToolResult = ToolResult> {
  results: Array<ToolHandlerResult<TResult>>;
}

/**
 * Return value for {@link ToolHandlerFn} / {@link BuiltinToolDefinition}
 */
export type ToolHandlerReturn<TResult extends ToolResult = ToolResult> =
  | ToolHandlerStandardReturn<TResult>
  | ToolHandlerPromptReturn;

export const isToolHandlerInterruptReturn = (
  toolReturn: ToolHandlerReturn
): toolReturn is ToolHandlerPromptReturn => {
  return 'prompt' in toolReturn;
};

export const isToolHandlerStandardReturn = (
  toolReturn: ToolHandlerReturn
): toolReturn is ToolHandlerStandardReturn => {
  return 'results' in toolReturn;
};

/**
 * Tool handler function for {@link BuiltinToolDefinition} handlers.
 */
export type ToolHandlerFn<
  TParams extends Record<string, unknown> = Record<string, unknown>,
  TResult extends ToolResult = ToolResult
> = (args: TParams, context: ToolHandlerContext) => MaybePromise<ToolHandlerReturn<TResult>>;

export interface ToolHandlerCallContext {
  toolId: string;
  toolCallId: string;
  callSource: ToolCallSource;
}

/**
 * Scoped context which can be used during tool execution to access
 * a panel of built-in services, such as a pre-scoped elasticsearch client.
 */
export interface ToolHandlerContext {
  /**
   * Information about the tool call
   */
  callContext: ToolHandlerCallContext;
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
   * A cluster client scoped to the current user.
   * Can be used to access ES on behalf of either the current user or the system user.
   */
  esClient: IScopedClusterClient;
  /**
   * Saved objects client scoped to the current user.
   */
  savedObjectsClient: SavedObjectsClientContract;
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
   * AgentBuilder runner scoped to the current execution.
   */
  runner: ScopedRunner;
  /**
   * Result store to access tool results during execution.
   */
  resultStore: ToolResultStore;
  /**
   * Skills store to access skill files (and their per-file metadata) during execution.
   */
  skillsStore: SkillsStore;
  /**
   * Event emitter that can be used to emits custom events
   */
  events: ToolEventEmitter;
  /**
   * Logger scoped to this execution
   */
  logger: Logger;
  /**
   * Service used to send and read interruptions.
   */
  prompts: ToolPromptManager;
  /**
   * Manager to store/load tool state during interrupted executions.
   */
  stateManager: ToolStateManager;
  /**
   * Attachment state manager to manage conversation attachments.
   * Allows tools to create, read, update, and delete attachments that persist across conversation rounds.
   */
  attachments: AttachmentStateManager;
  /**
   * Skills service to interact with skills.
   */
  skills: SkillsService;
  /**
   * Tool manager to manage active tools for the agent.
   */
  toolManager: ToolManager;
  /**
   * The current execution context, including the agent/tool call stack.
   */
  runContext: RunContext;
  /**
   * The execution mode for the current agent run.
   * When 'standalone', the execution is non-interactive (HITL disabled).
   */
  executionMode?: AgentExecutionMode;
  /**
   * The experimental features enabled for the current run.
   */
  experimentalFeatures: ExperimentalFeatures;
  /**
   * The effective agent configuration for the current run, with any
   * runtime configuration overrides already applied.
   */
  agentConfiguration?: AgentConfiguration;
}
