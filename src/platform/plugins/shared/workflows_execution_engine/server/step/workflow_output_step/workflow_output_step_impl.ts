/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { WorkflowOutputStep } from '@kbn/workflows';
import { ExecutionStatus } from '@kbn/workflows';
import type { WorkflowOutputGraphNode } from '@kbn/workflows/graph';
import { buildFieldsZodValidator } from '@kbn/workflows/spec/lib/build_fields_zod_validator';
import { normalizeFieldsToJsonSchema } from '@kbn/workflows/spec/lib/field_conversion';
import type { StepExecutionRuntime } from '../../workflow_context_manager/step_execution_runtime';
import type { WorkflowExecutionRuntimeManager } from '../../workflow_context_manager/workflow_execution_runtime_manager';
import type { IWorkflowEventLogger } from '../../workflow_event_logger';
import type { NodeImplementation } from '../node_implementation';

/**
 * Implements the workflow.output step which emits outputs and terminates workflow execution.
 *
 * When this step executes:
 * 1. Validates the output values against the workflow's declared output schema (if any)
 * 2. Sets the workflow outputs in the execution context
 * 3. Terminates the workflow with the specified status (completed/cancelled/failed)
 * 4. Prevents any subsequent steps from executing by clearing the next node
 */
export class WorkflowOutputStepImpl implements NodeImplementation {
  constructor(
    private node: WorkflowOutputGraphNode,
    private stepExecutionRuntime: StepExecutionRuntime,
    private workflowExecutionRuntime: WorkflowExecutionRuntimeManager,
    private workflowLogger: IWorkflowEventLogger
  ) {}

  async run(): Promise<void> {
    const executor = this.workflowExecutionRuntime.branchExecutor;
    if (!executor) throw new Error('Cursor engine is not initialized');
    this.stepExecutionRuntime.startStep();

    const step = this.node.configuration as WorkflowOutputStep;
    // Render template variables in the output values (with: may be omitted for workflow.fail)
    const outputValues = step.with
      ? (this.stepExecutionRuntime.contextManager.renderValueAccordingToContext(
          step.with
        ) as Record<string, unknown>)
      : {};

    try {
      // Get the workflow definition to check for declared outputs
      const workflowExecution = this.workflowExecutionRuntime.getWorkflowExecution();
      const declaredOutputs = workflowExecution.workflowDefinition?.outputs;

      const normalizedOutputs = normalizeFieldsToJsonSchema(declaredOutputs);

      if (normalizedOutputs?.properties && Object.keys(normalizedOutputs.properties).length > 0) {
        const validator = buildFieldsZodValidator(normalizedOutputs);
        const validationResult = validator.safeParse(outputValues);

        if (!validationResult.success) {
          const errorMessages = validationResult.error.issues
            .map((issue) => {
              const fieldName = (issue.path[0] as string) || '';
              return `${fieldName}: ${issue.message}`;
            })
            .join(', ');
          const errorMessage = `Output validation failed: ${errorMessages}`;
          const validationError = new Error(errorMessage);

          this.workflowLogger.logError(errorMessage, validationError, {
            event: { action: 'workflow-output-validation-failed', outcome: 'failure' },
            tags: ['workflow-output', 'validation-error'],
          });

          // Fail the step with validation error (failStep also sets workflow-level error via updateWorkflowExecution)
          this.stepExecutionRuntime.failStep(validationError);

          await executor.requestTermination(
            this.stepExecutionRuntime,
            {},
            ExecutionStatus.FAILED,
            validationError
          );
          return;
        }
      }

      this.workflowLogger.logInfo('Workflow outputs emitted successfully', {
        event: { action: 'workflow-output-emitted', outcome: 'success' },
        tags: ['workflow-output', 'success'],
      });

      // Execution status from step (default 'completed' is applied by WorkflowOutputStepSchema)
      const stepStatus = step.status;
      const status =
        stepStatus === 'failed'
          ? ExecutionStatus.FAILED
          : stepStatus === 'cancelled'
          ? ExecutionStatus.CANCELLED
          : ExecutionStatus.COMPLETED;
      const message =
        typeof outputValues.message === 'string'
          ? outputValues.message
          : typeof outputValues.reason === 'string'
          ? outputValues.reason
          : 'Workflow terminated with failed status';
      await executor.requestTermination(
        this.stepExecutionRuntime,
        outputValues,
        status,
        status === ExecutionStatus.FAILED ? new Error(message) : undefined
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorObj = error instanceof Error ? error : new Error(errorMessage);

      this.workflowLogger.logError(`Workflow output step failed: ${errorMessage}`, errorObj, {
        event: { action: 'workflow-output-failed', outcome: 'failure' },
        tags: ['workflow-output', 'error'],
      });

      // failStep() sets workflow-level error via updateWorkflowExecution({ error })
      this.stepExecutionRuntime.failStep(errorObj);

      this.workflowExecutionRuntime.setWorkflowStatus(ExecutionStatus.FAILED);
    }
  }
}
