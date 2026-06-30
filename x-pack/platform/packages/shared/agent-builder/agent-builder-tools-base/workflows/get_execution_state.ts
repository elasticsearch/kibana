/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { JsonValue } from '@kbn/utility-types';
import type { WorkflowsServerPluginSetup } from '@kbn/workflows-management-plugin/server';
import type { WaitForApprovalStep, WaitForInputStep, WorkflowExecutionDto } from '@kbn/workflows';
import { ExecutionStatus, getStepByNameFromNestedSteps } from '@kbn/workflows';
import { getWorkflowOutput } from './get_workflow_output';

type WorkflowApi = WorkflowsServerPluginSetup['management'];

export interface WaitingInputContext {
  /** Step execution document id for the paused HITL step instance. Compare across status polls. */
  step_execution_id: string;
  /** Human-readable prompt from the step's `with.message`. */
  message?: string;
  /** JSON Schema describing the expected input, from the step's `with.schema`. */
  schema?: Record<string, unknown>;
  /** Present for `waitForApproval` steps. */
  approve_label?: string;
  /** Present for `waitForApproval` steps. */
  reject_label?: string;
}

export interface WorkflowExecutionState {
  execution_id: string;
  status: ExecutionStatus;
  workflow_id: string;
  started_at: string;
  finished_at?: string;
  output?: JsonValue;
  workflow_name?: string;
  /** Present when status is FAILED; contains the workflow error message. */
  error_message?: string;
  /** Present when status is WAITING_FOR_INPUT. */
  waiting_input?: WaitingInputContext;
}

/**
 * Converts a workflow execution DTO into the state shape exposed to agent tools.
 */
export const toWorkflowExecutionState = (
  execution: WorkflowExecutionDto,
  executionId: string = execution.id
): WorkflowExecutionState => {
  const state: WorkflowExecutionState = {
    execution_id: executionId,
    status: execution.status,
    workflow_id: execution.workflowId ?? 'unknown',
    started_at: execution.startedAt,
    finished_at: execution.finishedAt,
    workflow_name: execution.workflowDefinition.name,
  };

  if (execution.status === ExecutionStatus.COMPLETED) {
    state.output = getWorkflowOutput(execution.stepExecutions);
  }

  if (execution.status === ExecutionStatus.FAILED && execution.error) {
    state.error_message = execution.error.message;
  }

  if (execution.status === ExecutionStatus.WAITING_FOR_INPUT) {
    const waitingStep = execution.stepExecutions.find(
      (s) => s.status === ExecutionStatus.WAITING_FOR_INPUT
    );

    if (waitingStep) {
      const stepInput = (waitingStep.input ?? {}) as {
        message?: string;
        schema?: Record<string, unknown>;
        approveLabel?: string;
        rejectLabel?: string;
      };
      const step = getStepByNameFromNestedSteps(
        execution.workflowDefinition.steps,
        waitingStep.stepId
      );
      const stepConfig =
        step?.type === 'waitForInput'
          ? (step as WaitForInputStep).with
          : step?.type === 'waitForApproval'
          ? (step as WaitForApprovalStep).with
          : undefined;

      const waitContext: WaitingInputContext = {
        step_execution_id: waitingStep.id,
        ...(stepInput.message && { message: stepInput.message }),
        ...(stepInput.schema && { schema: stepInput.schema }),
        ...(!stepInput.message && stepConfig?.message && { message: stepConfig.message }),
        ...(!stepInput.schema &&
          stepConfig &&
          'schema' in stepConfig &&
          stepConfig.schema && { schema: stepConfig.schema as Record<string, unknown> }),
        ...(stepInput.approveLabel && { approve_label: stepInput.approveLabel }),
        ...(stepInput.rejectLabel && { reject_label: stepInput.rejectLabel }),
      };
      state.waiting_input = waitContext;
    }
  }

  return state;
};

/**
 * Returns the state of a workflow execution.
 */
export const getExecutionState = async ({
  executionId,
  spaceId,
  workflowApi,
}: {
  executionId: string;
  spaceId: string;
  workflowApi: WorkflowApi;
}): Promise<WorkflowExecutionState | null> => {
  const execution = await workflowApi.getWorkflowExecution(executionId, spaceId, {
    includeOutput: true,
  });
  if (!execution) {
    return null;
  }

  return toWorkflowExecutionState(execution, executionId);
};
