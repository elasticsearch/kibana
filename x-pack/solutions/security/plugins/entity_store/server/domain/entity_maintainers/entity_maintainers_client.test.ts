/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { EntityMaintainersClient } from './entity_maintainers_client';
import { loggerMock } from '@kbn/logging-mocks';
import type { TaskManagerStartContract } from '@kbn/task-manager-plugin/server';
import type { CoreStart, KibanaRequest } from '@kbn/core/server';
import { SavedObjectsErrorHelpers } from '@kbn/core/server';
import type { LicensingPluginStart } from '@kbn/licensing-plugin/server';
import { DEFAULT_ENTITY_MAINTAINER_MIN_LICENSE } from '../../tasks/entity_maintainers';
import { EntityMaintainerTaskStatus } from '../../tasks/entity_maintainers/types';
import type { EntityMaintainerTaskEntry } from '../../tasks/entity_maintainers/types';

jest.mock('../../tasks/entity_maintainers', () => ({
  getTaskId: jest.fn((id: string, namespace: string) => `${id}:${namespace}`),
  removeEntityMaintainer: jest.fn().mockResolvedValue(undefined),
  scheduleEntityMaintainerTask: jest.fn().mockResolvedValue(undefined),
  startEntityMaintainer: jest.fn().mockResolvedValue(undefined),
  stopEntityMaintainer: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../tasks/entity_maintainers/execution', () => ({
  canRunMaintainerWithLicense: jest.fn().mockResolvedValue(true),
  createMaintainerStatus: jest.fn((params: { namespace?: string; initialState: object }) => ({
    metadata: {
      runs: 0,
      lastSuccessTimestamp: null,
      lastErrorTimestamp: null,
      namespace: params.namespace ?? '',
    },
    state: params.initialState,
    taskStatus: 'started',
  })),
  runEntityMaintainerTask: jest.fn().mockResolvedValue({
    state: {
      metadata: {
        runs: 1,
        lastSuccessTimestamp: 'now',
        lastErrorTimestamp: null,
        namespace: 'default',
      },
      state: {},
      taskStatus: 'started',
    },
  }),
  persistMaintainerState: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../tasks/entity_maintainers/entity_maintainers_registry', () => ({
  entityMaintainersRegistry: {
    hasId: jest.fn(),
    getAll: jest.fn().mockReturnValue([]),
    get: jest.fn(),
    getLifecycle: jest.fn(),
  },
}));

jest.mock('@kbn/core/server', () => {
  const actual = jest.requireActual('@kbn/core/server');
  return {
    ...actual,
    SavedObjectsErrorHelpers: {
      isNotFoundError: jest.fn().mockReturnValue(false),
    },
  };
});

const {
  getTaskId,
  removeEntityMaintainer,
  scheduleEntityMaintainerTask,
  startEntityMaintainer,
  stopEntityMaintainer,
} = jest.requireMock('../../tasks/entity_maintainers') as {
  getTaskId: jest.MockedFunction<(id: string, namespace: string) => string>;
  removeEntityMaintainer: jest.MockedFunction<
    typeof import('../../tasks/entity_maintainers').removeEntityMaintainer
  >;
  scheduleEntityMaintainerTask: jest.MockedFunction<
    typeof import('../../tasks/entity_maintainers').scheduleEntityMaintainerTask
  >;
  startEntityMaintainer: jest.MockedFunction<
    typeof import('../../tasks/entity_maintainers').startEntityMaintainer
  >;
  stopEntityMaintainer: jest.MockedFunction<
    typeof import('../../tasks/entity_maintainers').stopEntityMaintainer
  >;
};

const {
  canRunMaintainerWithLicense,
  createMaintainerStatus,
  runEntityMaintainerTask,
  persistMaintainerState,
} = jest.requireMock('../../tasks/entity_maintainers/execution') as {
  canRunMaintainerWithLicense: jest.MockedFunction<
    typeof import('../../tasks/entity_maintainers/execution').canRunMaintainerWithLicense
  >;
  createMaintainerStatus: jest.MockedFunction<
    typeof import('../../tasks/entity_maintainers/execution').createMaintainerStatus
  >;
  runEntityMaintainerTask: jest.MockedFunction<
    typeof import('../../tasks/entity_maintainers/execution').runEntityMaintainerTask
  >;
  persistMaintainerState: jest.MockedFunction<
    typeof import('../../tasks/entity_maintainers/execution').persistMaintainerState
  >;
};

