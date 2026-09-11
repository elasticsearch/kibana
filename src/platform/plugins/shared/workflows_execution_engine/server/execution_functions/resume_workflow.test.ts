/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { KibanaRequest, Logger } from '@kbn/core/server';
import { elasticsearchServiceMock, loggingSystemMock } from '@kbn/core/server/mocks';
import { ExecutionStatus } from '@kbn/workflows';
import { WORKFLOW_EXECUTION_FAILED_TRIGGER_ID } from '@kbn/workflows-extensions/server';

import { mockContextDependencies } from './__mock__/context_dependencies';
import {
  buildMockSetupDependenciesReturn,
  createFakeKibanaRequest,
  createMockLogger,
  createMockStepExecutionRepository,
  createMockWorkflowExecutionEngineConfig,
  createMockWorkflowExecutionRepository,
  createMockWorkflowRuntime,
  getExpectedWorkflowExecutionLoopCallArgs,
} from './execution_functions_test_utils';
import { resumeWorkflow } from './resume_workflow';
import { setupDependencies } from './setup_dependencies';
import type { WorkflowsMeteringService } from '../metering';
import { workflowsExecutionEngineMock } from '../mocks';
import type { WorkflowsExecutionEnginePluginStart } from '../types';
import { workflowExecutionLoop } from '../workflow_execution_loop';

jest.mock('./setup_dependencies');
jest.mock('../workflow_execution_loop', () => ({
  workflowExecutionLoop: jest.fn().mockResolvedValue(undefined),
}));

const mockSetupDependencies = setupDependencies as jest.MockedFunction<typeof setupDependencies>;
const mockWorkflowExecutionLoop = workflowExecutionLoop as jest.MockedFunction<
  typeof workflowExecutionLoop
>;

const mockWorkflowExecutionEngine = workflowsExecutionEngineMock.createStart();

