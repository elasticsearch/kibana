/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ElasticsearchClient, KibanaRequest } from '@kbn/core/server';
import type { OrStringRecursive } from '@kbn/utility-types';
import type { StepContext } from '@kbn/workflows';
import type { z } from '@kbn/zod/v4';
import type { CommonStepDefinition } from '../../common';

// -----------------------------------------------------------------------------
// Poll step types
// -----------------------------------------------------------------------------

/**
 * Applied by {@link createPollServerStepDefinition} when `policy` or `ceilings` fields are omitted
 * (or when individual ceiling properties are missing). Override in your step definition for
 * production integrations.
 */
export const PollStepDefaults = {
  ceilings: {
    maxAttempts: 60,
    maxWaitMs: 60 * 1_000, // 1 minute
  },
  policy: {
    strategy: 'fixed',
    intervalMs: 1000,
  },
} as const satisfies {
  ceilings: PollCeilings;
  policy: PollPolicy;
};

// -----------------------------------------------------------------------------
// Result types
// -----------------------------------------------------------------------------

/** Successful start/poll outcome — step has produced its final output. */
export interface PhaseDoneResult<Output extends z.ZodType = z.ZodType> {
  output: z.infer<Output>;
  error?: never;
}

/**
 * Poll-phase continuation: the step is not done yet. The engine schedules the
 * next wake-up from {@link PollPolicy} unless a positive `nextPollDelayMs` is
 * returned (that value is used from **now** for the next wake-up only).
 *
 * Returning `undefined` (or an object without `output` / `error`) continues polling
 * and keeps the previously persisted author state unless `state` is provided.
 */
export type PollContinueResult<State extends z.ZodObject = z.ZodObject> =
  | {
      output?: never;
      /** Optional updated author state. Omit to keep the previously persisted state. */
      state?: z.infer<State>;
      /**
       * Optional delay (ms) until the next poll. When omitted or non-positive, the
       * engine uses {@link PollPolicy} for the next wake-up. Overrides only the
       * upcoming sleep; the poll `attempt` counter still increments, and the
       * following wake-up uses {@link PollPolicy} from that incremented attempt.
       */
      nextPollDelayMs?: number;
      error?: never;
    }
  | undefined;

/** Failure outcome — same shape as the existing single-handler result. */
export interface PhaseErrorResult {
  output?: undefined;
  state?: undefined;
  error: Error;
}

export type DurablePhaseResult<
  Output extends z.ZodType = z.ZodType,
  State extends z.ZodObject = z.ZodObject
> = PhaseDoneResult<Output> | PollContinueResult<State> | PhaseErrorResult;

/**
 * Handler for a `start` phase that hands off to a `poll` phase.
 * Returns either a final output (synchronous completion) or `{ state }`
 * to start the polling loop.
 */
export type StartWithHandoffHandler<
  Input extends z.ZodType = z.ZodType,
  Output extends z.ZodType = z.ZodType,
  Config extends z.ZodObject = z.ZodObject,
  State extends z.ZodObject = z.ZodObject
> = (context: StepHandlerContext<Input, Config>) => Promise<DurablePhaseResult<Output, State>>;

/**
 * Handler for a `poll` phase. Receives the persisted author `state` alongside
 * the regular step handler context. Returns the final output, a continuation
 * ({@link PollContinueResult}), or `undefined` to continue with unchanged state.
 */
export type PollHandler<
  Input extends z.ZodType = z.ZodType,
  Output extends z.ZodType = z.ZodType,
  Config extends z.ZodObject = z.ZodObject,
  State extends z.ZodObject = z.ZodObject
> = (
  context: PollHandlerContext<Input, Config, State>
) => Promise<DurablePhaseResult<Output, State>>;

/**
 * Handler for a single-shot custom step ({@link createServerStepDefinition}).
 * For durable start/poll work, use {@link createPollServerStepDefinition} instead.
 *
 * @param context - The runtime context for the step execution
 * @returns The step output (should conform to outputSchema)
 */
export type StepHandler<
  Input extends z.ZodType = z.ZodType,
  Output extends z.ZodType = z.ZodType,
  Config extends z.ZodObject = z.ZodObject
> = (context: StepHandlerContext<Input, Config>) => Promise<StepHandlerResult<Output>>;

