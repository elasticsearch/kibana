/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { JsonValue } from '@kbn/utility-types';
import type { EsWorkflowExecution, EsWorkflowStepExecution } from '@kbn/workflows';
import { ExecutionStatus } from '@kbn/workflows';
import type { StepExecutionRepository } from '../../repositories/step_execution_repository';
import type { WorkflowExecutionRepository } from '../../repositories/workflow_execution_repository';
import { StepIoService } from '../step_io_service';
import { WorkflowExecutionState } from '../workflow_execution_state';

/**
 * Test helper: seeds metadata through state and IO through the service —
 * mirrors the production split where lifecycle (status, scopeStack, ...) is
 * state's job and IO (input, output) is the service's. Tests in this file
 * exercise both halves through their respective owners.
 */
function seedStep(
  state: WorkflowExecutionState,
  service: StepIoService,
  step: Partial<EsWorkflowStepExecution> & { id: string }
): void {
  const { input, output, ...metadata } = step;
  state.upsertStep(metadata);
  if (input !== undefined) {
    service.setStepInput(step.id, input as JsonValue);
  }
  if (output !== undefined) {
    service.setStepOutput(step.id, output as JsonValue | null);
  }
}

describe('WorkflowExecutionState', () => {
  let underTest: WorkflowExecutionState;
  let ioService: StepIoService;

  let workflowExecutionRepository: WorkflowExecutionRepository;
  let stepExecutionRepository: StepExecutionRepository;

  function buildService(
    state: WorkflowExecutionState,
    repo: StepExecutionRepository,
    evictionMinBytes = Infinity
  ): StepIoService {
    return new StepIoService({
      stepRepository: repo,
      state,
      evictionMinBytes,
    });
  }

  beforeEach(() => {
    workflowExecutionRepository = {} as unknown as WorkflowExecutionRepository;
    workflowExecutionRepository.updateWorkflowExecution = jest.fn();

    stepExecutionRepository = {} as unknown as StepExecutionRepository;
    stepExecutionRepository.bulkUpsert = jest.fn();
    stepExecutionRepository.getStepExecutionsByIds = jest.fn();

    const fakeWorkflowExecution = {
      id: 'test-workflow-execution-id',
      workflowId: 'test-workflow-id',
      status: ExecutionStatus.RUNNING,
      startedAt: '2025-08-05T20:00:00.000Z',
      isTestRun: false,
    } as EsWorkflowExecution;
    underTest = new WorkflowExecutionState(fakeWorkflowExecution, workflowExecutionRepository);
    ioService = buildService(underTest, stepExecutionRepository);
  });

  it('should initialize with the provided workflow execution', () => {
    const workflowExecution = underTest.getWorkflowExecution();
    expect(workflowExecution).toEqual({
      id: 'test-workflow-execution-id',
      workflowId: 'test-workflow-id',
      status: ExecutionStatus.RUNNING,
      startedAt: '2025-08-05T20:00:00.000Z',
      isTestRun: false,
    } as EsWorkflowExecution);
  });

  it('should update workflow execution', () => {
    const updatedWorkflowExecution = {
      id: 'test-workflow-execution-id',
      workflowId: 'test-workflow-id',
      status: ExecutionStatus.COMPLETED,
      startedAt: '2025-08-05T20:00:00.000Z',
      isTestRun: false,
    } as EsWorkflowExecution;

    underTest.updateWorkflowExecution(updatedWorkflowExecution);

    expect(underTest.getWorkflowExecution()).toEqual(updatedWorkflowExecution);
  });

  it('should not call updateWorkflowExecution', () => {
    const updatedWorkflowExecution = {
      id: 'test-workflow-execution-id',
      workflowId: 'test-workflow-id',
      status: ExecutionStatus.COMPLETED,
      startedAt: '2025-08-05T20:00:00.000Z',
    } as EsWorkflowExecution;

    underTest.updateWorkflowExecution(updatedWorkflowExecution);
    expect(workflowExecutionRepository.updateWorkflowExecution).not.toHaveBeenCalled();
  });

  it('should throw error from upsertStep if id is not provided', () => {
    expect(() => underTest.upsertStep({})).toThrowError(
      'WorkflowExecutionState: Step execution must have an ID to be upserted'
    );
  });

  it('should create step execution with assigning workflowRunId, workflowId only in local state', () => {
    const stepExecution = {
      id: 'fake-id',
      stepId: 'test-step-execution-id',
      status: ExecutionStatus.RUNNING,
      startedAt: '2025-08-05T20:00:00.000Z',
    } as EsWorkflowStepExecution;
    // Reset mock and set a specific uuid for this test

    underTest.upsertStep(stepExecution);
    // `as Partial<EsWorkflowStepExecution>` keeps the assertion focused on
    // the fields that createStep actually fills in; spaceId/topologicalIndex
    // come from upstream callers (workflow context / runtime) and are not
    // injected by createStep itself.
    expect(underTest.getLatestStepExecution('test-step-execution-id')).toEqual({
      id: 'fake-id',
      workflowRunId: 'test-workflow-execution-id',
      workflowId: 'test-workflow-id',
      stepId: 'test-step-execution-id',
      // `scopeStack` is required on the schema; createStep now defaults to []
      // when the caller did not supply one (previously it left undefined,
      // which would write `null` into ES on bulk upsert).
      scopeStack: [],
      status: ExecutionStatus.RUNNING,
      startedAt: '2025-08-05T20:00:00.000Z',
      stepExecutionIndex: 0,
      globalExecutionIndex: 0,
      isTestRun: false,
    } as Partial<EsWorkflowStepExecution>);
    expect(stepExecutionRepository.bulkUpsert).not.toHaveBeenCalled();
  });

  it('should set isTestRun on step execution from workflow execution', () => {
    const workflowExecutionWithTestRun = {
      id: 'test-workflow-execution-id',
      workflowId: 'test-workflow-id',
      status: ExecutionStatus.RUNNING,
      startedAt: '2025-08-05T20:00:00.000Z',
      isTestRun: true,
    } as EsWorkflowExecution;
    const stateWithTestRun = new WorkflowExecutionState(
      workflowExecutionWithTestRun,
      workflowExecutionRepository
    );
    buildService(stateWithTestRun, stepExecutionRepository);

    stateWithTestRun.upsertStep({
      id: 'fake-id',
      stepId: 'test-step',
      status: ExecutionStatus.RUNNING,
      startedAt: '2025-08-05T20:00:00.000Z',
    } as EsWorkflowStepExecution);

    expect(stateWithTestRun.getLatestStepExecution('test-step')).toEqual(
      expect.objectContaining({
        id: 'fake-id',
        workflowRunId: 'test-workflow-execution-id',
        workflowId: 'test-workflow-id',
        isTestRun: true,
      })
    );
  });

  it('should create step execution with executionIndex', () => {
    underTest.upsertStep({
      id: 'fake-id-1',
      stepId: 'test-step-execution-id',
    });
    underTest.upsertStep({
      id: 'fake-id-2',
      stepId: 'test-step-execution-id',
    });
    underTest.upsertStep({
      id: 'fake-id-3',
      stepId: 'test-step-execution-id',
    });

    expect(underTest.getLatestStepExecution('test-step-execution-id')).toEqual(
      expect.objectContaining({
        stepExecutionIndex: 2,
      } as EsWorkflowStepExecution)
    );
    expect(stepExecutionRepository.bulkUpsert).not.toHaveBeenCalled();
  });

  it('should create step execution with globalExecutionIndex', () => {
    underTest.upsertStep({
      id: 'fake-id-1',
      stepId: 'test-step-execution-id',
    });
    underTest.upsertStep({
      id: 'fake-id-2',
      stepId: 'test-step-execution-id-2',
    });
    underTest.upsertStep({
      id: 'fake-id-3',
      stepId: 'test-step-execution-id-3',
    });

    expect(underTest.getLatestStepExecution('test-step-execution-id-3')).toEqual(
      expect.objectContaining({
        globalExecutionIndex: 2,
      } as EsWorkflowStepExecution)
    );
    expect(stepExecutionRepository.bulkUpsert).not.toHaveBeenCalled();
  });

  it('should update step execution only in local state', () => {
    // create initial step execution
    underTest.upsertStep({
      id: 'fake-id',
      stepId: 'test-step-execution-id',
      status: ExecutionStatus.RUNNING,
      startedAt: '2025-08-05T20:00:00.000Z',
    } as EsWorkflowStepExecution);

    // update step execution
    underTest.upsertStep({
      id: 'fake-id',
      stepId: 'test-step-execution-id',
      status: ExecutionStatus.COMPLETED,
      finishedAt: '2025-08-05T20:01:00.000Z',
      executionTimeMs: 60000,
    } as EsWorkflowStepExecution);

    expect(underTest.getLatestStepExecution('test-step-execution-id')).toEqual(
      expect.objectContaining({
        id: 'fake-id',
        status: ExecutionStatus.COMPLETED,
        finishedAt: '2025-08-05T20:01:00.000Z',
        executionTimeMs: 60000,
      })
    );
    expect(stepExecutionRepository.bulkUpsert).not.toHaveBeenCalled();
  });

  describe('flush', () => {
    beforeEach(() => {
      workflowExecutionRepository.getWorkflowExecutionById = jest
        .fn()
        .mockResolvedValue({} as EsWorkflowExecution);
    });

    it('should flush workflow execution changes', async () => {
      const updatedWorkflowExecution = {
        id: 'test-workflow-execution-id',
        workflowId: 'test-workflow-id',
        status: ExecutionStatus.COMPLETED,
        startedAt: '2025-08-05T20:00:00.000Z',
        finishedAt: '2025-08-05T20:01:00.000Z',
      } as EsWorkflowExecution;

      underTest.updateWorkflowExecution(updatedWorkflowExecution);

      await ioService.flush();

      expect(workflowExecutionRepository.updateWorkflowExecution).toHaveBeenCalledWith(
        updatedWorkflowExecution,
        {}
      );
    });

    it('should flush workflow execution changes with execution id even if execution id is not in change', async () => {
      const updatedWorkflowExecution = {} as EsWorkflowExecution;

      underTest.updateWorkflowExecution(updatedWorkflowExecution);

      await ioService.flush();

      expect(workflowExecutionRepository.updateWorkflowExecution).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'test-workflow-execution-id',
        }),
        {}
      );
    });

    it('should flush new step executions', async () => {
      const stepExecution = {
        id: 'fake-uuid',
        stepId: 'test-step-execution-id',
        status: ExecutionStatus.RUNNING,
        startedAt: '2025-08-05T20:00:00.000Z',
      } as EsWorkflowStepExecution;

      underTest.upsertStep(stepExecution);

      await ioService.flush();

      expect(stepExecutionRepository.bulkUpsert).toHaveBeenCalledWith([
        expect.objectContaining({
          id: 'fake-uuid',
          stepId: 'test-step-execution-id',
          status: ExecutionStatus.RUNNING,
          startedAt: '2025-08-05T20:00:00.000Z',
          isTestRun: false,
        } as EsWorkflowStepExecution),
      ]);
    });

    it('should flush updates to changed step executions', async () => {
      // create initial step execution
      underTest.upsertStep({
        id: 'fake-uuid-1',
        stepId: 'test-step-execution-id',
        status: ExecutionStatus.RUNNING,
        startedAt: '2025-08-05T20:00:00.000Z',
      } as EsWorkflowStepExecution);
      await ioService.flush(); // initial flush to create the step execution

      // update step execution
      underTest.upsertStep({
        id: 'fake-uuid-1',
        stepId: 'test-step-execution-id',
        status: ExecutionStatus.COMPLETED,
        finishedAt: '2025-08-05T20:01:00.000Z',
        executionTimeMs: 60000,
      } as EsWorkflowStepExecution);

      await ioService.flush();

      expect(stepExecutionRepository.bulkUpsert).toHaveBeenCalledWith([
        {
          id: 'fake-uuid-1',
          stepId: 'test-step-execution-id',
          status: ExecutionStatus.COMPLETED,
          finishedAt: '2025-08-05T20:01:00.000Z',
          executionTimeMs: 60000,
        } as EsWorkflowStepExecution,
      ]);
    });

    it('should be able to create step executions that changed multiple times by merging changes', async () => {
      // create initial step execution
      const fakeUuid = 'fake-uuid-1';
      underTest.upsertStep({
        id: fakeUuid,
        stepId: 'test-step-execution-id',
        status: ExecutionStatus.RUNNING,
        startedAt: '2025-08-05T20:00:00.000Z',
      } as EsWorkflowStepExecution);

      // update step execution
      underTest.upsertStep({
        id: fakeUuid,
        stepId: 'test-step-execution-id',
        status: ExecutionStatus.COMPLETED,
        finishedAt: '2025-08-05T20:01:00.000Z',
        executionTimeMs: 2000,
      } as EsWorkflowStepExecution);

      await ioService.flush();

      expect(stepExecutionRepository.bulkUpsert).toHaveBeenCalledWith([
        expect.objectContaining({
          id: fakeUuid,
          stepId: 'test-step-execution-id',
          status: ExecutionStatus.COMPLETED,
          finishedAt: '2025-08-05T20:01:00.000Z',
          startedAt: '2025-08-05T20:00:00.000Z',
          executionTimeMs: 2000,
          isTestRun: false,
        } as EsWorkflowStepExecution),
      ]);
    });

    it('should not flush if there are no changes', async () => {
      await ioService.flush();

      expect(workflowExecutionRepository.updateWorkflowExecution).not.toHaveBeenCalled();
      expect(stepExecutionRepository.bulkUpsert).not.toHaveBeenCalled();
    });

    it('should not flush if there are no changes since last flush', async () => {
      // create initial step execution
      const fakeUuid = 'fake-uuid-1';
      underTest.updateWorkflowExecution({
        status: ExecutionStatus.SKIPPED,
      });
      underTest.upsertStep({
        id: fakeUuid,
        stepId: 'test-step-execution-id',
        status: ExecutionStatus.RUNNING,
        startedAt: '2025-08-05T20:00:00.000Z',
      } as EsWorkflowStepExecution);
      await ioService.flush(); // initial flush to create the step execution

      // update step execution
      underTest.upsertStep({
        id: fakeUuid,
        stepId: 'test-step-execution-id',
        status: ExecutionStatus.COMPLETED,
        finishedAt: '2025-08-05T20:01:00.000Z',
        executionTimeMs: 60000,
      } as EsWorkflowStepExecution);
      const secondFakeUuid = 'fake-uuid-2';
      underTest.upsertStep({
        id: secondFakeUuid,
        stepId: 'test-step-execution-id-created-again',
        status: ExecutionStatus.RUNNING,
        startedAt: '2025-08-05T20:00:00.000Z',
      } as EsWorkflowStepExecution);
      await ioService.flush(); // first flush that flushes everything
      await ioService.flush(); // second flush with no changes
      await ioService.flush(); // third flush with no changes

      expect(workflowExecutionRepository.updateWorkflowExecution).toHaveBeenCalledTimes(2);
      expect(stepExecutionRepository.bulkUpsert).toHaveBeenCalledTimes(2);
    });
  });

  describe('getStepExecutionsByStepId', () => {
    it('should return all step executions for the provided step id', () => {
      underTest.upsertStep({
        id: 'mock-uuid-1',
        stepId: 'testStep',
      });
      underTest.upsertStep({
        id: 'mock-uuid-2',
        stepId: 'testStep',
      });
      underTest.upsertStep({
        id: 'mock-uuid-3',
        stepId: 'notNeededStep',
      });
      expect(underTest.getStepExecutionsByStepId('testStep')).toEqual([
        expect.objectContaining({
          id: 'mock-uuid-1',
          stepId: 'testStep',
        }),
        expect.objectContaining({
          id: 'mock-uuid-2',
          stepId: 'testStep',
        }),
      ]);
    });
  });

  describe('getLatestStepExecution', () => {
    it('should return latest step execution for the provided step id', () => {
      underTest.upsertStep({
        id: 'mock-uuid-1',
        stepId: 'testStep',
      });
      underTest.upsertStep({
        id: 'mock-uuid-2',
        stepId: 'testStep',
      });
      expect(underTest.getLatestStepExecution('testStep')).toEqual(
        expect.objectContaining({
          id: 'mock-uuid-2',
          stepId: 'testStep',
        })
      );
    });
  });

  describe('load', () => {
    it('should throw if stepExecutionIds is not set on the workflow execution', async () => {
      await expect(ioService.load()).rejects.toThrow(
        'StepIoService: Workflow execution must have step execution IDs to be loaded'
      );
    });

    it('should load existing step executions with output excluded', async () => {
      underTest.updateWorkflowExecution({ stepExecutionIds: ['11', '22'] });
      (stepExecutionRepository.getStepExecutionsByIds as jest.Mock).mockResolvedValue([
        {
          id: '11',
          stepId: 'testStep',
          stepType: 'connector',
          status: ExecutionStatus.RUNNING,
        } as EsWorkflowStepExecution,
        {
          id: '22',
          stepId: 'testStep2',
          stepType: 'connector',
          status: ExecutionStatus.COMPLETED,
        } as EsWorkflowStepExecution,
      ]);
      await ioService.load();

      expect(stepExecutionRepository.getStepExecutionsByIds).toHaveBeenCalledWith(
        ['11', '22'],
        undefined,
        ['output']
      );
      expect(underTest.getLatestStepExecution('testStep')).toEqual(
        expect.objectContaining({
          id: '11',
          stepId: 'testStep',
          status: ExecutionStatus.RUNNING,
        })
      );
      expect(underTest.getLatestStepExecution('testStep2')).toEqual(
        expect.objectContaining({
          id: '22',
          stepId: 'testStep2',
          status: ExecutionStatus.COMPLETED,
        })
      );
    });

    it('should issue secondary fetch with id+output for pinned step types', async () => {
      // State owns the ES fetch path; the IO service decides which IDs are
      // pinned. Deferred-output / eviction semantics live in step_io_service.test.ts.
      underTest.updateWorkflowExecution({ stepExecutionIds: ['11', '22'] });
      const dataSetOutput = { myVar: 'hello' };
      (stepExecutionRepository.getStepExecutionsByIds as jest.Mock)
        .mockResolvedValueOnce([
          {
            id: '11',
            stepId: 'connectorStep',
            stepType: 'connector',
            status: ExecutionStatus.COMPLETED,
          } as EsWorkflowStepExecution,
          {
            id: '22',
            stepId: 'dataSetStep',
            stepType: 'data.set',
            status: ExecutionStatus.COMPLETED,
          } as EsWorkflowStepExecution,
        ])
        .mockResolvedValueOnce([
          { id: '22', output: dataSetOutput } as unknown as EsWorkflowStepExecution,
        ]);
      await ioService.load();

      expect(ioService.getStepOutput('22')).toEqual(dataSetOutput);
      expect(stepExecutionRepository.getStepExecutionsByIds).toHaveBeenCalledWith(
        ['22'],
        ['id', 'output']
      );
    });

    it('should sort step executions by executionIndex when loaded from repository', async () => {
      underTest.updateWorkflowExecution({ stepExecutionIds: ['11', '44', '33', '22'] });
      (stepExecutionRepository.getStepExecutionsByIds as jest.Mock).mockResolvedValue([
        {
          id: '11',
          stepId: 'testStep',
          stepExecutionIndex: 1,
        } as EsWorkflowStepExecution,
        {
          id: '44',
          stepId: 'testStep',
          stepExecutionIndex: 4,
        } as EsWorkflowStepExecution,
        {
          id: '33',
          stepId: 'testStep',
          stepExecutionIndex: 3,
        } as EsWorkflowStepExecution,
        {
          id: '22',
          stepId: 'testStep',
          stepExecutionIndex: 2,
        } as EsWorkflowStepExecution,
      ]);
      await ioService.load();

      expect(
        underTest.getStepExecutionsByStepId('testStep')?.map((stepExecution) => stepExecution.id)
      ).toEqual(['11', '22', '33', '44']);
    });
  });

  describe('evictStaleLoopOutputs', () => {
    it('should nullify output and input on non-latest executions for given stepIds', () => {
      seedStep(underTest, ioService, {
        id: 'exec-1',
        stepId: 'innerStep',
        output: { data: 'iteration-0' },
        input: { idx: 0 },
      });
      seedStep(underTest, ioService, {
        id: 'exec-2',
        stepId: 'innerStep',
        output: { data: 'iteration-1' },
        input: { idx: 1 },
      });
      seedStep(underTest, ioService, {
        id: 'exec-3',
        stepId: 'innerStep',
        output: { data: 'iteration-2' },
        input: { idx: 2 },
      });

      ioService.evictStaleLoopOutputs(['innerStep']);

      const executions = underTest.getStepExecutionsByStepId('innerStep');
      expect(ioService.getStepOutput(executions[0].id)).toBeUndefined();
      expect(ioService.getStepInput(executions[0].id)).toBeUndefined();
      expect(ioService.getStepOutput(executions[1].id)).toBeUndefined();
      expect(ioService.getStepInput(executions[1].id)).toBeUndefined();
      // Latest execution preserved
      expect(ioService.getStepOutput(executions[2].id)).toEqual({ data: 'iteration-2' });
      expect(ioService.getStepInput(executions[2].id)).toEqual({ idx: 2 });
    });

    it('should preserve all data.set step outputs', () => {
      seedStep(underTest, ioService, {
        id: 'ds-1',
        stepId: 'setVar',
        stepType: 'data.set',
        output: { myVar: 'val-0' },
        input: { myVar: 'val-0' },
      });
      seedStep(underTest, ioService, {
        id: 'ds-2',
        stepId: 'setVar',
        stepType: 'data.set',
        output: { myVar: 'val-1' },
        input: { myVar: 'val-1' },
      });
      seedStep(underTest, ioService, {
        id: 'ds-3',
        stepId: 'setVar',
        stepType: 'data.set',
        output: { myVar: 'val-2' },
        input: { myVar: 'val-2' },
      });

      ioService.evictStaleLoopOutputs(['setVar']);

      const executions = underTest.getStepExecutionsByStepId('setVar');
      expect(ioService.getStepOutput(executions[0].id)).toEqual({ myVar: 'val-0' });
      expect(ioService.getStepOutput(executions[1].id)).toEqual({ myVar: 'val-1' });
      expect(ioService.getStepOutput(executions[2].id)).toEqual({ myVar: 'val-2' });
    });

    it('should preserve metadata fields on evicted executions', () => {
      seedStep(underTest, ioService, {
        id: 'exec-1',
        stepId: 'innerStep',
        stepType: 'atomic',
        status: ExecutionStatus.COMPLETED,
        startedAt: '2025-01-01T00:00:00.000Z',
        finishedAt: '2025-01-01T00:01:00.000Z',
        executionTimeMs: 60000,
        output: { large: 'payload' },
        input: { some: 'input' },
      });
      seedStep(underTest, ioService, {
        id: 'exec-2',
        stepId: 'innerStep',
        output: { latest: true },
      });

      ioService.evictStaleLoopOutputs(['innerStep']);

      const evicted = underTest.getStepExecution('exec-1');
      // Metadata is preserved by state (which doesn't store IO at all),
      // and IO was cleared from the service maps by evictStaleLoopOutputs.
      expect(evicted).toEqual(
        expect.objectContaining({
          id: 'exec-1',
          stepId: 'innerStep',
          stepType: 'atomic',
          status: ExecutionStatus.COMPLETED,
          startedAt: '2025-01-01T00:00:00.000Z',
          finishedAt: '2025-01-01T00:01:00.000Z',
          executionTimeMs: 60000,
        })
      );
      expect(ioService.getStepOutput('exec-1')).toBeUndefined();
      expect(ioService.getStepInput('exec-1')).toBeUndefined();
    });

    it('should not touch steps with only one execution', () => {
      seedStep(underTest, ioService, {
        id: 'only-exec',
        stepId: 'singleStep',
        output: { preserved: true },
        input: { kept: true },
      });

      ioService.evictStaleLoopOutputs(['singleStep']);

      expect(ioService.getStepOutput('only-exec')).toEqual({ preserved: true });
      expect(ioService.getStepInput('only-exec')).toEqual({ kept: true });
    });

    it('should not touch steps not in the provided list', () => {
      seedStep(underTest, ioService, {
        id: 'outer-1',
        stepId: 'outerStep',
        output: { data: 'untouched-0' },
      });
      seedStep(underTest, ioService, {
        id: 'outer-2',
        stepId: 'outerStep',
        output: { data: 'untouched-1' },
      });

      ioService.evictStaleLoopOutputs(['otherStep']);

      const executions = underTest.getStepExecutionsByStepId('outerStep');
      expect(ioService.getStepOutput(executions[0].id)).toEqual({ data: 'untouched-0' });
      expect(ioService.getStepOutput(executions[1].id)).toEqual({ data: 'untouched-1' });
    });

    it('should handle empty innerStepIds', () => {
      seedStep(underTest, ioService, {
        id: 'exec-1',
        stepId: 'someStep',
        output: { data: true },
      });

      ioService.evictStaleLoopOutputs([]);

      expect(ioService.getStepOutput('exec-1')).toEqual({ data: true });
    });

    it('should handle stepIds with no executions in the index', () => {
      expect(() => ioService.evictStaleLoopOutputs(['nonexistent'])).not.toThrow();
    });

    it('should handle mixed data.set and non-data.set steps', () => {
      seedStep(underTest, ioService, {
        id: 'action-1',
        stepId: 'actionStep',
        stepType: 'atomic',
        output: { result: 'iter-0' },
      });
      seedStep(underTest, ioService, {
        id: 'action-2',
        stepId: 'actionStep',
        stepType: 'atomic',
        output: { result: 'iter-1' },
      });
      seedStep(underTest, ioService, {
        id: 'ds-1',
        stepId: 'dataStep',
        stepType: 'data.set',
        output: { var: 'val-0' },
      });
      seedStep(underTest, ioService, {
        id: 'ds-2',
        stepId: 'dataStep',
        stepType: 'data.set',
        output: { var: 'val-1' },
      });

      ioService.evictStaleLoopOutputs(['actionStep', 'dataStep']);

      // Non-latest atomic step output evicted
      expect(ioService.getStepOutput('action-1')).toBeUndefined();
      // Latest atomic step output preserved
      expect(ioService.getStepOutput('action-2')).toEqual({ result: 'iter-1' });
      // All data.set outputs preserved
      expect(ioService.getStepOutput('ds-1')).toEqual({ var: 'val-0' });
      expect(ioService.getStepOutput('ds-2')).toEqual({ var: 'val-1' });
    });

    it('should accept a Set as input', () => {
      seedStep(underTest, ioService, {
        id: 'exec-1',
        stepId: 'innerStep',
        output: { data: 'old' },
      });
      seedStep(underTest, ioService, {
        id: 'exec-2',
        stepId: 'innerStep',
        output: { data: 'latest' },
      });

      ioService.evictStaleLoopOutputs(new Set(['innerStep']));

      expect(ioService.getStepOutput('exec-1')).toBeUndefined();
      expect(ioService.getStepOutput('exec-2')).toEqual({ data: 'latest' });
    });

    describe('data.set preservation within loops', () => {
      it('should preserve data.set output for step A inside foreach step B', () => {
        // Simulate: foreach B iterates 3 times, each iteration runs data.set step A
        seedStep(underTest, ioService, {
          id: 'ds-a-iter0',
          stepId: 'stepA',
          stepType: 'data.set',
          output: { counter: 1 },
          input: { counter: 1 },
        });
        seedStep(underTest, ioService, {
          id: 'ds-a-iter1',
          stepId: 'stepA',
          stepType: 'data.set',
          output: { counter: 2 },
          input: { counter: 2 },
        });
        seedStep(underTest, ioService, {
          id: 'ds-a-iter2',
          stepId: 'stepA',
          stepType: 'data.set',
          output: { counter: 3 },
          input: { counter: 3 },
        });

        ioService.evictStaleLoopOutputs(['stepA']);

        // ALL data.set outputs must survive — getVariables() reads every one
        const executions = underTest.getStepExecutionsByStepId('stepA');
        expect(executions).toHaveLength(3);
        expect(ioService.getStepOutput(executions[0].id)).toEqual({ counter: 1 });
        expect(ioService.getStepInput(executions[0].id)).toEqual({ counter: 1 });
        expect(ioService.getStepOutput(executions[1].id)).toEqual({ counter: 2 });
        expect(ioService.getStepInput(executions[1].id)).toEqual({ counter: 2 });
        expect(ioService.getStepOutput(executions[2].id)).toEqual({ counter: 3 });
        expect(ioService.getStepInput(executions[2].id)).toEqual({ counter: 3 });
      });

      it('should preserve data.set but evict sibling non-data.set steps in the same loop', () => {
        // foreach loop body: [data.set step, connector step]
        for (let i = 0; i < 3; i++) {
          seedStep(underTest, ioService, {
            id: `ds-${i}`,
            stepId: 'setVarStep',
            stepType: 'data.set',
            output: { accumulator: `val-${i}` },
          });
          seedStep(underTest, ioService, {
            id: `conn-${i}`,
            stepId: 'connectorStep',
            stepType: 'slack',
            output: { message: `sent-${i}` },
          });
        }

        ioService.evictStaleLoopOutputs(['setVarStep', 'connectorStep']);

        // All data.set outputs preserved
        expect(ioService.getStepOutput('ds-0')).toEqual({ accumulator: 'val-0' });
        expect(ioService.getStepOutput('ds-1')).toEqual({ accumulator: 'val-1' });
        expect(ioService.getStepOutput('ds-2')).toEqual({ accumulator: 'val-2' });

        // Non-latest connector outputs evicted, latest preserved
        expect(ioService.getStepOutput('conn-0')).toBeUndefined();
        expect(ioService.getStepOutput('conn-1')).toBeUndefined();
        expect(ioService.getStepOutput('conn-2')).toEqual({ message: 'sent-2' });
      });
    });

    describe('nested loop eviction', () => {
      it('should handle inner loop eviction followed by outer loop eviction', () => {
        // Outer loop (2 iters) -> Inner loop (3 iters) -> action step
        // Outer iter 0: inner produces 3 executions of 'action'
        for (let i = 0; i < 3; i++) {
          seedStep(underTest, ioService, {
            id: `action-outer0-inner${i}`,
            stepId: 'action',
            stepType: 'atomic',
            output: { value: `0-${i}` },
          });
        }
        // Inner loop finishes -> evict inner body (action)
        ioService.evictStaleLoopOutputs(['action']);

        // After inner eviction: only latest (inner iter 2) has output
        expect(ioService.getStepOutput('action-outer0-inner0')).toBeUndefined();
        expect(ioService.getStepOutput('action-outer0-inner1')).toBeUndefined();
        expect(ioService.getStepOutput('action-outer0-inner2')).toEqual({
          value: '0-2',
        });

        // Outer iter 1: inner produces 3 more executions
        for (let i = 0; i < 3; i++) {
          seedStep(underTest, ioService, {
            id: `action-outer1-inner${i}`,
            stepId: 'action',
            stepType: 'atomic',
            output: { value: `1-${i}` },
          });
        }
        // Inner loop finishes again -> evict inner body
        ioService.evictStaleLoopOutputs(['action']);

        // Now 6 total executions. After second inner eviction,
        // only the very latest (outer1-inner2) should have output
        const allActionExecs = underTest.getStepExecutionsByStepId('action');
        expect(allActionExecs).toHaveLength(6);
        const withOutput = allActionExecs.filter(
          (e) => ioService.getStepOutput(e.id) !== undefined
        );
        expect(withOutput).toHaveLength(1);
        expect(withOutput[0].id).toBe('action-outer1-inner2');

        // Outer loop finishes -> evict outer body (includes action and inner loop steps)
        ioService.evictStaleLoopOutputs(['action', 'innerLoop']);

        // After outer eviction: still only the very latest has output
        const finalWithOutput = underTest
          .getStepExecutionsByStepId('action')
          .filter((e) => ioService.getStepOutput(e.id) !== undefined);
        expect(finalWithOutput).toHaveLength(1);
        expect(finalWithOutput[0].id).toBe('action-outer1-inner2');
      });
    });

    describe('idempotency', () => {
      it('should be safe to call eviction multiple times on the same step IDs', () => {
        seedStep(underTest, ioService, {
          id: 'exec-1',
          stepId: 'step',
          output: { data: 'old' },
        });
        seedStep(underTest, ioService, {
          id: 'exec-2',
          stepId: 'step',
          output: { data: 'latest' },
        });

        ioService.evictStaleLoopOutputs(['step']);
        ioService.evictStaleLoopOutputs(['step']);
        ioService.evictStaleLoopOutputs(['step']);

        expect(ioService.getStepOutput('exec-1')).toBeUndefined();
        expect(ioService.getStepOutput('exec-2')).toEqual({ data: 'latest' });
      });
    });

    describe('getLatestStepExecution correctness after eviction', () => {
      it('should return the latest execution with its output intact', () => {
        seedStep(underTest, ioService, {
          id: 'exec-1',
          stepId: 'step',
          output: { data: 'first' },
        });
        seedStep(underTest, ioService, {
          id: 'exec-2',
          stepId: 'step',
          output: { data: 'second' },
        });
        seedStep(underTest, ioService, {
          id: 'exec-3',
          stepId: 'step',
          output: { data: 'latest' },
        });

        ioService.evictStaleLoopOutputs(['step']);

        const latest = underTest.getLatestStepExecution('step');
        expect(latest?.id).toBe('exec-3');
        expect(ioService.getStepOutput('exec-3')).toEqual({ data: 'latest' });
      });
    });

    describe('getAllStepExecutions after eviction', () => {
      it('should still return all executions for telemetry', () => {
        for (let i = 0; i < 5; i++) {
          seedStep(underTest, ioService, {
            id: `exec-${i}`,
            stepId: 'loopBody',
            stepType: 'atomic',
            status: ExecutionStatus.COMPLETED,
            output: { iteration: i },
          });
        }

        ioService.evictStaleLoopOutputs(['loopBody']);

        const all = underTest.getAllStepExecutions();
        expect(all).toHaveLength(5);
        // All should still have metadata
        all.forEach((exec) => {
          expect(exec.stepId).toBe('loopBody');
          expect(exec.status).toBe(ExecutionStatus.COMPLETED);
        });
        // Only the last one should have output (IO lives in the service now).
        expect(all.filter((e) => ioService.getStepOutput(e.id) !== undefined)).toHaveLength(1);
      });
    });

    describe('state field preservation', () => {
      it('should preserve step state (used by loops and retries) after eviction', () => {
        seedStep(underTest, ioService, {
          id: 'exec-1',
          stepId: 'retryStep',
          stepType: 'atomic',
          state: { retryCount: 1, lastError: 'timeout' },
          output: { result: 'retry-1' },
        });
        seedStep(underTest, ioService, {
          id: 'exec-2',
          stepId: 'retryStep',
          stepType: 'atomic',
          state: { retryCount: 2 },
          output: { result: 'retry-2' },
        });

        ioService.evictStaleLoopOutputs(['retryStep']);

        const evicted = underTest.getStepExecution('exec-1');
        expect(evicted?.state).toEqual({ retryCount: 1, lastError: 'timeout' });
        expect(ioService.getStepOutput('exec-1')).toBeUndefined();
      });
    });

    describe('large iteration counts', () => {
      it('should handle eviction of many iterations efficiently', () => {
        const iterationCount = 1000;
        for (let i = 0; i < iterationCount; i++) {
          seedStep(underTest, ioService, {
            id: `exec-${i}`,
            stepId: 'heavyStep',
            stepType: 'atomic',
            output: { payload: 'x'.repeat(100) },
            input: { idx: i },
          });
        }

        ioService.evictStaleLoopOutputs(['heavyStep']);

        const executions = underTest.getStepExecutionsByStepId('heavyStep');
        expect(executions).toHaveLength(iterationCount);

        // Only the very last one should retain output
        const withOutput = executions.filter((e) => ioService.getStepOutput(e.id) !== undefined);
        expect(withOutput).toHaveLength(1);
        expect(withOutput[0].id).toBe(`exec-${iterationCount - 1}`);
      });
    });

    describe('does not affect pending flush', () => {
      it('should not add evicted changes to stepDocumentsChanges', async () => {
        seedStep(underTest, ioService, {
          id: 'exec-1',
          stepId: 'step',
          output: { data: 'old' },
        });
        seedStep(underTest, ioService, {
          id: 'exec-2',
          stepId: 'step',
          output: { data: 'latest' },
        });

        // Flush the creates to ES
        await ioService.flush();
        (stepExecutionRepository.bulkUpsert as jest.Mock).mockClear();

        // Now evict — this should NOT trigger another flush of the evicted data
        ioService.evictStaleLoopOutputs(['step']);
        await ioService.flush();

        // No additional bulk upsert should have been triggered
        expect(stepExecutionRepository.bulkUpsert).not.toHaveBeenCalled();
      });

      it('should not corrupt a pending flush entry when eviction runs before flush', async () => {
        // createStep stores the same object ref in both stepExecutions and stepDocumentsChanges.
        // Eviction must NOT mutate the pending flush entry, otherwise the step will be
        // upserted to ES with output: undefined, contradicting the "in-memory only" contract.
        seedStep(underTest, ioService, {
          id: 'exec-1',
          stepId: 'innerStep',
          stepType: 'atomic',
          output: { result: 'iter-0' },
          input: { idx: 0 },
        });
        seedStep(underTest, ioService, {
          id: 'exec-2',
          stepId: 'innerStep',
          stepType: 'atomic',
          output: { result: 'iter-1' },
          input: { idx: 1 },
        });

        // Evict BEFORE flushing — the pending entry for exec-1 must still carry its output
        ioService.evictStaleLoopOutputs(['innerStep']);

        await ioService.flush();

        // exec-1 was pending. Its flush payload must still include the original output/input
        // because eviction is in-memory-only and must not touch pending ES writes.
        expect(stepExecutionRepository.bulkUpsert).toHaveBeenCalledWith(
          expect.arrayContaining([
            expect.objectContaining({
              id: 'exec-1',
              output: { result: 'iter-0' },
              input: { idx: 0 },
            }),
          ])
        );
      });
    });

    describe('error field preservation', () => {
      it('should preserve error field on evicted failed step executions', () => {
        seedStep(underTest, ioService, {
          id: 'exec-1',
          stepId: 'failingStep',
          stepType: 'atomic',
          status: ExecutionStatus.FAILED,
          error: { message: 'timeout', type: 'StepTimeout' },
          output: null,
          input: { request: 'data' },
        });
        seedStep(underTest, ioService, {
          id: 'exec-2',
          stepId: 'failingStep',
          stepType: 'atomic',
          status: ExecutionStatus.COMPLETED,
          output: { result: 'success' },
        });

        ioService.evictStaleLoopOutputs(['failingStep']);

        const evicted = underTest.getStepExecution('exec-1');
        expect(evicted?.error).toEqual({ message: 'timeout', type: 'StepTimeout' });
        expect(evicted?.status).toBe(ExecutionStatus.FAILED);
        expect(ioService.getStepInput('exec-1')).toBeUndefined();
      });
    });

    describe('scopeStack preservation', () => {
      it('should preserve scopeStack on evicted executions', () => {
        const scopeStack = [
          {
            stepId: 'outerLoop',
            nestedScopes: [{ nodeId: 'enterForeach_outerLoop', nodeType: 'enter-foreach' }],
          },
        ];
        seedStep(underTest, ioService, {
          id: 'exec-1',
          stepId: 'innerStep',
          stepType: 'atomic',
          scopeStack,
          output: { data: 'old' },
        });
        seedStep(underTest, ioService, {
          id: 'exec-2',
          stepId: 'innerStep',
          stepType: 'atomic',
          output: { data: 'new' },
        });

        ioService.evictStaleLoopOutputs(['innerStep']);

        expect(underTest.getStepExecution('exec-1')?.scopeStack).toEqual(scopeStack);
      });
    });
  });

  describe('accumulateUsage', () => {
    it('sets the per-execution usage from the first reporting step', () => {
      underTest.accumulateUsage({ inputTokens: 100, outputTokens: 50, totalTokens: 150 });

      expect(underTest.getWorkflowExecution().usage).toEqual({
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
      });
    });

    it('sums usage across multiple steps', () => {
      underTest.accumulateUsage({ inputTokens: 100, outputTokens: 50, totalTokens: 150 });
      underTest.accumulateUsage({ inputTokens: 200, outputTokens: 80, totalTokens: 280 });

      expect(underTest.getWorkflowExecution().usage).toEqual({
        inputTokens: 300,
        outputTokens: 130,
        totalTokens: 430,
      });
    });

    it('persists the accumulated usage on the next workflow-doc flush', async () => {
      underTest.accumulateUsage({ inputTokens: 100, outputTokens: 50, totalTokens: 150 });
      await underTest.flushWorkflowDoc();

      expect(workflowExecutionRepository.updateWorkflowExecution).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'test-workflow-execution-id',
          usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
        }),
        {}
      );
    });

    it('is a no-op when usage is undefined (steps that report nothing)', () => {
      underTest.accumulateUsage(undefined);
      expect(underTest.getWorkflowExecution().usage).toBeUndefined();
    });
  });
});
