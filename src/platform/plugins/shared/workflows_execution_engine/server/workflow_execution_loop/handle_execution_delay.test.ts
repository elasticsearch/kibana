/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import {
  ExecutionStatus,
  WORKFLOW_EXECUTE_ASYNC_STEP_TYPE,
  WORKFLOW_EXECUTE_STEP_TYPE,
} from '@kbn/workflows';
import {
  ensureWorkflowIdleTimeoutResumeAfterLoop,
  getWorkflowIdleTimeoutResumeAtAfterLoop,
  handleExecutionDelay,
} from './handle_execution_delay';
import type { WorkflowExecutionLoopParams } from './types';
import {
  createMockWorkflowExecutionCursor,
  type MockWorkflowExecutionCursorOptions,
} from '../workflow_context_manager/mocks/workflow_execution_cursor.mock';
import type { StepExecutionRuntime } from '../workflow_context_manager/step_execution_runtime';
const makeParams = (
  cursorOptions: MockWorkflowExecutionCursorOptions = {}
): jest.Mocked<WorkflowExecutionLoopParams> =>
  ({
    workflowRuntime: {
      getWorkflowExecution: jest.fn().mockReturnValue({
        id: 'exec-parent',
        startedAt: '2025-06-01T12:00:00.000Z',
        scopeStack: [],
      }),
      getCurrentNode: jest.fn().mockReturnValue(undefined),
    },
    workflowExecutionCursor: createMockWorkflowExecutionCursor(cursorOptions),
    workflowExecutionState: {
      updateWorkflowExecution: jest.fn(),
      getLatestStepExecution: jest.fn().mockReturnValue(undefined),
    },
    workflowTaskManager: {
      scheduleResumeTask: jest.fn().mockResolvedValue({ taskId: 'resume-task-1' }),
      scheduleWorkflowGlobalTimeoutResumeTask: jest
        .fn()
        .mockResolvedValue({ taskId: 'wf-global-timeout-1' }),
    },
    fakeRequest: {},
    workflowExecutionGraph: {
      getWorkflowLevelTimeout: jest.fn().mockReturnValue(undefined),
      getNode: jest.fn().mockReturnValue(undefined),
    },
    workflowLogger: {
      logWarn: jest.fn(),
      flushEvents: jest.fn().mockResolvedValue(undefined),
    },
    stepIoService: {
      flush: jest.fn().mockResolvedValue(undefined),
    },
  } as unknown as jest.Mocked<WorkflowExecutionLoopParams>);

const makeStepRuntime = (
  overrides: Partial<StepExecutionRuntime> = {}
): jest.Mocked<StepExecutionRuntime> =>
  ({
    stepExecution: undefined,
    abortController: new AbortController(),
    node: { stepType: 'wait' },
    ...overrides,
  } as unknown as jest.Mocked<StepExecutionRuntime>);