/**
 * Cancellation cleanup handler for custom workflow steps.
 * Receives the same context as the main handler so it has access to input,
 * config, and runtime services needed for cleanup.
 *
 * `onCancel` fires after the abort signal triggers, in both the `RUNNING`
 * and `WAITING` states. Durable poll steps therefore get a guaranteed
 * cleanup entry point even when they were suspended between polls — handy
 * for cancelling externally-tracked jobs (e.g. an Osquery action created in
 * `start()`) without waiting for the next wake-up.
 *
 * Implementations must be idempotent. Errors thrown here are logged but do
 * not disrupt the cancellation flow.
 */
export type OnCancelHandler<
  Input extends z.ZodType = z.ZodType,
  Config extends z.ZodObject = z.ZodObject
> = (context: StepHandlerContext<Input, Config>) => Promise<void> | void;

// -----------------------------------------------------------------------------
// Poll policy + ceilings
// -----------------------------------------------------------------------------

/**
 * Strategy for computing the next poll wake-up. Cadence is owned by the step
 * author at definition time and is intentionally not configurable from YAML.
 *
 * - `fixed`        — constant interval between every poll.
 * - `exponential`  — `initialMs` scaled by `multiplier` (default 2, same name as
 *                    on-failure retry) each attempt, capped at `maxMs`. With
 *                    `jitter` enabled, uses the same backoff jitter as on-failure
 *                    retry: a uniform delay in `[computed/2, computed]` ms.
 */
export type PollPolicy =
  | { strategy: 'fixed'; intervalMs: number }
  | {
      strategy: 'exponential';
      initialMs: number;
      maxMs: number;
      multiplier?: number;
      jitter?: boolean;
    };

/**
 * Engine-enforced ceilings for a poll-based step. At registration,
 * {@link createPollServerStepDefinition} fills missing values from {@link PollStepDefaults}.
 */
export interface PollCeilings {
  /**
   * Maximum number of `poll` invocations before the engine fails the step with a
   * generic execution error. Prefer returning `{ error }` from `poll` for
   * integration-specific failure messages when the upstream job fails or times out.
   */
  maxAttempts: number;
  /**
   * Maximum delay (ms) until the next poll wake-up (from **now**). When policy or
   * `nextPollDelayMs` would schedule a longer sleep, the engine caps it to this value.
   * Does not fail the step.
   */
  maxWaitMs: number;
}

export interface CommonServerStepDefinition<
  Input extends z.ZodType = z.ZodType,
  Output extends z.ZodType = z.ZodType,
  Config extends z.ZodObject = z.ZodObject
> extends CommonStepDefinition<Input, Output, Config> {
  onCancel?: OnCancelHandler<Input, Config>;
}

// -----------------------------------------------------------------------------
// Step definition union
// -----------------------------------------------------------------------------

/**
 * Single-shot server-side workflow step (`handler` executes once per invocation).
 * Use {@link createServerStepDefinition} for automatic type inference.
 *
 * @example
 * ```typescript
 * // Option 1: Using the helper function (recommended for best type inference)
 * const myStepDefinition = createServerStepDefinition({
 *   id: 'custom.myStep',
 *   inputSchema: z.object({ message: z.string() }),
 *   outputSchema: z.object({ result: z.string() }),
 *   handler: async (context) => {
 *     // context.input is automatically typed as { message: string }
 *     return { output: { result: context.input.message } };
 *   },
 * });
 *
 * // Option 2: Using type annotation (works but may require explicit types in some cases)
 * const myStepDefinition: ServerHandlerStepDefinition = {
 *   id: 'custom.myStep',
 *   inputSchema: z.object({ message: z.string() }),
 *   outputSchema: z.object({ result: z.string() }),
 *   handler: async (context) => {
 *     return { output: { result: context.input.message } };
 *   },
 * };
 * ```
 */
export interface ServerHandlerStepDefinition<
  Input extends z.ZodType = z.ZodType,
  Output extends z.ZodType = z.ZodType,
  Config extends z.ZodObject = z.ZodObject
> extends CommonServerStepDefinition<Input, Output, Config> {
  /**
   * The handler function that executes this step's logic.
   * Input and output types are automatically inferred from the schemas.
   */
  handler: StepHandler<Input, Output, Config>;
}

export type PollOnCancelHandler<
  Input extends z.ZodType = z.ZodType,
  Config extends z.ZodObject = z.ZodObject,
  State extends z.ZodObject = z.ZodObject