const { entityMaintainersRegistry } = jest.requireMock(
  '../../tasks/entity_maintainers/entity_maintainers_registry'
) as {
  entityMaintainersRegistry: {
    hasId: jest.MockedFunction<(id: string) => boolean>;
    getAll: jest.MockedFunction<() => EntityMaintainerTaskEntry[]>;
    get: jest.MockedFunction<
      typeof import('../../tasks/entity_maintainers/entity_maintainers_registry').entityMaintainersRegistry.get
    >;
    getLifecycle: jest.MockedFunction<
      typeof import('../../tasks/entity_maintainers/entity_maintainers_registry').entityMaintainersRegistry.getLifecycle
    >;
  };
};

const mockSavedObjectsErrorHelpers = SavedObjectsErrorHelpers as jest.Mocked<
  typeof SavedObjectsErrorHelpers
>;

const mockAnalytics = {
  reportEvent: jest.fn(),
};

function createClient(overrides?: {
  taskManager?: Partial<TaskManagerStartContract>;
  namespace?: string;
}) {
  const taskManager = {
    get: jest.fn(),
    runSoon: jest.fn().mockResolvedValue({ id: 'id:default', forced: false }),
    ...overrides?.taskManager,
  } as unknown as TaskManagerStartContract;

  const coreStart = {
    elasticsearch: {
      client: {
        asScoped: jest.fn().mockReturnValue({ asCurrentUser: {} }),
      },
    },
  } as unknown as CoreStart;

  const licensing = {
    getLicense: jest
      .fn()
      .mockResolvedValue({ check: jest.fn().mockReturnValue({ state: 'valid' }) }),
  } as unknown as LicensingPluginStart;

  return new EntityMaintainersClient({
    logger: loggerMock.create(),
    taskManager,
    namespace: overrides?.namespace ?? 'default',
    analytics: mockAnalytics,
    coreStart,
    licensing,
  });
}

function createMockRequest(): KibanaRequest {
  return {} as KibanaRequest;
}

