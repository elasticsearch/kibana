/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ConcreteTaskInstance } from '@kbn/task-manager-plugin/server';
import { isUnrecoverableError } from '@kbn/task-manager-plugin/server';
import { loggingSystemMock } from '@kbn/core/server/mocks';
import {
  DATA_STREAM_CREATION_TASK_TYPE,
  TaskManagerService,
  isUnrecoverableByStatus,
  type DataStreamParams,
} from './task_manager_service';
import { TASK_STATUSES } from '../saved_objects/constants';
import type { AutomaticImportSavedObjectService } from '../saved_objects/saved_objects_service';

jest.mock('../agents/agent_service');
jest.mock('../build_integration/fields');
jest.mock('../build_integration/validate_fields');

const { AgentService } = jest.requireMock('../agents/agent_service');
const { generateFieldMappings } = jest.requireMock('../build_integration/fields');
const { validateFieldMappings } = jest.requireMock('../build_integration/validate_fields');

describe('TaskManagerService', () => {
  it('exports DATA_STREAM_CREATION_TASK_TYPE', () => {
    expect(DATA_STREAM_CREATION_TASK_TYPE).toBe('autoImport-dataStream-task');
  });

  it('exports TaskManagerService', () => {
    expect(TaskManagerService).toBeDefined();
  });

  it('DataStreamParams has required fields', () => {
    const params: DataStreamParams = { integrationId: 'a', dataStreamId: 'b' };
    expect(params.integrationId).toBe('a');
    expect(params.dataStreamId).toBe('b');
  });
});

describe('isUnrecoverableByStatus', () => {
  it('returns false for 200 and 201', () => {
    expect(isUnrecoverableByStatus(Object.assign(new Error(), { statusCode: 200 }))).toBe(false);
    expect(isUnrecoverableByStatus(Object.assign(new Error(), { statusCode: 201 }))).toBe(false);
  });

  it('returns true for any other status code', () => {
    expect(isUnrecoverableByStatus(Object.assign(new Error(), { statusCode: 400 }))).toBe(true);
    expect(isUnrecoverableByStatus(Object.assign(new Error(), { statusCode: 404 }))).toBe(true);
    expect(isUnrecoverableByStatus(Object.assign(new Error(), { statusCode: 500 }))).toBe(true);
  });

  it('reads status from meta.status and output.statusCode', () => {
    expect(isUnrecoverableByStatus({ meta: { status: 404 } })).toBe(true);
    expect(isUnrecoverableByStatus({ output: { statusCode: 400 } })).toBe(true);
    expect(isUnrecoverableByStatus({ meta: { status: 200 } })).toBe(false);
  });

  it('returns false when no status code (retry)', () => {
    expect(isUnrecoverableByStatus(new Error('timeout'))).toBe(false);
    expect(isUnrecoverableByStatus(null)).toBe(false);
    expect(isUnrecoverableByStatus(undefined)).toBe(false);
  });
});

