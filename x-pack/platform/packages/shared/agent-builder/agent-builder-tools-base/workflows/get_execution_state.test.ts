/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { ExecutionStatus } from '@kbn/workflows';
import { getExecutionState } from './get_execution_state';
import { getWorkflowOutput } from './get_workflow_output';

jest.mock('./get_workflow_output', () => ({
  getWorkflowOutput: jest.fn(),
}));

const getWorkflowOutputMock = jest.mocked(getWorkflowOutput);

describe('getExecutionState', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const createWorkflowApi = () =>
    ({
      getWorkflowExecution: jest.fn(),
    } as unknown as Parameters<typeof getExecutionState>[0]['workflowApi']);

  it('returns null when execution is not found', async () => {
    const workflowApi = createWorkflowApi();
    workflowApi.getWorkflowExecution = jest.fn().mockResolvedValue(null);

    const state = await getExecutionState({
      executionId: 'exec-1',
      spaceId: 'default',
      workflowApi,
    });

    expect(state).toBeNull();
  });

  it('includes output for completed execution', async () => {
    const workflowApi = createWorkflowApi();
    const stepExecutions = [{ id: 'step-1' }];
    workflowApi.getWorkflowExecution = jest.fn().mockResolvedValue({
      status: ExecutionStatus.COMPLETED,
      workflowId: 'workflow-1',
      startedAt: '2026-01-01T00:00:00.000Z',
      finishedAt: '2026-01-01T00:00:05.000Z',
      workflowDefinition: { name: 'Workflow One' },
      stepExecutions,
    });
    getWorkflowOutputMock.mockReturnValue({ transformed: true });

    const state = await getExecutionState({
      executionId: 'exec-1',
      spaceId: 'default',
      workflowApi,
    });

    expect(state).toEqual({
      execution_id: 'exec-1',
      status: ExecutionStatus.COMPLETED,
      workflow_id: 'workflow-1',
      started_at: '2026-01-01T00:00:00.000Z',
      finished_at: '2026-01-01T00:00:05.000Z',
      workflow_name: 'Workflow One',
      output: { transformed: true },
    });
    expect(getWorkflowOutputMock).toHaveBeenCalledWith(stepExecutions);
  });

  it('includes error_message for failed execution with error details', async () => {
    const workflowApi = createWorkflowApi();
    workflowApi.getWorkflowExecution = jest.fn().mockResolvedValue({
      status: ExecutionStatus.FAILED,
      workflowId: 'workflow-2',
      startedAt: '2026-01-01T00:00:00.000Z',
      finishedAt: '2026-01-01T00:00:05.000Z',
      workflowDefinition: { name: 'Workflow Two' },
      stepExecutions: [],
      error: { message: 'Step timed out' },
    });

    const state = await getExecutionState({
      executionId: 'exec-2',
      spaceId: 'default',
      workflowApi,
    });

    expect(state).toEqual({
      execution_id: 'exec-2',
      status: ExecutionStatus.FAILED,
      workflow_id: 'workflow-2',
      started_at: '2026-01-01T00:00:00.000Z',
      finished_at: '2026-01-01T00:00:05.000Z',
      workflow_name: 'Workflow Two',
      error_message: 'Step timed out',
    });
    expect(getWorkflowOutputMock).not.toHaveBeenCalled();
  });

  it('does not include error_message for failed execution without error', async () => {
    const workflowApi = createWorkflowApi();
    workflowApi.getWorkflowExecution = jest.fn().mockResolvedValue({
      status: ExecutionStatus.FAILED,
      workflowId: 'workflow-3',
      startedAt: '2026-01-01T00:00:00.000Z',
      finishedAt: '2026-01-01T00:00:05.000Z',
      workflowDefinition: { name: 'Workflow Three' },
      stepExecutions: [],
    });

    const state = await getExecutionState({
      executionId: 'exec-3',
      spaceId: 'default',
      workflowApi,
    });

    expect(state).toEqual({
      execution_id: 'exec-3',
      status: ExecutionStatus.FAILED,
      workflow_id: 'workflow-3',
      started_at: '2026-01-01T00:00:00.000Z',
      finished_at: '2026-01-01T00:00:05.000Z',
      workflow_name: 'Workflow Three',
    });
    expect(getWorkflowOutputMock).not.toHaveBeenCalled();
  });

  describe('WAITING_FOR_INPUT status', () => {
    it('includes waiting_input with message and schema when step has both', async () => {
      const workflowApi = createWorkflowApi();
      workflowApi.getWorkflowExecution = jest.fn().mockResolvedValue({
        status: ExecutionStatus.WAITING_FOR_INPUT,
        workflowId: 'wf-1',
        startedAt: '2026-01-01T00:00:00.000Z',
        workflowDefinition: {
          name: 'Approval Flow',
          steps: [
            {
              name: 'approve',
              type: 'waitForInput',
              with: {
                message: 'Please approve this request',
                schema: {
                  type: 'object',
                  properties: {
                    approved: { type: 'boolean' },
                    reason: { type: 'string' },
                  },
                  required: ['approved'],
                },
              },
            },
          ],
        },
        stepExecutions: [
          {
            id: 'step-exec-approve',
            stepId: 'approve',
            status: ExecutionStatus.WAITING_FOR_INPUT,
            scopeStack: [],
          },
        ],
      });

      const state = await getExecutionState({
        executionId: 'exec-w1',
        spaceId: 'default',
        workflowApi,
      });

      expect(state?.status).toBe(ExecutionStatus.WAITING_FOR_INPUT);
      expect(state?.waiting_input).toEqual({
        step_execution_id: 'step-exec-approve',
        message: 'Please approve this request',
        schema: {
          type: 'object',
          properties: {
            approved: { type: 'boolean' },
            reason: { type: 'string' },
          },
          required: ['approved'],
        },
      });
    });

    it('includes waiting_input with only message when step has no schema', async () => {
      const workflowApi = createWorkflowApi();
      workflowApi.getWorkflowExecution = jest.fn().mockResolvedValue({
        status: ExecutionStatus.WAITING_FOR_INPUT,
        workflowId: 'wf-2',
        startedAt: '2026-01-01T00:00:00.000Z',
        workflowDefinition: {
          name: 'Simple Wait',
          steps: [
            {
              name: 'ask',
              type: 'waitForInput',
              with: { message: 'Provide input' },
            },
          ],
        },
        stepExecutions: [
          {
            id: 'step-exec-ask',
            stepId: 'ask',
            status: ExecutionStatus.WAITING_FOR_INPUT,
            scopeStack: [],
          },
        ],
      });

      const state = await getExecutionState({
        executionId: 'exec-w2',
        spaceId: 'default',
        workflowApi,
      });

      expect(state?.waiting_input).toEqual({
        step_execution_id: 'step-exec-ask',
        message: 'Provide input',
      });
    });

    it('finds waitForInput step nested inside a foreach', async () => {
      const workflowApi = createWorkflowApi();
      workflowApi.getWorkflowExecution = jest.fn().mockResolvedValue({
        status: ExecutionStatus.WAITING_FOR_INPUT,
        workflowId: 'wf-3',
        startedAt: '2026-01-01T00:00:00.000Z',
        workflowDefinition: {
          name: 'Loop Approval',
          steps: [
            {
              name: 'loop',
              type: 'foreach',
              foreach: '["a","b"]',
              steps: [
                {
                  name: 'nested_ask',
                  type: 'waitForInput',
                  with: { message: 'Approve item' },
                },
              ],
            },
          ],
        },
        stepExecutions: [
          {
            id: 'step-exec-nested',
            stepId: 'nested_ask',
            status: ExecutionStatus.WAITING_FOR_INPUT,
            scopeStack: [],
          },
        ],
      });

      const state = await getExecutionState({
        executionId: 'exec-w3',
        spaceId: 'default',
        workflowApi,
      });

      expect(state?.waiting_input).toEqual({
        step_execution_id: 'step-exec-nested',
        message: 'Approve item',
      });
    });

    it('uses the waiting step execution id when the same stepId has a prior completed instance (loop)', async () => {
      const workflowApi = createWorkflowApi();
      workflowApi.getWorkflowExecution = jest.fn().mockResolvedValue({
        status: ExecutionStatus.WAITING_FOR_INPUT,
        workflowId: 'wf-loop',
        startedAt: '2026-01-01T00:00:00.000Z',
        workflowDefinition: {
          name: 'Loop ask',
          steps: [
            {
              name: 'ask_for_input',
              type: 'waitForInput',
              with: { message: 'Approve item' },
            },
          ],
        },
        stepExecutions: [
          {
            id: 'step-exec-iter-0-done',
            stepId: 'ask_for_input',
            status: ExecutionStatus.COMPLETED,
            scopeStack: [],
          },
          {
            id: 'step-exec-iter-1-waiting',
            stepId: 'ask_for_input',
            status: ExecutionStatus.WAITING_FOR_INPUT,
            scopeStack: [],
          },
        ],
      });

      const state = await getExecutionState({
        executionId: 'exec-loop',
        spaceId: 'default',
        workflowApi,
      });

      expect(state?.waiting_input?.step_execution_id).toBe('step-exec-iter-1-waiting');
      expect(state?.waiting_input?.message).toBe('Approve item');
    });

    it('omits waiting_input entirely when no waiting step is found', async () => {
      const workflowApi = createWorkflowApi();
      workflowApi.getWorkflowExecution = jest.fn().mockResolvedValue({
        status: ExecutionStatus.WAITING_FOR_INPUT,
        workflowId: 'wf-4',
        startedAt: '2026-01-01T00:00:00.000Z',
        workflowDefinition: {
          name: 'Empty Wait',
          steps: [],
        },
        stepExecutions: [],
      });

      const state = await getExecutionState({
        executionId: 'exec-w4',
        spaceId: 'default',
        workflowApi,
      });

      expect(state?.waiting_input).toBeUndefined();
    });

    it('includes approval labels from waitForApproval step execution input', async () => {
      const workflowApi = createWorkflowApi();
      workflowApi.getWorkflowExecution = jest.fn().mockResolvedValue({
        status: ExecutionStatus.WAITING_FOR_INPUT,
        workflowId: 'wf-approval',
        startedAt: '2026-01-01T00:00:00.000Z',
        workflowDefinition: {
          name: 'Approval Flow',
          steps: [
            {
              name: 'request-approval',
              type: 'waitForApproval',
              with: {
                message: 'Approve change?',
                approveLabel: 'Approve',
                rejectLabel: 'Decline',
              },
            },
          ],
        },
        stepExecutions: [
          {
            id: 'step-exec-approval',
            stepId: 'request-approval',
            status: ExecutionStatus.WAITING_FOR_INPUT,
            scopeStack: [],
            input: {
              message: 'Approve change to prod?',
              approveLabel: 'Ship it',
              rejectLabel: 'Hold',
              schema: { type: 'object', properties: { approved: { type: 'boolean' } } },
            },
          },
        ],
      });

      const state = await getExecutionState({
        executionId: 'exec-approval',
        spaceId: 'default',
        workflowApi,
      });

      expect(state?.waiting_input).toEqual({
        step_execution_id: 'step-exec-approval',
        message: 'Approve change to prod?',
        schema: { type: 'object', properties: { approved: { type: 'boolean' } } },
        approve_label: 'Ship it',
        reject_label: 'Hold',
      });
    });
  });
});