> = (context: PollHandlerContext<Input, Config, State>) => Promise<void> | void;

/**
 * Server definition for durable poll-based steps (`poll` required; optional `start`).
 * Omit `policy` to use {@link PollStepDefaults.policy} (fixed 1 s interval) via
 * {@link createPollServerStepDefinition}.
 */
export type ServerPollStepDefinition<
  Input extends z.ZodType = z.ZodType,
  Output extends z.ZodType = z.ZodType,
  Config extends z.ZodObject = z.ZodObject,
  State extends z.ZodObject = z.ZodObject
> = CommonServerStepDefinition<Input, Output, Config> & {
  poll: PollHandler<Input, Output, Config, State>;
  start?: StartWithHandoffHandler<Input, Output, Config, State>;
  policy?: PollPolicy;
  ceilings?: PollCeilings;
  /**
   * Optional Zod object used only for TypeScript inference of `context.state` and `{ state }`
   * continuations. The engine does not validate author state at runtime.
   */
  stateSchema?: State;
  onCancel?: PollOnCancelHandler<Input, Config, State>;
};

export const isPollStepDefinition = (
  definition: CommonServerStepDefinition
): definition is ServerPollStepDefinition =>
  'poll' in definition && typeof definition.poll === 'function';

/**
 * Helper function to create a ServerHandlerStepDefinition with automatic type inference.
 * This ensures that the handler's input and output types are correctly inferred
 * from the inputSchema and outputSchema without needing explicit type annotations.
 *
 * @example
 * ```typescript
 * const myStepDefinition = createServerStepDefinition({
 *   id: 'custom.myStep',
 *   inputSchema: z.object({ message: z.string() }),
 *   outputSchema: z.object({ result: z.string() }),
 *   handler: async (context) => {
 *     // context.input is typed as { message: string }
 *     // return type should be { output: { result: string } }
 *     return { output: { result: context.input.message } };
 *   },
 * });
 * ```
 */
export function createServerStepDefinition<
  Input extends z.ZodType = z.ZodType,
  Output extends z.ZodType = z.ZodType,
  Config extends z.ZodObject = z.ZodObject
>(
  definition: ServerHandlerStepDefinition<Input, Output, Config>
): ServerHandlerStepDefinition<Input, Output, Config> {
  return definition;
}

export const isOneShotStepDefinition = (
  definition: CommonServerStepDefinition
): definition is ServerHandlerStepDefinition =>
  'handler' in definition && typeof definition.handler === 'function';

/**
 * Like {@link createServerStepDefinition} but only for definitions that include **`poll`**
 * (`start` + `poll` or **`poll` only**). Narrows inference so single-`handler` steps are excluded.
 *
 * Merges {@link PollStepDefaults} when `policy` is omitted or `ceilings` / individual ceiling
 * properties are missing (`maxAttempts` **60**, `maxWaitMs` **60_000** ms, fixed **1_000** ms poll interval).
 */
export function createPollServerStepDefinition<
  Input extends z.ZodType = z.ZodType,
  Output extends z.ZodType = z.ZodType,
  Config extends z.ZodObject = z.ZodObject,
  State extends z.ZodObject = z.ZodObject
>(
  definition: ServerPollStepDefinition<Input, Output, Config, State>
): ServerPollStepDefinition<Input, Output, Config, State> {
  if (!definition.ceilings) {
    definition.ceilings = PollStepDefaults.ceilings;
  }

  if (!definition.policy) {
    definition.policy = PollStepDefaults.policy;
  }

  return definition;
}

// -----------------------------------------------------------------------------
// Handler context shapes
// -----------------------------------------------------------------------------

/**
 * Context provided to custom step handlers during execution.
 * This gives access to runtime services needed for step execution.
 */
export interface StepHandlerContext<TInput = z.ZodType, TConfig = z.ZodObject> {
  /**
   * The validated input provided to the step based on inputSchema
   */
  input: z.infer<TInput>;

  /**
   * The config provided to the step based on configSchema
   */
  config: z.infer<TConfig>;

  /**
   * The raw input configuration before template rendering.
   * Has the same shape as input, but values may contain template strings.
   */
  rawInput: OrStringRecursive<z.infer<TInput>>;

  /**
   * Runtime context manager for accessing workflow state, context, and template evaluation
   */
  contextManager: ContextManager;

