/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { WorkflowExecutionDto, WorkflowYaml } from '@kbn/workflows';
import { ExecutionStatus } from '@kbn/workflows';
import {
  buildTriggerContextFromExecution,
  buildTriggerStepExecutionFromContext,
} from '../workflow_pseudo_step_context';

const createWorkflowExecution = (
  overrides: Partial<WorkflowExecutionDto> = {}
): WorkflowExecutionDto => ({
  spaceId: 'default',
  id: 'exec-1',
  status: ExecutionStatus.COMPLETED,
  isTestRun: false,
  startedAt: '2024-01-01T00:00:00Z',
  finishedAt: '2024-01-01T00:01:00Z',
  error: null,
  stepExecutions: [],
  duration: 60000,
  yaml: '',
  workflowDefinition: {} as WorkflowYaml,
  ...overrides,
});

describe('buildTriggerContextFromExecution', () => {
  it('should return null for undefined context', () => {
    expect(buildTriggerContextFromExecution(undefined)).toBeNull();
  });

  it('should return null for null context', () => {
    expect(buildTriggerContextFromExecution(null)).toBeNull();
  });

  it('should detect manual trigger when context has inputs', () => {
    const result = buildTriggerContextFromExecution({ inputs: { name: 'test' } });

    expect(result).toEqual({
      triggerType: 'manual',
      input: { name: 'test' },
    });
  });

  it('should detect alert trigger when context event has alerts', () => {
    const result = buildTriggerContextFromExecution({ event: { alerts: [{ id: 'a1' }] } });

    expect(result).toEqual({
      triggerType: 'alert',
      input: { alerts: [{ id: 'a1' }] },
    });
  });

  it('should detect document trigger when context has a non-scheduled, non-alert event', () => {
    const result = buildTriggerContextFromExecution({ event: { type: 'other', data: {} } });

    expect(result).toEqual({
      triggerType: 'document',
      input: { type: 'other', data: {} },
    });
  });

  it('should use event trigger type when triggeredBy is event-driven and event is present', () => {
    const event = { workflow: { name: 'Parent' } };
    const result = buildTriggerContextFromExecution({ event }, 'workflows.failed');

    expect(result).toEqual({
      triggerType: 'event',
      input: event,
    });
  });

  it('should detect scheduled trigger when event type is scheduled', () => {
    const result = buildTriggerContextFromExecution({ event: { type: 'scheduled' } });

    expect(result).toEqual({
      triggerType: 'scheduled',
      input: { type: 'scheduled' },
    });
  });

  it('should default to manual when context has neither event nor inputs', () => {
    const result = buildTriggerContextFromExecution({ spaceId: 'default' });

    expect(result).toEqual({
      triggerType: 'manual',
      input: undefined,
    });
  });
});

