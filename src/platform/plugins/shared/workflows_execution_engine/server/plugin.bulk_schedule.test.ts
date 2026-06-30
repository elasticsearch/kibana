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
import { taskManagerMock } from '@kbn/task-manager-plugin/server/mocks';
import type { WorkflowExecutionEngineModel } from '@kbn/workflows';

jest.mock('../common', () => ({
  createIndexes: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('./lib/check_license', () => ({
  checkLicense: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('./lib/get_user', () => ({
  getAuthenticatedUser: jest.fn().mockResolvedValue('test-user'),
}));

const mockBulkCreateWorkflowExecutions = jest.fn();
const mockCreateWorkflowExecution = jest.fn().mockResolvedValue(undefined);
jest.mock('./repositories/workflow_execution_repository', () => ({
  WorkflowExecutionRepository: jest.fn().mockImplementation(() => ({
    bulkCreateWorkflowExecutions: mockBulkCreateWorkflowExecutions,
    createWorkflowExecution: mockCreateWorkflowExecution,
  })),
}));

const mockAreWorkflowsEnabled = jest.fn();
const mockIsWorkflowEnabled = jest.fn().mockResolvedValue(true);
jest.mock('@kbn/workflows', () => {
  const actual = jest.requireActual('@kbn/workflows');
  return {
    ...actual,
    WorkflowRepository: jest.fn().mockImplementation(() => ({
      areWorkflowsEnabled: mockAreWorkflowsEnabled,
      isWorkflowEnabled: mockIsWorkflowEnabled,
    })),
  };
});

const mockConcurrencyCheckConcurrency = jest.fn();
const mockEvaluateConcurrencyKey = jest.fn();
jest.mock('./concurrency/concurrency_manager', () => ({
  ConcurrencyManager: jest.fn().mockImplementation(() => ({
    checkConcurrency: mockConcurrencyCheckConcurrency,
    evaluateConcurrencyKey: mockEvaluateConcurrencyKey,
  })),
}));

jest.mock('@kbn/workflows/server', () => {
  const actual = jest.requireActual('@kbn/workflows/server');
  return {
    ...actual,
    readWorkflowVersioningEnabled: jest.fn().mockResolvedValue(false),
  };
});

import { checkLicense } from './lib/check_license';
import { getAuthenticatedUser } from './lib/get_user';
import { WorkflowsExecutionEnginePlugin } from './plugin';

const makeGate = () => {
  let resolve!: (value: boolean) => void;
  const promise = new Promise<boolean>((r) => {
    resolve = r;
  });
  return { promise, resolve };
};

const createWorkflow = (
  id: string,
  overrides: Partial<WorkflowExecutionEngineModel> = {}
): WorkflowExecutionEngineModel => ({
  id,
  name: `Workflow ${id}`,
  enabled: true,
  definition: {
    name: `Workflow ${id}`,
    enabled: true,
    version: '1',
    triggers: [{ type: 'manual' }],
    steps: [],
  },
  yaml: `name: Workflow ${id}`,
  isTestRun: false,
  ...overrides,
});

describe('bulkScheduleWorkflow', () => {
  let plugin: WorkflowsExecutionEnginePlugin;
  let pluginStart: Awaited<ReturnType<WorkflowsExecutionEnginePlugin['start']>>;
  let taskManager: ReturnType<typeof taskManagerMock.createStart>;
  const request = {} as KibanaRequest;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockConcurrencyCheckConcurrency.mockResolvedValue(true);
    mockEvaluateConcurrencyKey.mockReturnValue(null);
    mockAreWorkflowsEnabled.mockResolvedValue(new Map<string, boolean>());
    mockIsWorkflowEnabled.mockResolvedValue(true);
    mockCreateWorkflowExecution.mockResolvedValue(undefined);

    const initializerContext = coreMock.createPluginInitializerContext({
      logging: { console: false },
      eventDriven: { enabled: true, logEvents: true, maxChainDepth: 10 },
    });
    plugin = new WorkflowsExecutionEnginePlugin(initializerContext);

    const coreSetup = coreMock.createSetup();
    plugin.setup(coreSetup as any, {
      taskManager: taskManagerMock.createSetup(),
      cloud: {} as any,
      workflowsExtensions: { registerConnectorAdapter: jest.fn() } as any,
    });

    const coreStart = coreMock.createStart();
    taskManager = taskManagerMock.createStart();
    pluginStart = plugin.start(coreStart, {
      taskManager,
      actions: {} as any,
      cloud: {} as any,
      workflowsExtensions: {} as any,
      licensing: licensingMock.createStart(),
    });
  });

  it('returns [] immediately and skips license/ES/task-manager on empty input', async () => {
    const result = await pluginStart.bulkScheduleWorkflow([], request);

    expect(result).toEqual([]);
    expect(checkLicense).not.toHaveBeenCalled();
    expect(getAuthenticatedUser).not.toHaveBeenCalled();
    expect(mockAreWorkflowsEnabled).not.toHaveBeenCalled();
    expect(mockBulkCreateWorkflowExecutions).not.toHaveBeenCalled();
    expect(taskManager.bulkSchedule).not.toHaveBeenCalled();
  });

  it('schedules every enabled item via one bulk create and one bulk taskManager call', async () => {
    const workflowA = createWorkflow('wf-a');
    const workflowB = createWorkflow('wf-b');
    mockAreWorkflowsEnabled.mockResolvedValue(
      new Map([
        ['default:wf-a', true],
        ['default:wf-b', true],
      ])
    );
    mockBulkCreateWorkflowExecutions.mockImplementation(async (executions: Array<{ id: string }>) =>
      executions.map(({ id }) => ({ id }))
    );

    const result = await pluginStart.bulkScheduleWorkflow(
      [
        { workflow: workflowA, context: { spaceId: 'default' } },
        { workflow: workflowB, context: { spaceId: 'default' } },
      ],
      request
    );

    expect(mockAreWorkflowsEnabled).toHaveBeenCalledTimes(1);
    expect(mockAreWorkflowsEnabled).toHaveBeenCalledWith(
      [
        { workflowId: 'wf-a', spaceId: 'default' },
        { workflowId: 'wf-b', spaceId: 'default' },
      ],
      { includeGlobal: true }
    );
    expect(mockBulkCreateWorkflowExecutions).toHaveBeenCalledTimes(1);
    expect(mockBulkCreateWorkflowExecutions).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ workflowId: 'wf-a' }),
        expect.objectContaining({ workflowId: 'wf-b' }),
      ]),
      { refresh: 'wait_for' }
    );
    expect(taskManager.bulkSchedule).toHaveBeenCalledTimes(1);
    const [scheduledTasks, scheduleOptions] = taskManager.bulkSchedule.mock.calls[0];
    expect(scheduledTasks).toHaveLength(2);
    expect(scheduleOptions).toEqual({ request });

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      status: 'scheduled',
      workflowExecutionId: expect.any(String),
    });
    expect(result[1]).toEqual({
      status: 'scheduled',
      workflowExecutionId: expect.any(String),
    });
  });

  it('marks a disabled workflow as error and still schedules the rest', async () => {
    const enabledWorkflow = createWorkflow('wf-ok');
    const disabledWorkflow = createWorkflow('wf-bad');
    mockAreWorkflowsEnabled.mockResolvedValue(
      new Map([
        ['default:wf-ok', true],
        ['default:wf-bad', false],
      ])
    );
    mockBulkCreateWorkflowExecutions.mockImplementation(async (executions: Array<{ id: string }>) =>
      executions.map(({ id }) => ({ id }))
    );

    const result = await pluginStart.bulkScheduleWorkflow(
      [
        { workflow: enabledWorkflow, context: { spaceId: 'default' } },
        { workflow: disabledWorkflow, context: { spaceId: 'default' } },
      ],
      request
    );

    expect(mockBulkCreateWorkflowExecutions).toHaveBeenCalledTimes(1);
    const [bulkArgs] = mockBulkCreateWorkflowExecutions.mock.calls[0];
    expect(bulkArgs).toHaveLength(1);
    expect(bulkArgs[0]).toEqual(expect.objectContaining({ workflowId: 'wf-ok' }));

    expect(taskManager.bulkSchedule).toHaveBeenCalledTimes(1);
    const [scheduledTasks] = taskManager.bulkSchedule.mock.calls[0];
    expect(scheduledTasks).toHaveLength(1);

    expect(result[0]).toEqual({
      status: 'scheduled',
      workflowExecutionId: expect.any(String),
    });
    expect(result[1]).toEqual({
      status: 'error',
      error: { message: 'Workflow is disabled: wf-bad. Enable the workflow to run it.' },
    });
  });

  it('maps per-doc ES bulk errors to per-item errors without dropping remaining items', async () => {
    const workflowA = createWorkflow('wf-a');
    const workflowB = createWorkflow('wf-b');
    mockAreWorkflowsEnabled.mockResolvedValue(
      new Map([
        ['default:wf-a', true],
        ['default:wf-b', true],
      ])
    );
    mockBulkCreateWorkflowExecutions.mockImplementation(async (executions: Array<{ id: string }>) =>
      executions.map(({ id }, idx) =>
        idx === 0 ? { id, error: 'version_conflict_engine_exception' } : { id }
      )
    );

    const result = await pluginStart.bulkScheduleWorkflow(
      [
        { workflow: workflowA, context: { spaceId: 'default' } },
        { workflow: workflowB, context: { spaceId: 'default' } },
      ],
      request
    );

    expect(taskManager.bulkSchedule).toHaveBeenCalledTimes(1);
    const [scheduledTasks] = taskManager.bulkSchedule.mock.calls[0];
    expect(scheduledTasks).toHaveLength(1);

    expect(result[0]).toEqual({
      status: 'error',
      error: { message: 'version_conflict_engine_exception' },
    });
    expect(result[1]).toEqual({
      status: 'scheduled',
      workflowExecutionId: expect.any(String),
    });
  });

  it('returns scheduled for every persisted doc regardless of concurrency drops; only non-dropped tasks reach taskManager', async () => {
    const workflowA = createWorkflow('wf-a', {
      definition: {
        name: 'wf-a',
        enabled: true,
        version: '1',
        triggers: [{ type: 'manual' }],
        steps: [],
        settings: {
          concurrency: { key: 'static-key', limit: 1, onCollision: 'drop' as const },
        },
      } as any,
    });
    const workflowB = createWorkflow('wf-b', {
      definition: {
        name: 'wf-b',
        enabled: true,
        version: '1',
        triggers: [{ type: 'manual' }],
        steps: [],
        settings: {
          concurrency: { key: 'static-key', limit: 1, onCollision: 'drop' as const },
        },
      } as any,
    });
    mockAreWorkflowsEnabled.mockResolvedValue(
      new Map([
        ['default:wf-a', true],
        ['default:wf-b', true],
      ])
    );
    mockBulkCreateWorkflowExecutions.mockImplementation(async (executions: Array<{ id: string }>) =>
      executions.map(({ id }) => ({ id }))
    );
    // Spy on the plugin's internal concurrency helper to simulate a drop on the
    // second item without going through the full ConcurrencyManager machinery.
    const checkConcurrencyIfNeeded = jest
      .spyOn(
        plugin as unknown as { checkConcurrencyIfNeeded: (e: unknown) => Promise<boolean> },
        'checkConcurrencyIfNeeded'
      )
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);

    const result = await pluginStart.bulkScheduleWorkflow(
      [
        { workflow: workflowA, context: { spaceId: 'default' } },
        { workflow: workflowB, context: { spaceId: 'default' } },
      ],
      request
    );

    expect(checkConcurrencyIfNeeded).toHaveBeenCalledTimes(2);
    expect(taskManager.bulkSchedule).toHaveBeenCalledTimes(1);
    const [scheduledTasks] = taskManager.bulkSchedule.mock.calls[0];
    expect(scheduledTasks).toHaveLength(1);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      status: 'scheduled',
      workflowExecutionId: expect.any(String),
    });
    expect(result[1]).toEqual({
      status: 'scheduled',
      workflowExecutionId: expect.any(String),
    });
  });

  it('serializes concurrency checks within the same concurrency group', async () => {
    const workflow = createWorkflow('wf-a', {
      definition: {
        name: 'wf-a',
        enabled: true,
        version: '1',
        triggers: [{ type: 'manual' }],
        steps: [],
        settings: {
          concurrency: { key: 'same-group', limit: 1, onCollision: 'drop' as const },
        },
      } as any,
    });
    mockAreWorkflowsEnabled.mockResolvedValue(new Map([['default:wf-a', true]]));
    mockBulkCreateWorkflowExecutions.mockImplementation(async (executions: Array<{ id: string }>) =>
      executions.map(({ id }) => ({ id }))
    );
    mockEvaluateConcurrencyKey.mockReturnValue('same-group');

    const gate1 = makeGate();
    const gate2 = makeGate();
    const startedIds: string[] = [];
    mockConcurrencyCheckConcurrency.mockImplementation(
      async (_settings: unknown, _key: string, currentExecutionId: string) => {
        startedIds.push(currentExecutionId);
        return startedIds.length === 1 ? gate1.promise : gate2.promise;
      }
    );

    const pending = pluginStart.bulkScheduleWorkflow(
      [
        { workflow, context: { spaceId: 'default' } },
        { workflow, context: { spaceId: 'default' } },
      ],
      request
    );

    await new Promise((resolve) => setImmediate(resolve));
    expect(startedIds).toHaveLength(1);

    gate1.resolve(true);
    await new Promise((resolve) => setImmediate(resolve));
    expect(startedIds).toHaveLength(2);

    gate2.resolve(true);
    await pending;

    expect(mockConcurrencyCheckConcurrency).toHaveBeenCalledTimes(2);
  });

  it('runs concurrency checks for different concurrency groups in parallel', async () => {
    const workflowA = createWorkflow('wf-a', {
      definition: {
        name: 'wf-a',
        enabled: true,
        version: '1',
        triggers: [{ type: 'manual' }],
        steps: [],
        settings: {
          concurrency: { key: 'group-a', limit: 1, onCollision: 'drop' as const },
        },
      } as any,
    });
    const workflowB = createWorkflow('wf-b', {
      definition: {
        name: 'wf-b',
        enabled: true,
        version: '1',
        triggers: [{ type: 'manual' }],
        steps: [],
        settings: {
          concurrency: { key: 'group-b', limit: 1, onCollision: 'drop' as const },
        },
      } as any,
    });
    mockAreWorkflowsEnabled.mockResolvedValue(
      new Map([
        ['default:wf-a', true],
        ['default:wf-b', true],
      ])
    );
    mockBulkCreateWorkflowExecutions.mockImplementation(async (executions: Array<{ id: string }>) =>
      executions.map(({ id }) => ({ id }))
    );
    mockEvaluateConcurrencyKey.mockReturnValueOnce('group-a').mockReturnValueOnce('group-b');

    const gate1 = makeGate();
    const gate2 = makeGate();
    const startedIds: string[] = [];
    mockConcurrencyCheckConcurrency.mockImplementation(
      async (_settings: unknown, _key: string, currentExecutionId: string) => {
        startedIds.push(currentExecutionId);
        return startedIds.length === 1 ? gate1.promise : gate2.promise;
      }
    );

    const pending = pluginStart.bulkScheduleWorkflow(
      [
        { workflow: workflowA, context: { spaceId: 'default' } },
        { workflow: workflowB, context: { spaceId: 'default' } },
      ],
      request
    );

    await new Promise((resolve) => setImmediate(resolve));
    expect(startedIds).toHaveLength(2);

    gate1.resolve(true);
    gate2.resolve(true);
    await pending;

    expect(mockConcurrencyCheckConcurrency).toHaveBeenCalledTimes(2);
  });

  it('skips bulkCreate and taskManager when no items are enabled', async () => {
    const disabledWorkflow = createWorkflow('wf-bad');
    mockAreWorkflowsEnabled.mockResolvedValue(new Map([['default:wf-bad', false]]));

    const result = await pluginStart.bulkScheduleWorkflow(
      [{ workflow: disabledWorkflow, context: { spaceId: 'default' } }],
      request
    );

    expect(mockBulkCreateWorkflowExecutions).not.toHaveBeenCalled();
    expect(taskManager.bulkSchedule).not.toHaveBeenCalled();
    expect(result).toEqual([
      {
        status: 'error',
        error: { message: 'Workflow is disabled: wf-bad. Enable the workflow to run it.' },
      },
    ]);
  });

  it('still checks saved workflow enabled state for test runs', async () => {
    const testRunWorkflow = createWorkflow('wf-test', { isTestRun: true });
    mockAreWorkflowsEnabled.mockResolvedValue(new Map([['default:wf-test', false]]));

    const result = await pluginStart.bulkScheduleWorkflow(
      [{ workflow: testRunWorkflow, context: { spaceId: 'default' } }],
      request
    );

    expect(mockAreWorkflowsEnabled).toHaveBeenCalledWith(
      [{ workflowId: 'wf-test', spaceId: 'default' }],
      { includeGlobal: true }
    );
    expect(mockBulkCreateWorkflowExecutions).not.toHaveBeenCalled();
    expect(taskManager.bulkSchedule).not.toHaveBeenCalled();
    expect(result).toEqual([
      {
        status: 'error',
        error: { message: 'Workflow is disabled: wf-test. Enable the workflow to run it.' },
      },
    ]);
  });

  it('skips saved workflow enabled checks for ephemeral workflows', async () => {
    const ephemeralWorkflow = createWorkflow('wf-ephemeral', { isEphemeral: true });
    mockBulkCreateWorkflowExecutions.mockImplementation(async (executions: Array<{ id: string }>) =>
      executions.map(({ id }) => ({ id }))
    );

    const result = await pluginStart.bulkScheduleWorkflow(
      [{ workflow: ephemeralWorkflow, context: { spaceId: 'default' } }],
      request
    );

    expect(mockAreWorkflowsEnabled).not.toHaveBeenCalled();
    expect(mockBulkCreateWorkflowExecutions).toHaveBeenCalledWith(
      [expect.objectContaining({ workflowId: 'wf-ephemeral' })],
      { refresh: 'wait_for' }
    );
    expect(taskManager.bulkSchedule).toHaveBeenCalledTimes(1);
    expect(result).toEqual([
      {
        status: 'scheduled',
        workflowExecutionId: expect.any(String),
      },
    ]);
  });

  it('checks saved workflow enabled state for single test-run executions', async () => {
    mockIsWorkflowEnabled.mockResolvedValue(false);

    await expect(
      pluginStart.executeWorkflow(
        createWorkflow('wf-test', { isTestRun: true }),
        { spaceId: 'default' },
        request
      )
    ).rejects.toThrow('Workflow is disabled: wf-test. Enable the workflow to run it.');

    expect(mockIsWorkflowEnabled).toHaveBeenCalledWith('wf-test', 'default', {
      includeGlobal: true,
    });
    expect(mockCreateWorkflowExecution).not.toHaveBeenCalled();
    expect(taskManager.schedule).not.toHaveBeenCalled();
  });

  it('skips saved workflow enabled state for single ephemeral executions', async () => {
    mockIsWorkflowEnabled.mockResolvedValue(false);

    const result = await pluginStart.executeWorkflow(
      createWorkflow('wf-ephemeral', { isEphemeral: true }),
      { spaceId: 'default' },
      request
    );

    expect(result).toEqual({ workflowExecutionId: expect.any(String) });
    expect(mockIsWorkflowEnabled).not.toHaveBeenCalled();
    expect(mockCreateWorkflowExecution).toHaveBeenCalledWith(
      expect.objectContaining({ workflowId: 'wf-ephemeral' }),
      { refresh: false }
    );
    expect(taskManager.schedule).toHaveBeenCalledTimes(1);
  });
});
