/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { ByteSizeValue } from '@kbn/config-schema';
import type { ElasticsearchClient, KibanaRequest, Logger } from '@kbn/core/server';
import { isGraphBuildError, WorkflowGraph } from '@kbn/workflows/graph';
import { mockContextDependencies } from './__mock__/context_dependencies';
import { setupDependencies } from './setup_dependencies';
import { WorkflowGraphSetupError } from './workflow_graph_setup_error';
import type { WorkflowsExecutionEngineConfig } from '../config';
import { WorkflowExecutionTelemetryClient } from '../lib/telemetry/workflow_execution_telemetry_client';
import type { StepExecutionRepository } from '../repositories/step_execution_repository';
import { WorkflowExecutionRepository } from '../repositories/workflow_execution_repository';
import { WorkflowEventLoggerService } from '../workflow_event_logger/workflow_event_logger_service';

// Hoisted mock — must be in the test file (not an imported side-effect) so that
// setup_dependencies.ts receives the mocked WorkflowEventLoggerService when it is
// first imported. Side-effect imports (like mocks.ts) are NOT hoisted and arrive
// too late to intercept the module cache.
jest.mock('../workflow_event_logger/workflow_event_logger_service', () => ({
  WorkflowEventLoggerService: jest.fn().mockImplementation(() => ({
    createLogger: jest.fn().mockReturnValue({
      logInfo: jest.fn(),
      logError: jest.fn(),
      logWarn: jest.fn(),
      logDebug: jest.fn(),
      startTiming: jest.fn(),
      stopTiming: jest.fn(),
      createStepLogger: jest.fn().mockReturnValue({
        logInfo: jest.fn(),
        flushEvents: jest.fn(),
      }),
      flushEvents: jest.fn(),
    }),
    createWorkflowLogger: jest.fn(),
    createExecutionLogger: jest.fn(),
    createStepLogger: jest.fn(),
    getExecutionLogs: jest.fn(),
    getStepLogs: jest.fn(),
    getLogsByLevel: jest.fn(),
    searchLogs: jest.fn(),
    getRecentLogs: jest.fn(),
  })),
}));

import '../workflow_event_logger/mocks';
jest.mock('../repositories/workflow_execution_repository');
jest.mock('@kbn/workflows/graph');