describe('buildTriggerStepExecutionFromContext', () => {
  it('should return null when execution has no context', () => {
    const execution = createWorkflowExecution({ context: undefined });

    expect(buildTriggerStepExecutionFromContext(execution)).toBeNull();
  });

  it('should build trigger step with COMPLETED status for successful execution', () => {
    const execution = createWorkflowExecution({
      status: ExecutionStatus.COMPLETED,
      stepExecutions: [
        {
          id: 'step-1',
          stepId: 'action-1',
          stepType: 'action',
          status: ExecutionStatus.COMPLETED,
          scopeStack: [],
          workflowRunId: 'exec-1',
          workflowId: 'wf-1',
          startedAt: '',
          topologicalIndex: 0,
          globalExecutionIndex: 0,
          stepExecutionIndex: 0,
        },
      ],
      context: { inputs: { name: 'test' } },
    });

    const result = buildTriggerStepExecutionFromContext(execution);

    expect(result).not.toBeNull();
    expect(result?.status).toBe(ExecutionStatus.COMPLETED);
    expect(result?.error).toBeUndefined();
  });

  it('should build trigger step with FAILED status when execution failed before steps', () => {
    const execution = createWorkflowExecution({
      status: ExecutionStatus.FAILED,
      stepExecutions: [],
      error: { type: 'InputValidationError', message: 'name: Required' },
      context: { inputs: {} },
    });

    const result = buildTriggerStepExecutionFromContext(execution);

    expect(result).not.toBeNull();
    expect(result?.status).toBe(ExecutionStatus.FAILED);
    expect(result?.error).toEqual({ type: 'InputValidationError', message: 'name: Required' });
  });

  it('should not set FAILED on trigger step when execution failed after steps ran', () => {
    const execution = createWorkflowExecution({
      status: ExecutionStatus.FAILED,
      stepExecutions: [
        {
          id: 'step-1',
          stepId: 'action-1',
          stepType: 'action',
          status: ExecutionStatus.FAILED,
          scopeStack: [],
          workflowRunId: 'exec-1',
          workflowId: 'wf-1',
          startedAt: '',
          topologicalIndex: 0,
          globalExecutionIndex: 0,
          stepExecutionIndex: 0,
        },
      ],
      error: { type: 'StepError', message: 'step failed' },
      context: { inputs: { name: 'test' } },
    });

    const result = buildTriggerStepExecutionFromContext(execution);

    expect(result).not.toBeNull();
    expect(result?.status).toBe(ExecutionStatus.COMPLETED);
    expect(result?.error).toBeUndefined();
  });

  it('should set correct stepId and stepType based on trigger type', () => {
    const alertExecution = createWorkflowExecution({
      context: { event: { alerts: [{ id: 'a1' }] } },
    });

    const result = buildTriggerStepExecutionFromContext(alertExecution);

    expect(result?.stepId).toBe('alert');
    expect(result?.stepType).toBe('trigger_alert');
  });

  it('should use event pseudo-step with document icon mapping for event-driven executions', () => {
    const execution = createWorkflowExecution({
      triggeredBy: 'workflows.failed',
      context: { event: { error: { message: 'fail' } } },
    });

    const result = buildTriggerStepExecutionFromContext(execution);

    expect(result?.stepId).toBe('event');
    expect(result?.stepType).toBe('trigger_event');
  });

  it('should expose manual inputs as output when both event and inputs are present', () => {
    const execution = createWorkflowExecution({
      status: ExecutionStatus.COMPLETED,
      stepExecutions: [
        {
          id: 'step-1',
          stepId: 'action-1',
          stepType: 'action',
          status: ExecutionStatus.COMPLETED,
          scopeStack: [],
          workflowRunId: 'exec-1',
          workflowId: 'wf-1',
          startedAt: '',
          topologicalIndex: 0,
          globalExecutionIndex: 0,
          stepExecutionIndex: 0,
        },
      ],
      context: {
        event: { alerts: [{ id: 'alert-1' }] },
        inputs: { ticketId: 'ABC-123' },
      },
    });

    const result = buildTriggerStepExecutionFromContext(execution);

    expect(result).not.toBeNull();
    expect(result?.input).toEqual({ alerts: [{ id: 'alert-1' }] });
    expect(result?.output).toEqual({ ticketId: 'ABC-123' });
  });

  it('should not set output when only event is present', () => {
    const execution = createWorkflowExecution({
      status: ExecutionStatus.COMPLETED,
      stepExecutions: [
        {
          id: 'step-1',
          stepId: 'action-1',
          stepType: 'action',
          status: ExecutionStatus.COMPLETED,
          scopeStack: [],
          workflowRunId: 'exec-1',
          workflowId: 'wf-1',
          startedAt: '',
          topologicalIndex: 0,
          globalExecutionIndex: 0,
          stepExecutionIndex: 0,
        },
      ],
      // The server always persists an `inputs` key (empty object when no manual inputs
      // were supplied alongside the event), so the realistic persisted shape includes it.
      context: { event: { alerts: [{ id: 'alert-1' }] }, inputs: {} },
    });

    const result = buildTriggerStepExecutionFromContext(execution);

    expect(result).not.toBeNull();
    expect(result?.input).toEqual({ alerts: [{ id: 'alert-1' }] });
    expect(result?.output).toBeUndefined();
  });
});