describe('EntityMaintainersClient', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSavedObjectsErrorHelpers.isNotFoundError.mockReturnValue(false);
    entityMaintainersRegistry.hasId.mockReturnValue(true);
    entityMaintainersRegistry.get.mockReturnValue({
      id: 'maintainer-a',
      interval: '5m',
      minLicense: DEFAULT_ENTITY_MAINTAINER_MIN_LICENSE,
    });
  });

  describe('start', () => {
    it('should return without starting when id is not in registry', async () => {
      entityMaintainersRegistry.hasId.mockReturnValue(false);
      const client = createClient();
      const request = createMockRequest();

      await client.start('unknown-id', request);

      expect(entityMaintainersRegistry.hasId).toHaveBeenCalledWith('unknown-id');
      expect(startEntityMaintainer).not.toHaveBeenCalled();
    });

    it('should start task when id is in registry', async () => {
      entityMaintainersRegistry.hasId.mockReturnValue(true);
      const client = createClient();
      const request = createMockRequest();

      await client.start('maintainer-a', request);

      expect(startEntityMaintainer).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'maintainer-a',
          namespace: 'default',
          request,
        })
      );
    });

    it('should propagate error when startEntityMaintainer throws', async () => {
      entityMaintainersRegistry.hasId.mockReturnValue(true);
      (startEntityMaintainer as jest.Mock).mockRejectedValueOnce(new Error('start failed'));
      const client = createClient();
      const request = createMockRequest();

      await expect(client.start('maintainer-a', request)).rejects.toThrow('start failed');
    });
  });

  describe('runNow', () => {
    it('should return without calling runSoon when id is not in registry', async () => {
      entityMaintainersRegistry.hasId.mockReturnValue(false);
      const runSoonMock = jest.fn().mockResolvedValue({ id: 'id:default', forced: false });
      const client = createClient({ taskManager: { runSoon: runSoonMock } });
      await client.runNow('unknown-id');

      expect(entityMaintainersRegistry.hasId).toHaveBeenCalledWith('unknown-id');
      expect(runSoonMock).not.toHaveBeenCalled();
    });

    it('should call taskManager.runSoon with task id when id is in registry', async () => {
      entityMaintainersRegistry.hasId.mockReturnValue(true);
      const runSoonMock = jest.fn().mockResolvedValue({ id: 'id:default', forced: false });
      const client = createClient({ taskManager: { runSoon: runSoonMock } });

      await client.runNow('maintainer-a');

      expect(getTaskId).toHaveBeenCalledWith('maintainer-a', 'default');
      expect(runSoonMock).toHaveBeenCalledWith('maintainer-a:default');
    });

    it('should propagate error when runSoon throws', async () => {
      entityMaintainersRegistry.hasId.mockReturnValue(true);
      const client = createClient({
        taskManager: { runSoon: jest.fn().mockRejectedValue(new Error('runSoon failed')) },
      });

      await expect(client.runNow('maintainer-a')).rejects.toThrow('runSoon failed');
    });
  });

  describe('runSync', () => {
    const mockRun = jest.fn().mockResolvedValue({});
    const mockLifecycle = { run: mockRun, initialState: {} };

    beforeEach(() => {
      createMaintainerStatus.mockReturnValue({
        metadata: {
          runs: 1,
          lastSuccessTimestamp: null,
          lastErrorTimestamp: null,
          namespace: 'default',
        },
        state: {},
        taskStatus: EntityMaintainerTaskStatus.STARTED,
      });
      runEntityMaintainerTask.mockResolvedValue({
        state: {
          metadata: {
            runs: 2,
            lastSuccessTimestamp: 'now',
            lastErrorTimestamp: null,
            namespace: 'default',
          },
          state: { next: true },
          taskStatus: EntityMaintainerTaskStatus.STARTED,
        },
      });
      mockRun.mockClear();
    });

    it('should return without running when id is not in registry', async () => {
      entityMaintainersRegistry.hasId.mockReturnValue(false);
      const client = createClient();
      const request = createMockRequest();

      await client.runSync('unknown-id', request);

      expect(entityMaintainersRegistry.hasId).toHaveBeenCalledWith('unknown-id');
      expect(entityMaintainersRegistry.getLifecycle).not.toHaveBeenCalled();
    });

    it('should run registered callbacks and persist returned state', async () => {
      const taskState = {
        namespace: 'default',
        taskStatus: EntityMaintainerTaskStatus.STARTED,
        metadata: { runs: 1, lastSuccessTimestamp: null, lastErrorTimestamp: null },
        state: {},
      };
      entityMaintainersRegistry.getLifecycle.mockReturnValue(mockLifecycle);
      entityMaintainersRegistry.get.mockReturnValue({
        id: 'maintainer-a',
        interval: '5m',
        minLicense: DEFAULT_ENTITY_MAINTAINER_MIN_LICENSE,
      });
      const taskManagerGet = jest.fn().mockResolvedValue({ state: taskState });
      const client = createClient({
        taskManager: { get: taskManagerGet, bulkUpdateState: jest.fn() } as any,
      });
      const request = createMockRequest();

      await client.runSync('maintainer-a', request);

      expect(taskManagerGet).toHaveBeenCalledWith('maintainer-a:default');
      expect(createMaintainerStatus).toHaveBeenCalledWith(
        expect.objectContaining({
          status: taskState,
          namespace: 'default',
          initialState: {},
        })
      );
      expect(canRunMaintainerWithLicense).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'maintainer-a',
          minLicense: DEFAULT_ENTITY_MAINTAINER_MIN_LICENSE,
        })
      );
      expect(runEntityMaintainerTask).toHaveBeenCalledWith(
        expect.objectContaining({
          status: expect.objectContaining({
            taskStatus: EntityMaintainerTaskStatus.STARTED,
          }),
          fakeRequest: request,
          id: 'maintainer-a',
          run: mockRun,
        })
      );
      expect(persistMaintainerState).toHaveBeenCalledWith(
        expect.objectContaining({
          taskId: 'maintainer-a:default',
          request,
          state: expect.objectContaining({
            metadata: expect.objectContaining({ runs: 2 }),
          }),
        })
      );
    });

    it('should propagate error when runEntityMaintainerTask throws', async () => {
      runEntityMaintainerTask.mockRejectedValueOnce(new Error('run failed'));
      entityMaintainersRegistry.getLifecycle.mockReturnValue(mockLifecycle);
      entityMaintainersRegistry.get.mockReturnValue({
        id: 'maintainer-a',
        interval: '5m',
        minLicense: DEFAULT_ENTITY_MAINTAINER_MIN_LICENSE,
      });
      const taskManagerGet = jest.fn().mockResolvedValue({ state: {} });
      const client = createClient({ taskManager: { get: taskManagerGet } });

      await expect(client.runSync('maintainer-a', createMockRequest())).rejects.toThrow(
        'run failed'
      );
    });

    it('should skip sync execution when license is invalid', async () => {
      canRunMaintainerWithLicense.mockResolvedValueOnce(false);
      entityMaintainersRegistry.getLifecycle.mockReturnValue(mockLifecycle);
      const taskManagerGet = jest.fn().mockResolvedValue({ state: {} });
      const client = createClient({ taskManager: { get: taskManagerGet } });

      await client.runSync('maintainer-a', createMockRequest());

      expect(taskManagerGet).not.toHaveBeenCalled();
      expect(runEntityMaintainerTask).not.toHaveBeenCalled();
      expect(persistMaintainerState).not.toHaveBeenCalled();
    });
  });

  describe('init', () => {
    it('should schedule only maintainers without an existing task', async () => {
      entityMaintainersRegistry.getAll.mockReturnValue([
        {
          id: 'm1',
          interval: '5m',
          description: 'M1',
          minLicense: DEFAULT_ENTITY_MAINTAINER_MIN_LICENSE,
        },
        {
          id: 'm2',
          interval: '1h',
          description: 'M2',
          minLicense: DEFAULT_ENTITY_MAINTAINER_MIN_LICENSE,
        },
      ]);
      const taskManager = {
        get: jest.fn().mockImplementation((taskId: string) => {
          if (taskId === 'm1:default') {
            return Promise.reject(new Error('Not found'));
          }
          return Promise.resolve({
            state: {
              metadata: { runs: 0 },
              state: {},
              taskStatus: EntityMaintainerTaskStatus.STARTED,
            },
          });
        }),
      };
      mockSavedObjectsErrorHelpers.isNotFoundError.mockReturnValue(true);
      const client = createClient({ taskManager: taskManager as any });
      const request = createMockRequest();

      await client.init(request);

      expect(scheduleEntityMaintainerTask).toHaveBeenCalledTimes(1);
      expect(scheduleEntityMaintainerTask).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'm1', interval: '5m', namespace: 'default', request })
      );
    });

    it('should not schedule when all maintainers already have tasks', async () => {
      entityMaintainersRegistry.getAll.mockReturnValue([
        {
          id: 'm1',
          interval: '5m',
          description: 'M1',
          minLicense: DEFAULT_ENTITY_MAINTAINER_MIN_LICENSE,
        },
      ]);
      const taskManager = {
        get: jest.fn().mockResolvedValue({
          state: {
            metadata: { runs: 1 },
            state: {},
            taskStatus: EntityMaintainerTaskStatus.STARTED,
          },
        }),
      };
      const client = createClient({ taskManager: taskManager as any });
      const request = createMockRequest();

      await client.init(request);

      expect(scheduleEntityMaintainerTask).not.toHaveBeenCalled();
    });

    it('should propagate error when scheduleEntityMaintainerTask rejects', async () => {
      entityMaintainersRegistry.getAll.mockReturnValue([
        {
          id: 'm1',
          interval: '5m',
          description: 'M1',
          minLicense: DEFAULT_ENTITY_MAINTAINER_MIN_LICENSE,
        },
      ]);
      const taskManager = {
        get: jest.fn().mockRejectedValue(new Error('Not found')),
      };
      mockSavedObjectsErrorHelpers.isNotFoundError.mockReturnValue(true);
      (scheduleEntityMaintainerTask as jest.Mock).mockRejectedValueOnce(
        new Error('schedule failed')
      );
      const client = createClient({ taskManager: taskManager as any });
      const request = createMockRequest();

      await expect(client.init(request)).rejects.toThrow('schedule failed');
    });

    it('should forward autoStart option when scheduling maintainers', async () => {
      entityMaintainersRegistry.getAll.mockReturnValue([
        {
          id: 'm1',
          interval: '5m',
          description: 'M1',
          minLicense: DEFAULT_ENTITY_MAINTAINER_MIN_LICENSE,
        },
      ]);
      const taskManager = {
        get: jest.fn().mockRejectedValue(new Error('Not found')),
      };
      mockSavedObjectsErrorHelpers.isNotFoundError.mockReturnValue(true);
      const client = createClient({ taskManager: taskManager as any });
      const request = createMockRequest();

      await client.init(request, { autoStart: false });

      expect(scheduleEntityMaintainerTask).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'm1',
          enabled: false,
        })
      );
    });
  });

  describe('stop', () => {
    it('should return without stopping when id is not in registry', async () => {
      entityMaintainersRegistry.hasId.mockReturnValue(false);
      const client = createClient();
      const request = createMockRequest();

      await client.stop('unknown-id', request);

      expect(stopEntityMaintainer).not.toHaveBeenCalled();
    });

    it('should stop task when id is in registry', async () => {
      entityMaintainersRegistry.hasId.mockReturnValue(true);
      const client = createClient();
      const request = createMockRequest();

      await client.stop('maintainer-a', request);

      expect(stopEntityMaintainer).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'maintainer-a',
          namespace: 'default',
          request,
        })
      );
    });

    it('should propagate error when stopEntityMaintainer throws', async () => {
      entityMaintainersRegistry.hasId.mockReturnValue(true);
      (stopEntityMaintainer as jest.Mock).mockRejectedValueOnce(new Error('stop failed'));
      const client = createClient();
      const request = createMockRequest();

      await expect(client.stop('maintainer-a', request)).rejects.toThrow('stop failed');
    });
  });

  describe('removeAll', () => {
    it('should remove all registered tasks', async () => {
      const entries: EntityMaintainerTaskEntry[] = [
        { id: 'm1', interval: '5m', minLicense: DEFAULT_ENTITY_MAINTAINER_MIN_LICENSE },
        { id: 'm2', interval: '1h', minLicense: DEFAULT_ENTITY_MAINTAINER_MIN_LICENSE },
      ];
      entityMaintainersRegistry.getAll.mockReturnValue(entries);
      const client = createClient();

      await client.removeAll();

      expect(entityMaintainersRegistry.getAll).toHaveBeenCalled();
      expect(removeEntityMaintainer).toHaveBeenCalledTimes(2);
      expect(removeEntityMaintainer).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'm1', namespace: 'default' })
      );
      expect(removeEntityMaintainer).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'm2', namespace: 'default' })
      );
    });

    it('should propagate error when any remove fails', async () => {
      const entries: EntityMaintainerTaskEntry[] = [
        { id: 'm1', interval: '5m', minLicense: DEFAULT_ENTITY_MAINTAINER_MIN_LICENSE },
        { id: 'm2', interval: '1h', minLicense: DEFAULT_ENTITY_MAINTAINER_MIN_LICENSE },
      ];
      entityMaintainersRegistry.getAll.mockReturnValue(entries);
      (removeEntityMaintainer as jest.Mock)
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('remove failed'));
      const client = createClient();

      await expect(client.removeAll()).rejects.toThrow('remove failed');
    });
  });

  describe('stopAll', () => {
    it('should stop all registered maintainer tasks', async () => {
      const entries: EntityMaintainerTaskEntry[] = [
        { id: 'm1', interval: '5m', minLicense: DEFAULT_ENTITY_MAINTAINER_MIN_LICENSE },
        { id: 'm2', interval: '1h', minLicense: DEFAULT_ENTITY_MAINTAINER_MIN_LICENSE },
      ];
      entityMaintainersRegistry.getAll.mockReturnValue(entries);
      entityMaintainersRegistry.hasId.mockReturnValue(true);
      const client = createClient();
      const request = createMockRequest();

      await client.stopAll(request);

      expect(entityMaintainersRegistry.getAll).toHaveBeenCalled();
      expect(stopEntityMaintainer).toHaveBeenCalledTimes(2);
      expect(stopEntityMaintainer).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'm1', namespace: 'default', request })
      );
      expect(stopEntityMaintainer).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'm2', namespace: 'default', request })
      );
    });

    it('should do nothing when registry is empty', async () => {
      entityMaintainersRegistry.getAll.mockReturnValue([]);
      const client = createClient();

      await client.stopAll(createMockRequest());

      expect(stopEntityMaintainer).not.toHaveBeenCalled();
    });

    it('should throw a combined error listing failed task ids when any stop fails', async () => {
      const entries: EntityMaintainerTaskEntry[] = [
        { id: 'm1', interval: '5m', minLicense: DEFAULT_ENTITY_MAINTAINER_MIN_LICENSE },
        { id: 'm2', interval: '1h', minLicense: DEFAULT_ENTITY_MAINTAINER_MIN_LICENSE },
      ];
      entityMaintainersRegistry.getAll.mockReturnValue(entries);
      entityMaintainersRegistry.hasId.mockReturnValue(true);
      (stopEntityMaintainer as jest.Mock)
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('stop failed'));
      const client = createClient();

      await expect(client.stopAll(createMockRequest())).rejects.toThrow(
        'Failed to stop 1 of 2 entity maintainer tasks: m2'
      );
    });

    it('should run all tasks even when some fail', async () => {
      const entries: EntityMaintainerTaskEntry[] = [
        { id: 'm1', interval: '5m', minLicense: DEFAULT_ENTITY_MAINTAINER_MIN_LICENSE },
        { id: 'm2', interval: '1h', minLicense: DEFAULT_ENTITY_MAINTAINER_MIN_LICENSE },
      ];
      entityMaintainersRegistry.getAll.mockReturnValue(entries);
      entityMaintainersRegistry.hasId.mockReturnValue(true);
      (stopEntityMaintainer as jest.Mock)
        .mockRejectedValueOnce(new Error('stop failed'))
        .mockResolvedValueOnce(undefined);
      const client = createClient();

      await expect(client.stopAll(createMockRequest())).rejects.toThrow();
      expect(stopEntityMaintainer).toHaveBeenCalledTimes(2);
    });
  });

  describe('startAll', () => {
    it('should start all registered maintainer tasks', async () => {
      const entries: EntityMaintainerTaskEntry[] = [
        { id: 'm1', interval: '5m', minLicense: DEFAULT_ENTITY_MAINTAINER_MIN_LICENSE },
        { id: 'm2', interval: '1h', minLicense: DEFAULT_ENTITY_MAINTAINER_MIN_LICENSE },
      ];
      entityMaintainersRegistry.getAll.mockReturnValue(entries);
      entityMaintainersRegistry.hasId.mockReturnValue(true);
      const client = createClient();
      const request = createMockRequest();

      await client.startAll(request);

      expect(entityMaintainersRegistry.getAll).toHaveBeenCalled();
      expect(startEntityMaintainer).toHaveBeenCalledTimes(2);
      expect(startEntityMaintainer).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'm1', namespace: 'default', request })
      );
      expect(startEntityMaintainer).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'm2', namespace: 'default', request })
      );
    });

    it('should do nothing when registry is empty', async () => {
      entityMaintainersRegistry.getAll.mockReturnValue([]);
      const client = createClient();

      await client.startAll(createMockRequest());

      expect(startEntityMaintainer).not.toHaveBeenCalled();
    });

    it('should throw a combined error listing failed task ids when any start fails', async () => {
      const entries: EntityMaintainerTaskEntry[] = [
        { id: 'm1', interval: '5m', minLicense: DEFAULT_ENTITY_MAINTAINER_MIN_LICENSE },
        { id: 'm2', interval: '1h', minLicense: DEFAULT_ENTITY_MAINTAINER_MIN_LICENSE },
      ];
      entityMaintainersRegistry.getAll.mockReturnValue(entries);
      entityMaintainersRegistry.hasId.mockReturnValue(true);
      (startEntityMaintainer as jest.Mock)
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('start failed'));
      const client = createClient();

      await expect(client.startAll(createMockRequest())).rejects.toThrow(
        'Failed to start 1 of 2 entity maintainer tasks: m2'
      );
    });

    it('should run all tasks even when some fail', async () => {
      const entries: EntityMaintainerTaskEntry[] = [
        { id: 'm1', interval: '5m', minLicense: DEFAULT_ENTITY_MAINTAINER_MIN_LICENSE },
        { id: 'm2', interval: '1h', minLicense: DEFAULT_ENTITY_MAINTAINER_MIN_LICENSE },
      ];
      entityMaintainersRegistry.getAll.mockReturnValue(entries);
      entityMaintainersRegistry.hasId.mockReturnValue(true);
      (startEntityMaintainer as jest.Mock)
        .mockRejectedValueOnce(new Error('start failed'))
        .mockResolvedValueOnce(undefined);
      const client = createClient();

      await expect(client.startAll(createMockRequest())).rejects.toThrow();
      expect(startEntityMaintainer).toHaveBeenCalledTimes(2);
    });
  });

  describe('getMaintainers', () => {
    it('should only return requested maintainers when ids filter is provided', async () => {
      entityMaintainersRegistry.getAll.mockReturnValue([
        { id: 'm1', interval: '5m', minLicense: DEFAULT_ENTITY_MAINTAINER_MIN_LICENSE },
        { id: 'm2', interval: '10m', minLicense: DEFAULT_ENTITY_MAINTAINER_MIN_LICENSE },
      ]);
      const taskManagerGet = jest.fn().mockRejectedValue(new Error('Not found'));
      const client = createClient({ taskManager: { get: taskManagerGet } });
      mockSavedObjectsErrorHelpers.isNotFoundError.mockReturnValue(true);

      const result = await client.getMaintainers(['m2']);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('m2');
      expect(taskManagerGet).toHaveBeenCalledTimes(1);
      expect(taskManagerGet).toHaveBeenCalledWith('m2:default');
    });

    it('should return entries with taskStatus NOT_STARTED and no taskSnapshot when task does not exist (not-found)', async () => {
      entityMaintainersRegistry.getAll.mockReturnValue([
        {
          id: 'm1',
          interval: '5m',
          description: 'Maintainer one',
          minLicense: DEFAULT_ENTITY_MAINTAINER_MIN_LICENSE,
        },
      ]);
      const taskManagerGet = jest.fn().mockRejectedValue(new Error('Not found'));
      const client = createClient({ taskManager: { get: taskManagerGet } });
      mockSavedObjectsErrorHelpers.isNotFoundError.mockReturnValue(true);

      const result = await client.getMaintainers();

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        id: 'm1',
        taskStatus: EntityMaintainerTaskStatus.NEVER_STARTED,
        interval: '5m',
        description: 'Maintainer one',
        nextRunAt: null,
        minLicense: DEFAULT_ENTITY_MAINTAINER_MIN_LICENSE,
        taskSnapshot: undefined,
      });
      expect(getTaskId).toHaveBeenCalledWith('m1', 'default');
      expect(taskManagerGet).toHaveBeenCalledWith('m1:default');
    });

    it('should return entries with taskSnapshot and taskStatus from task state when task exists', async () => {
      entityMaintainersRegistry.getAll.mockReturnValue([
        { id: 'm1', interval: '5m', minLicense: 'gold' },
      ]);
      const taskManagerGet = jest.fn().mockResolvedValue({
        state: {
          taskStatus: EntityMaintainerTaskStatus.STARTED,
          metadata: {
            runs: 10,
            lastSuccessTimestamp: '2024-01-15T12:00:00.000Z',
            lastErrorTimestamp: null,
          },
          state: { custom: 'state' },
        },
      });
      const client = createClient({ taskManager: { get: taskManagerGet } });

      const result = await client.getMaintainers();

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: 'm1',
        taskStatus: EntityMaintainerTaskStatus.STARTED,
        interval: '5m',
        nextRunAt: null,
        minLicense: 'gold',
        taskSnapshot: {
          runs: 10,
          lastSuccessTimestamp: '2024-01-15T12:00:00.000Z',
          lastErrorTimestamp: null,
          state: { custom: 'state' },
        },
      });
    });

    it('should return taskStatus from task state', async () => {
      entityMaintainersRegistry.getAll.mockReturnValue([
        {
          id: 'm1',
          interval: '5m',
          description: 'Registry says stopped',
          minLicense: DEFAULT_ENTITY_MAINTAINER_MIN_LICENSE,
        },
      ]);
      const taskManagerGet = jest.fn().mockResolvedValue({
        state: {
          taskStatus: EntityMaintainerTaskStatus.STOPPED,
          metadata: {
            runs: 3,
            lastSuccessTimestamp: '2024-01-10T08:00:00.000Z',
            lastErrorTimestamp: null,
          },
          state: { entityCount: 42 },
        },
      });
      const client = createClient({ taskManager: { get: taskManagerGet } });

      const result = await client.getMaintainers();

      expect(result).toHaveLength(1);
      expect(result[0].taskStatus).toBe(EntityMaintainerTaskStatus.STOPPED);
      expect(result[0].nextRunAt).toBeNull();
      expect(result[0].taskSnapshot).toEqual({
        runs: 3,
        lastSuccessTimestamp: '2024-01-10T08:00:00.000Z',
        lastErrorTimestamp: null,
        state: { entityCount: 42 },
      });
    });

    it('should propagate non-not-found errors from taskManager.get', async () => {
      entityMaintainersRegistry.getAll.mockReturnValue([
        { id: 'm1', interval: '5m', minLicense: DEFAULT_ENTITY_MAINTAINER_MIN_LICENSE },
      ]);
      const taskManagerGet = jest.fn().mockRejectedValue(new Error('ES connection failed'));
      const client = createClient({ taskManager: { get: taskManagerGet } });
      mockSavedObjectsErrorHelpers.isNotFoundError.mockReturnValue(false);

      await expect(client.getMaintainers()).rejects.toThrow('ES connection failed');
    });

    it('should use default runs and timestamps when task state metadata is missing', async () => {
      entityMaintainersRegistry.getAll.mockReturnValue([
        { id: 'm1', interval: '5m', minLicense: DEFAULT_ENTITY_MAINTAINER_MIN_LICENSE },
      ]);
      const taskManagerGet = jest.fn().mockResolvedValue({
        state: {
          taskStatus: EntityMaintainerTaskStatus.STARTED,
          metadata: undefined,
          state: {},
        },
      });
      const client = createClient({ taskManager: { get: taskManagerGet } });

      const result = await client.getMaintainers();

      expect(result[0].taskStatus).toBe(EntityMaintainerTaskStatus.STARTED);
      expect(result[0].nextRunAt).toBeNull();
      expect(result[0].taskSnapshot).toEqual({
        runs: 0,
        lastSuccessTimestamp: null,
        lastErrorTimestamp: null,
        state: {},
      });
    });

    it('should include nextRunAt when task manager returns runAt', async () => {
      entityMaintainersRegistry.getAll.mockReturnValue([
        { id: 'm1', interval: '5m', minLicense: DEFAULT_ENTITY_MAINTAINER_MIN_LICENSE },
      ]);
      const runAt = new Date('2024-03-02T10:00:00.000Z');
      const taskManagerGet = jest.fn().mockResolvedValue({
        state: {
          taskStatus: EntityMaintainerTaskStatus.STARTED,
          metadata: { runs: 1 },
          state: {},
        },
        runAt,
      });
      const client = createClient({ taskManager: { get: taskManagerGet } });

      const result = await client.getMaintainers();

      expect(result[0].nextRunAt).toBe(runAt.toISOString());
    });
  });
});
