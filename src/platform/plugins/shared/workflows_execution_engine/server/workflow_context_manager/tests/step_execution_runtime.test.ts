/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { JsonValue } from '@kbn/utility-types';
import type { EsWorkflowExecution, EsWorkflowStepExecution, StackFrame } from '@kbn/workflows';
import { ExecutionStatus } from '@kbn/workflows';
import type { GraphNodeUnion, WorkflowGraph } from '@kbn/workflows/graph';
import { ExecutionError } from '@kbn/workflows/server';
import { createMockWorkflowEventLogger } from '../../workflow_event_logger/mocks';
import type { IWorkflowEventLogger } from '../../workflow_event_logger/types';
import { StepExecutionRuntime } from '../step_execution_runtime';
import type { StepIoService } from '../step_io_service';
import type { WorkflowContextManager } from '../workflow_context_manager';
import type { WorkflowExecutionState } from '../workflow_execution_state';

/**
 * Builds a `StepIoService` test double that owns its own IO maps — mirrors
 * the production split where state holds metadata only and the service is
 * sovereign over `input` / `output`. Lifecycle writes still go through
 * `state.upsertStep`; the runtime tests assert against those calls directly.
 */
function createPassthroughStepIoService(state: WorkflowExecutionState): StepIoService {
  const inputs = new Map<string, JsonValue>();
  const outputs = new Map<string, JsonValue | null>();
  const sizes = new Map<string, number>();
  return {
    setStepInput: (id: string, input: JsonValue) => {
      inputs.set(id, input);
    },
    setStepOutput: (id: string, output: JsonValue | null, sizeBytes?: number) => {
      outputs.set(id, output);
      if (sizeBytes !== undefined && Number.isFinite(sizeBytes) && sizeBytes >= 0) {
        sizes.set(id, sizeBytes);
      }
    },
    getStepInput: jest.fn((id: string) => inputs.get(id)),
    getStepOutput: jest.fn((id: string) => outputs.get(id)),
    getStepError: jest.fn((id: string) => state.getStepExecution(id)?.error),
    getLatestStepIO: jest.fn((stepId: string) => {
      const latest = state.getLatestStepExecution(stepId);
      if (!latest) return undefined;
      return {
        input: inputs.get(latest.id),
        output: outputs.get(latest.id),
        error: latest.error,
      };
    }),
    getDataSetVariables: jest.fn(() => ({} as Record<string, unknown>)),
    getOutputSizeStats: jest.fn(() => {
      let totalBytes = 0;
      for (const bytes of sizes.values()) totalBytes += bytes;
      return { totalBytes, stepCount: sizes.size };
    }),
    hasEvictedOutputs: jest.fn().mockReturnValue(false),
    rehydrateOutputs: jest.fn().mockResolvedValue(undefined),
    prepareForRead: jest.fn().mockResolvedValue(undefined),
    releaseTransientlyRehydratedOutputs: jest.fn(),
  } as unknown as StepIoService;
}

