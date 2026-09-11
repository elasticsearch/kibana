/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { KibanaRequest } from '@kbn/core-http-server';
import { HookLifecycle, HookExecutionMode } from '@kbn/agent-builder-common';
import type { AgentConfiguration, ConversationRound } from '@kbn/agent-builder-common';
import type { ProcessedRoundInput } from '../processed_input';
import type { RunToolReturn } from '../runner';
import type { ToolCallSource } from '../runner/runner';
import type { ToolHandlerContext } from '../tools/handler';

export { HookLifecycle, HookExecutionMode };

interface AgentHookContextBase {
  request: KibanaRequest;
  abortSignal?: AbortSignal;
  agentId?: string;
}

export interface BeforeAgentHookContext extends AgentHookContextBase {
  nextInput: ProcessedRoundInput;
  /** Id of the conversation this round belongs to. Absent for standalone (sub-agent) runs. */
  conversationId?: string;
}

interface ToolCallHookContextBase extends AgentHookContextBase {
  toolId: string;
  toolCallId: string;
  toolParams: Record<string, unknown>;
  source: ToolCallSource;
}

export type BeforeToolCallHookContext = ToolCallHookContextBase;
export interface AfterToolCallHookContext extends ToolCallHookContextBase {
  toolReturn: RunToolReturn;
  toolHandlerContext: ToolHandlerContext;
}

export interface AfterExecutionHookContext extends AgentHookContextBase {
  round: ConversationRound;
  conversationId?: string;
  agentConfiguration: AgentConfiguration;
}

export interface HookContextByLifecycle {
  [HookLifecycle.beforeAgent]: BeforeAgentHookContext;
  [HookLifecycle.beforeToolCall]: BeforeToolCallHookContext;
  [HookLifecycle.afterToolCall]: AfterToolCallHookContext;
  [HookLifecycle.afterExecution]: AfterExecutionHookContext;
}

export type HookContext<E extends HookLifecycle = HookLifecycle> = HookContextByLifecycle[E];

/**
 * Define which return type each hook lifecycle supports.
 */
export interface HookHandlerResultByLifecycle {
  [HookLifecycle.beforeAgent]: {
    nextInput?: ProcessedRoundInput;
  };
  [HookLifecycle.beforeToolCall]: {
    toolParams?: Record<string, unknown>;
  };
  [HookLifecycle.afterToolCall]: {
    toolReturn?: RunToolReturn;
  };
  [HookLifecycle.afterExecution]: Record<string, never>;
}

export type HookHandlerResult<E extends HookLifecycle = HookLifecycle> =
  HookHandlerResultByLifecycle[E];

export type BlockingHookHandler<E extends HookLifecycle = HookLifecycle> = (
  context: HookContext<E>
) => Promise<void | HookHandlerResult<E>> | void | HookHandlerResult<E>;

/**
 * Handler for non-blocking hooks. Non-blocking hooks run fire-and-forget; their return value is ignored.
 * They can't return context updates (use blocking hooks for that).
 */
type NonBlockingHookHandler<E extends HookLifecycle = HookLifecycle> = (
  context: HookContext<E>
) => void | Promise<void>;

interface BlockingHookRegistrationEntry<E extends HookLifecycle> {
  mode: HookExecutionMode.blocking;
  handler: BlockingHookHandler<E>;
  /**
   * Optional timeout in milliseconds for this hook. If exceeded, execution fails.
   */
  timeout?: number;
}

interface NonBlockingHookRegistrationEntry<E extends HookLifecycle> {
  mode: HookExecutionMode.nonBlocking;
  handler: NonBlockingHookHandler<E>;
}

type HookRegistrationEntry<E extends HookLifecycle> =
  | BlockingHookRegistrationEntry<E>
  | NonBlockingHookRegistrationEntry<E>;

/**
 * Single hook registration (one lifecycle event). When expanded from a bundle,
 */
export type HookRegistration<E extends HookLifecycle = HookLifecycle> = Pick<
  HookRegistrationsBundle,
  'id' | 'priority'
> &
  HookRegistrationEntry<E>;

/**
 * Bundle of hook registrations for one or more lifecycles in a single call.
 * id and priority apply to all entries in the bundle.
 */
interface HookRegistrationsBundle {
  /**
   * Unique id for this bundle (used as prefix per lifecycle, e.g. `id-beforeToolCall`).
   */
  id: string;
  /**
   * Priority for all hooks in this bundle. Higher values run earlier.
   */
  priority?: number;
  hooks: {
    [K in HookLifecycle]?: HookRegistrationEntry<K>;
  };
}

export interface HooksServiceSetup {
  /**
   * Register one or more lifecycle hooks in a single call.
   */
  register(bundle: HookRegistrationsBundle): void;
}

export interface HooksServiceStart {
  /**
   * Runs blocking hooks first (await), then runs non-blocking hooks with the updated context (fire-and-forget).
   * Returns the context as updated by blocking hooks.
   */
  run: <E extends HookLifecycle>(lifecycle: E, context: HookContext<E>) => Promise<HookContext<E>>;
}

export interface AgentBuilderHooks {
  run: HooksServiceStart['run'];
}
