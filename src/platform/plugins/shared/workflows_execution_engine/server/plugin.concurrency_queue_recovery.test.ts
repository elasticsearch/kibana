/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { KibanaRequest } from '@kbn/core/server';
import { coreMock } from '@kbn/core/server/mocks';
import { licensingMock } from '@kbn/licensing-plugin/server/mocks';
import { TaskStatus } from '@kbn/task-manager-plugin/server';
import type { ConcreteTaskInstance, TaskRegisterDefinition } from '@kbn/task-manager-plugin/server';
import { taskManagerMock } from '@kbn/task-manager-plugin/server/mocks';

jest.mock('../common', () => ({
  createIndexes: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('./lib/check_license', () => ({
  checkLicense: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('elastic-apm-node', () => ({
  default: {
    currentTransaction: null,
    startSpan: jest.fn(),
  },
}));

const mockMaybeDrainConcurrencyQueueAfterTerminal = jest.fn().mockResolvedValue(undefined);
jest.mock('./concurrency/concurrency_queue_drainer', () => {
  const actual = jest.requireActual('./concurrency/concurrency_queue_drainer');
  return {
    ...actual,
    maybeDrainConcurrencyQueueAfterTerminal: (...args: unknown[]) =>
      mockMaybeDrainConcurrencyQueueAfterTerminal(...args),
  };
});

const mockResolveInterruptedWorkflowRunTask = jest.fn();
jest.mock('./lib/task_recovery', () => {
  const actual = jest.requireActual('./lib/task_recovery');
  return {
    ...actual,
    resolveInterruptedWorkflowRunTask: (...args: unknown[]) =>
      mockResolveInterruptedWorkflowRunTask(...args),
  };
});

jest.mock('./execution_functions', () => {
  const actual = jest.requireActual('./execution_functions');
  return {
    ...actual,
    runWorkflow: jest.fn().mockResolvedValue(undefined),
  };
});

import { WorkflowsExecutionEnginePlugin } from './plugin';
import { WORKFLOW_RUN_TASK_TYPE } from './workflow_task_manager/types';

describe('concurrency queue recovery wiring', () => {
  let taskDefinitions: Record<string, TaskRegisterDefinition>;

  const setupPlugin = () => {
    taskDefinitions = {};
    const initializerContext = coreMock.createPluginInitializerContext({
      logging: { console: false },
      eventDriven: { enabled: true, logEvents: true, maxChainDepth: 10 },
    });
    const plugin = new WorkflowsExecutionEnginePlugin(initializerContext);
    const coreSetup = coreMock.createSetup();
    const coreStart = coreMock.createStart();
    coreSetup.getStartServices.mockResolvedValue([
      coreStart,
      {
        taskManager: taskManagerMock.createStart(),
        actions: {} as never,
        workflowsExtensions: {} as never,
        licensing: licensingMock.createStart(),
      },
      {} as never,
    ]);

    const taskManagerSetup = taskManagerMock.createSetup();
    taskManagerSetup.registerTaskDefinitions.mockImplementation((definitions) => {
      Object.assign(taskDefinitions, definitions);
    });

    plugin.setup(coreSetup as never, {
      taskManager: taskManagerSetup,
      cloud: {} as never,
      workflowsExtensions: { registerConnectorAdapter: jest.fn() } as never,
    });

    return { plugin };
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockResolveInterruptedWorkflowRunTask.mockResolvedValue('task_complete');
  });

  it('workflow:run calls maybeDrain when interrupt recovery returns task_complete', async () => {
    setupPlugin();

    const workflowRunId = 'exec-interrupted';
    const spaceId = 'default';
    const taskInstance = {
      id: `workflow:${workflowRunId}:manual`,
      taskType: WORKFLOW_RUN_TASK_TYPE,
      params: { workflowRunId, spaceId },
      state: {},
      attempts: 2,
      runAt: new Date('2024-01-01T10:00:00Z'),
      scheduledAt: new Date('2024-01-01T09:55:00Z'),
      startedAt: new Date('2024-01-01T10:00:00Z'),
      retryAt: null,
      status: TaskStatus.Running,
      ownerId: 'kibana-instance-id',
    } as ConcreteTaskInstance;

    const fakeRequest = {} as KibanaRequest;
    const runner = taskDefinitions[WORKFLOW_RUN_TASK_TYPE]!.createTaskRunner({
      taskInstance,
      fakeRequest,
      abortController: new AbortController(),
    });

    await runner.run();

    expect(mockResolveInterruptedWorkflowRunTask).toHaveBeenCalled();
    expect(mockMaybeDrainConcurrencyQueueAfterTerminal).toHaveBeenCalledWith(
      expect.objectContaining({
        workflowRunId,
        spaceId,
        fakeRequest,
      })
    );
  });
});