describe('handleExecutionDelay', () => {
  it.each([
    ExecutionStatus.WAITING,
    ExecutionStatus.WAITING_FOR_INPUT,
    ExecutionStatus.WAITING_FOR_CHILD,
  ])('rejects asynchronous resume status %s in sync mode', async (status) => {
    const params = makeParams();
    params.executionMode = 'sync';
    const stepRuntime = makeStepRuntime({
      node: { stepId: 'blocking-step', stepType: 'wait' } as any,
      stepExecution: { status } as any,
    });

    await expect(handleExecutionDelay(params, stepRuntime)).rejects.toThrow(
      'is not supported in synchronous workflows'
    );
    expect(params.workflowTaskManager.scheduleResumeTask).not.toHaveBeenCalled();
    expect(
      params.workflowTaskManager.scheduleWorkflowGlobalTimeoutResumeTask
    ).not.toHaveBeenCalled();
  });

  describe('WAITING_FOR_INPUT step (HITL)', () => {
    it('should set workflow status to WAITING_FOR_INPUT', async () => {
      const params = makeParams();
      const stepRuntime = makeStepRuntime({
        stepExecution: { status: ExecutionStatus.WAITING_FOR_INPUT } as any,
      });

      await handleExecutionDelay(params, stepRuntime);

      expect(params.workflowExecutionState.updateWorkflowExecution).toHaveBeenCalledWith({
        status: ExecutionStatus.WAITING_FOR_INPUT,
      });
    });

    it('should not schedule workflow timeout resume when the graph has no workflow-level timeout', async () => {
      const params = makeParams();
      const stepRuntime = makeStepRuntime({
        stepExecution: { status: ExecutionStatus.WAITING_FOR_INPUT } as any,
      });

      await handleExecutionDelay(params, stepRuntime);

      expect(
        params.workflowTaskManager.scheduleWorkflowGlobalTimeoutResumeTask
      ).not.toHaveBeenCalled();
    });

    it('should schedule approval deadline for waitForApproval without workflow-level timeout', async () => {
      jest.useFakeTimers();
      try {
        jest.setSystemTime(new Date('2025-06-01T12:00:15.000Z'));
        const params = makeParams();
        const stepRuntime = makeStepRuntime({
          node: {
            type: 'waitForApproval',
            stepType: 'waitForApproval',
            configuration: { timeout: '30s' },
          } as any,
          stepExecution: {
            status: ExecutionStatus.WAITING_FOR_INPUT,
            startedAt: '2025-06-01T12:00:00.000Z',
          } as any,
        });

        await handleExecutionDelay(params, stepRuntime);

        expect(
          params.workflowTaskManager.scheduleWorkflowGlobalTimeoutResumeTask
        ).toHaveBeenCalledTimes(1);
        const call = (
          params.workflowTaskManager.scheduleWorkflowGlobalTimeoutResumeTask as jest.Mock
        ).mock.calls[0][0];
        expect(call.resumeAt.toISOString()).toBe('2025-06-01T12:00:30.000Z');
      } finally {
        jest.useRealTimers();
      }
    });

    it('should schedule input deadline for waitForInput without workflow-level timeout', async () => {
      jest.useFakeTimers();
      try {
        jest.setSystemTime(new Date('2025-06-01T12:00:15.000Z'));
        const params = makeParams();
        const stepRuntime = makeStepRuntime({
          node: {
            type: 'waitForInput',
            stepType: 'waitForInput',
            configuration: { timeout: '30s' },
          } as any,
          stepExecution: {
            status: ExecutionStatus.WAITING_FOR_INPUT,
            startedAt: '2025-06-01T12:00:00.000Z',
          } as any,
        });

        await handleExecutionDelay(params, stepRuntime);

        expect(
          params.workflowTaskManager.scheduleWorkflowGlobalTimeoutResumeTask
        ).toHaveBeenCalledTimes(1);
        const call = (
          params.workflowTaskManager.scheduleWorkflowGlobalTimeoutResumeTask as jest.Mock
        ).mock.calls[0][0];
        expect(call.resumeAt.toISOString()).toBe('2025-06-01T12:00:30.000Z');
      } finally {
        jest.useRealTimers();
      }
    });

    it('should schedule workflow timeout resume at startedAt + timeout when workflow-level timeout exists', async () => {
      jest.useFakeTimers();
      try {
        jest.setSystemTime(new Date('2025-06-01T13:00:00.000Z'));
        const params = makeParams();
        (params.workflowExecutionGraph.getWorkflowLevelTimeout as jest.Mock).mockReturnValue('2h');

        const stepRuntime = makeStepRuntime({
          stepExecution: { status: ExecutionStatus.WAITING_FOR_INPUT } as any,
        });

        await handleExecutionDelay(params, stepRuntime);

        expect(
          params.workflowTaskManager.scheduleWorkflowGlobalTimeoutResumeTask
        ).toHaveBeenCalledTimes(1);
        const call = (
          params.workflowTaskManager.scheduleWorkflowGlobalTimeoutResumeTask as jest.Mock
        ).mock.calls[0][0];
        expect(call.workflowExecution).toEqual(
          expect.objectContaining({
            id: 'exec-parent',
            startedAt: '2025-06-01T12:00:00.000Z',
          })
        );
        expect(call.resumeAt.toISOString()).toBe('2025-06-01T14:00:00.000Z');
      } finally {
        jest.useRealTimers();
      }
    });

    it.each([
      {
        label: 'step deadline before workflow global',
        nowIso: '2025-06-01T12:00:15.000Z',
        workflowLevelTimeout: '10m',
      },
      {
        label: 'step deadline with no workflow-level timeout',
        nowIso: '2025-06-01T12:00:10.000Z',
        workflowLevelTimeout: undefined as string | undefined,
      },
    ])(
      'should schedule idle resume from enclosing step timeout ($label)',
      async ({ nowIso, workflowLevelTimeout }) => {
        jest.useFakeTimers();
        try {
          jest.setSystemTime(new Date(nowIso));
          const params = makeParams({
            currentStackFrames: [
              {
                stepId: 'timedParent',
                nestedScopes: [
                  {
                    nodeId: 'enterTimeoutZone_timedParent',
                    nodeType: 'enter-timeout-zone',
                  },
                ],
              },
            ],
          });
          (params.workflowExecutionGraph.getWorkflowLevelTimeout as jest.Mock).mockReturnValue(
            workflowLevelTimeout
          );
          (params.workflowExecutionGraph.getNode as jest.Mock).mockImplementation(
            (nodeId: string) => {
              if (nodeId === 'enterTimeoutZone_timedParent') {
                return {
                  id: 'enterTimeoutZone_timedParent',
                  type: 'enter-timeout-zone',
                  stepId: 'timedParent',
                  stepType: 'step_level_timeout',
                  timeout: '30s',
                };
              }
              return undefined;
            }
          );
          (params.workflowExecutionState.getLatestStepExecution as jest.Mock).mockImplementation(
            (stepId: string) => {
              if (stepId === 'timedParent') {
                return { startedAt: '2025-06-01T12:00:00.000Z' };
              }
              return undefined;
            }
          );

          const stepRuntime = makeStepRuntime({
            stepExecution: { status: ExecutionStatus.WAITING_FOR_INPUT } as any,
          });

          await handleExecutionDelay(params, stepRuntime);

          expect(
            params.workflowTaskManager.scheduleWorkflowGlobalTimeoutResumeTask
          ).toHaveBeenCalledTimes(1);
          const call = (
            params.workflowTaskManager.scheduleWorkflowGlobalTimeoutResumeTask as jest.Mock
          ).mock.calls[0][0];
          expect(call.resumeAt.toISOString()).toBe('2025-06-01T12:00:30.000Z');
        } finally {
          jest.useRealTimers();
        }
      }
    );
  });

  describe('WAITING_FOR_CHILD step (sync child workflow)', () => {
    it('should set workflow status to WAITING_FOR_CHILD', async () => {
      const params = makeParams();
      const stepRuntime = makeStepRuntime({
        node: { stepType: WORKFLOW_EXECUTE_STEP_TYPE } as any,
        stepExecution: { status: ExecutionStatus.WAITING_FOR_CHILD } as any,
      });

      await handleExecutionDelay(params, stepRuntime);

      expect(params.workflowExecutionState.updateWorkflowExecution).toHaveBeenCalledWith({
        status: ExecutionStatus.WAITING_FOR_CHILD,
      });
      expect(
        params.workflowTaskManager.scheduleWorkflowGlobalTimeoutResumeTask
      ).not.toHaveBeenCalled();
    });

    it('should schedule workflow timeout resume when WAITING_FOR_CHILD and workflow-level timeout exists', async () => {
      jest.useFakeTimers();
      try {
        jest.setSystemTime(new Date('2025-06-01T13:00:00.000Z'));
        const params = makeParams();
        (params.workflowExecutionGraph.getWorkflowLevelTimeout as jest.Mock).mockReturnValue('2h');

        const stepRuntime = makeStepRuntime({
          node: { stepType: WORKFLOW_EXECUTE_STEP_TYPE } as any,
          stepExecution: { status: ExecutionStatus.WAITING_FOR_CHILD } as any,
        });

        await handleExecutionDelay(params, stepRuntime);

        expect(
          params.workflowTaskManager.scheduleWorkflowGlobalTimeoutResumeTask
        ).toHaveBeenCalledTimes(1);
      } finally {
        jest.useRealTimers();
      }
    });
  });

  describe('non-waiting step (no-op)', () => {
    it('should not update workflow status when step has no execution', async () => {
      const params = makeParams();
      const stepRuntime = makeStepRuntime({ stepExecution: undefined });

      await handleExecutionDelay(params, stepRuntime);

      expect(params.workflowExecutionState.updateWorkflowExecution).not.toHaveBeenCalled();
    });

    it('should not update workflow status when step is RUNNING', async () => {
      const params = makeParams();
      const stepRuntime = makeStepRuntime({
        stepExecution: { status: ExecutionStatus.RUNNING } as any,
      });

      await handleExecutionDelay(params, stepRuntime);

      expect(params.workflowExecutionState.updateWorkflowExecution).not.toHaveBeenCalled();
    });
  });

  describe('missing resumeAt', () => {
    it('returns early without scheduling when resumeAt is not a string', async () => {
      const params = makeParams();
      const stepRuntime = makeStepRuntime({
        stepExecution: {
          status: ExecutionStatus.WAITING,
          state: {},
        } as any,
      });

      await handleExecutionDelay(params, stepRuntime);

      expect(params.workflowTaskManager.scheduleResumeTask).not.toHaveBeenCalled();
      expect(params.workflowExecutionState.updateWorkflowExecution).not.toHaveBeenCalled();
    });
  });

  describe('short wait (< 5s) in-process', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('sleeps in-process without changing workflow status, flushing, or parking on TM', async () => {
      const params = makeParams();
      const resumeAt = new Date(Date.now() + 100).toISOString();
      const stepRuntime = makeStepRuntime({
        node: { stepType: 'wait' } as any,
        stepExecution: {
          status: ExecutionStatus.WAITING,
          state: { resumeAt },
        } as any,
      });

      const delayPromise = handleExecutionDelay(params, stepRuntime);
      await jest.advanceTimersByTimeAsync(100);
      await delayPromise;

      expect(params.workflowTaskManager.scheduleResumeTask).not.toHaveBeenCalled();
      expect(params.stepIoService.flush).not.toHaveBeenCalled();
      expect(params.workflowExecutionState.updateWorkflowExecution).not.toHaveBeenCalled();
      expect(params.workflowExecutionCursor.stop).not.toHaveBeenCalled();
    });

    it('workflow.executeAsync uses short in-process path like other steps', async () => {
      const params = makeParams();
      const resumeAt = new Date(Date.now() + 100).toISOString();
      const stepRuntime = makeStepRuntime({
        node: { stepType: WORKFLOW_EXECUTE_ASYNC_STEP_TYPE } as any,
        stepExecution: {
          status: ExecutionStatus.WAITING,
          state: { resumeAt },
        } as any,
      });

      const delayPromise = handleExecutionDelay(params, stepRuntime);
      await jest.advanceTimersByTimeAsync(100);
      await delayPromise;

      expect(params.workflowTaskManager.scheduleResumeTask).not.toHaveBeenCalled();
      expect(params.workflowExecutionState.updateWorkflowExecution).not.toHaveBeenCalled();
      expect(params.workflowExecutionCursor.stop).not.toHaveBeenCalled();
    });
  });

  describe('short wait — abort during in-process sleep (real timers)', () => {
    it('on step abort during sleep does not change workflow status (cancel / interrupt path)', async () => {
      const params = makeParams();
      const resumeAt = new Date(Date.now() + 3000).toISOString();
      const ac = new AbortController();
      const stepRuntime = makeStepRuntime({
        node: { stepType: 'wait' } as any,
        abortController: ac,
        stepExecution: {
          status: ExecutionStatus.WAITING,
          state: { resumeAt },
        } as any,
      });

      queueMicrotask(() => ac.abort());

      await handleExecutionDelay(params, stepRuntime);

      expect(params.workflowTaskManager.scheduleResumeTask).not.toHaveBeenCalled();
      expect(params.workflowExecutionState.updateWorkflowExecution).not.toHaveBeenCalled();
      expect(params.workflowExecutionCursor.stop).not.toHaveBeenCalled();
    });
  });

  describe('long wait (>= 5s) schedules TM resume task', () => {
    it('schedules resume task and sets workflow status to WAITING', async () => {
      const params = makeParams();
      const resumeAtDate = new Date(Date.now() + 8000);
      const resumeAt = resumeAtDate.toISOString();
      const stepRuntime = makeStepRuntime({
        node: { stepType: 'wait' } as any,
        stepExecution: {
          status: ExecutionStatus.WAITING,
          state: { resumeAt },
        } as any,
      });

      await handleExecutionDelay(params, stepRuntime);

      expect(params.stepIoService.flush).not.toHaveBeenCalled();
      expect(params.workflowTaskManager.scheduleResumeTask).toHaveBeenCalledTimes(1);
      const call = (params.workflowTaskManager.scheduleResumeTask as jest.Mock).mock.calls[0][0];
      expect(call.workflowExecution).toEqual(expect.objectContaining({ id: 'exec-parent' }));
      expect(call.resumeAt.getTime()).toBe(resumeAtDate.getTime());
      expect(params.workflowExecutionState.updateWorkflowExecution).toHaveBeenCalledWith({
        status: ExecutionStatus.WAITING,
      });
      expect(params.workflowExecutionCursor.stop).toHaveBeenCalledTimes(1);
    });
  });

  describe('resumeAt in the past', () => {
    it('uses 0ms in-process sleep (no negative timeout)', async () => {
      const params = makeParams();
      const resumeAt = new Date(Date.now() - 5000).toISOString();
      const stepRuntime = makeStepRuntime({
        node: { stepType: 'wait' } as any,
        stepExecution: {
          status: ExecutionStatus.WAITING,
          state: { resumeAt },
        } as any,
      });

      await handleExecutionDelay(params, stepRuntime);

      expect(params.workflowTaskManager.scheduleResumeTask).not.toHaveBeenCalled();
      expect(params.workflowExecutionState.updateWorkflowExecution).not.toHaveBeenCalled();
    });
  });

  describe('exact 5s boundary', () => {
    it('diff exactly at SHORT_DURATION_THRESHOLD goes to TM path', async () => {
      jest.useFakeTimers();
      try {
        jest.setSystemTime(new Date('2025-06-01T12:00:00.000Z'));
        const params = makeParams();
        const resumeAt = new Date(Date.now() + 5000).toISOString();
        const stepRuntime = makeStepRuntime({
          node: { stepType: 'wait' } as any,
          stepExecution: {
            status: ExecutionStatus.WAITING,
            state: { resumeAt },
          } as any,
        });

        await handleExecutionDelay(params, stepRuntime);

        expect(params.workflowTaskManager.scheduleResumeTask).toHaveBeenCalledTimes(1);
        expect(params.stepIoService.flush).not.toHaveBeenCalled();
        expect(params.workflowExecutionState.updateWorkflowExecution).toHaveBeenCalledWith({
          status: ExecutionStatus.WAITING,
        });
        expect(params.workflowExecutionCursor.stop).toHaveBeenCalledTimes(1);
      } finally {
        jest.useRealTimers();
      }
    });
  });

  describe('forceTaskSchedule parks on TM even for short remaining delay', () => {
    it('schedules resume and sets WAITING when forceTaskSchedule is set', async () => {
      const params = makeParams();
      const resumeAtDate = new Date(Date.now() + 500);
      const stepRuntime = makeStepRuntime({
        node: { stepType: 'wait' } as any,
        stepExecution: {
          status: ExecutionStatus.WAITING,
          state: { resumeAt: resumeAtDate.toISOString(), forceTaskSchedule: true },
        } as any,
      });

      await handleExecutionDelay(params, stepRuntime);

      expect(params.workflowTaskManager.scheduleResumeTask).toHaveBeenCalledTimes(1);
      expect(params.workflowExecutionState.updateWorkflowExecution).toHaveBeenCalledWith({
        status: ExecutionStatus.WAITING,
      });
      expect(params.workflowExecutionCursor.stop).toHaveBeenCalledTimes(1);
    });
  });

  describe('TM scheduling errors', () => {
    it('propagates scheduleResumeTask failure', async () => {
      const params = makeParams();
      (params.workflowTaskManager.scheduleResumeTask as jest.Mock).mockRejectedValue(
        new Error('task manager unavailable')
      );
      const resumeAt = new Date(Date.now() + 8000).toISOString();
      const stepRuntime = makeStepRuntime({
        node: { stepType: 'wait' } as any,
        stepExecution: {
          status: ExecutionStatus.WAITING,
          state: { resumeAt },
        } as any,
      });

      await expect(handleExecutionDelay(params, stepRuntime)).rejects.toThrow(
        'task manager unavailable'
      );
    });
  });
});