describe('runTask abort handling', () => {
  let taskDefinition: Record<string, { createTaskRunner: Function }>;
  let mockSavedObjectService: jest.Mocked<AutomaticImportSavedObjectService>;
  let mockAnalytics: { reportEvent: jest.Mock; registerEventType: jest.Mock };
  let loggerFactory: ReturnType<typeof loggingSystemMock.create>;

  const taskParams = {
    integrationId: 'test-int',
    dataStreamId: 'test-ds',
    connectorId: 'test-connector',
    integrationName: 'Test Integration',
    dataStreamName: 'Test DS',
  };

  const mockTaskInstance: ConcreteTaskInstance = {
    id: 'task-123',
    params: taskParams,
    state: { task_status: TASK_STATUSES.pending },
    taskType: DATA_STREAM_CREATION_TASK_TYPE,
    scheduledAt: new Date(),
    attempts: 0,
    status: 'idle' as ConcreteTaskInstance['status'],
    runAt: new Date(),
    startedAt: null,
    retryAt: null,
    ownerId: null,
  };

  const mockFakeRequest = {} as unknown;

  const mockCoreStart = {
    elasticsearch: { client: { asInternalUser: {} } },
  };

  const mockPluginsStart = {
    inference: {
      getChatModel: jest.fn().mockResolvedValue({}),
    },
    fieldsMetadata: {
      getClient: jest.fn().mockResolvedValue({}),
    },
  };

  const mockCore = {
    getStartServices: jest.fn().mockResolvedValue([mockCoreStart, mockPluginsStart]),
  };

  const mockSamplesIndexService = {};

  beforeEach(() => {
    jest.clearAllMocks();
    taskDefinition = {};
    loggerFactory = loggingSystemMock.create();

    mockAnalytics = {
      reportEvent: jest.fn(),
      registerEventType: jest.fn(),
    };

    mockSavedObjectService = {
      updateDataStreamSavedObjectAttributes: jest.fn().mockResolvedValue(undefined),
      updateDataStreamPhase: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<AutomaticImportSavedObjectService>;

    const mockTaskManagerSetup = {
      registerTaskDefinitions: jest.fn((defs: Record<string, unknown>) => {
        Object.assign(taskDefinition, defs);
      }),
    };

    AgentService.mockImplementation(() => ({
      invokeAutomaticImportAgent: jest.fn().mockResolvedValue({
        current_pipeline: { name: 'test', processors: [] },
        pipeline_generation_results: [{ _source: { answer: 42 } }],
        field_mappings: [
          { name: 'my_app.created_at', type: 'date' },
          { name: 'my_app.status', type: 'keyword' },
        ],
      }),
    }));

    generateFieldMappings.mockResolvedValue([{ name: 'field_a', type: 'keyword', is_ecs: false }]);

    validateFieldMappings.mockResolvedValue({ valid: true, errors: [] });

    const service = new TaskManagerService(
      loggerFactory,
      mockTaskManagerSetup as never,
      mockCore as never,
      mockAnalytics as never,
      mockSamplesIndexService as never
    );
    service.initialize({} as never, mockSavedObjectService);
  });

  const createRunner = (abortController: AbortController) => {
    const def = taskDefinition[DATA_STREAM_CREATION_TASK_TYPE];
    return def.createTaskRunner({
      taskInstance: mockTaskInstance,
      fakeRequest: mockFakeRequest,
      abortController,
    });
  };

  it('completes successfully when not aborted', async () => {
    const abortController = new AbortController();
    const runner = createRunner(abortController);

    const result = await runner.run();

    expect(result.state.task_status).toBe(TASK_STATUSES.completed);
    expect(mockSavedObjectService.updateDataStreamSavedObjectAttributes).toHaveBeenCalledWith(
      expect.objectContaining({ status: TASK_STATUSES.processing })
    );
    expect(mockSavedObjectService.updateDataStreamPhase).toHaveBeenCalled();
    expect(mockSavedObjectService.updateDataStreamSavedObjectAttributes).toHaveBeenCalledWith(
      expect.objectContaining({ status: TASK_STATUSES.completed }),
      abortController.signal
    );
    expect(mockAnalytics.reportEvent).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ success: true })
    );
  });

  it('passes agent field_mappings to generateFieldMappings', async () => {
    const abortController = new AbortController();
    const runner = createRunner(abortController);

    await runner.run();

    expect(generateFieldMappings).toHaveBeenCalledWith(expect.any(Array), expect.anything(), [
      { name: 'my_app.created_at', type: 'date' },
      { name: 'my_app.status', type: 'keyword' },
    ]);
  });

  it('marks data stream as cancelled when aborted before agent invocation returns', async () => {
    const abortController = new AbortController();

    AgentService.mockImplementation(() => ({
      invokeAutomaticImportAgent: jest.fn().mockImplementation(async () => {
        abortController.abort();
        return {
          current_pipeline: { name: 'test', processors: [] },
          pipeline_generation_results: [],
        };
      }),
    }));

    const service = new TaskManagerService(
      loggerFactory,
      {
        registerTaskDefinitions: jest.fn((defs: Record<string, unknown>) => {
          Object.assign(taskDefinition, defs);
        }),
      } as never,
      mockCore as never,
      mockAnalytics as never,
      mockSamplesIndexService as never
    );
    service.initialize({} as never, mockSavedObjectService);

    const runner = createRunner(abortController);
    const result = await runner.run();

    expect(result.state.task_status).toBe(TASK_STATUSES.cancelled);
    expect(mockSavedObjectService.updateDataStreamSavedObjectAttributes).toHaveBeenCalledWith(
      expect.objectContaining({ status: TASK_STATUSES.cancelled })
    );
  });

  it('marks data stream as cancelled when aborted after generateFieldMappings', async () => {
    const abortController = new AbortController();

    generateFieldMappings.mockImplementation(async () => {
      abortController.abort();
      return [{ name: 'f', type: 'keyword', is_ecs: false }];
    });

    const runner = createRunner(abortController);
    const result = await runner.run();

    expect(result.state.task_status).toBe(TASK_STATUSES.cancelled);
    expect(mockSavedObjectService.updateDataStreamSavedObjectAttributes).toHaveBeenCalledWith(
      expect.objectContaining({ status: TASK_STATUSES.cancelled })
    );
  });

  it('marks data stream as cancelled when validateFieldMappings re-throws AbortError', async () => {
    const abortController = new AbortController();

    validateFieldMappings.mockImplementation(async () => {
      abortController.abort();
      throw new DOMException('The operation was aborted', 'AbortError');
    });

    const runner = createRunner(abortController);
    const result = await runner.run();

    expect(result.state.task_status).toBe(TASK_STATUSES.cancelled);
    expect(mockSavedObjectService.updateDataStreamSavedObjectAttributes).toHaveBeenCalledWith(
      expect.objectContaining({ status: TASK_STATUSES.cancelled })
    );
  });

  it('marks data stream as cancelled when aborted after validateFieldMappings', async () => {
    const abortController = new AbortController();

    validateFieldMappings.mockImplementation(async () => {
      const result = { valid: true, errors: [] };
      abortController.abort();
      return result;
    });

    const runner = createRunner(abortController);
    const res = await runner.run();

    expect(res.state.task_status).toBe(TASK_STATUSES.cancelled);
    expect(mockSavedObjectService.updateDataStreamSavedObjectAttributes).toHaveBeenCalledWith(
      expect.objectContaining({ status: TASK_STATUSES.cancelled })
    );
  });

  it('marks data stream as cancelled when updateDataStreamSavedObjectAttributes throws due to abort', async () => {
    const abortController = new AbortController();

    mockSavedObjectService.updateDataStreamSavedObjectAttributes.mockImplementation(
      async (_params, abortSig) => {
        if (abortSig?.aborted) {
          throw new Error('Task was cancelled');
        }
        abortController.abort();
        throw new Error('Task was cancelled');
      }
    );

    const runner = createRunner(abortController);
    const result = await runner.run();

    expect(result.state.task_status).toBe(TASK_STATUSES.cancelled);
  });

  it('cancellation update does not pass abortSignal', async () => {
    const abortController = new AbortController();
    abortController.abort();

    AgentService.mockImplementation(() => ({
      invokeAutomaticImportAgent: jest.fn().mockRejectedValue(new Error('aborted')),
    }));

    const service = new TaskManagerService(
      loggerFactory,
      {
        registerTaskDefinitions: jest.fn((defs: Record<string, unknown>) => {
          Object.assign(taskDefinition, defs);
        }),
      } as never,
      mockCore as never,
      mockAnalytics as never,
      mockSamplesIndexService as never
    );
    service.initialize({} as never, mockSavedObjectService);

    const runner = createRunner(abortController);
    await runner.run();

    const cancelCall = mockSavedObjectService.updateDataStreamSavedObjectAttributes.mock.calls.find(
      (call) => (call[0] as { status: string }).status === TASK_STATUSES.cancelled
    );
    expect(cancelCall).toBeDefined();
    expect(cancelCall![1]).toBeUndefined();
  });

  it('logs error but still returns cancelled when cancellation update fails', async () => {
    const abortController = new AbortController();

    AgentService.mockImplementation(() => ({
      invokeAutomaticImportAgent: jest.fn().mockImplementation(async () => {
        abortController.abort();
        throw new Error('aborted');
      }),
    }));

    mockSavedObjectService.updateDataStreamSavedObjectAttributes.mockImplementation(
      async (params: { status: string }) => {
        if (params.status === TASK_STATUSES.cancelled) {
          throw new Error('SO update failed');
        }
      }
    );

    const service = new TaskManagerService(
      loggerFactory,
      {
        registerTaskDefinitions: jest.fn((defs: Record<string, unknown>) => {
          Object.assign(taskDefinition, defs);
        }),
      } as never,
      mockCore as never,
      mockAnalytics as never,
      mockSamplesIndexService as never
    );
    service.initialize({} as never, mockSavedObjectService);

    const runner = createRunner(abortController);
    const result = await runner.run();

    expect(result.state.task_status).toBe(TASK_STATUSES.cancelled);
  });

  it('marks data stream as failed for non-abort errors', async () => {
    const abortController = new AbortController();

    AgentService.mockImplementation(() => ({
      invokeAutomaticImportAgent: jest.fn().mockRejectedValue(new Error('Model inference failed')),
    }));

    const service = new TaskManagerService(
      loggerFactory,
      {
        registerTaskDefinitions: jest.fn((defs: Record<string, unknown>) => {
          Object.assign(taskDefinition, defs);
        }),
      } as never,
      mockCore as never,
      mockAnalytics as never,
      mockSamplesIndexService as never
    );
    service.initialize({} as never, mockSavedObjectService);

    const runner = createRunner(abortController);
    const result = await runner.run();

    expect(result.state.task_status).toBe(TASK_STATUSES.failed);
    expect(mockSavedObjectService.updateDataStreamSavedObjectAttributes).toHaveBeenCalledWith(
      expect.objectContaining({ status: TASK_STATUSES.failed })
    );
  });

  it('cancel() returns cancelled state', async () => {
    const abortController = new AbortController();
    const runner = createRunner(abortController);

    const cancelResult = await runner.cancel();

    // The Task Manager framework is responsible for aborting the controller;
    // the runner's cancel() callback only returns the cancelled state.
    expect(abortController.signal.aborted).toBe(false);
    expect(cancelResult.state.task_status).toBe(TASK_STATUSES.cancelled);
  });
});

