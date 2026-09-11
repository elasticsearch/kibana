/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { ByteSizeValue } from '@kbn/config-schema';
import type { KibanaRequest, Logger } from '@kbn/core/server';
import { ExecutionStatus } from '@kbn/workflows';

import type { setupDependencies } from './setup_dependencies';
import type { WorkflowsExecutionEngineConfig } from '../config';
import type { StepExecutionRepository } from '../repositories/step_execution_repository';
import type { MockWorkflowExecutionCursor } from '../workflow_context_manager/mocks/workflow_execution_cursor.mock';
// eslint-disable-next-line @kbn/imports/no_boundary_crossing
import { createMockWorkflowExecutionCursor } from '../workflow_context_manager/mocks/workflow_execution_cursor.mock';
import type { ContextDependencies } from '../workflow_context_manager/types';

export const createMockWorkflowExecutionEngineConfig = (): WorkflowsExecutionEngineConfig => ({
  enabled: true,
  eventDriven: { enabled: true, logEvents: true, maxChainDepth: 10 },
  maxWorkflowDepth: 10,
  logging: { console: true },
  http: { allowedHosts: ['*'] },
  maxResponseSize: new ByteSizeValue(10 * 1024 * 1024),
  eviction: { minPayloadSize: new ByteSizeValue(10 * 1024) },
  collectQueueMetrics: false,
  hitlExternalResume: { enabled: true },
  syncExecution: { enabled: false, maxDurationMs: 60_000 },
  syncLogDrain: { enabled: true, intervalMs: 500, maxQueue: 20000, maxBatch: 4000 },
});

export const createMockLogger = (): Logger =>
  ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  } as unknown as Logger);

export const createFakeKibanaRequest = (): KibanaRequest => ({ headers: {} } as KibanaRequest);

export interface MockWorkflowRuntime {
  start: jest.Mock;
  resume: jest.Mock;
  getWorkflowExecutionStatus: jest.Mock;
  getWorkflowExecution: jest.Mock;
  executionCursor: MockWorkflowExecutionCursor;
}

export const createMockWorkflowRuntime = (): MockWorkflowRuntime => ({
  start: jest.fn().mockResolvedValue(undefined),
  resume: jest.fn().mockResolvedValue(undefined),
  getWorkflowExecutionStatus: jest.fn().mockReturnValue(ExecutionStatus.COMPLETED),
  getWorkflowExecution: jest.fn().mockReturnValue({
    isTestRun: false,
    status: ExecutionStatus.COMPLETED,
  }),
  executionCursor: createMockWorkflowExecutionCursor(),
});

export interface MockWorkflowExecutionRepository {
  getWorkflowExecutionById: jest.Mock;
  updateWorkflowExecution: jest.Mock;
}

export const createMockWorkflowExecutionRepository = (): MockWorkflowExecutionRepository => ({
  getWorkflowExecutionById: jest.fn().mockResolvedValue(null),
  updateWorkflowExecution: jest.fn().mockResolvedValue(undefined),
});

export const createMockStepExecutionRepository = (): jest.Mocked<StepExecutionRepository> =>
  ({
    bulkUpsert: jest.fn().mockResolvedValue(undefined),
    markNonTerminalStepsFailed: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<StepExecutionRepository>);

export interface MockTelemetryClient {
  reportEventDrivenExecutionSuppressed: jest.Mock;
}

export const createMockTelemetryClient = (): MockTelemetryClient => ({
  reportEventDrivenExecutionSuppressed: jest.fn(),
});

export const buildMockSetupDependenciesReturn = (options: {
  workflowRuntime: MockWorkflowRuntime;
  workflowExecutionRepository: MockWorkflowExecutionRepository;
  telemetryClient?: MockTelemetryClient;
}): Awaited<ReturnType<typeof setupDependencies>> =>
  ({
    workflowRuntime: options.workflowRuntime,
    stepExecutionRuntimeFactory: {},
    workflowExecutionState: {
      getWorkflowExecution: jest.fn().mockReturnValue({ status: ExecutionStatus.WAITING }),
      getLastFailedStepContext: jest.fn(),
    },
    workflowLogger: {},
    nodesFactory: {},
    workflowExecutionGraph: {},
    workflowTaskManager: {},
    workflowExecutionRepository: options.workflowExecutionRepository,
    esClient: {},
    telemetryClient: options.telemetryClient ?? createMockTelemetryClient(),
  } as unknown as Awaited<ReturnType<typeof setupDependencies>>);

/** Payload passed to `workflowExecutionLoop` from `runWorkflow` / `resumeWorkflow` (mocked deps). */
export const getExpectedWorkflowExecutionLoopCallArgs = (options: {
  workflowRuntime: MockWorkflowRuntime;
  workflowExecutionRepository: MockWorkflowExecutionRepository;
  dependencies: ContextDependencies;
  fakeRequest: KibanaRequest;
  signal: AbortSignal;
}) => ({
  workflowRuntime: options.workflowRuntime,
  stepExecutionRuntimeFactory: {},
  workflowExecutionState: expect.any(Object),
  workflowExecutionRepository: options.workflowExecutionRepository,
  workflowLogger: {},
  nodesFactory: {},
  workflowExecutionGraph: {},
  esClient: {},
  fakeRequest: options.fakeRequest,
  coreStart: options.dependencies.coreStart,
  signal: options.signal,
  workflowTaskManager: {},
});
