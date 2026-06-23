/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { EsWorkflowExecution } from '@kbn/workflows';
import { ExecutionStatus } from '@kbn/workflows';
import { isEnterStepTimeoutZone } from '@kbn/workflows/graph';
import { flushState } from './persistence_loop';
import type { WorkflowExecutionLoopParams } from './types';
import { abortableTimeout, parseDuration, TimeoutAbortedError } from '../utils';
import type { StepExecutionRuntime } from '../workflow_context_manager/step_execution_runtime';

const SHORT_DURATION_THRESHOLD = 1000 * 5; // 5 seconds

function getIdleTimeoutResumeDeadlineMs(
  params: WorkflowExecutionLoopParams,
  workflowExecution: EsWorkflowExecution
): number | undefined {
  const deadlineMs: number[] = [];

  const workflowTimeoutStr = params.workflowExecutionGraph.getWorkflowLevelTimeout();
  if (workflowTimeoutStr && workflowExecution.startedAt) {
    deadlineMs.push(
      new Date(workflowExecution.startedAt).getTime() + parseDuration(workflowTimeoutStr)
    );
  }

  const scopeStackFrames = workflowExecution.scopeStack ?? [];
  for (const frame of scopeStackFrames) {
    for (const scope of frame.nestedScopes) {
      const graphNode = params.workflowExecutionGraph.getNode(scope.nodeId);
      if (graphNode && isEnterStepTimeoutZone(graphNode)) {
        const latest = params.workflowExecutionState.getLatestStepExecution(graphNode.stepId);
        if (latest?.startedAt) {
          deadlineMs.push(new Date(latest.startedAt).getTime() + parseDuration(graphNode.timeout));
        }
      }
    }
  }

  if (deadlineMs.length === 0) {
    return undefined;
  }

  return Math.min(...deadlineMs);
}

export async function handleExecutionDelay(
  params: WorkflowExecutionLoopParams,
  stepExecutionRuntime: StepExecutionRuntime
) {
  const workflowExecution = params.workflowRuntime.getWorkflowExecution();

  const stepStatus = stepExecutionRuntime.stepExecution?.status;
  if (
    stepStatus === ExecutionStatus.WAITING_FOR_INPUT ||
    stepStatus === ExecutionStatus.WAITING_FOR_CHILD
  ) {
    params.workflowExecutionState.updateWorkflowExecution({
      status: stepStatus,
    });

    const deadlineMs = getIdleTimeoutResumeDeadlineMs(params, workflowExecution);
    if (deadlineMs !== undefined) {
      const resumeAtMs = Math.max(deadlineMs, new Date().getTime() + 500);

      await params.workflowTaskManager
        .scheduleWorkflowGlobalTimeoutResumeTask({
          workflowExecution: workflowExecution as EsWorkflowExecution,
          resumeAt: new Date(resumeAtMs),
          fakeRequest: params.fakeRequest,
        })
        .catch((error: unknown) => {
          params.workflowLogger.logWarn(
            `Failed to schedule idle-timeout resume (execution=${workflowExecution.id}): ${
              error instanceof Error ? error.message : String(error)
            }`
          );
        });
    }

    return;
  }

  if (
    !stepExecutionRuntime.stepExecution ||
    stepExecutionRuntime.stepExecution.status !== ExecutionStatus.WAITING
  ) {
    return;
  }
  const resumeAtFromState = stepExecutionRuntime.stepExecution.state?.resumeAt;
  // When set, skip in-process sleep for short delays and schedule a resume task so this task
  // is not held for the full wait (see enterWaitUntil forceTaskSchedule).
  const forceTaskScheduleFromState = stepExecutionRuntime.stepExecution.state?.forceTaskSchedule;

  if (typeof resumeAtFromState !== 'string') {
    return;
  }

  const resumeAt = new Date(resumeAtFromState);
  const now = new Date();
  const diff = resumeAt.getTime() - now.getTime();
  await flushState(params);
  params.workflowExecutionState.updateWorkflowExecution({
    status: ExecutionStatus.WAITING,
  });
  if (!forceTaskScheduleFromState && diff < SHORT_DURATION_THRESHOLD) {
    const timeout = diff > 0 ? diff : 0;

    try {
      await abortableTimeout(timeout, stepExecutionRuntime.abortController.signal);
    } catch (error) {
      if (error instanceof TimeoutAbortedError) {
        params.workflowExecutionState.updateWorkflowExecution({
          status: ExecutionStatus.RUNNING,
        });
        return;
      }

      throw error;
    }
    params.workflowExecutionState.updateWorkflowExecution({
      status: ExecutionStatus.RUNNING,
    });
  } else {
    await params.workflowTaskManager.scheduleResumeTask({
      workflowExecution: workflowExecution as EsWorkflowExecution,
      resumeAt,
      fakeRequest: params.fakeRequest,
    });
  }
}