describe('removeDataStreamCreationTask', () => {
  const mockCore = {
    getStartServices: jest
      .fn()
      .mockResolvedValue([{ elasticsearch: { client: { asInternalUser: {} } } }, {}]),
  };

  it('aborts the Task Manager AbortController when a run is in flight on this node, then removes the task', async () => {
    const loggerFactory = loggingSystemMock.create();
    const mockAnalytics = { reportEvent: jest.fn(), registerEventType: jest.fn() };

    const service = new TaskManagerService(
      loggerFactory,
      { registerTaskDefinitions: jest.fn() } as never,
      mockCore as never,
      mockAnalytics as never,
      {} as never
    );

    const removeIfExists = jest.fn().mockResolvedValue(undefined);
    service.initialize({ removeIfExists } as never, {} as never);

    const taskId = 'data-stream-task-myint-mydstream';
    const controller = new AbortController();
    const abortSpy = jest.spyOn(controller, 'abort');

    (
      service as unknown as { inFlightRunAbortControllers: Map<string, AbortController> }
    ).inFlightRunAbortControllers.set(taskId, controller);

    await service.removeDataStreamCreationTask({
      integrationId: 'myint',
      dataStreamId: 'mydstream',
    });

    expect(abortSpy).toHaveBeenCalled();
    expect(removeIfExists).toHaveBeenCalledWith(taskId);
  });

  it('calls removeIfExists when there is no in-flight run on this node', async () => {
    const loggerFactory = loggingSystemMock.create();
    const mockAnalytics = { reportEvent: jest.fn(), registerEventType: jest.fn() };

    const service = new TaskManagerService(
      loggerFactory,
      { registerTaskDefinitions: jest.fn() } as never,
      mockCore as never,
      mockAnalytics as never,
      {} as never
    );

    const removeIfExists = jest.fn().mockResolvedValue(undefined);
    service.initialize({ removeIfExists } as never, {} as never);

    await service.removeDataStreamCreationTask({
      integrationId: 'a',
      dataStreamId: 'b',
    });

    expect(removeIfExists).toHaveBeenCalledWith('data-stream-task-a-b');
  });

  it('does not call abort when in-flight controller is already aborted', async () => {
    const loggerFactory = loggingSystemMock.create();
    const mockAnalytics = { reportEvent: jest.fn(), registerEventType: jest.fn() };

    const service = new TaskManagerService(
      loggerFactory,
      { registerTaskDefinitions: jest.fn() } as never,
      mockCore as never,
      mockAnalytics as never,
      {} as never
    );

    const removeIfExists = jest.fn().mockResolvedValue(undefined);
    service.initialize({ removeIfExists } as never, {} as never);

    const taskId = 'data-stream-task-x-y';
    const controller = new AbortController();
    controller.abort();
    const abortSpy = jest.spyOn(controller, 'abort');

    (
      service as unknown as { inFlightRunAbortControllers: Map<string, AbortController> }
    ).inFlightRunAbortControllers.set(taskId, controller);

    await service.removeDataStreamCreationTask({
      integrationId: 'x',
      dataStreamId: 'y',
    });

    expect(abortSpy).not.toHaveBeenCalled();
    expect(removeIfExists).toHaveBeenCalledWith(taskId);
  });

  it('throws when removeIfExists rejects', async () => {
    const loggerFactory = loggingSystemMock.create();
    const mockAnalytics = { reportEvent: jest.fn(), registerEventType: jest.fn() };

    const service = new TaskManagerService(
      loggerFactory,
      { registerTaskDefinitions: jest.fn() } as never,
      mockCore as never,
      mockAnalytics as never,
      {} as never
    );

    const removeIfExists = jest.fn().mockRejectedValue(new Error('ES unavailable'));
    service.initialize({ removeIfExists } as never, {} as never);

    await expect(
      service.removeDataStreamCreationTask({ integrationId: 'a', dataStreamId: 'b' })
    ).rejects.toThrow('ES unavailable');
  });

  it('throws assertion error when TaskManager is not initialized', async () => {
    const loggerFactory = loggingSystemMock.create();
    const mockAnalytics = { reportEvent: jest.fn(), registerEventType: jest.fn() };

    const service = new TaskManagerService(
      loggerFactory,
      { registerTaskDefinitions: jest.fn() } as never,
      mockCore as never,
      mockAnalytics as never,
      {} as never
    );

    await expect(
      service.removeDataStreamCreationTask({ integrationId: 'a', dataStreamId: 'b' })
    ).rejects.toThrow();
  });
});

