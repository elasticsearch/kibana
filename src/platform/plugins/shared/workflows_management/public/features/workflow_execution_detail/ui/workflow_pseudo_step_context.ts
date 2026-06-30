/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { JsonValue } from '@kbn/utility-types';
import type { WorkflowExecutionDto, WorkflowStepExecutionDto } from '@kbn/workflows';
import {
  ExecutionStatus,
  isEventDrivenWorkflowTriggerSource,
  isFailedBeforeSteps,
} from '@kbn/workflows';

export type TriggerType = 'alert' | 'scheduled' | 'manual' | 'document' | 'event';

export interface TriggerContextFromExecution {
  triggerType: TriggerType;
  input: JsonValue;
}

export function buildTriggerContextFromExecution(
  executionContext: Record<string, unknown> | undefined | null,
  triggeredBy?: string
): TriggerContextFromExecution | null {
  if (!executionContext) {
    return null;
  }
  let triggerType: TriggerType = 'manual'; // Default to manual trigger type

  const isScheduled =
    (executionContext.event as { type?: string } | undefined)?.type === 'scheduled';

  if (isScheduled) {
    triggerType = 'scheduled';
  } else if (executionContext.event != null) {
    const event = executionContext.event as Record<string, unknown>;
    if (event.alerts != null || event.type === 'alert') {
      triggerType = 'alert';
    } else if (isEventDrivenWorkflowTriggerSource(triggeredBy)) {
      triggerType = 'event';
    } else {
      triggerType = 'document';
    }
  }

  const inputData = (executionContext as { event?: JsonValue; inputs?: JsonValue }).event
    ? executionContext.event
    : executionContext.inputs;

  return {
    triggerType,
    input: inputData as JsonValue,
  };
}

export function buildTriggerStepExecutionFromContext(
  workflowExecution: WorkflowExecutionDto
): WorkflowStepExecutionDto | null {
  const triggerContext = buildTriggerContextFromExecution(
    workflowExecution.context as Record<string, unknown> | undefined | null,
    workflowExecution.triggeredBy
  );

  if (!triggerContext) {
    return null;
  }

  const failedBeforeSteps = isFailedBeforeSteps(
    workflowExecution.status,
    workflowExecution.stepExecutions
  );

  // For non-manual triggers (alert/document/scheduled/event), manual inputs supplied alongside
  // the event are stored in context.inputs and surfaced as the step's output field. The server
  // always persists an `inputs` key (an empty object when no manual inputs were supplied), so we
  // must check for a non-empty object rather than `!== undefined` to avoid surfacing an empty output.
  const ctx = workflowExecution.context as Record<string, unknown> | undefined | null;
  const manualInputs = ctx?.inputs;
  const hasManualInputs =
    manualInputs != null &&
    typeof manualInputs === 'object' &&
    Object.keys(manualInputs).length > 0;
  const triggerOutput: JsonValue | undefined =
    triggerContext.triggerType !== 'manual' && hasManualInputs
      ? (manualInputs as JsonValue)
      : (workflowExecution.context?.output as JsonValue | undefined) ?? undefined;

  return {
    id: 'trigger',
    stepId: triggerContext.triggerType,
    stepType: `trigger_${triggerContext.triggerType}`,
    status: failedBeforeSteps ? ExecutionStatus.FAILED : ExecutionStatus.COMPLETED,
    input: triggerContext.input,
    output: triggerOutput,
    error: failedBeforeSteps ? workflowExecution.error ?? undefined : undefined,
    scopeStack: [],
    workflowRunId: workflowExecution.id,
    workflowId: workflowExecution.workflowId || '',
    startedAt: '',
    globalExecutionIndex: -1,
    stepExecutionIndex: 0,
    topologicalIndex: -1,
  } as WorkflowStepExecutionDto;
}

export function buildOverviewStepExecutionFromContext(
  workflowExecution: WorkflowExecutionDto
): WorkflowStepExecutionDto {
  let contextData: Record<string, unknown> = {};
  if (workflowExecution.context) {
    const { inputs, event, ...context } = workflowExecution.context;
    contextData = context as Record<string, unknown>;
  }

  // Add trace information to the context data for display in the Overview table
  if (workflowExecution.traceId) {
    contextData = {
      ...contextData,
      trace: {
        traceId: workflowExecution.traceId,
        entryTransactionId: workflowExecution.entryTransactionId,
      },
    };
  }

  // Surface document-level error on Overview kv tree when the trigger row does not
  // already attach the same execution.error (failed-before-steps → trigger pseudo-step only).
  const failedBeforeSteps = isFailedBeforeSteps(
    workflowExecution.status,
    workflowExecution.stepExecutions
  );
  if (workflowExecution.error && !failedBeforeSteps) {
    contextData = {
      ...contextData,
      executionError: {
        type: workflowExecution.error.type,
        message: workflowExecution.error.message,
      },
    };
  }

  return {
    id: '__overview',
    stepId: 'Overview',
    stepType: '__overview',
    status: workflowExecution.status,
    stepExecutionIndex: 0,
    startedAt: workflowExecution.startedAt,
    input: contextData as JsonValue,
    scopeStack: [],
    workflowRunId: workflowExecution.id,
    workflowId: workflowExecution.workflowId ?? '',
    topologicalIndex: -1,
    globalExecutionIndex: -1,
  };
}
