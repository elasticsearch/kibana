/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { KibanaRequest, Logger } from '@kbn/core/server';
import {
  type EsWorkflowExecution,
  ExecutionStatus,
  type WorkflowExecutionEngineModel,
} from '@kbn/workflows';
import { executeWorkflowSync } from './execute_workflow_sync';
import { runWorkflowSync } from './run_workflow_sync';
import { buildWorkflowExecutionDocument } from '../lib/build_workflow_execution_document';
import { getAuthenticatedUser } from '../lib/get_user';
import { validateWorkflowInputs } from '../lib/validate_workflow_inputs';
import { InMemoryExecutionPersistence } from '../repositories/execution_persistence';
import type { ExecuteWorkflowOptions, WorkflowsExecutionEnginePluginStart } from '../types';
import type { ContextDependencies } from '../workflow_context_manager/types';

jest.mock('./run_workflow_sync');
jest.mock('../lib/build_workflow_execution_document');
jest.mock('../lib/get_user');
jest.mock('../lib/validate_workflow_inputs');
jest.mock('../repositories/execution_persistence');

const WORKFLOW_ID = 'wf-1';
const EXECUTION_ID = 'exec-1';
const SPACE_ID = 'default';

const baseExecution: EsWorkflowExecution = {
  id: EXECUTION_ID,
  spaceId: SPACE_ID,
  workflowId: WORKFLOW_ID,
  isTestRun: false,
  status: ExecutionStatus.COMPLETED,
  context: {},
  workflowDefinition: {
    version: '1',
    name: 'Test',
    enabled: true,
    triggers: [],
    steps: [],
  },
  yaml: '',
  scopeStack: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  error: null,
  startedAt: '2026-01-01T00:00:00.000Z',
  finishedAt: '2026-01-01T00:00:01.000Z',
  cancelRequested: false,
  duration: 1000,
};

const makeWorkflow = (overrides: Partial<WorkflowExecutionEngineModel> = {}) =>
  ({
    id: WORKFLOW_ID,
    isEphemeral: true,
    yaml: '',
    workflowDefinition: baseExecution.workflowDefinition,
    ...overrides,
  } as WorkflowExecutionEngineModel);

const makeOptions = (overrides: Partial<ExecuteWorkflowOptions> = {}): ExecuteWorkflowOptions => ({
  ...overrides,
});

const makeDependencies = (overrides: Partial<ContextDependencies> = {}): ContextDependencies => ({
  coreStart: {
    security: {},
    elasticsearch: { client: {} },
  } as unknown as ContextDependencies['coreStart'],
  config: {
    syncExecution: { enabled: true, maxDurationMs: 5_000 },
    eventDriven: { maxChainDepth: 5 },
  } as unknown as ContextDependencies['config'],
  actions: {} as unknown as ContextDependencies['actions'],
  taskManager: {} as unknown as ContextDependencies['taskManager'],
  workflowsExtensions: {} as unknown as ContextDependencies['workflowsExtensions'],
  cloudSetup: undefined,
  ...overrides,
});