describe('getWorkflowIdleTimeoutResumeAtAfterLoop', () => {
  it('returns a future runAt when execution is still waiting for input', () => {
    const params = makeParams();
    (params.workflowRuntime.getWorkflowExecution as jest.Mock).mockReturnValue({
      id: 'exec-parent',
      status: ExecutionStatus.WAITING_FOR_INPUT,
      startedAt: '2025-06-01T12:00:00.000Z',
      scopeStack: [],
    });
    (params.workflowRuntime.getCurrentNode as jest.Mock).mockReturnValue({
      stepId: 'app',
      type: 'waitForApproval',
      configuration: { timeout: '24h' },
    });
    (params.workflowExecutionState.getLatestStepExecution as jest.Mock).mockReturnValue({
      startedAt: '2025-06-01T12:00:00.000Z',
    });

    const resumeAt = getWorkflowIdleTimeoutResumeAtAfterLoop(params);

    expect(resumeAt).toBeInstanceOf(Date);
    expect(resumeAt!.getTime()).toBeGreaterThan(Date.now());
  });
});

describe('ensureWorkflowIdleTimeoutResumeAfterLoop', () => {
  it('schedules the global-timeout resume task when execution is still waiting for input', async () => {
    const params = makeParams();
    (params.workflowRuntime.getWorkflowExecution as jest.Mock).mockReturnValue({
      id: 'exec-parent',
      status: ExecutionStatus.WAITING_FOR_INPUT,
      startedAt: '2025-06-01T12:00:00.000Z',
      scopeStack: [],
    });
    (params.workflowRuntime.getCurrentNode as jest.Mock).mockReturnValue({
      stepId: 'app',
      type: 'waitForApproval',
      configuration: { timeout: '24h' },
    });
    (params.workflowExecutionState.getLatestStepExecution as jest.Mock).mockReturnValue({
      startedAt: '2025-06-01T12:00:00.000Z',
    });

    await ensureWorkflowIdleTimeoutResumeAfterLoop(params);

    expect(
      params.workflowTaskManager.scheduleWorkflowGlobalTimeoutResumeTask
    ).toHaveBeenCalledTimes(1);
  });

  it('does nothing when execution is not waiting', async () => {
    const params = makeParams();
    (params.workflowRuntime.getWorkflowExecution as jest.Mock).mockReturnValue({
      id: 'exec-parent',
      status: ExecutionStatus.RUNNING,
      startedAt: '2025-06-01T12:00:00.000Z',
      scopeStack: [],
    });

    await ensureWorkflowIdleTimeoutResumeAfterLoop(params);

    expect(
      params.workflowTaskManager.scheduleWorkflowGlobalTimeoutResumeTask
    ).not.toHaveBeenCalled();
  });
});