describe('scheduleDataStreamCreationTask', () => {
  const createService = () => {
    const loggerFactory = loggingSystemMock.create();
    const mockAnalytics = { reportEvent: jest.fn(), registerEventType: jest.fn() };
    const service = new TaskManagerService(
      loggerFactory,
      { registerTaskDefinitions: jest.fn() } as never,
      {} as never,
      mockAnalytics as never,
      {} as never
    );
    return service;
  };

  const baseParams = {
    integrationId: 'int-1',
    dataStreamId: 'ds-1',
    connectorId: 'conn-1',
    integrationName: 'Test',
    dataStreamName: 'Test DS',
  };

  const fakeRequest = {} as never;

  it('returns the scheduled task ID on success', async () => {
    const service = createService();
    const ensureScheduled = jest.fn().mockResolvedValue({ id: 'data-stream-task-int-1-ds-1' });
    service.initialize({ ensureScheduled } as never, {} as never);

    const result = await service.scheduleDataStreamCreationTask(baseParams, fakeRequest);

    expect(result.taskId).toBe('data-stream-task-int-1-ds-1');
    expect(ensureScheduled).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'data-stream-task-int-1-ds-1',
        taskType: DATA_STREAM_CREATION_TASK_TYPE,
        params: baseParams,
        state: { task_status: TASK_STATUSES.pending },
        scope: ['automaticImport'],
      }),
      { request: fakeRequest }
    );
  });

  it('returns the existing task ID when task already exists (ensureScheduled handles conflict)', async () => {
    const service = createService();
    const ensureScheduled = jest.fn().mockResolvedValue({ id: 'data-stream-task-int-1-ds-1' });
    service.initialize({ ensureScheduled } as never, {} as never);

    const result = await service.scheduleDataStreamCreationTask(baseParams, fakeRequest);

    expect(result.taskId).toBe('data-stream-task-int-1-ds-1');
  });

  it('propagates errors from ensureScheduled', async () => {
    const service = createService();
    const ensureScheduled = jest.fn().mockRejectedValue(new Error('unauthorized'));
    service.initialize({ ensureScheduled } as never, {} as never);

    await expect(service.scheduleDataStreamCreationTask(baseParams, fakeRequest)).rejects.toThrow(
      'unauthorized'
    );
  });

  it('throws assertion error when TaskManager is not initialized', async () => {
    const service = createService();

    await expect(service.scheduleDataStreamCreationTask(baseParams, fakeRequest)).rejects.toThrow();
  });
});

