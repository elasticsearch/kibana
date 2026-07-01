/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { httpServerMock } from '@kbn/core/server/mocks';
import { SignificantEventsWorkflowStatus } from '@kbn/significant-events-schema';
import { ExecutionStatus } from '@kbn/workflows';
import { WorkflowExecutionService } from './workflow_execution_service';

const WORKFLOW_ID = 'wf-1';
const WORKFLOW_SPACE_ID = '*';

const createMockManagementApi = (overrides: Record<string, jest.Mock> = {}) => ({
  getWorkflow: jest.fn().mockResolvedValue({
    id: WORKFLOW_ID,
    name: 'workflow',
    enabled: true,
    definition: {},
    yaml: '',
  }),
  runWorkflow: jest.fn().mockResolvedValue('execution-id'),
  getWorkflowExecutions: jest.fn().mockResolvedValue({ results: [], total: 0 }),
  getWorkflowExecution: jest.fn().mockResolvedValue(null),
  cancelWorkflowExecution: jest.fn().mockResolvedValue(undefined),
  ...overrides,
});

const createService = (overrides: Record<string, jest.Mock> = {}) => {
  const managementApi = createMockManagementApi(overrides);
  const service = new WorkflowExecutionService({
    managementApi: managementApi as never,
    workflowId: WORKFLOW_ID,
    workflowSpaceId: WORKFLOW_SPACE_ID,
  });
  return { service, managementApi };
};

