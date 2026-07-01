/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Logger } from '@kbn/core/server';
import type { EsWorkflowExecution } from '@kbn/workflows';
import { ExecutionStatus, isTerminalStatus } from '@kbn/workflows';

import type { StepExecutionRepository } from '../repositories/step_execution_repository';
import type { WorkflowExecutionRepository } from '../repositories/workflow_execution_repository';

/** Unified error type for executions abandoned after Kibana/Task Manager interruption (fail-fast recovery). */
export const TASK_RECOVERY_ERROR_TYPE = 'TaskRecoveryError' as const;

export const taskRecoveryMessages = {
  scheduledStale:
    'Execution abandoned due to recovery mechanism. The scheduled task was interrupted before completion.',
  workflowRunInterrupted:
    'Execution abandoned due to recovery mechanism. The workflow run task was interrupted before completion.',
  workflowResumeInterrupted:
    'Execution abandoned due to recovery mechanism. The workflow resume task was interrupted before completion.',
} as const;

export function buildTaskAttemptsExhaustedMessage(lastError: string): string {
  return `Task Manager exhausted all attempts for this workflow execution task. Last error: ${lastError}`;
}

export type InterruptedWorkflowRunTaskOutcome = 'run_workflow' | 'task_complete';

/**
 * When Task Manager retries `workflow:run` (`attempts > 1`), the prior claim did not finish successfully.
 * Fail the persisted execution (same fault-tolerance model as scheduled stale recovery) so operators
 * see a terminal FAILED state instead of a stuck RUNNING execution. `waiting_for_input` is excluded
 * because resumption is human-driven via the resume API.
 */
export async function resolveInterruptedWorkflowRunTask({
  workflowExecutionRepository,
  stepExecutionRepository,
  workflowRunId,
  spaceId,
  taskAttempts,
  logger,
}: {
  workflowExecutionRepository: WorkflowExecutionRepository;
  stepExecutionRepository: StepExecutionRepository;
  workflowRunId: string;
  spaceId: string;
  taskAttempts: number;
  logger: Logger;
}): Promise<InterruptedWorkflowRunTaskOutcome> {
  if (taskAttempts <= 1) {
    return 'run_workflow';
  }

  const execution = await workflowExecutionRepository.getWorkflowExecutionById(
    workflowRunId,
    spaceId
  );

  if (!execution) {
    logger.warn(
      `workflow:run retry (attempts=${taskAttempts}) but no execution document for ${workflowRunId}; continuing run`
    );
    return 'run_workflow';
  }

  if (!shouldFailOnWorkflowRunRetry(execution)) {
    if (execution.status === ExecutionStatus.WAITING_FOR_INPUT) {
      logger.warn(
        `workflow:run retry for execution ${workflowRunId} while status is waiting_for_input; leaving execution unchanged (human resume only)`
      );
    }
    return 'task_complete';
  }

  await markExecutionFailedTaskRecovery(
    workflowExecutionRepository,
    stepExecutionRepository,
    workflowRunId,
    {
      message: taskRecoveryMessages.workflowRunInterrupted,
    }
  );

  logger.warn(
    `Marked workflow execution ${workflowRunId} FAILED after workflow:run retry (attempts=${taskAttempts}) - prior run was interrupted`
  );

  return 'task_complete';
}

export type InterruptedWorkflowResumeTaskOutcome = 'resume_workflow' | 'task_complete';

/**
 * When Task Manager retries `workflow:resume` (`attempts > 1`), the prior claim did not finish successfully.
 * Fail non-terminal executions that are no longer waiting for input (stuck RUNNING / WAITING, etc.).
 * If still `waiting_for_input`, invoke the resume handler again - the first attempt never completed.
 */