describe('executeWorkflowSync', () => {
  const mockGetEngine = jest.fn().mockResolvedValue({} as WorkflowsExecutionEnginePluginStart);
  const mockLogger = {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  } as unknown as Logger;
  const mockRequest = {} as KibanaRequest;

  beforeEach(() => {
    jest.clearAllMocks();
    (buildWorkflowExecutionDocument as jest.Mock).mockResolvedValue(baseExecution);
    (getAuthenticatedUser as jest.Mock).mockResolvedValue({ username: 'test-user' });
    (validateWorkflowInputs as jest.Mock).mockResolvedValue(true);
    (runWorkflowSync as jest.Mock).mockResolvedValue({ ...baseExecution, context: {} });
    (InMemoryExecutionPersistence as jest.Mock).mockImplementation(() => ({
      getWorkflowExecutionById: jest.fn().mockResolvedValue(baseExecution),
    }));
  });

  it('throws when a non-ephemeral workflow is disabled', async () => {
    const deps = makeDependencies({
      workflowRepository: {
        isWorkflowEnabled: jest.fn().mockResolvedValue(false),
      } as unknown as ContextDependencies['workflowRepository'],
    });

    await expect(
      executeWorkflowSync({
        workflow: makeWorkflow({ isEphemeral: false }),
        context: { spaceId: SPACE_ID },
        request: mockRequest,
        options: makeOptions(),
        logger: mockLogger,
        dependencies: deps,
        getWorkflowsExecutionEngine: mockGetEngine,
      })
    ).rejects.toThrow(`Workflow is disabled: ${WORKFLOW_ID}`);
  });

  it('returns FAILED with error when input validation fails', async () => {
    const failedExecution = {
      ...baseExecution,
      error: { type: 'InputValidationError', message: 'bad input' },
    };
    (validateWorkflowInputs as jest.Mock).mockResolvedValue(false);
    (InMemoryExecutionPersistence as jest.Mock).mockImplementation(() => ({
      getWorkflowExecutionById: jest.fn().mockResolvedValue(failedExecution),
    }));

    const result = await executeWorkflowSync({
      workflow: makeWorkflow(),
      context: { spaceId: SPACE_ID },
      request: mockRequest,
      options: makeOptions(),
      logger: mockLogger,
      dependencies: makeDependencies(),
      getWorkflowsExecutionEngine: mockGetEngine,
    });

    expect(result.result).toBeDefined();
    expect(result.result!.status).toBe(ExecutionStatus.FAILED);
    expect(result.result!.error).toEqual(failedExecution.error);
    expect(runWorkflowSync).not.toHaveBeenCalled();
  });

  it('always clears the timeout in the finally block', async () => {
    const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');

    await executeWorkflowSync({
      workflow: makeWorkflow(),
      context: { spaceId: SPACE_ID },
      request: mockRequest,
      options: makeOptions(),
      logger: mockLogger,
      dependencies: makeDependencies(),
      getWorkflowsExecutionEngine: mockGetEngine,
    });

    expect(clearTimeoutSpy).toHaveBeenCalled();
    clearTimeoutSpy.mockRestore();
  });

  it('relays a pre-aborted caller signal to the internal abort controller', async () => {
    const externalController = new AbortController();
    externalController.abort(new Error('caller cancelled'));

    let capturedAbortController: AbortController | undefined;
    (runWorkflowSync as jest.Mock).mockImplementation(({ abortController }) => {
      capturedAbortController = abortController;
      return Promise.resolve({ ...baseExecution, context: {} });
    });

    await executeWorkflowSync({
      workflow: makeWorkflow(),
      context: { spaceId: SPACE_ID },
      request: mockRequest,
      options: makeOptions({ abortSignal: externalController.signal }),
      logger: mockLogger,
      dependencies: makeDependencies(),
      getWorkflowsExecutionEngine: mockGetEngine,
    });

    expect(capturedAbortController?.signal.aborted).toBe(true);
  });

  it('throws when output is a non-object, non-null value', async () => {
    (runWorkflowSync as jest.Mock).mockResolvedValue({
      ...baseExecution,
      context: { output: 'a string' },
    });

    await expect(
      executeWorkflowSync({
        workflow: makeWorkflow(),
        context: { spaceId: SPACE_ID },
        request: mockRequest,
        options: makeOptions(),
        logger: mockLogger,
        dependencies: makeDependencies(),
        getWorkflowsExecutionEngine: mockGetEngine,
      })
    ).rejects.toThrow('Synchronous workflow output must be an object');
  });

  it('returns result without output when execution context.output is null', async () => {
    (runWorkflowSync as jest.Mock).mockResolvedValue({
      ...baseExecution,
      context: { output: null },
    });

    const result = await executeWorkflowSync({
      workflow: makeWorkflow(),
      context: { spaceId: SPACE_ID },
      request: mockRequest,
      options: makeOptions(),
      logger: mockLogger,
      dependencies: makeDependencies(),
      getWorkflowsExecutionEngine: mockGetEngine,
    });

    expect(result.result).not.toHaveProperty('output');
  });
});