describe('resumeWorkflow', () => {
  describe('terminal state and resume gating', () => {
    const workflowRunId = 'run-1';
    const spaceId = 'default';
    const logger = loggingSystemMock.create().get();
    const fakeRequest = { headers: {} } as KibanaRequest;
    let dependencies: ReturnType<typeof mockContextDependencies>;
    let mockGetWorkflowExecutionById: jest.Mock;
    let mockGetLastFailedStepContext: jest.Mock;
    let mockGetWorkflowExecutionStatus: jest.Mock;
    let mockGetWorkflowExecution: jest.Mock;
    let mockStateGetWorkflowExecution: jest.Mock;
    const mockWorkflowExecutionRepositoryForResume = createMockWorkflowExecutionRepository();
    const mockStepExecutionRepositoryForResume = createMockStepExecutionRepository();

    /** After a successful loop, `emitWorkflowExecutionFailedEventIfFailed` still runs in `finally`. */
    const nonFailedRuntimeMethods = () => ({
      getWorkflowExecutionStatus: jest.fn().mockReturnValue(ExecutionStatus.COMPLETED),
      getWorkflowExecution: jest.fn().mockReturnValue({
        isTestRun: false,
        status: ExecutionStatus.COMPLETED,
      }),
    });

    beforeEach(() => {
      jest.clearAllMocks();
      dependencies = mockContextDependencies();
      mockGetWorkflowExecutionById = jest.fn().mockResolvedValue(null);
      mockGetLastFailedStepContext = jest.fn().mockReturnValue(undefined);
      mockGetWorkflowExecutionStatus = jest.fn();
      mockGetWorkflowExecution = jest.fn();
      mockStateGetWorkflowExecution = jest
        .fn()
        .mockReturnValue({ status: ExecutionStatus.WAITING });

      mockSetupDependencies.mockResolvedValue({
        workflowRuntime: {
          resume: jest.fn().mockResolvedValue(undefined),
          getWorkflowExecutionStatus: mockGetWorkflowExecutionStatus,
          getWorkflowExecution: mockGetWorkflowExecution,
        },
        stepExecutionRuntimeFactory: {},
        workflowExecutionState: {
          getLastFailedStepContext: mockGetLastFailedStepContext,
          getWorkflowExecution: mockStateGetWorkflowExecution,
        },
        workflowLogger: {},
        nodesFactory: {},
        workflowExecutionGraph: {},
        workflowTaskManager: {},
        workflowExecutionRepository: {
          getWorkflowExecutionById: mockGetWorkflowExecutionById,
        },
        esClient: elasticsearchServiceMock.createElasticsearchClient(),
      } as never);
    });

    it('does not resume or run loop when execution is already terminal', async () => {
      const resume = jest.fn().mockResolvedValue(undefined);
      mockSetupDependencies.mockResolvedValue({
        workflowRuntime: { resume, ...nonFailedRuntimeMethods() },
        stepExecutionRuntimeFactory: {},
        workflowExecutionState: {
          getWorkflowExecution: () => ({
            status: ExecutionStatus.COMPLETED,
          }),
        },
        workflowLogger: {},
        nodesFactory: {},
        workflowExecutionGraph: {},
        esClient: {},
        workflowTaskManager: {},
        workflowExecutionRepository: {},
      } as never);

      await resumeWorkflow({
        workflowRunId,
        spaceId,
        signal: new AbortController().signal,
        dependencies,
        logger: logger as Logger,
        config: { logging: { console: false }, http: { allowedHosts: ['*'] } } as never,
        fakeRequest,
        workflowsExecutionEngine: mockWorkflowExecutionEngine,
        workflowExecutionRepository: mockWorkflowExecutionRepositoryForResume as any,
        stepExecutionRepository: mockStepExecutionRepositoryForResume,
      });

      expect(resume).not.toHaveBeenCalled();
      expect(mockWorkflowExecutionLoop).not.toHaveBeenCalled();
    });

    it('runs resume and loop when execution is not terminal', async () => {
      const resume = jest.fn().mockResolvedValue(undefined);
      mockSetupDependencies.mockResolvedValue({
        workflowRuntime: {
          resume,
          ...nonFailedRuntimeMethods(),
        },
        stepExecutionRuntimeFactory: {},
        workflowExecutionState: {
          getWorkflowExecution: () => ({
            status: ExecutionStatus.WAITING,
          }),
        },
        workflowLogger: {},
        nodesFactory: {},
        workflowExecutionGraph: {},
        esClient: {},
        workflowTaskManager: {},
        workflowExecutionRepository: {
          getWorkflowExecutionById: jest.fn().mockResolvedValue(null),
        },
      } as never);

      await resumeWorkflow({
        workflowRunId,
        spaceId,
        signal: new AbortController().signal,
        dependencies,
        logger: logger as Logger,
        config: { logging: { console: false }, http: { allowedHosts: ['*'] } } as never,
        fakeRequest,
        workflowsExecutionEngine: mockWorkflowExecutionEngine,
        workflowExecutionRepository: mockWorkflowExecutionRepositoryForResume as any,
        stepExecutionRepository: mockStepExecutionRepositoryForResume,
      });

      expect(resume).toHaveBeenCalledTimes(1);
      expect(mockWorkflowExecutionLoop).toHaveBeenCalledTimes(1);
    });

    it.each([
      ['FAILED', ExecutionStatus.FAILED],
      ['CANCELLED', ExecutionStatus.CANCELLED],
      ['SKIPPED', ExecutionStatus.SKIPPED],
      ['COMPLETED', ExecutionStatus.COMPLETED],
      ['TIMED_OUT', ExecutionStatus.TIMED_OUT],
    ] as const)('skips resume when already %s (stale TM / duplicate resume)', async (_, status) => {
      const resume = jest.fn().mockResolvedValue(undefined);
      mockSetupDependencies.mockResolvedValue({
        workflowRuntime: { resume, ...nonFailedRuntimeMethods() },
        stepExecutionRuntimeFactory: {},
        workflowExecutionState: {
          getWorkflowExecution: () => ({ status }),
        },
        workflowLogger: {},
        nodesFactory: {},
        workflowExecutionGraph: {},
        esClient: {},
        workflowTaskManager: {},
        workflowExecutionRepository: {},
      } as never);

      await resumeWorkflow({
        workflowRunId,
        spaceId,
        signal: new AbortController().signal,
        dependencies,
        logger: logger as Logger,
        config: { logging: { console: false }, http: { allowedHosts: ['*'] } } as never,
        fakeRequest,
        workflowsExecutionEngine: mockWorkflowExecutionEngine,
        workflowExecutionRepository: mockWorkflowExecutionRepositoryForResume as any,
        stepExecutionRepository: mockStepExecutionRepositoryForResume,
      });

      expect(resume).not.toHaveBeenCalled();
      expect(mockWorkflowExecutionLoop).not.toHaveBeenCalled();
    });

    it('runs resume when status is RUNNING (e.g. mid-loop)', async () => {
      const resume = jest.fn().mockResolvedValue(undefined);
      mockSetupDependencies.mockResolvedValue({
        workflowRuntime: {
          resume,
          ...nonFailedRuntimeMethods(),
        },
        stepExecutionRuntimeFactory: {},
        workflowExecutionState: {
          getWorkflowExecution: () => ({
            status: ExecutionStatus.RUNNING,
          }),
        },
        workflowLogger: {},
        nodesFactory: {},
        workflowExecutionGraph: {},
        esClient: {},
        workflowTaskManager: {},
        workflowExecutionRepository: {
          getWorkflowExecutionById: jest.fn().mockResolvedValue(null),
        },
      } as never);

      await resumeWorkflow({
        workflowRunId,
        spaceId,
        signal: new AbortController().signal,
        dependencies,
        logger: logger as Logger,
        config: { logging: { console: false }, http: { allowedHosts: ['*'] } } as never,
        fakeRequest,
        workflowsExecutionEngine: mockWorkflowExecutionEngine,
        workflowExecutionRepository: mockWorkflowExecutionRepositoryForResume as any,
        stepExecutionRepository: mockStepExecutionRepositoryForResume,
      });

      expect(resume).toHaveBeenCalledTimes(1);
      expect(mockWorkflowExecutionLoop).toHaveBeenCalledTimes(1);
    });
  });

  describe('wiring / metering', () => {
    const workflowRunId = 'test-workflow-run-id';
    const spaceId = 'default';

    let dependencies: ReturnType<typeof mockContextDependencies>;
    let fakeRequest: KibanaRequest;
    let logger: Logger;
    let taskAbortController: AbortController;
    let workflowRuntime: ReturnType<typeof createMockWorkflowRuntime>;
    let workflowExecutionRepository: ReturnType<typeof createMockWorkflowExecutionRepository>;
    let stepExecutionRepository: ReturnType<typeof createMockStepExecutionRepository>;

    const mockConfig = createMockWorkflowExecutionEngineConfig();

    const resumeWorkflowWithDefaults = (overrides?: {
      meteringService?: WorkflowsMeteringService;
      workflowsExecutionEngine?: WorkflowsExecutionEnginePluginStart;
    }) =>
      resumeWorkflow({
        workflowRunId,
        spaceId,
        signal: taskAbortController.signal,
        logger,
        config: mockConfig,
        fakeRequest,
        dependencies,
        meteringService: overrides?.meteringService,
        workflowsExecutionEngine:
          overrides?.workflowsExecutionEngine ?? mockWorkflowExecutionEngine,
        workflowExecutionRepository: workflowExecutionRepository as any,
        stepExecutionRepository,
      });

    beforeEach(() => {
      jest.clearAllMocks();

      dependencies = mockContextDependencies();
      fakeRequest = createFakeKibanaRequest();
      logger = createMockLogger();
      taskAbortController = new AbortController();

      workflowRuntime = createMockWorkflowRuntime();
      workflowExecutionRepository = createMockWorkflowExecutionRepository();
      stepExecutionRepository = createMockStepExecutionRepository();

      mockSetupDependencies.mockResolvedValue(
        buildMockSetupDependenciesReturn({ workflowRuntime, workflowExecutionRepository })
      );

      mockWorkflowExecutionLoop.mockResolvedValue(undefined);
    });

    describe('happy path / wiring', () => {
      it('calls setupDependencies with default workflowsExecutionEngine', async () => {
        await resumeWorkflowWithDefaults();

        expect(mockSetupDependencies).toHaveBeenCalledWith({
          workflowRunId,
          spaceId,
          logger,
          config: mockConfig,
          dependencies,
          workflowExecutionRepository,
          stepExecutionRepository,
          fakeRequest,
          workflowsExecutionEngine: mockWorkflowExecutionEngine,
        });
      });

      it('forwards workflowsExecutionEngine to setupDependencies when provided', async () => {
        const workflowsExecutionEngine = {
          triggerEvents: {
            emitEvent: jest.fn().mockResolvedValue(undefined),
            isEnabled: true,
            isLogEventsEnabled: true,
            maxEventChainDepth: 10,
          },
        } as unknown as WorkflowsExecutionEnginePluginStart;

        await resumeWorkflowWithDefaults({ workflowsExecutionEngine });

        expect(mockSetupDependencies).toHaveBeenCalledWith({
          workflowRunId,
          spaceId,
          logger,
          config: mockConfig,
          dependencies,
          workflowExecutionRepository,
          stepExecutionRepository,
          fakeRequest,
          workflowsExecutionEngine,
        });
      });

      it('calls workflowRuntime.resume then workflowExecutionLoop in order', async () => {
        await resumeWorkflowWithDefaults();

        expect(workflowRuntime.resume).toHaveBeenCalledTimes(1);
        expect(workflowRuntime.start).not.toHaveBeenCalled();
        expect(mockWorkflowExecutionLoop).toHaveBeenCalledTimes(1);
        expect(workflowRuntime.resume.mock.invocationCallOrder[0]).toBeLessThan(
          mockWorkflowExecutionLoop.mock.invocationCallOrder[0]!
        );
      });

      it('passes all setupDependencies outputs and context into workflowExecutionLoop', async () => {
        await resumeWorkflowWithDefaults();

        expect(mockWorkflowExecutionLoop).toHaveBeenCalledWith(
          getExpectedWorkflowExecutionLoopCallArgs({
            workflowRuntime,
            workflowExecutionRepository,
            dependencies,
            fakeRequest,
            signal: taskAbortController.signal,
          })
        );
      });
    });

    describe('workflowRuntime.resume() and loop errors', () => {
      it('propagates error when workflowRuntime.resume rejects', async () => {
        workflowRuntime.resume.mockRejectedValue(new Error('resume failed'));

        await expect(resumeWorkflowWithDefaults()).rejects.toThrow('resume failed');
        expect(mockWorkflowExecutionLoop).not.toHaveBeenCalled();
      });

      it('propagates error from workflowExecutionLoop', async () => {
        mockWorkflowExecutionLoop.mockRejectedValue(new Error('loop failed'));

        await expect(resumeWorkflowWithDefaults()).rejects.toThrow('loop failed');
      });
    });

    describe('metering', () => {
      const finalExecution = {
        id: workflowRunId,
        workflowId: 'wf',
        spaceId,
        status: ExecutionStatus.COMPLETED,
      };

      it('does not report metering when meteringService is omitted but still loads execution after loop', async () => {
        await resumeWorkflowWithDefaults();

        expect(workflowExecutionRepository.getWorkflowExecutionById).toHaveBeenCalledWith(
          workflowRunId,
          spaceId
        );
      });

      it('calls reportWorkflowExecution when final execution exists', async () => {
        const reportWorkflowExecution = jest.fn().mockResolvedValue(undefined);
        const meteringService = { reportWorkflowExecution } as unknown as WorkflowsMeteringService;

        workflowExecutionRepository.getWorkflowExecutionById.mockResolvedValue(finalExecution);

        await resumeWorkflowWithDefaults({ meteringService });

        expect(reportWorkflowExecution).toHaveBeenCalledTimes(1);
        expect(reportWorkflowExecution).toHaveBeenCalledWith(
          finalExecution,
          dependencies.cloudSetup
        );
      });

      it('does not call reportWorkflowExecution when getWorkflowExecutionById returns null', async () => {
        const reportWorkflowExecution = jest.fn().mockResolvedValue(undefined);
        const meteringService = { reportWorkflowExecution } as unknown as WorkflowsMeteringService;

        workflowExecutionRepository.getWorkflowExecutionById.mockResolvedValue(null);

        await resumeWorkflowWithDefaults({ meteringService });

        expect(reportWorkflowExecution).not.toHaveBeenCalled();
      });

      it('logs warn and resolves when getWorkflowExecutionById throws in metering block', async () => {
        const reportWorkflowExecution = jest.fn().mockResolvedValue(undefined);
        const meteringService = { reportWorkflowExecution } as unknown as WorkflowsMeteringService;

        workflowExecutionRepository.getWorkflowExecutionById.mockRejectedValue(
          new Error('fetch failed')
        );

        await expect(resumeWorkflowWithDefaults({ meteringService })).resolves.toEqual({
          idleTimeoutResumeAt: undefined,
        });

        expect(logger.warn).toHaveBeenCalledWith(
          expect.stringContaining(
            `Failed to fetch execution after loop (execution=${workflowRunId}): fetch failed`
          )
        );
        expect(reportWorkflowExecution).not.toHaveBeenCalled();
      });
    });
  });

  describe('workflow_execution_failed event emission', () => {
    const workflowRunId = 'run-1';
    const spaceId = 'default';
    const logger = loggingSystemMock.create().get();
    const fakeRequest = { headers: {} } as KibanaRequest;
    let dependencies: ReturnType<typeof mockContextDependencies>;
    let mockGetWorkflowExecutionById: jest.Mock;
    let mockGetLastFailedStepContext: jest.Mock;
    let mockGetWorkflowExecutionStatus: jest.Mock;
    let mockGetWorkflowExecution: jest.Mock;
    let mockGetWorkflowExecutionFromState: jest.Mock;

    const mockWorkflowExecutionEngineEmit = workflowsExecutionEngineMock.createStart();
    const mockWorkflowExecutionRepositoryForEmit = createMockWorkflowExecutionRepository();
    const mockStepExecutionRepositoryForEmit = createMockStepExecutionRepository();

    beforeEach(() => {
      jest.clearAllMocks();
      dependencies = mockContextDependencies();
      mockGetWorkflowExecutionById = jest.fn().mockResolvedValue(null);
      mockGetLastFailedStepContext = jest.fn().mockReturnValue(undefined);
      mockGetWorkflowExecutionStatus = jest.fn();
      mockGetWorkflowExecution = jest.fn();
      mockGetWorkflowExecutionFromState = jest.fn().mockReturnValue({
        status: ExecutionStatus.WAITING,
      });

      mockWorkflowExecutionEngineEmit.triggerEvents.emitEvent.mockClear();
      mockWorkflowExecutionEngineEmit.triggerEvents.emitEvent.mockResolvedValue(undefined);

      mockSetupDependencies.mockResolvedValue({
        workflowRuntime: {
          resume: jest.fn().mockResolvedValue(undefined),
          getWorkflowExecutionStatus: mockGetWorkflowExecutionStatus,
          getWorkflowExecution: mockGetWorkflowExecution,
        },
        stepExecutionRuntimeFactory: {},
        workflowExecutionState: {
          getLastFailedStepContext: mockGetLastFailedStepContext,
          getWorkflowExecution: mockGetWorkflowExecutionFromState,
        },
        workflowLogger: {},
        nodesFactory: {},
        workflowExecutionGraph: {},
        workflowTaskManager: {},
        workflowExecutionRepository: {
          getWorkflowExecutionById: mockGetWorkflowExecutionById,
        },
        esClient: elasticsearchServiceMock.createElasticsearchClient(),
      } as any);
    });

    it('emits workflow_execution_failed event when resumed execution fails', async () => {
      mockWorkflowExecutionLoop.mockRejectedValueOnce(new Error('Step failed'));

      const failedExecution = {
        id: workflowRunId,
        workflowId: 'wf-1',
        spaceId,
        status: ExecutionStatus.FAILED,
        isTestRun: false,
        workflowDefinition: { name: 'Resumed Workflow', steps: [] },
        error: { type: 'Error', message: 'Step failed' },
        createdAt: '2024-01-01T10:00:00.000Z',
        finishedAt: '2024-01-01T10:05:00.000Z',
        triggeredBy: 'manual',
      };
      mockGetWorkflowExecutionStatus.mockReturnValue(ExecutionStatus.FAILED);
      mockGetWorkflowExecution.mockReturnValue(failedExecution);
      mockGetWorkflowExecutionById.mockResolvedValue(failedExecution);
      mockGetLastFailedStepContext.mockReturnValue({
        stepId: 'step_1',
        stepName: 'Resume step',
        stepExecutionId: 'se-1',
      });

      await expect(
        resumeWorkflow({
          workflowRunId,
          spaceId,
          signal: new AbortController().signal,
          logger: logger as Logger,
          config: { logging: { console: false }, http: { allowedHosts: ['*'] } } as any,
          fakeRequest,
          dependencies,
          workflowsExecutionEngine: mockWorkflowExecutionEngineEmit,
          workflowExecutionRepository: mockWorkflowExecutionRepositoryForEmit as any,
          stepExecutionRepository: mockStepExecutionRepositoryForEmit,
        })
      ).rejects.toThrow('Step failed');

      expect(mockGetWorkflowExecutionStatus).toHaveBeenCalled();
      expect(mockGetWorkflowExecution).toHaveBeenCalled();
      expect(mockWorkflowExecutionEngineEmit.triggerEvents.emitEvent).toHaveBeenCalledTimes(1);
      expect(mockWorkflowExecutionEngineEmit.triggerEvents.emitEvent).toHaveBeenCalledWith({
        triggerId: WORKFLOW_EXECUTION_FAILED_TRIGGER_ID,
        payload: expect.objectContaining({
          workflow: expect.objectContaining({
            id: 'wf-1',
            name: 'Resumed Workflow',
            isErrorHandler: false,
          }),
          error: expect.objectContaining({
            message: 'Step failed',
            stepId: 'step_1',
            stepName: 'Resume step',
          }),
        }),
        request: fakeRequest,
      });
    });

    it('emits workflow_execution_failed with no step fields when failure was not due to a step', async () => {
      mockWorkflowExecutionLoop.mockRejectedValueOnce(new Error('Runtime error'));

      const failedExecution = {
        id: workflowRunId,
        workflowId: 'wf-1',
        spaceId,
        status: ExecutionStatus.FAILED,
        isTestRun: false,
        workflowDefinition: { name: 'Resumed Workflow', steps: [] },
        error: { type: 'Error', message: 'Runtime error' },
        createdAt: '2024-01-01T10:00:00.000Z',
        finishedAt: '2024-01-01T10:05:00.000Z',
        triggeredBy: 'manual',
      };
      mockGetWorkflowExecutionStatus.mockReturnValue(ExecutionStatus.FAILED);
      mockGetWorkflowExecution.mockReturnValue(failedExecution);
      mockGetWorkflowExecutionById.mockResolvedValue(failedExecution);
      mockGetLastFailedStepContext.mockReturnValue(undefined);

      await expect(
        resumeWorkflow({
          workflowRunId,
          spaceId,
          signal: new AbortController().signal,
          logger: logger as Logger,
          config: { logging: { console: false }, http: { allowedHosts: ['*'] } } as any,
          fakeRequest,
          dependencies,
          workflowsExecutionEngine: mockWorkflowExecutionEngineEmit,
          workflowExecutionRepository: mockWorkflowExecutionRepositoryForEmit as any,
          stepExecutionRepository: mockStepExecutionRepositoryForEmit,
        })
      ).rejects.toThrow('Runtime error');

      expect(mockWorkflowExecutionEngineEmit.triggerEvents.emitEvent).toHaveBeenCalledTimes(1);
      const emittedPayload =
        mockWorkflowExecutionEngineEmit.triggerEvents.emitEvent.mock.calls[0]![0].payload;
      expect(emittedPayload.error.message).toBe('Runtime error');
      expect(emittedPayload.error).not.toHaveProperty('stepId');
      expect(emittedPayload.error).not.toHaveProperty('stepName');
    });
  });
});
