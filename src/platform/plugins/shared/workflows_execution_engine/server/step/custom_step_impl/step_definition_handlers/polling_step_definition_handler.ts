/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { AtomicGraphNode } from '@kbn/workflows/graph';
import { ExecutionError } from '@kbn/workflows/server';
import { PollStepDefaults } from '@kbn/workflows-extensions/server';
import type {
  DurablePhaseResult,
  PollCeilings,
  PollHandlerContext,
  ServerPollStepDefinition,
  StepHandlerContext,
} from '@kbn/workflows-extensions/server';
import { createBaseHandlerContext } from './create_base_handler_context';
import { DURABLE_STEP_STATE_KEY, type DurableStepState } from './durable_step_state';
import { applyBackoffJitter } from '../../../utils/backoff_jitter/backoff_jitter';
import type { StepExecutionRuntime } from '../../../workflow_context_manager/step_execution_runtime';
import type { IWorkflowEventLogger } from '../../../workflow_event_logger';
import type { RunStepResult } from '../../node_implementation';
import type { CustomStepDefinitionHandler } from '../types';

/**
 * After the first poll continuation, force Task Manager scheduling even when sleep is under
 * handle_execution_delay's in-process threshold (5 s), so the worker is not pinned across
 * long-running poll loops.
 */
const FORCE_TASK_SCHEDULE_FROM_ATTEMPT = 2;

type PolicyCalculationResult =
  | { outcome: 'success'; nextPollAt: string }
  | { outcome: 'maxAttemptReached' };

export class PollPolicyStepHandler implements CustomStepDefinitionHandler {
  constructor(
    private readonly stepDefinition: ServerPollStepDefinition,
    private readonly node: AtomicGraphNode,
    private readonly stepExecutionRuntime: StepExecutionRuntime,
    private readonly workflowLogger: IWorkflowEventLogger
  ) {}

  public async onCancel(
    input: unknown,
    rawInput: unknown,
    config: Record<string, unknown>
  ): Promise<void> {
    if ('onCancel' in this.stepDefinition && this.stepDefinition.onCancel) {
      await this.stepDefinition.onCancel(this.createPollHandlerContext(input, rawInput, config));
    }
  }

  public async run(
    input: unknown,
    rawInput: unknown,
    config: Record<string, unknown>
  ): Promise<RunStepResult> {
    const state = this.getDurableStepState();
    const durableResult =
      this.stepDefinition.start && !state.startCalled
        ? await this.handleStart(input, rawInput, config)
        : await this.handlePoll(input, rawInput, config);

    return this.handleDurableResult(input, durableResult);
  }

  private async handleStart(
    input: unknown,
    rawInput: unknown,
    config: Record<string, unknown>
  ): Promise<DurablePhaseResult> {
    if (!this.stepDefinition.start) {
      throw new Error(`Poll step "${this.node.stepType}" has no "start" handler.`);
    }

    const result = await this.stepDefinition.start(
      this.createBaseHandlerContext(input, rawInput, config)
    );

    this.setDurableStepState({
      ...this.getDurableStepState(),
      startCalled: true,
    });

    return result as DurablePhaseResult;
  }

  private async handlePoll(
    input: unknown,
    rawInput: unknown,
    config: Record<string, unknown>
  ): Promise<DurablePhaseResult> {
    const pollResult = await this.stepDefinition.poll(
      this.createPollHandlerContext(input, rawInput, config)
    );

    return pollResult as DurablePhaseResult;
  }