export async function resolveInterruptedWorkflowResumeTask({
  workflowExecutionRepository,
  stepExecutionRepository,
  workflowRunId,
  spaceId,
  taskAttempts,
  logger,
}: {
  workflowExecutionRepository: WorkflowExecutionRepository;
  stepExecutionRepository: StepExecutionRepository;
  workflowRunId: string;
  spaceId: string;
  taskAttempts: number;
  logger: Logger;
}): Promise<InterruptedWorkflowResumeTaskOutcome> {
  if (taskAttempts <= 1) {
    return 'resume_workflow';
  }

  const execution = await workflowExecutionRepository.getWorkflowExecutionById(
    workflowRunId,
    spaceId
  );

  if (!execution) {
    logger.warn(
      `workflow:resume retry (attempts=${taskAttempts}) but no execution document for ${workflowRunId}; continuing resume`
    );
    return 'resume_workflow';
  }

  if (isTerminalStatus(execution.status)) {
    return 'task_complete';
  }

  if (execution.status === ExecutionStatus.WAITING_FOR_INPUT) {
    logger.warn(
      `workflow:resume retry for execution ${workflowRunId} still waiting_for_input - invoking resume handler again`
    );
    return 'resume_workflow';
  }

  await markExecutionFailedTaskRecovery(
    workflowExecutionRepository,
    stepExecutionRepository,
    workflowRunId,
    {
      message: taskRecoveryMessages.workflowResumeInterrupted,
    }
  );

  logger.warn(
    `Marked workflow execution ${workflowRunId} FAILED after workflow:resume retry (attempts=${taskAttempts}) - prior resume task was interrupted`
  );

  return 'task_complete';
}

export async function markExecutionFailedTaskRecovery(
  workflowExecutionRepository: WorkflowExecutionRepository,
  stepExecutionRepository: StepExecutionRepository,
  executionId: string,
  {
    message,
    type = TASK_RECOVERY_ERROR_TYPE,
  }: {
    message: string;
    type?: typeof TASK_RECOVERY_ERROR_TYPE | 'TaskAttemptsExhaustedError';
  }
): Promise<void> {
  const error = { type, message };
  const finishedAt = new Date().toISOString();

  await workflowExecutionRepository.updateWorkflowExecution({
    id: executionId,
    status: ExecutionStatus.FAILED,
    error,
    finishedAt,
  });

  await stepExecutionRepository.markNonTerminalStepsFailed(executionId, error);
}

/**
 * After **`workflow:run`** or **`workflow:resume`** throws on the **last** Task Manager attempt
 * (`taskAttempts >= maxAttempts` from the caller), best-effort mark a still-non-terminal execution
 * **`FAILED`** with **`TaskAttemptsExhaustedError`** so it does not stay stuck if the handler exits
 * without updating state. Same semantics for both task types; **`plugin.ts`** passes the task's
 * **`maxAttempts`** (`WORKFLOW_RUN_TASK_MAX_ATTEMPTS` vs **`WORKFLOW_RESUME_TASK_MAX_ATTEMPTS`**).
 */
export async function resolveExhaustedWorkflowRunTask({
  workflowExecutionRepository,
  stepExecutionRepository,
  workflowRunId,
  spaceId,
  taskAttempts,
  maxAttempts,
  error,
  logger,
}: {
  workflowExecutionRepository: WorkflowExecutionRepository;
  stepExecutionRepository: StepExecutionRepository;
  workflowRunId: string;
  spaceId: string;
  taskAttempts: number;
  maxAttempts: number;
  error: unknown;
  logger: Logger;
}): Promise<void> {
  if (taskAttempts < maxAttempts) {
    return;
  }

  try {
    const execution = await workflowExecutionRepository.getWorkflowExecutionById(
      workflowRunId,
      spaceId
    );
    if (
      execution &&
      !isTerminalStatus(execution.status) &&
      execution.status !== ExecutionStatus.QUEUED
    ) {
      const lastMessage = error instanceof Error ? error.message : String(error);
      await markExecutionFailedTaskRecovery(
        workflowExecutionRepository,
        stepExecutionRepository,
        workflowRunId,
        {
          type: 'TaskAttemptsExhaustedError',
          message: buildTaskAttemptsExhaustedMessage(lastMessage),
        }
      );
    }
  } catch (markFailedErr) {
    logger.error(
      `Failed to mark workflow execution ${workflowRunId} as FAILED after task attempts exhausted: ${
        markFailedErr instanceof Error ? markFailedErr.message : String(markFailedErr)
      }`
    );
  }
}

/** For `workflow:run` retry path after `taskAttempts > 1` with a loaded execution; exported for tests. */
export function shouldFailOnWorkflowRunRetry(execution: EsWorkflowExecution): boolean {
  if (isTerminalStatus(execution.status)) {
    return false;
  }
  if (
    execution.status === ExecutionStatus.WAITING_FOR_INPUT ||
    execution.status === ExecutionStatus.QUEUED
  ) {
    return false;
  }
  return true;
}