describe('WorkflowExecutionService', () => {
  describe('classifyExecutionStatus', () => {
    it.each([
      [ExecutionStatus.PENDING, SignificantEventsWorkflowStatus.InProgress],
      [ExecutionStatus.QUEUED, SignificantEventsWorkflowStatus.InProgress],
      [ExecutionStatus.RUNNING, SignificantEventsWorkflowStatus.InProgress],
      [ExecutionStatus.WAITING, SignificantEventsWorkflowStatus.InProgress],
      [ExecutionStatus.WAITING_FOR_INPUT, SignificantEventsWorkflowStatus.InProgress],
      [ExecutionStatus.WAITING_FOR_CHILD, SignificantEventsWorkflowStatus.InProgress],
      [ExecutionStatus.COMPLETED, SignificantEventsWorkflowStatus.Completed],
      [ExecutionStatus.FAILED, SignificantEventsWorkflowStatus.Failed],
      [ExecutionStatus.TIMED_OUT, SignificantEventsWorkflowStatus.Failed],
      [ExecutionStatus.CANCELLED, SignificantEventsWorkflowStatus.Canceled],
      [ExecutionStatus.SKIPPED, SignificantEventsWorkflowStatus.Canceled],
    ])('maps %s to %s', (executionStatus, expected) => {
      expect(WorkflowExecutionService.classifyExecutionStatus(executionStatus)).toBe(expected);
    });

    it('throws on an unhandled status', () => {
      expect(() =>
        WorkflowExecutionService.classifyExecutionStatus('unknown' as ExecutionStatus)
      ).toThrow(/Unhandled ExecutionStatus/);
    });
  });

  describe('getFailureMessage', () => {
    it('returns "Workflow <id> timed out" for TIMED_OUT executions', () => {
      expect(
        WorkflowExecutionService.getFailureMessage({
          execution: { status: ExecutionStatus.TIMED_OUT, error: { message: 'ignored' } } as never,
          workflowId: WORKFLOW_ID,
        })
      ).toBe(`Workflow ${WORKFLOW_ID} timed out`);
    });

    it('returns the execution error message for non-timeout failures', () => {
      expect(
        WorkflowExecutionService.getFailureMessage({
          execution: { status: ExecutionStatus.FAILED, error: { message: 'boom' } } as never,
          workflowId: WORKFLOW_ID,
        })
      ).toBe('boom');
    });

    it('falls back to "Unknown error" when no error message is present', () => {
      expect(
        WorkflowExecutionService.getFailureMessage({
          execution: { status: ExecutionStatus.FAILED } as never,
          workflowId: WORKFLOW_ID,
        })
      ).toBe('Unknown error');
    });
  });

  describe('getStatus', () => {
    it('returns NotStarted when there are no executions', async () => {
      const { service } = createService();

      const result = await service.getStatus({ spaceId: 'space-a' });

      expect(result).toEqual({
        status: SignificantEventsWorkflowStatus.NotStarted,
        executionId: null,
      });
    });

    it('returns InProgress with executionId for a running execution', async () => {
      const { service } = createService({
        getWorkflowExecutions: jest
          .fn()
          .mockResolvedValue({ results: [{ id: 'exec-1', status: ExecutionStatus.RUNNING }] }),
      });

      const result = await service.getStatus({ spaceId: 'space-a' });

      expect(result).toEqual({
        status: SignificantEventsWorkflowStatus.InProgress,
        executionId: 'exec-1',
      });
    });

    it('returns Completed with executionId for a completed execution', async () => {
      const { service } = createService({
        getWorkflowExecutions: jest
          .fn()
          .mockResolvedValue({ results: [{ id: 'exec-1', status: ExecutionStatus.COMPLETED }] }),
      });

      const result = await service.getStatus({ spaceId: 'space-a' });

      expect(result).toEqual({
        status: SignificantEventsWorkflowStatus.Completed,
        executionId: 'exec-1',
      });
    });

    it('returns Failed with error message for a failed execution', async () => {
      const { service } = createService({
        getWorkflowExecutions: jest.fn().mockResolvedValue({
          results: [{ id: 'exec-1', status: ExecutionStatus.FAILED, error: { message: 'boom' } }],
        }),
      });

      const result = await service.getStatus({ spaceId: 'space-a' });

      expect(result).toEqual({
        status: SignificantEventsWorkflowStatus.Failed,
        executionId: 'exec-1',
        error: 'boom',
      });
    });

    it('returns Failed with "Workflow <id> timed out" for a timed-out execution', async () => {
      const { service } = createService({
        getWorkflowExecutions: jest
          .fn()
          .mockResolvedValue({ results: [{ id: 'exec-1', status: ExecutionStatus.TIMED_OUT }] }),
      });

      const result = await service.getStatus({ spaceId: 'space-a' });

      expect(result).toEqual({
        status: SignificantEventsWorkflowStatus.Failed,
        executionId: 'exec-1',
        error: `Workflow ${WORKFLOW_ID} timed out`,
      });
    });

    it('always fetches exactly one execution', async () => {
      const { service, managementApi } = createService();

      await service.getStatus({ spaceId: 'space-a' });

      expect(managementApi.getWorkflowExecutions).toHaveBeenCalledWith(
        expect.objectContaining({ size: 1 }),
        'space-a'
      );
    });

    it('caller-supplied queryParams cannot override size: 1', async () => {
      const { service, managementApi } = createService();

      await service.getStatus({ spaceId: 'space-a', queryParams: { size: 99 } });

      expect(managementApi.getWorkflowExecutions).toHaveBeenCalledWith(
        expect.objectContaining({ size: 1 }),
        'space-a'
      );
    });

    it('forwards optional queryParams (e.g. concurrencyGroupKey)', async () => {
      const { service, managementApi } = createService();

      await service.getStatus({
        spaceId: 'space-a',
        queryParams: { concurrencyGroupKey: 'group-1' },
      });

      expect(managementApi.getWorkflowExecutions).toHaveBeenCalledWith(
        expect.objectContaining({ concurrencyGroupKey: 'group-1' }),
        'space-a'
      );
    });
  });

  describe('execute', () => {
    it('fetches the definition from the constructor workflow space and runs it in the execution space', async () => {
      const { service, managementApi } = createService();
      const request = httpServerMock.createKibanaRequest();

      const executionId = await service.execute({
        executionSpaceId: 'space-a',
        inputs: { foo: 'bar' },
        request,
      });

      expect(executionId).toBe('execution-id');
      expect(managementApi.getWorkflow).toHaveBeenCalledWith(WORKFLOW_ID, WORKFLOW_SPACE_ID);
      expect(managementApi.runWorkflow).toHaveBeenCalledWith(
        expect.objectContaining({ id: WORKFLOW_ID }),
        'space-a',
        { foo: 'bar' },
        request
      );
    });

    it('passes an empty object when inputs are omitted', async () => {
      const { service, managementApi } = createService();
      const request = httpServerMock.createKibanaRequest();

      await service.execute({ executionSpaceId: 'space-a', request });

      expect(managementApi.runWorkflow).toHaveBeenCalledWith(
        expect.anything(),
        'space-a',
        {},
        request
      );
    });

    it('throws when the workflow is not found', async () => {
      const { service } = createService({ getWorkflow: jest.fn().mockResolvedValue(null) });

      await expect(
        service.execute({
          executionSpaceId: 'space-a',
          request: httpServerMock.createKibanaRequest(),
        })
      ).rejects.toThrow(new RegExp(`Workflow ${WORKFLOW_ID} not found`));
    });

    it('throws when the workflow has no definition', async () => {
      const { service } = createService({
        getWorkflow: jest.fn().mockResolvedValue({ id: WORKFLOW_ID, definition: null }),
      });

      await expect(
        service.execute({
          executionSpaceId: 'space-a',
          request: httpServerMock.createKibanaRequest(),
        })
      ).rejects.toThrow(new RegExp(`Workflow ${WORKFLOW_ID} not found`));
    });

    it('throws "Workflow <id> not found" when the workflow is not found', async () => {
      const { service } = createService({ getWorkflow: jest.fn().mockResolvedValue(null) });

      await expect(
        service.execute({
          executionSpaceId: 'space-a',
          request: httpServerMock.createKibanaRequest(),
        })
      ).rejects.toThrow(new RegExp(`Workflow ${WORKFLOW_ID} not found`));
    });
  });

  describe('cancelLatest', () => {
    it('cancels the latest non-terminal execution and returns its id', async () => {
      const { service, managementApi } = createService({
        getWorkflowExecutions: jest
          .fn()
          .mockResolvedValue({ results: [{ id: 'exec-1', status: ExecutionStatus.RUNNING }] }),
      });
      const request = httpServerMock.createKibanaRequest();

      const result = await service.cancelLatest({ spaceId: 'space-a', request });

      expect(result).toBe('exec-1');
      expect(managementApi.cancelWorkflowExecution).toHaveBeenCalledWith(
        'exec-1',
        'space-a',
        request
      );
    });

    it('returns null and does not cancel when the latest execution is terminal', async () => {
      const { service, managementApi } = createService({
        getWorkflowExecutions: jest
          .fn()
          .mockResolvedValue({ results: [{ id: 'exec-1', status: ExecutionStatus.COMPLETED }] }),
      });

      const result = await service.cancelLatest({
        spaceId: 'space-a',
        request: httpServerMock.createKibanaRequest(),
      });

      expect(result).toBeNull();
      expect(managementApi.cancelWorkflowExecution).not.toHaveBeenCalled();
    });

    it('returns null when there are no executions', async () => {
      const { service } = createService();

      const result = await service.cancelLatest({
        spaceId: 'space-a',
        request: httpServerMock.createKibanaRequest(),
      });

      expect(result).toBeNull();
    });

    it('forwards the concurrency group key when provided', async () => {
      const { service, managementApi } = createService();

      await service.cancelLatest({
        spaceId: 'space-a',
        request: httpServerMock.createKibanaRequest(),
        concurrencyGroupKey: 'group-1',
      });

      expect(managementApi.getWorkflowExecutions).toHaveBeenCalledWith(
        expect.objectContaining({
          workflowId: WORKFLOW_ID,
          concurrencyGroupKey: 'group-1',
          size: 1,
        }),
        'space-a'
      );
    });
  });

  describe('getLastExecution', () => {
    it('returns the first result when executions exist', async () => {
      const { service } = createService({
        getWorkflowExecutions: jest
          .fn()
          .mockResolvedValue({ results: [{ id: 'exec-1', status: ExecutionStatus.RUNNING }] }),
      });

      const result = await service.getLastExecution('space-a');

      expect(result).toEqual({ id: 'exec-1', status: ExecutionStatus.RUNNING });
    });

    it('returns null when there are no executions', async () => {
      const { service } = createService();

      const result = await service.getLastExecution('space-a');

      expect(result).toBeNull();
    });

    it('queries by createdAt desc to get the most recently created execution', async () => {
      const { service, managementApi } = createService();

      await service.getLastExecution('space-a');

      expect(managementApi.getWorkflowExecutions).toHaveBeenCalledWith(
        expect.objectContaining({ sortField: 'createdAt', sortOrder: 'desc', size: 1 }),
        'space-a'
      );
    });
  });
});