  /**
   * Logger scoped to this step execution
   */
  logger: {
    debug(message: string, meta?: object): void;
    info(message: string, meta?: object): void;
    warn(message: string, meta?: object): void;
    error(message: string, error?: Error): void;
  };

  /**
   * Abort signal for cancellation support
   */
  abortSignal: AbortSignal;

  /**
   * Current step's ID
   */
  stepId: string;

  /**
   * Current step's type
   */
  stepType: string;
}

/**
 * Context passed to a {@link PollHandler}. Extends {@link StepHandlerContext}
 * with the persisted author `state` from the previous start/poll invocation.
 */
export interface PollHandlerContext<TInput = z.ZodType, TConfig = z.ZodObject, TState = z.ZodObject>
  extends StepHandlerContext<TInput, TConfig> {
  /**
   * Author state persisted by the most recent run/poll invocation.
   * Undefined on the first poll of a poll-only step (no `start` to seed it).
   */
  state: z.infer<TState> | undefined;

  /**
   * 0-based index of this `poll` invocation (first poll is `0`, including
   * the first wake-up after `start` returns `{ state }` on a `start` + `poll` step).
   */
  attempt: number;
}

/**
 * Parameters for {@link ContextManager.callKibanaApi}.
 *
 * Intentionally narrow so the underlying transport (currently network `fetch`) can be swapped
 * to an in-process implementation later without changing observable behavior or the caller API.
 */
export interface CallKibanaApiParams {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  /** Route path starting with `/`, e.g. `/api/cases`. Space prefix is added automatically. */
  path: string;
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
  /**
   * Caller-supplied headers. Cross-cutting headers (Authorization, internal-origin marker,
   * event-chain headers, Content-Type) are managed by the engine and cannot be overridden.
   */
  headers?: Record<string, string>;
}

/**
 * Result returned by {@link ContextManager.callKibanaApi}.
 * `body` is parsed JSON for JSON content types, a `string` for non-JSON text bodies,
 * and a `Buffer` for binary content types. 204/304 responses yield `body: {}`.
 */
export interface CallKibanaApiResult<T = unknown> {
  status: number;
  headers: Record<string, string>;
  body: T;
}

/**
 * Context manager for accessing step execution runtime services
 */
export interface ContextManager {
  /**
   * Get the full context
   */
  getContext(): StepContext;

  /**
   * Get the scoped Elasticsearch client
   */
  getScopedEsClient(): ElasticsearchClient;

  /**
   * Evaluate a template string using the workflow context
   * @param input - The value to render with template expressions
   * @param additionalContext - Optional additional context to merge with workflow context
   */
  renderInputTemplate<T>(input: T, additionalContext?: Record<string, unknown>): T;

  /**
   * Returns the fake request
   */
  getFakeRequest(): KibanaRequest;

  /**
   * Calls a Kibana API route on the running Kibana instance, using the workflow's fake
   * request for authentication. Throws on non-2xx responses with an error of the form
   * `HTTP <status>: <body>`. The implementation may evolve (e.g. move to an in-process
   * call) but the API surface stays stable.
   *
   * Not supported: multipart/form-data, streaming/SSE responses, custom fetcher/TLS
   * options. For those, use the `kibana.request` YAML step.
   */
  callKibanaApi<T = unknown>(params: CallKibanaApiParams): Promise<CallKibanaApiResult<T>>;
}

/**
 * Result returned by a custom step handler
 */
export interface StepHandlerResult<TOutput extends z.ZodType = z.ZodType> {
  /**
   * Output data from the step execution
   * This will be available to subsequent steps via template expressions
   */
  output?: z.infer<TOutput>;
  /**
   * Optional error information if the step failed
   */
  error?: Error;
}

/**
 * Server-side workflow step definition registered by plugins.
 * Union of {@link ServerHandlerStepDefinition} (single-shot `handler`) and
 * {@link ServerPollStepDefinition} (durable `start`/`poll`).
 */
export type ServerStepDefinition<
  Input extends z.ZodType = z.ZodType,
  Output extends z.ZodType = z.ZodType,
  Config extends z.ZodObject = z.ZodObject,
  State extends z.ZodObject = z.ZodObject
> =
  | ServerHandlerStepDefinition<Input, Output, Config>
  | ServerPollStepDefinition<Input, Output, Config, State>;
