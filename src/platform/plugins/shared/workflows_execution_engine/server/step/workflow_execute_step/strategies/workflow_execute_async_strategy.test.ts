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
import { WorkflowExecuteAsyncStrategy } from './workflow_execute_async_strategy';
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

describe('WorkflowExecuteAsyncStrategy', () => {
  let strategy: WorkflowExecuteAsyncStrategy;
  let mockEngine: jest.Mocked<WorkflowsExecutionEnginePluginStart>;
  let mockExecRepo: jest.Mocked<WorkflowExecutionRepository>;
  let mockStepRuntime: jest.Mocked<StepExecutionRuntime>;
  let mockLogger: jest.Mocked<IWorkflowEventLogger>;
  let mockRequest: KibanaRequest;

  beforeEach(() => {
    mockEngine = {
      executeWorkflow: jest.fn().mockResolvedValue({ workflowExecutionId: 'async-exec-1' }),
    } as any;

    mockExecRepo = {
      getWorkflowExecutionById: jest.fn().mockResolvedValue({
        id: 'async-exec-1',
        startedAt: '2024-01-01T00:00:00Z',
      }),
    } as any;

    mockStepRuntime = {
      workflowExecution: {
        id: 'parent-exec-1',
        workflowId: 'parent-workflow-id',
        isTestRun: false,
      },
      node: { stepId: 'async-step-1' },
    } as any;

    mockLogger = {
      logInfo: jest.fn(),
      logDebug: jest.fn(),
      logError: jest.fn(),
    } as any;

    mockRequest = {} as KibanaRequest;

    strategy = new WorkflowExecuteAsyncStrategy(
      mockEngine,
      mockExecRepo,
      mockStepRuntime,
      mockLogger
    );
  });

  it('should execute the workflow via the engine', async () => {
    const workflow = createMockWorkflow();
    const inputs = { param1: 'value1' };

    await strategy.execute(workflow, inputs, 'default', mockRequest, 0);

    expect(mockEngine.executeWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'child-workflow-id',
        name: 'Child Workflow',
        isTestRun: false,
      }),
      expect.objectContaining({
        spaceId: 'default',
        inputs: { param1: 'value1' },
        triggeredBy: 'workflow-step',
        parentWorkflowInvocation: 'async',
        parentWorkflowId: 'parent-workflow-id',
        parentWorkflowExecutionId: 'parent-exec-1',
        parentStepId: 'async-step-1',
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

  it('should return completed status with execution metadata', async () => {
    const result = await strategy.execute(createMockWorkflow(), {}, 'default', mockRequest, 0);

    expect(result).toEqual({
      status: 'completed',
      output: {
        workflowId: 'child-workflow-id',
        executionId: 'async-exec-1',
        awaited: false,
        status: 'pending',
        startedAt: '2024-01-01T00:00:00Z',
      },
    });
  });

  it('should omit startedAt when execution fetch returns null', async () => {
    mockExecRepo.getWorkflowExecutionById.mockResolvedValue(null);

    const result = await strategy.execute(createMockWorkflow(), {}, 'default', mockRequest, 0);

    expect(result.status).toBe('completed');
    expect(result.output).not.toHaveProperty('startedAt');
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

  it('should return failed status when engine throws', async () => {
    mockEngine.executeWorkflow.mockRejectedValue(new Error('Engine unavailable'));

    const result = await strategy.execute(createMockWorkflow(), {}, 'default', mockRequest, 0);

    expect(result).toEqual({
      status: 'failed',
      error: expect.objectContaining({ message: 'Engine unavailable' }),
    });
  });

  it('should propagate parentDepth correctly', async () => {
    await strategy.execute(createMockWorkflow(), {}, 'default', mockRequest, 5);

    expect(mockEngine.executeWorkflow).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ parentDepth: 5 }),
      mockRequest
    );
  });

  it('should log info about the started execution', async () => {
    await strategy.execute(createMockWorkflow(), {}, 'default', mockRequest, 0);

    expect(mockLogger.logInfo).toHaveBeenCalledWith(expect.stringContaining('async-exec-1'));
  });
});
