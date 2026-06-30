/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { ExecutionStatus } from '@kbn/workflows';
import type { StepExecutionRuntime } from '../../workflow_context_manager/step_execution_runtime';
import type { WorkflowExecutionRuntimeManager } from '../../workflow_context_manager/workflow_execution_runtime_manager';
import type { IWorkflowEventLogger } from '../../workflow_event_logger';

export function resumeHitlWaitStep({
  stepExecutionRuntime,
  workflowRuntime,
  workflowLogger,
  stepId,
  transformResumeInput,
}: {
  stepExecutionRuntime: StepExecutionRuntime;
  workflowRuntime: WorkflowExecutionRuntimeManager;
  workflowLogger: IWorkflowEventLogger;
  stepId: string;
  transformResumeInput?: (
    resumeInput: Record<string, unknown> | undefined,
    resumedBy: string
  ) => unknown;
}): void {
  const execution = workflowRuntime.getWorkflowExecution();
  const context = execution.context;
  const resumeInput = context?.resumeInput as Record<string, unknown> | undefined;
  const ctx = context as Record<string, unknown> | null | undefined;
  const resumedBy = typeof ctx?.resumedBy === 'string' ? ctx.resumedBy : 'unknown';
  const executionId = execution.id;

  const stepOutput = transformResumeInput
    ? transformResumeInput(resumeInput, resumedBy)
    : resumeInput;

  stepExecutionRuntime.finishStep(stepOutput);

  if (context != null && typeof context === 'object' && 'resumeInput' in context) {
    const { resumeInput: _cleared, ...restContext } = context as Record<string, unknown>;
    stepExecutionRuntime.updateWorkflowExecution({ context: restContext });
  }

  workflowLogger.logDebug(`Workflow ${executionId} resumed by ${resumedBy}`, {
    event: {
      action: 'hitl:resumed',
      category: ['workflow'],
      outcome: 'success',
      provider: 'workflow-engine',
    },
    labels: {
      responder: resumedBy,
      execution_id: executionId,
    },
  });

  workflowRuntime.navigateToNextNode();
}

export function shouldSkipHitlWaitEntry(stepExecutionRuntime: StepExecutionRuntime): boolean {
  return stepExecutionRuntime.abortController.signal.aborted;
}

export function tryEnterHitlWait(stepExecutionRuntime: StepExecutionRuntime): boolean {
  return stepExecutionRuntime.tryEnterWaitUntil(undefined, ExecutionStatus.WAITING_FOR_INPUT);
}