describe('setupDependencies', () => {
  const workflowRunId = 'test-workflow-run-id';
  const spaceId = 'default';

  const mockWorkflowExecution = {
    id: workflowRunId,
    workflowId: 'test-workflow',
    workflowDefinition: {
      name: 'Test Workflow',
      steps: [],
    },
    spaceId,
    status: 'running',
    startedAt: Date.now(),
  };

  const mockScopedActionsClient = {
    getAll: jest.fn(),
    execute: jest.fn(),
  };

  const mockLogger = {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  } as unknown as Logger;

  const mockConfig: WorkflowsExecutionEngineConfig = {
    enabled: true,
    eventDriven: { enabled: true, logEvents: true, maxChainDepth: 10 },
    maxWorkflowDepth: 10,
    logging: {
      console: true,
    },
    http: {
      allowedHosts: ['*'],
    },
    maxResponseSize: new ByteSizeValue(10 * 1024 * 1024),
    eviction: {
      minPayloadSize: new ByteSizeValue(10 * 1024),
    },
    collectQueueMetrics: false,
    hitlExternalResume: { enabled: true },
    syncExecution: { enabled: false, maxDurationMs: 60_000 },
    syncLogDrain: { enabled: true, intervalMs: 500, maxQueue: 20000, maxBatch: 4000 },
  };

  let mockDependencies: ReturnType<typeof mockContextDependencies>;
  let mockWorkflowExecutionRepository: jest.Mocked<WorkflowExecutionRepository>;
  let mockStepExecutionRepository: jest.Mocked<StepExecutionRepository>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockDependencies = mockContextDependencies();
    mockDependencies.actions.getActionsClientWithRequest = jest
      .fn()
      .mockResolvedValue(mockScopedActionsClient);

    mockWorkflowExecutionRepository = {
      getWorkflowExecutionById: jest.fn().mockResolvedValue(mockWorkflowExecution),
      updateWorkflowExecution: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<WorkflowExecutionRepository>;

    mockStepExecutionRepository = {} as unknown as jest.Mocked<StepExecutionRepository>;

    (WorkflowExecutionRepository as jest.Mock).mockImplementation(
      () => mockWorkflowExecutionRepository
    );

    const mockWorkflowGraph = {
      fromWorkflowDefinition: jest.fn().mockReturnThis(),
      getStepGraph: jest.fn().mockReturnThis(),
      topologicalOrder: ['entry-node'],
      getNode: jest.fn().mockReturnValue({ id: 'entry-node' }),
      getNodeStack: jest.fn().mockReturnValue(['entry-node']),
    };
    (WorkflowGraph.fromWorkflowDefinition as jest.Mock) = jest
      .fn()
      .mockReturnValue(mockWorkflowGraph);
  });

  it('should use user-scoped ES client from coreStart', async () => {
    const mockScopedClient = {
      search: jest.fn(),
      index: jest.fn(),
    } as unknown as ElasticsearchClient;

    const mockAsCurrentUser = mockScopedClient;
    const mockAsScoped = jest.fn().mockReturnValue({
      asCurrentUser: mockAsCurrentUser,
    });

    mockDependencies.coreStart.elasticsearch.client.asScoped = mockAsScoped;

    const mockFakeRequest = {
      headers: {},
    } as KibanaRequest;

    const result = await setupDependencies({
      workflowRunId,
      spaceId,
      logger: mockLogger,
      config: mockConfig,
      dependencies: mockDependencies,
      workflowExecutionRepository: mockWorkflowExecutionRepository,
      stepExecutionRepository: mockStepExecutionRepository,
      fakeRequest: mockFakeRequest,
    });

    expect(mockAsScoped).toHaveBeenCalledWith(mockFakeRequest);
    expect(result.esClient).toBe(mockAsCurrentUser);
    expect(result.telemetryClient).toBeInstanceOf(WorkflowExecutionTelemetryClient);
  });

  it('should use scoped actions client with fakeRequest', async () => {
    const mockScopedClient = {
      search: jest.fn(),
      index: jest.fn(),
    } as unknown as ElasticsearchClient;

    mockDependencies.coreStart.elasticsearch.client.asScoped = jest.fn().mockReturnValue({
      asCurrentUser: mockScopedClient,
    });

    const mockFakeRequest = {
      headers: {},
    } as KibanaRequest;

    await setupDependencies({
      workflowRunId,
      spaceId,
      logger: mockLogger,
      config: mockConfig,
      dependencies: mockDependencies,
      workflowExecutionRepository: mockWorkflowExecutionRepository,
      stepExecutionRepository: mockStepExecutionRepository,
      fakeRequest: mockFakeRequest,
    });

    expect(mockDependencies.actions.getActionsClientWithRequest).toHaveBeenCalledWith(
      mockFakeRequest
    );
  });

  describe('WorkflowGraph', () => {
    beforeEach(() => {
      const mockScopedClient = {
        search: jest.fn(),
        index: jest.fn(),
      } as unknown as ElasticsearchClient;

      mockDependencies.coreStart.elasticsearch.client.asScoped = jest.fn().mockReturnValue({
        asCurrentUser: mockScopedClient,
      });
    });

    it('should call fromWorkflowDefinition with correct workflow definition', async () => {
      const mockFakeRequest = {
        headers: {},
      } as KibanaRequest;

      await setupDependencies({
        workflowRunId,
        spaceId,
        logger: mockLogger,
        config: mockConfig,
        dependencies: mockDependencies,
        workflowExecutionRepository: mockWorkflowExecutionRepository,
        stepExecutionRepository: mockStepExecutionRepository,
        fakeRequest: mockFakeRequest,
      });

      expect(WorkflowGraph.fromWorkflowDefinition).toHaveBeenCalledWith(
        mockWorkflowExecution.workflowDefinition,
        expect.anything()
      );
    });

    it('should call fromWorkflowDefinition with correct default settings', async () => {
      const mockFakeRequest = {
        headers: {},
      } as KibanaRequest;

      await setupDependencies({
        workflowRunId,
        spaceId,
        logger: mockLogger,
        config: mockConfig,
        dependencies: mockDependencies,
        workflowExecutionRepository: mockWorkflowExecutionRepository,
        stepExecutionRepository: mockStepExecutionRepository,
        fakeRequest: mockFakeRequest,
      });

      expect(WorkflowGraph.fromWorkflowDefinition).toHaveBeenCalledWith(expect.anything(), {
        timeout: '6h',
      });
    });
  });

  describe('graph build failure', () => {
    beforeEach(() => {
      const mockScopedClient = {
        search: jest.fn(),
        index: jest.fn(),
      } as unknown as ElasticsearchClient;
      mockDependencies.coreStart.elasticsearch.client.asScoped = jest.fn().mockReturnValue({
        asCurrentUser: mockScopedClient,
      });
    });

    it('persists the execution as FAILED and throws WorkflowGraphSetupError on a GraphBuildError', async () => {
      const mockFakeRequest = { headers: {} } as KibanaRequest;
      const buildError = new Error(
        'Parallel step "outer" has a branch body with nested flow-control, which is not supported yet.'
      );
      (WorkflowGraph.fromWorkflowDefinition as jest.Mock) = jest.fn(() => {
        throw buildError;
      });
      (isGraphBuildError as unknown as jest.Mock).mockReturnValue(true);

      await expect(
        setupDependencies({
          workflowRunId,
          spaceId,
          logger: mockLogger,
          config: mockConfig,
          dependencies: mockDependencies,
          workflowExecutionRepository: mockWorkflowExecutionRepository,
          stepExecutionRepository: mockStepExecutionRepository,
          fakeRequest: mockFakeRequest,
        })
      ).rejects.toBeInstanceOf(WorkflowGraphSetupError);

      expect(mockWorkflowExecutionRepository.updateWorkflowExecution).toHaveBeenCalledWith(
        expect.objectContaining({
          id: workflowRunId,
          status: 'failed',
          error: expect.objectContaining({ message: buildError.message }),
        })
      );
    });

    it('rethrows non-graph-build errors unchanged (no clean-failure persistence)', async () => {
      const mockFakeRequest = { headers: {} } as KibanaRequest;
      const otherError = new Error('some other failure');
      (WorkflowGraph.fromWorkflowDefinition as jest.Mock) = jest.fn(() => {
        throw otherError;
      });
      (isGraphBuildError as unknown as jest.Mock).mockReturnValue(false);

      await expect(
        setupDependencies({
          workflowRunId,
          spaceId,
          logger: mockLogger,
          config: mockConfig,
          dependencies: mockDependencies,
          workflowExecutionRepository: mockWorkflowExecutionRepository,
          stepExecutionRepository: mockStepExecutionRepository,
          fakeRequest: mockFakeRequest,
        })
      ).rejects.toBe(otherError);

      expect(mockWorkflowExecutionRepository.updateWorkflowExecution).not.toHaveBeenCalled();
    });
  });

  it('throws when the workflow execution document is missing', async () => {
    const mockFakeRequest = { headers: {} } as KibanaRequest;
    mockWorkflowExecutionRepository.getWorkflowExecutionById = jest.fn().mockResolvedValue(null);

    const mockScopedClient = {
      search: jest.fn(),
      index: jest.fn(),
    } as unknown as ElasticsearchClient;
    mockDependencies.coreStart.elasticsearch.client.asScoped = jest.fn().mockReturnValue({
      asCurrentUser: mockScopedClient,
    });

    await expect(
      setupDependencies({
        workflowRunId,
        spaceId,
        logger: mockLogger,
        config: mockConfig,
        dependencies: mockDependencies,
        workflowExecutionRepository: mockWorkflowExecutionRepository,
        stepExecutionRepository: mockStepExecutionRepository,
        fakeRequest: mockFakeRequest,
      })
    ).rejects.toThrow(`Workflow execution with ID ${workflowRunId} not found`);

    expect(mockWorkflowExecutionRepository.getWorkflowExecutionById).toHaveBeenCalledWith(
      workflowRunId,
      spaceId
    );
  });

  describe('workflowsExtensions', () => {
    beforeEach(() => {
      const mockScopedClient = {
        search: jest.fn(),
        index: jest.fn(),
      } as unknown as ElasticsearchClient;

      mockDependencies.coreStart.elasticsearch.client.asScoped = jest.fn().mockReturnValue({
        asCurrentUser: mockScopedClient,
      });
    });

    it('should await workflowsExtensions.isReady before reading the workflow execution', async () => {
      const mockFakeRequest = { headers: {} } as KibanaRequest;

      let isReadyResolved = false;
      let resolveIsReady!: () => void;
      const isReadyPromise = new Promise<void>((resolve) => {
        resolveIsReady = () => {
          isReadyResolved = true;
          resolve();
        };
      });
      (mockDependencies.workflowsExtensions.isReady as jest.Mock).mockReturnValue(isReadyPromise);

      const setupPromise = setupDependencies({
        workflowRunId,
        spaceId,
        logger: mockLogger,
        config: mockConfig,
        dependencies: mockDependencies,
        workflowExecutionRepository: mockWorkflowExecutionRepository,
        stepExecutionRepository: mockStepExecutionRepository,
        fakeRequest: mockFakeRequest,
      });

      // Let any microtasks before the isReady await run
      await Promise.resolve();

      expect(mockDependencies.workflowsExtensions.isReady).toHaveBeenCalledTimes(1);
      expect(isReadyResolved).toBe(false);
      expect(mockWorkflowExecutionRepository.getWorkflowExecutionById).not.toHaveBeenCalled();

      resolveIsReady();
      await setupPromise;

      expect(mockWorkflowExecutionRepository.getWorkflowExecutionById).toHaveBeenCalledWith(
        workflowRunId,
        spaceId
      );
    });
  });

  /**
   * Machine-checked invariant: the syncLogDrain supplied to setupDependencies must
   * be forwarded to WorkflowEventLoggerService so that every per-execution logger
   * routes its flushEvents calls to the drain instead of writing to ES inline.
   *
   * If someone removes the forwarding at the setupDependencies callsite, this test
   * fails while all drain unit tests still pass — making the regression visible.
   */
  describe('WorkflowEventLoggerService wiring', () => {
    beforeEach(() => {
      const mockScopedClient = {
        search: jest.fn(),
        index: jest.fn(),
      } as unknown as ElasticsearchClient;
      mockDependencies.coreStart.elasticsearch.client.asScoped = jest.fn().mockReturnValue({
        asCurrentUser: mockScopedClient,
      });
    });

    it('calls WorkflowEventLoggerService with dataStreams, logger, and enableConsoleLogging', async () => {
      const mockFakeRequest = { headers: {} } as KibanaRequest;

      await setupDependencies({
        workflowRunId,
        spaceId,
        logger: mockLogger,
        config: mockConfig,
        dependencies: mockDependencies,
        fakeRequest: mockFakeRequest,
      });

      expect(WorkflowEventLoggerService).toHaveBeenCalledWith(
        mockDependencies.coreStart.dataStreams,
        mockLogger,
        mockConfig.logging.console
      );
    });
  });
});
