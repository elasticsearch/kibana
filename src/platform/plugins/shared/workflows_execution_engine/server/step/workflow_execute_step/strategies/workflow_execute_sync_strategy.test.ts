/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { KibanaRequest } from '@kbn/core/server';
import type { EsWorkflow } from '@kbn/workflows';
import { ExecutionStatus } from '@kbn/workflows';
import { WorkflowExecuteSyncStrategy } from './workflow_execute_sync_strategy';
import type { StepExecutionRepository } from '../../../repositories/step_execution_repository';
import type { WorkflowExecutionRepository } from '../../../repositories/workflow_execution_repository';
import type { WorkflowsExecutionEnginePluginStart } from '../../../types';
import type { StepExecutionRuntime } from '../../../workflow_context_manager/step_execution_runtime';
import type { IWorkflowEventLogger } from '../../../workflow_event_logger';

const createMockWorkflow = (overrides: Partial<EsWorkflow> = {}): EsWorkflow =>
  ({
    id: 'child-workflow-id',
    name: 'Child Workflow',
    enabled: true,
    valid: true,
    definition: {},
    yaml: 'steps: []',
    ...overrides,
  } as EsWorkflow);

describe('WorkflowExecuteSyncStrategy', () => {
  let strategy: WorkflowExecuteSyncStrategy;
  let mockEngine: jest.Mocked<WorkflowsExecutionEnginePluginStart>;
  let mockExecRepo: jest.Mocked<WorkflowExecutionRepository>;
  let mockStepRepo: jest.Mocked<StepExecutionRepository>;
  let mockStepRuntime: jest.Mocked<StepExecutionRuntime>;
  let mockLogger: jest.Mocked<IWorkflowEventLogger>;
  let mockRequest: KibanaRequest;

  beforeEach(() => {
    mockEngine = {
      executeWorkflow: jest.fn().mockResolvedValue({ workflowExecutionId: 'child-exec-1' }),
    } as any;

    mockExecRepo = {
      getWorkflowExecutionById: jest.fn(),
    } as any;

    mockStepRepo = {
      getStepExecutionsByWorkflowExecution: jest.fn().mockResolvedValue([]),
    } as any;

    mockStepRuntime = {
      workflowExecution: {
        id: 'parent-exec-1',
        workflowId: 'parent-workflow-id',
        isTestRun: false,
        spaceId: 'default',
        context: {},
      },
      node: { stepId: 'sync-step-1' },
      abortController: new AbortController(),
      getCurrentStepState: jest.fn().mockReturnValue(undefined),
      setCurrentStepState: jest.fn(),
      tryEnterWaitUntil: jest.fn().mockReturnValue(true),
      updateWorkflowExecution: jest.fn(),
    } as any;

    mockLogger = {
      logInfo: jest.fn(),
      logDebug: jest.fn(),
      logError: jest.fn(),
    } as any;

    mockRequest = {} as KibanaRequest;

    strategy = new WorkflowExecuteSyncStrategy(
      mockEngine,
      mockExecRepo,
      mockStepRepo,
      mockStepRuntime,
      mockLogger
    );
  });

  describe('initial execution (no existing state)', () => {
    it('should schedule sub-workflow and return waiting status', async () => {
      const result = await strategy.execute(
        createMockWorkflow(),
        { param1: 'value1' },
        'default',
        mockRequest,
        0
      );

      expect(result.status).toBe('waiting');
      expect(mockEngine.executeWorkflow).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'child-workflow-id', isTestRun: false }),
        expect.objectContaining({
          spaceId: 'default',
          inputs: { param1: 'value1' },
          triggeredBy: 'workflow-step',
          parentWorkflowInvocation: 'sync',
          parentWorkflowId: 'parent-workflow-id',
          parentWorkflowExecutionId: 'parent-exec-1',
          parentStepId: 'sync-step-1',
          parentDepth: 0,
        }),
        mockRequest
      );
    });

    it('forwards document version from repository-loaded workflow', async () => {
      await strategy.execute(createMockWorkflow({ version: 5 }), {}, 'default', mockRequest, 0);

      expect(mockEngine.executeWorkflow).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'child-workflow-id', version: 5 }),
        expect.any(Object),
        mockRequest
      );
    });

    it('should save wait state with execution ID (no pollCount)', async () => {
      await strategy.execute(createMockWorkflow(), {}, 'default', mockRequest, 0);

      expect(mockStepRuntime.setCurrentStepState).toHaveBeenCalledWith(
        expect.objectContaining({
          workflowId: 'child-workflow-id',
          executionId: 'child-exec-1',
        })
      );
      const savedState = mockStepRuntime.setCurrentStepState.mock.calls[0][0] as Record<
        string,
        unknown
      >;
      expect(savedState).not.toHaveProperty('pollCount');
    });

    it('should enter WAITING_FOR_CHILD (callback model, not poll delay)', async () => {
      await strategy.execute(createMockWorkflow(), {}, 'default', mockRequest, 0);

      expect(mockStepRuntime.tryEnterWaitUntil).toHaveBeenCalledWith(
        undefined,
        ExecutionStatus.WAITING_FOR_CHILD
      );
    });

    it('should propagate isTestRun flag', async () => {
      (mockStepRuntime.workflowExecution as any).isTestRun = true;

      await strategy.execute(createMockWorkflow(), {}, 'default', mockRequest, 0);

      expect(mockEngine.executeWorkflow).toHaveBeenCalledWith(
        expect.objectContaining({ isTestRun: true }),
        expect.any(Object),
        mockRequest
      );
    });

    it('should return failed when engine throws', async () => {
      mockEngine.executeWorkflow.mockRejectedValue(new Error('Engine failed'));

      const result = await strategy.execute(createMockWorkflow(), {}, 'default', mockRequest, 0);

      expect(result).toEqual({
        status: 'failed',
        error: expect.objectContaining({ message: 'Engine failed' }),
      });
    });
  });

  describe('resume execution (reads child from ES)', () => {
    const waitState = {
      workflowId: 'child-workflow-id',
      executionId: 'child-exec-1',
      startedAt: '2024-01-01T00:00:00Z',
    };

    beforeEach(() => {
      mockStepRuntime.getCurrentStepState.mockReturnValue(waitState);
    });

    it('should return completed with workflow.output from child execution', async () => {
      mockExecRepo.getWorkflowExecutionById.mockResolvedValue({
        id: 'child-exec-1',
        status: ExecutionStatus.COMPLETED,
        context: { output: { result: 'done' } },
      } as any);

      const result = await strategy.execute(createMockWorkflow(), {}, 'default', mockRequest, 0);

      expect(result).toEqual({ status: 'completed', output: { result: 'done' } });
      expect(mockExecRepo.getWorkflowExecutionById).toHaveBeenCalledWith('child-exec-1', 'default');
    });

    it('should return completed with last step output when no workflow.output', async () => {
      mockExecRepo.getWorkflowExecutionById.mockResolvedValue({
        id: 'child-exec-1',
        status: ExecutionStatus.COMPLETED,
        context: {},
        stepExecutionIds: ['step-1'],
      } as any);

      mockStepRepo.getStepExecutionsByWorkflowExecution.mockResolvedValue([
        {
          id: 'step-1',
          stepId: 'step1',
          spaceId: 'default',
          scopeStack: [],
          output: { data: 'from last step' },
        },
      ] as any);

      const result = await strategy.execute(createMockWorkflow(), {}, 'default', mockRequest, 0);

      expect(result.status).toBe('completed');
      expect(result.output).toEqual({ data: 'from last step' });
    });

    it('should return failed when child workflow failed', async () => {
      mockExecRepo.getWorkflowExecutionById.mockResolvedValue({
        id: 'child-exec-1',
        status: ExecutionStatus.FAILED,
        error: { type: 'Error', message: 'child failed' },
      } as any);

      const result = await strategy.execute(createMockWorkflow(), {}, 'default', mockRequest, 0);

      expect(result.status).toBe('failed');
      expect(result.error!.message).toBe('child failed');
    });

    it('should return failed when child workflow is cancelled', async () => {
      mockExecRepo.getWorkflowExecutionById.mockResolvedValue({
        id: 'child-exec-1',
        status: ExecutionStatus.CANCELLED,
      } as any);

      const result = await strategy.execute(createMockWorkflow(), {}, 'default', mockRequest, 0);

      expect(result.status).toBe('failed');
      expect(result.error!.message).toContain('cancelled');
    });

    it('should return failed when child workflow timed out', async () => {
      mockExecRepo.getWorkflowExecutionById.mockResolvedValue({
        id: 'child-exec-1',
        status: ExecutionStatus.TIMED_OUT,
      } as any);

      const result = await strategy.execute(createMockWorkflow(), {}, 'default', mockRequest, 0);

      expect(result.status).toBe('failed');
      expect(result.error!.message).toContain('timed_out');
    });

    it('should return waiting when child is not terminal (e.g. parent resume before child completes)', async () => {
      mockExecRepo.getWorkflowExecutionById.mockResolvedValue({
        id: 'child-exec-1',
        status: ExecutionStatus.RUNNING,
      } as any);

      const result = await strategy.execute(createMockWorkflow(), {}, 'default', mockRequest, 0);

      expect(result).toEqual({ status: 'waiting' });
    });

    it('should return failed when child execution not found', async () => {
      mockExecRepo.getWorkflowExecutionById.mockResolvedValue(null);

      const result = await strategy.execute(createMockWorkflow(), {}, 'default', mockRequest, 0);

      expect(result.status).toBe('failed');
      expect(result.error!.message).toContain('not found');
    });

    it('should return failed when getWorkflowExecutionById throws', async () => {
      mockExecRepo.getWorkflowExecutionById.mockRejectedValue(new Error('ES unavailable'));

      const result = await strategy.execute(createMockWorkflow(), {}, 'default', mockRequest, 0);

      expect(result.status).toBe('failed');
      expect(result.error!.message).toBe('ES unavailable');
    });
  });

  describe('resume()', () => {
    it('should return completed when wait state exists and child completed in ES', async () => {
      mockStepRuntime.getCurrentStepState.mockReturnValue({
        workflowId: 'child-workflow-id',
        executionId: 'child-exec-1',
        startedAt: '2024-01-01T00:00:00Z',
      });

      mockExecRepo.getWorkflowExecutionById.mockResolvedValue({
        id: 'child-exec-1',
        status: ExecutionStatus.COMPLETED,
        context: { output: { result: 'done' } },
      } as any);

      const result = await strategy.resume('default');

      expect(result).toEqual({ status: 'completed', output: { result: 'done' } });
      expect(mockEngine.executeWorkflow).not.toHaveBeenCalled();
    });

    it('should return waiting when child is still non-terminal on resume()', async () => {
      mockStepRuntime.getCurrentStepState.mockReturnValue({
        workflowId: 'child-workflow-id',
        executionId: 'child-exec-1',
        startedAt: '2024-01-01T00:00:00Z',
      });

      mockExecRepo.getWorkflowExecutionById.mockResolvedValue({
        id: 'child-exec-1',
        status: ExecutionStatus.WAITING,
      } as any);

      const result = await strategy.resume('default');

      expect(result).toEqual({ status: 'waiting' });
    });

    it('should return failed when no wait state', async () => {
      mockStepRuntime.getCurrentStepState.mockReturnValue(undefined);

      const result = await strategy.resume('default');

      expect(result.status).toBe('failed');
      expect(result.error?.message).toContain('Cannot resume');
      expect(mockExecRepo.getWorkflowExecutionById).not.toHaveBeenCalled();
    });

    it('should return failed when state has no executionId', async () => {
      mockStepRuntime.getCurrentStepState.mockReturnValue({ workflowId: 'w1' });

      const result = await strategy.resume('default');

      expect(result.status).toBe('failed');
      expect(result.error?.message).toContain('Cannot resume');
      expect(mockExecRepo.getWorkflowExecutionById).not.toHaveBeenCalled();
    });
  });

  describe('canResume()', () => {
    it('returns true when step state has executionId', () => {
      mockStepRuntime.getCurrentStepState.mockReturnValue({
        workflowId: 'w1',
        executionId: 'exec-123',
        startedAt: '2024-01-01T00:00:00Z',
      });

      expect(strategy.canResume()).toBe(true);
    });

    it('returns false when step state is undefined', () => {
      mockStepRuntime.getCurrentStepState.mockReturnValue(undefined);

      expect(strategy.canResume()).toBe(false);
    });

    it('returns false when step state has no executionId', () => {
      mockStepRuntime.getCurrentStepState.mockReturnValue({ workflowId: 'w1' });

      expect(strategy.canResume()).toBe(false);
    });
  });

  describe('getExecutionIdForCancel()', () => {
    it('returns executionId when step state has it', () => {
      mockStepRuntime.getCurrentStepState.mockReturnValue({
        workflowId: 'w1',
        executionId: 'exec-456',
        startedAt: '2024-01-01T00:00:00Z',
      });

      expect(strategy.getExecutionIdForCancel()).toBe('exec-456');
    });

    it('returns undefined when step state is undefined', () => {
      mockStepRuntime.getCurrentStepState.mockReturnValue(undefined);

      expect(strategy.getExecutionIdForCancel()).toBeUndefined();
    });

    it('returns undefined when step state has no executionId', () => {
      mockStepRuntime.getCurrentStepState.mockReturnValue({});

      expect(strategy.getExecutionIdForCancel()).toBeUndefined();
    });
  });

  describe('cancellation during initial execution', () => {
    it('should skip tryEnterWaitUntil on initial execution when aborted', async () => {
      mockStepRuntime.abortController.abort();

      const result = await strategy.execute(createMockWorkflow(), {}, 'default', mockRequest, 0);

      expect(result.status).toBe('cancelled');
      expect(mockStepRuntime.setCurrentStepState).toHaveBeenCalledWith(
        expect.objectContaining({ executionId: 'child-exec-1' })
      );
      expect(mockStepRuntime.tryEnterWaitUntil).not.toHaveBeenCalled();
    });
  });

  describe('output extraction from step executions', () => {
    const waitState = {
      workflowId: 'child-workflow-id',
      executionId: 'child-exec-1',
      startedAt: '2024-01-01T00:00:00Z',
    };

    beforeEach(() => {
      mockStepRuntime.getCurrentStepState.mockReturnValue(waitState);
    });

    it('should return the last step output at top level', async () => {
      mockExecRepo.getWorkflowExecutionById.mockResolvedValue({
        id: 'child-exec-1',
        status: ExecutionStatus.COMPLETED,
        context: {},
        stepExecutionIds: ['step-exec-1', 'step-exec-2'],
      } as any);

      mockStepRepo.getStepExecutionsByWorkflowExecution.mockResolvedValue([
        {
          id: 'step-exec-1',
          stepId: 'step1',
          spaceId: 'default',
          scopeStack: [],
          output: { first: true },
        },
        {
          id: 'step-exec-2',
          stepId: 'step2',
          spaceId: 'default',
          scopeStack: [],
          output: { second: true },
        },
      ] as any);

      const result = await strategy.execute(createMockWorkflow(), {}, 'default', mockRequest, 0);

      expect(result.status).toBe('completed');
      expect(result.output).toEqual({ second: true });
    });

    it('should recurse into children of the last top-level step', async () => {
      mockExecRepo.getWorkflowExecutionById.mockResolvedValue({
        id: 'child-exec-1',
        status: ExecutionStatus.COMPLETED,
        context: {},
        stepExecutionIds: ['step-exec-1', 'step-exec-2', 'step-exec-3'],
      } as any);

      mockStepRepo.getStepExecutionsByWorkflowExecution.mockResolvedValue([
        {
          id: 'step-exec-1',
          stepId: 'step1',
          spaceId: 'default',
          scopeStack: [],
          output: { top: true },
        },
        {
          id: 'step-exec-2',
          stepId: 'step2',
          spaceId: 'default',
          scopeStack: [],
          output: undefined,
        },
        {
          id: 'step-exec-3',
          stepId: 'child-step',
          spaceId: 'default',
          scopeStack: [{ stepId: 'step2' }],
          output: { nested: true },
        },
      ] as any);

      const result = await strategy.execute(createMockWorkflow(), {}, 'default', mockRequest, 0);

      expect(result.status).toBe('completed');
      expect(result.output).toEqual([{ nested: true }]);
    });
  });
});
