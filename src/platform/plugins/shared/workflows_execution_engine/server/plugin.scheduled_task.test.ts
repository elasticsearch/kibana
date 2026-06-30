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

const mockGetWorkflow = jest.fn();
jest.mock('@kbn/workflows', () => {
  const actual = jest.requireActual('@kbn/workflows');
  return {
    ...actual,
    WorkflowRepository: jest.fn().mockImplementation(() => ({
      getWorkflow: mockGetWorkflow,
    })),
  };
});

const mockRunWorkflow = jest.fn();
const mockCheckAndSkipIfExistingScheduledExecution = jest.fn();
jest.mock('./execution_functions', () => {
  const actual = jest.requireActual('./execution_functions');
  return {
    ...actual,
    runWorkflow: (...args: unknown[]) => mockRunWorkflow(...args),
    checkAndSkipIfExistingScheduledExecution: (...args: unknown[]) =>
      mockCheckAndSkipIfExistingScheduledExecution(...args),
  };
});

import { WorkflowsExecutionEnginePlugin } from './plugin';
import { WORKFLOW_SCHEDULED_TASK_TYPE } from './workflow_task_manager/types';

describe('workflow:scheduled task runner', () => {
  const workflowId = 'missing-workflow';
  const spaceId = 'default';
  const taskState = {
    lastRunAt: null,
    lastRunStatus: null,
    lastRunError: null,
  };

  const createTaskInstance = (): ConcreteTaskInstance =>
    ({
      id: `workflow:${workflowId}:scheduled`,
      taskType: WORKFLOW_SCHEDULED_TASK_TYPE,
      params: { workflowId, spaceId, triggerType: 'scheduled' },
      state: taskState,
      attempts: 1,
      runAt: new Date('2024-01-01T10:00:00Z'),
      scheduledAt: new Date('2024-01-01T09:55:00Z'),
      startedAt: new Date('2024-01-01T10:00:00Z'),
      retryAt: null,
      status: TaskStatus.Running,
      ownerId: 'kibana-instance-id',
      schedule: { interval: '1h' },
    } as ConcreteTaskInstance);

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetWorkflow.mockResolvedValue(null);
  });

  it('requests task deletion when the workflow document is missing', async () => {
    const taskDefinitions: Record<string, TaskRegisterDefinition> = {};
    const initializerContext = coreMock.createPluginInitializerContext({
      logging: { console: false },
      eventDriven: { enabled: true, logEvents: true, maxChainDepth: 10 },
    });
    const logger = initializerContext.logger.get();
    const errorSpy = jest.spyOn(logger, 'error');

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

    const scheduledTaskDefinition = taskDefinitions[WORKFLOW_SCHEDULED_TASK_TYPE];
    expect(scheduledTaskDefinition).toBeDefined();

    const runner = scheduledTaskDefinition!.createTaskRunner(
      taskManagerMock.createRunContext({
        taskInstance: createTaskInstance(),
        fakeRequest: {} as KibanaRequest,
      })
    );

    const result = await runner.run();

    expect(result).toEqual({
      state: taskState,
      shouldDeleteTask: true,
    });
    expect(mockGetWorkflow).toHaveBeenCalledWith(workflowId, spaceId, { includeGlobal: true });
    expect(mockCheckAndSkipIfExistingScheduledExecution).not.toHaveBeenCalled();
    expect(mockRunWorkflow).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith(
      `Workflow ${workflowId} not found in space ${spaceId}; removing orphaned scheduled task`
    );
  });
});