  private async handleDurableResult(
    input: unknown,
    pollResult: DurablePhaseResult
  ): Promise<RunStepResult> {
    let stepState = this.getDurableStepState();

    let nextPollAtOverride: Date | undefined;
    let customState = stepState.customState;

    if (pollResult?.output || pollResult?.error) {
      return {
        input,
        output: pollResult.output,
        error: pollResult.error
          ? ExecutionError.fromError(pollResult.error).toSerializableObject()
          : undefined,
      };
    }

    if (pollResult && 'nextPollDelayMs' in pollResult && pollResult.nextPollDelayMs) {
      nextPollAtOverride = new Date(Date.now() + pollResult.nextPollDelayMs);
    }

    if (pollResult && 'state' in pollResult && pollResult.state !== undefined) {
      customState = pollResult.state as Record<string, unknown>;
    }

    let nextPollAt: string | undefined;
    const attempt = stepState?.pollState?.attempt ?? 0;
    const nextAttempt = attempt + 1;

    if (nextPollAtOverride) {
      nextPollAt = nextPollAtOverride.toISOString();
    }

    if (!nextPollAt) {
      nextPollAt = await this.calculateNextPollAt({
        currentAttempt: attempt,
      });
    }

    const data = this.enforceCeilings({
      attempt,
      nextPollAt,
    });

    if (data.outcome === 'maxAttemptReached') {
      const maxAttempts = this.stepDefinition.ceilings?.maxAttempts;
      this.workflowLogger.logWarn(`Poll step attempt ceiling exceeded ${maxAttempts}`);
      throw new ExecutionError({
        type: 'StepFailed',
        message: 'The step did not complete within the allowed time.',
      });
    }

    nextPollAt = data.nextPollAt;

    stepState = {
      ...stepState,
      pollState: {
        attempt: nextAttempt,
        nextPollAt,
      },
      customState,
    };

    this.setDurableStepState(stepState);
    this.stepExecutionRuntime.enterWaitUntil(
      new Date(nextPollAt),
      undefined,
      nextAttempt >= FORCE_TASK_SCHEDULE_FROM_ATTEMPT
    );
    return { suspended: true, input };
  }

  private getDurableStepState(): DurableStepState {
    const durableStepState =
      this.stepExecutionRuntime.getCurrentStepState()?.[DURABLE_STEP_STATE_KEY] || {};

    return durableStepState as DurableStepState;
  }

  private setDurableStepState(durableStepState: DurableStepState): void {
    this.stepExecutionRuntime.setCurrentStepState({
      [DURABLE_STEP_STATE_KEY]: durableStepState,
    });
  }

  private createBaseHandlerContext(
    input: unknown,
    rawInput: unknown,
    config: Record<string, unknown>
  ): StepHandlerContext {
    return createBaseHandlerContext(
      input,
      rawInput,
      config,
      this.node,
      this.stepExecutionRuntime,
      this.workflowLogger
    );
  }

  private createPollHandlerContext(
    input: unknown,
    rawInput: unknown,
    config: Record<string, unknown>
  ): PollHandlerContext {
    const stepState = this.getDurableStepState();
    return {
      ...this.createBaseHandlerContext(input, rawInput, config),
      state: stepState.customState,
      attempt: stepState.pollState?.attempt ?? 0,
    } as PollHandlerContext;
  }

  private async calculateNextPollAt(params: { currentAttempt: number }): Promise<string> {
    const { currentAttempt } = params;
    const policy = this.stepDefinition.policy ?? PollStepDefaults.policy;

    const now = new Date();

    switch (policy.strategy) {
      case 'fixed':
        return new Date(now.getTime() + policy.intervalMs).toISOString();
      case 'exponential': {
        const multiplier = policy.multiplier ?? 2;
        const exponent = Math.max(currentAttempt, 0);
        const raw = policy.initialMs * Math.pow(multiplier, exponent);
        const capped = Math.min(raw, policy.maxMs);
        const delayMs = policy.jitter ? applyBackoffJitter(capped) : Math.floor(capped);
        return new Date(now.getTime() + Math.max(0, delayMs)).toISOString();
      }

      default: {
        const unknownPolicy = policy as { strategy: string };
        throw new Error(`Unknown poll policy strategy: ${unknownPolicy.strategy}`);
      }
    }
  }

  private enforceCeilings(params: {
    attempt: number;
    nextPollAt: string;
  }): PolicyCalculationResult {
    const { attempt, nextPollAt: currentNextPollAtString } = params;
    const ceilings = this.getCeilings();
    const maxWaitMs = ceilings?.maxWaitMs;
    const maxAttempts = ceilings?.maxAttempts;

    if (attempt >= maxAttempts) {
      return { outcome: 'maxAttemptReached' };
    }

    const now = new Date();
    const scheduledNextPollAt = new Date(currentNextPollAtString);
    const scheduledDelayMs = scheduledNextPollAt.getTime() - now.getTime();

    if (scheduledDelayMs < 0) {
      return {
        outcome: 'success',
        nextPollAt: now.toISOString(),
      };
    }

    if (scheduledDelayMs > maxWaitMs) {
      return {
        outcome: 'success',
        nextPollAt: new Date(now.getTime() + maxWaitMs).toISOString(),
      };
    }

    return {
      outcome: 'success',
      nextPollAt: scheduledNextPollAt.toISOString(),
    };
  }

  private getCeilings(): PollCeilings {
    if (!this.stepDefinition.ceilings) {
      throw new Error('Poll step ceilings are not configured');
    }

    return this.stepDefinition.ceilings;
  }
}