describe('StepExecutionRuntime', () => {
  let underTest: StepExecutionRuntime;
  let workflowExecution: EsWorkflowExecution;
  let workflowExecutionGraph: WorkflowGraph;
  let workflowLogger: IWorkflowEventLogger;
  let workflowExecutionState: WorkflowExecutionState;
  let stepIoService: StepIoService;
  let workflowContextManager: WorkflowContextManager;
  const fakeStepExecutionId = 'fake_step_execution_id';
  const fakeNode = {
    id: 'node1',
    stepId: 'fakeStepId1',
    stepType: 'fakeStepType1',
  } as GraphNodeUnion;
  const fakeStackFrames: StackFrame[] = [];
  const originalDateCtor = global.Date;
  let mockDateNow: Date;

  beforeAll(() => {
    jest.spyOn(global, 'Date').mockImplementation((...args) => {
      if (args.length) {
        return new originalDateCtor(...args);
      }

      return mockDateNow;
    });
  });
  afterAll(() => {
    jest.restoreAllMocks();
  });

  beforeEach(() => {
    workflowLogger = createMockWorkflowEventLogger();
    workflowContextManager = {} as unknown as WorkflowContextManager;
    mockDateNow = new Date('2025-07-05T20:00:00.000Z');
    workflowExecution = {
      id: 'testWorkflowExecutionid',
      workflowId: 'test-workflow-id',
      scopeStack: [
        { stepId: 'firstScope', nestedScopes: [{ nodeId: 'node1' }] },
        { stepId: 'secondScope', nestedScopes: [{ nodeId: 'node2' }] },
      ] as StackFrame[],
      status: ExecutionStatus.RUNNING,
      createdAt: new Date('2025-08-05T19:00:00.000Z').toISOString(),
      startedAt: new Date('2025-08-05T20:00:00.000Z').toISOString(),
    } as EsWorkflowExecution;

    workflowExecutionState = {
      getWorkflowExecution: jest.fn().mockReturnValue(workflowExecution),
      updateWorkflowExecution: jest.fn(),
      getStepExecution: jest.fn(),
      getLatestStepExecution: jest.fn(),
      getStepExecutionsByStepId: jest.fn(),
      upsertStep: jest.fn(),
      load: jest.fn(),
      flush: jest.fn(),
      flushStepChanges: jest.fn(),
      setLastFailedStepContext: jest.fn(),
      getLastFailedStepContext: jest.fn(),
      accumulateUsage: jest.fn(),
    } as unknown as WorkflowExecutionState;

    workflowExecutionGraph = {
      topologicalOrder: ['node1', 'node2', 'node3'],
    } as unknown as WorkflowGraph;

    workflowExecutionGraph.getNode = jest.fn().mockImplementation((nodeId) => {
      switch (nodeId) {
        case 'node1':
          return {
            id: 'node1',
            stepId: 'fakeStepId1',
            stepType: 'fakeStepType1',
          } as GraphNodeUnion;
        case 'node2':
          return {
            id: 'node2',
            stepId: 'fakeStepId2',
            stepType: 'fakeStepType2',
          } as GraphNodeUnion;
        case 'node3':
          return {
            id: 'node3',
            stepId: 'fakeStepId3',
            stepType: 'fakeStepType3',
          } as GraphNodeUnion;
      }
    });

    stepIoService = createPassthroughStepIoService(workflowExecutionState);

    underTest = new StepExecutionRuntime({
      node: fakeNode,
      stackFrames: fakeStackFrames,
      stepExecutionId: fakeStepExecutionId,
      contextManager: workflowContextManager,
      workflowExecutionGraph,
      stepLogger: workflowLogger,
      workflowExecutionState,
      stepIoService,
    });
  });

  describe('step result management', () => {
    beforeEach(() => {
      workflowExecutionState.getWorkflowExecution = jest.fn().mockReturnValue({
        id: 'testWorkflowExecutionId',
        scopeStack: [
          { stepId: 'firstScope', nestedScopes: [{ nodeId: 'node1' }] },
          { stepId: 'secondScope', nestedScopes: [{ nodeId: 'node2' }] },
        ] as StackFrame[],
        currentNodeId: 'node1',
      });
    });

    it('should be able to retrieve the step result', () => {
      (workflowExecutionState.getStepExecution as jest.Mock).mockReturnValue({
        stepId: 'node1',
        error: { type: 'Error', message: 'Fake error' },
      } as Partial<EsWorkflowStepExecution>);
      // IO lives in the service now — seed it through the passthrough mock.
      stepIoService.setStepInput(fakeStepExecutionId, {});
      stepIoService.setStepOutput(fakeStepExecutionId, { success: true, data: {} });

      const stepResult = underTest.getCurrentStepResult();
      expect(workflowExecutionState.getStepExecution).toHaveBeenCalledWith(
        `fake_step_execution_id`
      );
      expect(stepResult).toEqual({
        input: {},
        output: { success: true, data: {} },
        error: new ExecutionError({ type: 'Error', message: 'Fake error' }),
      });
    });
  });

  describe('step state management', () => {
    beforeEach(() => {
      workflowExecutionState.getWorkflowExecution = jest.fn().mockReturnValue({
        id: 'testWorkflowExecutionId',
        scopeStack: [
          { stepId: 'firstScope', nestedScopes: [{ nodeId: 'node1' }] },
          { stepId: 'secondScope', nestedScopes: [{ nodeId: 'node2' }] },
        ] as StackFrame[],
        currentNodeId: 'node1',
      });
    });

    it('should upsertStep with the fake step execution id', () => {
      underTest.setCurrentStepState({});
      expect(workflowExecutionState.upsertStep).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'fake_step_execution_id',
        } as Partial<EsWorkflowStepExecution>)
      );
    });

    it('should update the step execution with the state and be able to retrieve it', () => {
      (workflowExecutionState.getLatestStepExecution as jest.Mock).mockReturnValue({
        stepId: 'node1',
        state: { success: true, data: {} },
      } as Partial<EsWorkflowStepExecution>);
      const fakeState = { success: true, data: {} };
      underTest.setCurrentStepState(fakeState);

      expect(workflowExecutionState.upsertStep).toHaveBeenCalledWith(
        expect.objectContaining({
          stepId: 'fakeStepId1',
          state: fakeState,
        } as Partial<EsWorkflowStepExecution>)
      );
    });

    it('should be able to retrieve the step state', () => {
      (workflowExecutionState.getStepExecution as jest.Mock).mockReturnValue({
        stepId: 'fakeStepId1',
        state: { success: true, data: {} },
      } as Partial<EsWorkflowStepExecution>);
      const stepState = underTest.getCurrentStepState();
      expect(workflowExecutionState.getStepExecution).toHaveBeenCalledWith(
        `fake_step_execution_id`
      );
      expect(stepState).toEqual({ success: true, data: {} });
    });
  });

  describe('startStep', () => {
    beforeEach(() => {
      (workflowExecutionState.getStepExecutionsByStepId as jest.Mock).mockReturnValue([]);
      (workflowExecutionState.getWorkflowExecution as jest.Mock).mockReturnValue({
        id: 'testWorkflowExecutionId',
        scopeStack: [
          { stepId: 'firstScope', nestedScopes: [{ nodeId: 'node1' }] },
          { stepId: 'secondScope', nestedScopes: [{ nodeId: 'node2' }] },
        ] as StackFrame[],
        currentNodeId: 'node1',
      } as Partial<EsWorkflowExecution>);
      mockDateNow = new Date('2023-01-01T00:00:00.000Z');
    });

    it('should upsertStep with the fake step execution id', () => {
      underTest.startStep();

      expect(workflowExecutionState.upsertStep).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'fake_step_execution_id',
        } as Partial<EsWorkflowStepExecution>)
      );
    });

    it('should create a step execution with "RUNNING" status', () => {
      underTest.startStep();

      expect(workflowExecutionState.upsertStep).toHaveBeenCalledWith(
        expect.objectContaining({
          stepId: 'fakeStepId1',
          topologicalIndex: 0,
          status: ExecutionStatus.RUNNING,
          startedAt: mockDateNow.toISOString(),
        })
      );
    });

    it('should log the start of step execution', () => {
      underTest.startStep();
      expect(workflowLogger.logInfo).toHaveBeenCalledWith(`Step 'fakeStepId1' started`, {
        event: { action: 'step-start', category: ['workflow', 'step'] },
        tags: ['workflow', 'step', 'start'],
        workflow: {
          step_id: 'fakeStepId1',
          step_execution_id: 'fake_step_execution_id',
        },
        labels: {
          connector_type: 'fakeStepType1',
          step_id: 'fakeStepId1',
          step_name: 'fakeStepId1',
          step_type: 'fakeStepType1',
        },
      });
    });

    it('should save step path from the workflow execution stack', () => {
      underTest.startStep();
      expect(workflowExecutionState.upsertStep).toHaveBeenCalledWith(
        expect.objectContaining({
          scopeStack: [
            { stepId: 'firstScope', nestedScopes: [{ nodeId: 'node1' }] },
            { stepId: 'secondScope', nestedScopes: [{ nodeId: 'node2' }] },
          ] as StackFrame[],
        })
      );
    });

    it('should save step type', () => {
      underTest.startStep();
      expect(workflowExecutionState.upsertStep).toHaveBeenCalledWith(
        expect.objectContaining({
          stepType: 'fakeStepType1',
        })
      );
    });

    it('should preserve startedAt when step execution already exists (e.g. poll resume)', () => {
      const originalStartedAt = '2025-08-05T00:00:00.000Z';
      (workflowExecutionState.getStepExecution as jest.Mock).mockReturnValue({
        id: 'fake_step_execution_id',
        stepId: 'fakeStepId1',
        startedAt: originalStartedAt,
      } as Partial<EsWorkflowStepExecution>);
      mockDateNow = new Date('2025-08-06T00:00:00.000Z');

      underTest.startStep();

      expect(workflowExecutionState.upsertStep).toHaveBeenCalledWith(
        expect.objectContaining({
          startedAt: originalStartedAt,
        })
      );
    });
  });

  describe('finishStep', () => {
    beforeEach(() => {
      mockDateNow = new Date('2025-08-06T00:00:00.000Z');
      (workflowExecutionState.getStepExecution as jest.Mock).mockImplementation(
        (stepExecutionId) => {
          if (stepExecutionId === 'fake_step_execution_id') {
            return {
              stepId: 'fakeStepId1',
              startedAt: '2025-08-06T00:00:00.000Z',
            } as Partial<EsWorkflowStepExecution>;
          }
        }
      );
      workflowExecutionState.getWorkflowExecution = jest.fn().mockReturnValue({
        id: 'testWorkflowExecutionId',
        currentNodeId: 'node1',
        scopeStack: [
          { stepId: 'firstScope', nestedScopes: [{ nodeId: 'node1' }] },
          { stepId: 'secondScope', nestedScopes: [{ nodeId: 'node2' }] },
        ] as StackFrame[],
      });
    });

    it('should correctly calculate step finishedAt and executionTimeMs', () => {
      const expectedFinishedAt = new Date('2025-08-06T00:00:02.000Z');
      mockDateNow = expectedFinishedAt;
      underTest.finishStep();

      expect(workflowExecutionState.upsertStep).toHaveBeenCalledWith(
        expect.objectContaining({
          finishedAt: expectedFinishedAt.toISOString(),
          executionTimeMs: 2000,
        })
      );
    });

    describe('step execution succeeds', () => {
      beforeEach(() => {
        (workflowExecutionState.getStepExecution as jest.Mock).mockImplementation(
          (stepExecutionId) => {
            if (stepExecutionId === 'fake_step_execution_id') {
              return {
                stepId: 'node1',
                startedAt: '2025-08-05T00:00:00.000Z',
                output: { success: true, data: {} },
                error: undefined,
              } as Partial<EsWorkflowStepExecution>;
            }
          }
        );
      });

      it('should upsert step with the fake step execution id', () => {
        underTest.finishStep();

        expect(workflowExecutionState.upsertStep).toHaveBeenCalledWith(
          expect.objectContaining({
            id: 'fake_step_execution_id',
          } as Partial<EsWorkflowStepExecution>)
        );
      });

      it('should finish a step execution with "COMPLETED" status', () => {
        underTest.finishStep();

        expect(workflowExecutionState.upsertStep).toHaveBeenCalledWith(
          expect.objectContaining({
            status: ExecutionStatus.COMPLETED,
          })
        );
      });

      it('should finish a step execution executionTime', () => {
        underTest.finishStep();

        expect(workflowExecutionState.upsertStep).toHaveBeenCalledWith(
          expect.objectContaining({
            executionTimeMs: 86400000,
          })
        );
      });

      it('should extract token usage from output.metadata.usage and persist it on the step', () => {
        underTest.finishStep({
          message: 'hello',
          metadata: { usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 } },
        });

        expect(workflowExecutionState.upsertStep).toHaveBeenCalledWith(
          expect.objectContaining({
            usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
          })
        );
        expect(workflowExecutionState.accumulateUsage).toHaveBeenCalledWith({
          inputTokens: 100,
          outputTokens: 50,
          totalTokens: 150,
        });
      });

      it('should not tag usage on steps that do not report it', () => {
        underTest.finishStep({ message: 'hello' });

        expect(workflowExecutionState.upsertStep).toHaveBeenCalledWith(
          expect.not.objectContaining({ usage: expect.anything() })
        );
        expect(workflowExecutionState.accumulateUsage).toHaveBeenCalledWith(undefined);
      });

      it('should log successful step execution', () => {
        underTest.finishStep();
        expect(workflowLogger.logInfo).toHaveBeenCalledWith(`Step 'fakeStepId1' completed`, {
          event: {
            action: 'step-complete',
            category: ['workflow', 'step'],
            outcome: 'success',
          },
          tags: ['workflow', 'step', 'complete'],
          workflow: {
            step_id: 'fakeStepId1',
            step_execution_id: 'fake_step_execution_id',
          },
          labels: {
            connector_type: 'fakeStepType1',
            execution_time_ms: 86400000,
            step_id: 'fakeStepId1',
            step_name: 'fakeStepId1',
            step_type: 'fakeStepType1',
          },
        });
      });
    });
  });

  describe('tryEnterWaitUntil', () => {
    beforeEach(() => {
      workflowExecutionState.getWorkflowExecution = jest.fn().mockReturnValue({
        ...workflowExecution,
        currentNodeId: 'node1',
      });
    });

    describe('timer-based wait (resumeDate provided)', () => {
      it('should enter wait state and store resumeAt on first call', () => {
        (workflowExecutionState.getStepExecution as jest.Mock).mockReturnValue(undefined);

        const resumeDate = new Date('2025-12-31T00:00:00.000Z');
        const entered = underTest.tryEnterWaitUntil(resumeDate);

        expect(entered).toBe(true);
        expect(workflowExecutionState.upsertStep).toHaveBeenCalledWith(
          expect.objectContaining({
            status: ExecutionStatus.WAITING,
            state: expect.objectContaining({ resumeAt: resumeDate.toISOString() }),
          })
        );
      });

      it('should exit wait state and clear resumeAt when step already has resumeAt in state', () => {
        (workflowExecutionState.getStepExecution as jest.Mock).mockReturnValue({
          status: ExecutionStatus.WAITING,
          state: { resumeAt: '2025-12-31T00:00:00.000Z' },
        } as Partial<EsWorkflowStepExecution>);

        const entered = underTest.tryEnterWaitUntil(new Date('2025-12-31T00:00:00.000Z'));

        expect(entered).toBe(false);
        expect(workflowExecutionState.upsertStep).toHaveBeenCalledWith(
          expect.objectContaining({ state: undefined })
        );
      });

      it('should enter wait state even when status is WAITING but resumeAt is absent', () => {
        // Guards against the broad-detection bug: status alone must not trigger exit
        // for timer-based waits — only resumeAt is authoritative.
        (workflowExecutionState.getStepExecution as jest.Mock).mockReturnValue({
          status: ExecutionStatus.WAITING,
          state: {},
        } as Partial<EsWorkflowStepExecution>);

        const entered = underTest.tryEnterWaitUntil(new Date('2025-12-31T00:00:00.000Z'));

        expect(entered).toBe(true);
      });
    });

    describe('indefinite wait (resumeDate omitted)', () => {
      it('should enter wait state with WAITING_FOR_INPUT status on first call', () => {
        (workflowExecutionState.getStepExecution as jest.Mock).mockReturnValue(undefined);

        const entered = underTest.tryEnterWaitUntil(undefined, ExecutionStatus.WAITING_FOR_INPUT);

        expect(entered).toBe(true);
        expect(workflowExecutionState.upsertStep).toHaveBeenCalledWith(
          expect.objectContaining({ status: ExecutionStatus.WAITING_FOR_INPUT })
        );
      });

      it('should exit wait state on resume call when step status is already WAITING_FOR_INPUT', () => {
        // Simulates the resume run: stepExecution already has WAITING_FOR_INPUT status
        // and no resumeAt in state. Without the status-based check this would return true
        // (re-entering wait) instead of false (exiting wait) — the core bug being tested.
        (workflowExecutionState.getStepExecution as jest.Mock).mockReturnValue({
          status: ExecutionStatus.WAITING_FOR_INPUT,
          state: {},
        } as Partial<EsWorkflowStepExecution>);

        const entered = underTest.tryEnterWaitUntil(undefined, ExecutionStatus.WAITING_FOR_INPUT);

        expect(entered).toBe(false);
      });

      it('should not store resumeAt in state for indefinite waits', () => {
        (workflowExecutionState.getStepExecution as jest.Mock).mockReturnValue(undefined);

        underTest.tryEnterWaitUntil(undefined, ExecutionStatus.WAITING_FOR_INPUT);

        expect(workflowExecutionState.upsertStep).toHaveBeenCalledWith(
          expect.not.objectContaining({
            state: expect.objectContaining({ resumeAt: expect.anything() }),
          })
        );
      });

      it('should strip a residual resumeAt from prior state when entering an indefinite wait', () => {
        // Guards against a prior timer-based run leaving a resumeAt that leaks into
        // a subsequent indefinite wait record and confuses the scheduler.
        (workflowExecutionState.getStepExecution as jest.Mock).mockReturnValue({
          status: ExecutionStatus.RUNNING,
          state: { resumeAt: '2025-12-31T00:00:00.000Z', otherKey: 'kept' },
        } as Partial<EsWorkflowStepExecution>);

        underTest.tryEnterWaitUntil(undefined, ExecutionStatus.WAITING_FOR_INPUT);

        expect(workflowExecutionState.upsertStep).toHaveBeenCalledWith(
          expect.objectContaining({ state: { otherKey: 'kept' } })
        );
      });
    });
  });

  describe('failStep', () => {
    beforeEach(() => {
      workflowExecutionState.getWorkflowExecution = jest.fn().mockReturnValue({
        id: 'testWorkflowExecutionId',
        scopeStack: [
          { stepId: 'firstScope', nestedScopes: [{ nodeId: 'node1' }] },
          { stepId: 'secondScope', nestedScopes: [{ nodeId: 'node2' }] },
        ] as StackFrame[],
        currentNodeId: 'node1',
      });
    });

    it('should upsert step with the fake step execution id', () => {
      const error = new Error('Step execution failed');
      underTest.failStep(error);

      expect(workflowExecutionState.upsertStep).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'fake_step_execution_id',
        } as Partial<EsWorkflowStepExecution>)
      );
    });

    it.each([
      {
        testName: 'JS error',
        inputError: new Error('Step execution failed'),
        expectedError: { type: 'Error', message: 'Step execution failed' },
      },
      {
        testName: 'execution error',
        inputError: new ExecutionError({ type: 'CustomError', message: 'Custom step error' }),
        expectedError: { type: 'CustomError', message: 'Custom step error' },
      },
    ])(
      'should mark the step as failed and map "$testName" error to execution error',
      async (testCase) => {
        const { inputError, expectedError } = testCase;
        await underTest.failStep(inputError);

        expect(workflowExecutionState.upsertStep).toHaveBeenCalledWith(
          expect.objectContaining({
            status: ExecutionStatus.FAILED,
            error: expectedError,
          })
        );
      }
    );

    it('should extract and accumulate partial token usage from partial output on failure', () => {
      underTest.failStep(new Error('stream interrupted'), {
        message: '',
        metadata: { usage: { inputTokens: 150, outputTokens: 60, totalTokens: 210 } },
      });

      expect(workflowExecutionState.upsertStep).toHaveBeenCalledWith(
        expect.objectContaining({
          status: ExecutionStatus.FAILED,
          usage: { inputTokens: 150, outputTokens: 60, totalTokens: 210 },
        })
      );
      expect(workflowExecutionState.accumulateUsage).toHaveBeenCalledWith({
        inputTokens: 150,
        outputTokens: 60,
        totalTokens: 210,
      });
    });

    it('should not accumulate usage when failing without partial output', () => {
      underTest.failStep(new Error('boom'));
      expect(workflowExecutionState.accumulateUsage).toHaveBeenCalledWith(undefined);
    });

    it('should log the failure of the step', () => {
      const error = new Error('Step execution failed');
      underTest.failStep(error);

      expect(workflowLogger.logError).toHaveBeenCalledWith(
        `Step 'fakeStepId1' failed: Step execution failed`,
        error,
        {
          event: { action: 'step-fail', category: ['workflow', 'step'] },
          tags: ['workflow', 'step', 'fail'],
          labels: {
            step_type: 'fakeStepType1',
            connector_type: 'fakeStepType1',
            step_name: 'fakeStepId1',
            step_id: 'fakeStepId1',
          },
          workflow: {
            step_execution_id: 'fake_step_execution_id',
            step_id: 'fakeStepId1',
          },
        }
      );
    });

    it('should use stepId as stepName for setLastFailedStepContext when configuration.name is not a string', () => {
      const nodeWithNonStringName = {
        ...fakeNode,
        configuration: { name: 42 },
      } as GraphNodeUnion;

      const runtime = new StepExecutionRuntime({
        node: nodeWithNonStringName,
        stackFrames: fakeStackFrames,
        stepExecutionId: fakeStepExecutionId,
        contextManager: workflowContextManager,
        workflowExecutionGraph,
        stepLogger: workflowLogger,
        workflowExecutionState,
        stepIoService,
      });

      runtime.failStep(new Error('fail'));

      expect(workflowExecutionState.setLastFailedStepContext).toHaveBeenCalledWith({
        stepId: 'fakeStepId1',
        stepName: 'fakeStepId1',
        stepExecutionId: fakeStepExecutionId,
      });
    });

    it('should use configuration.name for setLastFailedStepContext when it is a string', () => {
      const nodeWithDisplayName = {
        ...fakeNode,
        configuration: { name: 'Display name' },
      } as GraphNodeUnion;

      const runtime = new StepExecutionRuntime({
        node: nodeWithDisplayName,
        stackFrames: fakeStackFrames,
        stepExecutionId: fakeStepExecutionId,
        contextManager: workflowContextManager,
        workflowExecutionGraph,
        stepLogger: workflowLogger,
        workflowExecutionState,
        stepIoService,
      });

      runtime.failStep(new Error('fail'));

      expect(workflowExecutionState.setLastFailedStepContext).toHaveBeenCalledWith({
        stepId: 'fakeStepId1',
        stepName: 'Display name',
        stepExecutionId: fakeStepExecutionId,
      });
    });
  });
});