describe('getTaskStatus', () => {
  const createService = () => {
    const loggerFactory = loggingSystemMock.create();
    const mockAnalytics = { reportEvent: jest.fn(), registerEventType: jest.fn() };
    return new TaskManagerService(
      loggerFactory,
      { registerTaskDefinitions: jest.fn() } as never,
      {} as never,
      mockAnalytics as never,
      {} as never
    );
  };

  it('returns the task status from state', async () => {
    const service = createService();
    const get = jest.fn().mockResolvedValue({ state: { task_status: TASK_STATUSES.completed } });
    service.initialize({ get } as never, {} as never);

    const result = await service.getTaskStatus('task-1');
    expect(result.task_status).toBe(TASK_STATUSES.completed);
  });

  it('throws when task is not found', async () => {
    const service = createService();
    const get = jest.fn().mockRejectedValue(new Error('not found'));
    service.initialize({ get } as never, {} as never);

    await expect(service.getTaskStatus('missing-task')).rejects.toThrow(
      'Task missing-task not found or inaccessible'
    );
  });

  it('throws when TaskManager is not initialized', async () => {
    const service = createService();

    await expect(service.getTaskStatus('task-1')).rejects.toThrow('TaskManager not initialized');
  });
});

describe('runTask error edge cases', () => {
  let taskDefinition: Record<string, { createTaskRunner: Function }>;
  let mockSavedObjectService: jest.Mocked<AutomaticImportSavedObjectService>;
  let mockAnalytics: { reportEvent: jest.Mock; registerEventType: jest.Mock };
  let loggerFactory: ReturnType<typeof loggingSystemMock.create>;

  const taskParams = {
    integrationId: 'test-int',
    dataStreamId: 'test-ds',
    connectorId: 'test-connector',
    integrationName: 'Test Integration',
    dataStreamName: 'Test DS',
  };

  const mockTaskInstance: ConcreteTaskInstance = {
    id: 'task-123',
    params: taskParams,
    state: { task_status: TASK_STATUSES.pending },
    taskType: DATA_STREAM_CREATION_TASK_TYPE,
    scheduledAt: new Date(),
    attempts: 0,
    status: 'idle' as ConcreteTaskInstance['status'],
    runAt: new Date(),
    startedAt: null,
    retryAt: null,
    ownerId: null,
  };

  const mockFakeRequest = {} as unknown;

  const mockCoreStart = {
    elasticsearch: { client: { asInternalUser: {} } },
  };

  const mockPluginsStart = {
    inference: {
      getChatModel: jest.fn().mockResolvedValue({}),
    },
    fieldsMetadata: {
      getClient: jest.fn().mockResolvedValue({}),
    },
  };

  const mockCore = {
    getStartServices: jest.fn().mockResolvedValue([mockCoreStart, mockPluginsStart]),
  };

  const mockSamplesIndexService = {};

  const buildService = () => {
    const mockTaskManagerSetup = {
      registerTaskDefinitions: jest.fn((defs: Record<string, unknown>) => {
        Object.assign(taskDefinition, defs);
      }),
    };

    const service = new TaskManagerService(
      loggerFactory,
      mockTaskManagerSetup as never,
      mockCore as never,
      mockAnalytics as never,
      mockSamplesIndexService as never
    );
    service.initialize({} as never, mockSavedObjectService);
    return service;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    taskDefinition = {};
    loggerFactory = loggingSystemMock.create();

    mockAnalytics = {
      reportEvent: jest.fn(),
      registerEventType: jest.fn(),
    };

    mockSavedObjectService = {
      updateDataStreamSavedObjectAttributes: jest.fn().mockResolvedValue(undefined),
      updateDataStreamPhase: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<AutomaticImportSavedObjectService>;

    AgentService.mockImplementation(() => ({
      invokeAutomaticImportAgent: jest.fn().mockResolvedValue({
        current_pipeline: { name: 'test', processors: [] },
        pipeline_generation_results: [{ _source: { answer: 42 } }],
      }),
    }));

    generateFieldMappings.mockResolvedValue([{ name: 'field_a', type: 'keyword', is_ecs: false }]);
    validateFieldMappings.mockResolvedValue({ valid: true, errors: [] });
  });

  const createRunner = (abortController: AbortController) => {
    const def = taskDefinition[DATA_STREAM_CREATION_TASK_TYPE];
    return def.createTaskRunner({
      taskInstance: mockTaskInstance,
      fakeRequest: mockFakeRequest,
      abortController,
    });
  };

  it('fails with error when required task params are missing', async () => {
    const incompleteTaskInstance: ConcreteTaskInstance = {
      ...mockTaskInstance,
      params: { integrationId: '', dataStreamId: '', connectorId: '' },
    };

    const mockTaskManagerSetup = {
      registerTaskDefinitions: jest.fn((defs: Record<string, unknown>) => {
        Object.assign(taskDefinition, defs);
      }),
    };

    new TaskManagerService(
      loggerFactory,
      mockTaskManagerSetup as never,
      mockCore as never,
      mockAnalytics as never,
      mockSamplesIndexService as never
    ).initialize({} as never, mockSavedObjectService);

    const def = taskDefinition[DATA_STREAM_CREATION_TASK_TYPE];
    const abortController = new AbortController();
    const runner = def.createTaskRunner({
      taskInstance: incompleteTaskInstance,
      fakeRequest: mockFakeRequest,
      abortController,
    });

    const result = await runner.run();

    expect(result.state.task_status).toBe(TASK_STATUSES.failed);
    expect(mockSavedObjectService.updateDataStreamSavedObjectAttributes).toHaveBeenCalledWith(
      expect.objectContaining({ status: TASK_STATUSES.failed })
    );
  });

  it('fails when agent does not produce a valid ingest pipeline', async () => {
    AgentService.mockImplementation(() => ({
      invokeAutomaticImportAgent: jest.fn().mockResolvedValue({
        current_pipeline: null,
        pipeline_generation_results: [],
      }),
    }));

    buildService();
    const abortController = new AbortController();
    const runner = createRunner(abortController);
    const result = await runner.run();

    expect(result.state.task_status).toBe(TASK_STATUSES.failed);
    expect(mockSavedObjectService.updateDataStreamSavedObjectAttributes).toHaveBeenCalledWith(
      expect.objectContaining({ status: TASK_STATUSES.failed })
    );
  });

  it('throws unrecoverable error for HTTP error status codes', async () => {
    const httpError = Object.assign(new Error('Forbidden'), { statusCode: 403 });
    AgentService.mockImplementation(() => ({
      invokeAutomaticImportAgent: jest.fn().mockRejectedValue(httpError),
    }));

    buildService();
    const abortController = new AbortController();
    const runner = createRunner(abortController);

    await expect(runner.run()).rejects.toThrow('Forbidden');

    const thrownError = await runner.run().catch((e: Error) => e);
    expect(isUnrecoverableError(thrownError)).toBe(true);
  });

  it('returns failed state (retryable) for errors without HTTP status', async () => {
    AgentService.mockImplementation(() => ({
      invokeAutomaticImportAgent: jest.fn().mockRejectedValue(new Error('transient network error')),
    }));

    buildService();
    const abortController = new AbortController();
    const runner = createRunner(abortController);
    const result = await runner.run();

    expect(result.state.task_status).toBe(TASK_STATUSES.failed);
    expect(result.error).toBeDefined();
  });

  it('reports telemetry with error message on failure', async () => {
    AgentService.mockImplementation(() => ({
      invokeAutomaticImportAgent: jest.fn().mockRejectedValue(new Error('LLM timeout')),
    }));

    buildService();
    const abortController = new AbortController();
    const runner = createRunner(abortController);
    await runner.run();

    expect(mockAnalytics.reportEvent).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        success: false,
        errorMessage: 'LLM timeout',
      })
    );
  });

  it('does not report telemetry on cancellation', async () => {
    const abortController = new AbortController();
    AgentService.mockImplementation(() => ({
      invokeAutomaticImportAgent: jest.fn().mockImplementation(async () => {
        abortController.abort();
        throw new Error('aborted');
      }),
    }));

    buildService();
    const runner = createRunner(abortController);
    await runner.run();

    expect(mockAnalytics.reportEvent).not.toHaveBeenCalled();
  });

  it('still marks as failed even when SO update for failure throws', async () => {
    AgentService.mockImplementation(() => ({
      invokeAutomaticImportAgent: jest.fn().mockRejectedValue(new Error('agent crashed')),
    }));

    mockSavedObjectService.updateDataStreamSavedObjectAttributes.mockRejectedValue(
      new Error('SO write failed')
    );

    buildService();
    const abortController = new AbortController();
    const runner = createRunner(abortController);
    const result = await runner.run();

    expect(result.state.task_status).toBe(TASK_STATUSES.failed);
    expect(mockAnalytics.reportEvent).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ success: false })
    );
  });

  it('cleans up inFlightRunAbortControllers after run completes', async () => {
    buildService();
    const abortController = new AbortController();
    const runner = createRunner(abortController);

    await runner.run();

    expect(abortController.signal.aborted).toBe(false);
  });

  it('passes undefined agent field_mappings when agent does not provide them', async () => {
    AgentService.mockImplementation(() => ({
      invokeAutomaticImportAgent: jest.fn().mockResolvedValue({
        current_pipeline: { name: 'test', processors: [] },
        pipeline_generation_results: [{ _source: { value: 'test' } }],
      }),
    }));

    buildService();
    const abortController = new AbortController();
    const runner = createRunner(abortController);
    await runner.run();

    expect(generateFieldMappings).toHaveBeenCalledWith(
      expect.any(Array),
      expect.anything(),
      undefined
    );
  });

  it('passes validation warnings through without failing the task', async () => {
    validateFieldMappings.mockResolvedValue({
      valid: false,
      errors: ['field "foo" has unsupported type'],
    });

    buildService();
    const abortController = new AbortController();
    const runner = createRunner(abortController);
    const result = await runner.run();

    expect(result.state.task_status).toBe(TASK_STATUSES.completed);
  });

  it('handles non-Error thrown values in the error path', async () => {
    AgentService.mockImplementation(() => ({
      invokeAutomaticImportAgent: jest.fn().mockRejectedValue('string error'),
    }));

    buildService();
    const abortController = new AbortController();
    const runner = createRunner(abortController);
    const result = await runner.run();

    expect(result.state.task_status).toBe(TASK_STATUSES.failed);
    expect(mockAnalytics.reportEvent).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ errorMessage: 'string error' })
    );
  });
});
