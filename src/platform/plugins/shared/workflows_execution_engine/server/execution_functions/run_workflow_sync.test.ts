/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { type EsWorkflowExecution, ExecutionStatus } from '@kbn/workflows';
import { runWorkflowSync } from './run_workflow_sync';
import { setupDependencies } from './setup_dependencies';
import { validateSyncWorkflow } from './validate_sync_workflow';
import { workflowExecutionLoop } from '../workflow_execution_loop';

jest.mock('./setup_dependencies', () => ({ setupDependencies: jest.fn() }));
jest.mock('./validate_sync_workflow', () => ({ validateSyncWorkflow: jest.fn() }));
jest.mock('../workflow_execution_loop', () => ({ workflowExecutionLoop: jest.fn() }));

describe('runWorkflowSync', () => {
  it('runs the canonical workflow loop with in-memory dependencies and sync mode', async () => {
    const completedExecution = {
      id: 'execution-1',
      spaceId: 'default',
      workflowId: 'workflow-1',
      isTestRun: false,
      status: ExecutionStatus.COMPLETED,
      context: {},
      workflowDefinition: {
        version: '1',
        name: 'Test workflow',
        enabled: true,
        triggers: [],
        steps: [],
      },
      yaml: '',
      scopeStack: [],
      createdAt: '2026-07-21T00:00:00.000Z',
      error: null,
      startedAt: '2026-07-21T00:00:00.000Z',
      finishedAt: '2026-07-21T00:00:01.000Z',
      cancelRequested: false,
      duration: 1000,
    } satisfies EsWorkflowExecution;
    const workflowExecutionGraph = { topologicalOrder: [] };
    const workflowRuntime = { start: jest.fn().mockResolvedValue(undefined) };
    const workflowExecutionState = {
      getWorkflowExecution: jest.fn().mockReturnValue(completedExecution),
    };
    const setup = {
      workflowExecutionGraph,
      workflowRuntime,
      workflowExecutionState,
      stepExecutionRuntimeFactory: {},
      stepIoService: {},
      workflowLogger: {},
      workflowTaskManager: {},
      nodesFactory: {},
      activeExecutionPersistence: {},
      workflowExecutionRepository: undefined,
      esClient: {},
    };
    (setupDependencies as jest.Mock).mockResolvedValue(setup);
    (workflowExecutionLoop as jest.Mock).mockResolvedValue(undefined);

    const abortController = new AbortController();
    const request = {} as Parameters<typeof runWorkflowSync>[0]['request'];
    const dependencies = Object.assign(
      {} as Parameters<typeof runWorkflowSync>[0]['dependencies'],
      { coreStart: {}, workflowsExtensions: { getStepDefinition: jest.fn() } }
    );
    const workflowExecutionRepository = {} as Parameters<
      typeof runWorkflowSync
    >[0]['workflowExecutionRepository'];
    const stepExecutionRepository = {} as Parameters<
      typeof runWorkflowSync
    >[0]['stepExecutionRepository'];

    await expect(
      runWorkflowSync({
        workflowExecution: completedExecution,
        request,
        abortController,
        logger: {} as Parameters<typeof runWorkflowSync>[0]['logger'],
        config: {} as Parameters<typeof runWorkflowSync>[0]['config'],
        dependencies,
        workflowsExecutionEngine: {} as Parameters<
          typeof runWorkflowSync
        >[0]['workflowsExecutionEngine'],
        workflowExecutionRepository,
        stepExecutionRepository,
      })
    ).resolves.toBe(completedExecution);

    expect(validateSyncWorkflow).toHaveBeenCalledWith(
      workflowExecutionGraph,
      dependencies.workflowsExtensions.getStepDefinition
    );
    expect(workflowRuntime.start).toHaveBeenCalledTimes(1);
    expect(workflowExecutionLoop).toHaveBeenCalledWith(
      expect.objectContaining({
        executionMode: 'sync',
        signal: abortController.signal,
        fakeRequest: request,
        workflowExecutionRepository: setup.activeExecutionPersistence,
      })
    );
  });
});
