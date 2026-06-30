/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { loggerMock } from '@kbn/logging-mocks';
import type { KibanaRequest } from '@kbn/core/server';
import { taskManagerMock } from '@kbn/task-manager-plugin/server/mocks';
import {
  DEFAULT_ENTITY_MAINTAINER_TIMEOUT,
  DEFAULT_ENTITY_MAINTAINER_MIN_LICENSE,
  registerEntityMaintainerTask,
  scheduleEntityMaintainerTask,
} from '.';
import type { RegisterEntityMaintainerConfig } from './types';
import { EntityMaintainerTaskStatus } from './types';

const mockEnsureScheduled = jest.fn();
const mockRegisterTaskDefinitions = jest.fn();
const mockCreateInternalRepository = jest.fn();
const mockGetStartServices = jest.fn();
const mockLicenseCheck = jest.fn();
const mockGetLicense = jest.fn();

jest.mock('./entity_maintainers_registry', () => ({
  entityMaintainersRegistry: {
    getAll: jest.fn(),
    register: jest.fn(),
    hasId: jest.fn(),
  },
}));

const registryMock = jest.requireMock('./entity_maintainers_registry')
  .entityMaintainersRegistry as {
  register: jest.Mock;
  getAll: jest.Mock;
  hasId: jest.Mock;
};

function createMockDeps() {
  mockLicenseCheck.mockReturnValue({ state: 'valid' });
  mockGetLicense.mockResolvedValue({
    check: mockLicenseCheck,
    type: 'platinum',
  });
  const logger = loggerMock.create();
  (logger.get as jest.Mock) = jest.fn().mockReturnValue(logger);
  const request = { headers: {} } as KibanaRequest;
  const taskManagerStart = {
    ensureScheduled: mockEnsureScheduled.mockResolvedValue(undefined),
  };
  const taskManagerSetup = {
    registerTaskDefinitions: mockRegisterTaskDefinitions.mockImplementation((defs) => defs),
  };
  const mockEsClient = {};
  const coreStart = {
    savedObjects: {
      createInternalRepository: mockCreateInternalRepository.mockReturnValue({}),
    },
    elasticsearch: {
      client: {
        asScoped: () => ({ asCurrentUser: mockEsClient }),
      },
    },
  };
  const plugins = {
    licensing: {
      getLicense: mockGetLicense,
    },
  };
  const startContract = { createCRUDClient: jest.fn() };
  const core = {
    getStartServices: mockGetStartServices.mockResolvedValue([coreStart, plugins, startContract]),
  };
  const analytics = { reportEvent: jest.fn() };
  return {
    logger,
    request,
    taskManagerStart,
    taskManagerSetup,
    core,
    analytics,
  };
}

function createMockConfig(
  overrides?: Partial<RegisterEntityMaintainerConfig>
): RegisterEntityMaintainerConfig {
  const defaultRun = jest.fn().mockResolvedValue({ foo: 'bar' });
  const { run = defaultRun, ...rest } = overrides ?? {};
  return {
    id: 'test-maintainer',
    interval: '5m',
    initialState: {},
    run,
    description: 'Test maintainer',
    ...rest,
  };
}

describe('entity_maintainer task', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('scheduleEntityMaintainerTask', () => {
    it('should call ensureScheduled with correct id, taskType, and schedule for single task', async () => {
      const { logger, request, taskManagerStart } = createMockDeps();

      await scheduleEntityMaintainerTask({
        logger,
        taskManager: taskManagerStart as any,
        id: 'maintainer-a',
        interval: '1m',
        namespace: 'default',
        request,
      });

      expect(mockEnsureScheduled).toHaveBeenCalledTimes(1);
      expect(mockEnsureScheduled).toHaveBeenCalledWith(
        {
          id: 'maintainer-a:default',
          taskType: 'entity_store:v2:entity_maintainer_task:maintainer-a',
          schedule: { interval: '1m' },
          state: {
            namespace: 'default',
            taskStatus: EntityMaintainerTaskStatus.STARTED,
          },
          params: {},
          enabled: true,
        },
        { request }
      );
    });

    it('should schedule task as disabled when enabled option is false', async () => {
      const { logger, request, taskManagerStart } = createMockDeps();

      await scheduleEntityMaintainerTask({
        logger,
        taskManager: taskManagerStart as any,
        id: 'maintainer-a',
        interval: '1m',
        namespace: 'default',
        request,
        enabled: false,
      });

      expect(mockEnsureScheduled).toHaveBeenCalledTimes(1);
      expect(mockEnsureScheduled).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'maintainer-a:default',
          enabled: false,
        }),
        { request }
      );
    });

    it('should schedule multiple tasks when called multiple times', async () => {
      const { logger, request, taskManagerStart } = createMockDeps();

      await scheduleEntityMaintainerTask({
        logger,
        taskManager: taskManagerStart as any,
        id: 'maintainer-a',
        interval: '1m',
        namespace: 'default',
        request,
      });
      await scheduleEntityMaintainerTask({
        logger,
        taskManager: taskManagerStart as any,
        id: 'maintainer-b',
        interval: '5m',
        namespace: 'default',
        request,
      });

      expect(mockEnsureScheduled).toHaveBeenCalledTimes(2);
      expect(mockEnsureScheduled).toHaveBeenNthCalledWith(
        1,
        {
          id: 'maintainer-a:default',
          taskType: 'entity_store:v2:entity_maintainer_task:maintainer-a',
          schedule: { interval: '1m' },
          state: {
            namespace: 'default',
            taskStatus: EntityMaintainerTaskStatus.STARTED,
          },
          params: {},
          enabled: true,
        },
        { request }
      );
      expect(mockEnsureScheduled).toHaveBeenNthCalledWith(
        2,
        {
          id: 'maintainer-b:default',
          taskType: 'entity_store:v2:entity_maintainer_task:maintainer-b',
          schedule: { interval: '5m' },
          state: {
            namespace: 'default',
            taskStatus: EntityMaintainerTaskStatus.STARTED,
          },
          params: {},
          enabled: true,
        },
        { request }
      );
    });
  });

  describe('registerEntityMaintainerTask', () => {
    it('should register task definition with expected type and title', async () => {
      const { logger, taskManagerSetup, core, analytics } = createMockDeps();
      const config = createMockConfig();

      registerEntityMaintainerTask({
        taskManager: taskManagerSetup as any,
        logger,
        config,
        core: core as any,
        analytics,
      });
      await core.getStartServices();

      expect(mockRegisterTaskDefinitions).toHaveBeenCalledTimes(1);
      const [defs] = mockRegisterTaskDefinitions.mock.calls[0];
      const taskType = 'entity_store:v2:entity_maintainer_task:test-maintainer';
      expect(defs[taskType]).toBeDefined();
      expect(defs[taskType].title).toBe('Entity Store - Entity Maintainer Task');
      expect(defs[taskType].description).toBe('Test maintainer');
      expect(registryMock.register).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'test-maintainer',
          minLicense: DEFAULT_ENTITY_MAINTAINER_MIN_LICENSE,
        })
      );
    });

    it('should pass the configured timeout to task definition', async () => {
      const { logger, taskManagerSetup, core, analytics } = createMockDeps();
      const config = createMockConfig({ timeout: '60m' });

      registerEntityMaintainerTask({
        taskManager: taskManagerSetup as any,
        logger,
        config,
        core: core as any,
        analytics,
      });
      await core.getStartServices();

      const [defs] = mockRegisterTaskDefinitions.mock.calls[0];
      const taskType = 'entity_store:v2:entity_maintainer_task:test-maintainer';
      expect(defs[taskType].timeout).toBe('60m');
    });

    it('should use the default timeout when timeout is not configured', async () => {
      const { logger, taskManagerSetup, core, analytics } = createMockDeps();
      const config = createMockConfig();

      registerEntityMaintainerTask({
        taskManager: taskManagerSetup as any,
        logger,
        config,
        core: core as any,
        analytics,
      });
      await core.getStartServices();

      const [defs] = mockRegisterTaskDefinitions.mock.calls[0];
      const taskType = 'entity_store:v2:entity_maintainer_task:test-maintainer';
      expect(defs[taskType].timeout).toBe(DEFAULT_ENTITY_MAINTAINER_TIMEOUT);
    });

    it('should trigger the correct run method upon registration and scheduling', async () => {
      const { logger, taskManagerSetup, core, analytics } = createMockDeps();
      const run = jest.fn().mockResolvedValue({ key: 'value' });
      const config = createMockConfig({ run, minLicense: 'enterprise' });

      registerEntityMaintainerTask({
        taskManager: taskManagerSetup as any,
        logger,
        config,
        core: core as any,
        analytics,
      });
      await core.getStartServices();

      expect(registryMock.register).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'test-maintainer',
          minLicense: 'enterprise',
        })
      );

      const [defs] = mockRegisterTaskDefinitions.mock.calls[0];
      const taskType = 'entity_store:v2:entity_maintainer_task:test-maintainer';
      const createTaskRunner = defs[taskType].createTaskRunner;
      const runner = createTaskRunner(
        taskManagerMock.createRunContext({
          taskInstance: { id: 'test-maintainer:default', state: { namespace: 'default' } } as any,
          fakeRequest: { headers: {} } as KibanaRequest,
        })
      );

      await runner.run();

      expect(mockGetLicense).toHaveBeenCalled();
      expect(mockLicenseCheck).toHaveBeenCalledWith('entityStore', 'enterprise');
      expect(run).toHaveBeenCalledTimes(1);
      expect(run).toHaveBeenCalledWith(
        expect.objectContaining({
          status: expect.objectContaining({
            state: {},
          }),
          abortController: expect.any(AbortController),
          logger: expect.anything(),
          fakeRequest: expect.anything(),
          esClient: expect.anything(),
        })
      );
    });

    it('should not call run when license check is not valid', async () => {
      const { logger, taskManagerSetup, core, analytics } = createMockDeps();
      const run = jest.fn().mockResolvedValue({ key: 'value' });
      const config = createMockConfig({ run });

      registerEntityMaintainerTask({
        taskManager: taskManagerSetup as any,
        logger,
        config,
        core: core as any,
        analytics,
      });
      await core.getStartServices();

      mockLicenseCheck.mockReturnValueOnce({
        state: 'invalid',
        message: 'License does not support this feature',
      });

      const [defs] = mockRegisterTaskDefinitions.mock.calls[0];
      const taskType = 'entity_store:v2:entity_maintainer_task:test-maintainer';
      const createTaskRunner = defs[taskType].createTaskRunner;
      const taskState = {
        namespace: 'default',
        taskStatus: EntityMaintainerTaskStatus.STARTED,
        metadata: { runs: 0 },
      };
      const runner = createTaskRunner(
        taskManagerMock.createRunContext({
          taskInstance: { id: 'test-maintainer:default', state: taskState } as any,
          fakeRequest: { headers: {} } as KibanaRequest,
        })
      );

      const result = await runner.run();

      expect(run).not.toHaveBeenCalled();
      expect(logger.debug).toHaveBeenCalledWith(
        expect.stringContaining('skipped: insufficient or inactive license')
      );
      expect(result.state).toEqual(taskState);
    });

    it('should trigger all run methods when multiple registrations occur with single scheduling', async () => {
      const { logger, taskManagerSetup, core, analytics } = createMockDeps();
      const runA = jest.fn().mockResolvedValue({ from: 'a' });
      const runB = jest.fn().mockResolvedValue({ from: 'b' });

      registerEntityMaintainerTask({
        taskManager: taskManagerSetup as any,
        logger,
        config: createMockConfig({ id: 'maintainer-a', run: runA }),
        core: core as any,
        analytics,
      });
      await core.getStartServices();
      registerEntityMaintainerTask({
        taskManager: taskManagerSetup as any,
        logger,
        config: createMockConfig({ id: 'maintainer-b', run: runB }),
        core: core as any,
        analytics,
      });
      await core.getStartServices();

      expect(mockRegisterTaskDefinitions).toHaveBeenCalledTimes(2);
      const defs1 = mockRegisterTaskDefinitions.mock.calls[0][0];
      const defs2 = mockRegisterTaskDefinitions.mock.calls[1][0];
      const runnerA = defs1['entity_store:v2:entity_maintainer_task:maintainer-a'].createTaskRunner(
        taskManagerMock.createRunContext({
          taskInstance: { id: 'maintainer-a:default', state: { namespace: 'default' } } as any,
          fakeRequest: { headers: {} } as KibanaRequest,
        })
      );
      const runnerB = defs2['entity_store:v2:entity_maintainer_task:maintainer-b'].createTaskRunner(
        taskManagerMock.createRunContext({
          taskInstance: { id: 'maintainer-b:default', state: { namespace: 'default' } } as any,
          fakeRequest: { headers: {} } as KibanaRequest,
        })
      );

      await runnerA.run();
      await runnerB.run();

      expect(runA).toHaveBeenCalledTimes(1);
      expect(runB).toHaveBeenCalledTimes(1);
    });

    it('should execute setup method only once', async () => {
      const { logger, taskManagerSetup, core, analytics } = createMockDeps();
      const setup = jest.fn().mockResolvedValue({ initialized: true });
      const run = jest.fn().mockResolvedValue({ synced: true });
      const config = createMockConfig({ setup, run });

      registerEntityMaintainerTask({
        taskManager: taskManagerSetup as any,
        logger,
        config,
        core: core as any,
        analytics,
      });
      await core.getStartServices();

      const [defs] = mockRegisterTaskDefinitions.mock.calls[0];
      const taskType = 'entity_store:v2:entity_maintainer_task:test-maintainer';
      const createTaskRunner = defs[taskType].createTaskRunner;
      const fakeRequest = { headers: {} } as KibanaRequest;

      const runner1 = createTaskRunner(
        taskManagerMock.createRunContext({
          taskInstance: { id: 'test-maintainer:default', state: { namespace: 'default' } } as any,
          fakeRequest,
        })
      );
      await runner1.run();
      expect(setup).toHaveBeenCalledTimes(1);
      expect(run).toHaveBeenCalledTimes(1);

      const runner2 = createTaskRunner(
        taskManagerMock.createRunContext({
          taskInstance: {
            id: 'test-maintainer:default',
            state: {
              metadata: {
                runs: 1,
                lastSuccessTimestamp: new Date().toISOString(),
                lastErrorTimestamp: null,
                namespace: 'default',
              },
              state: { synced: true },
            },
          } as any,
          fakeRequest,
        })
      );
      await runner2.run();
      expect(setup).toHaveBeenCalledTimes(1);
      expect(run).toHaveBeenCalledTimes(2);
    });

    it('should change state across lifecycle as run or setup change it', async () => {
      const { logger, taskManagerSetup, core, analytics } = createMockDeps();
      const setup = jest.fn().mockResolvedValue({ setupState: 1 });
      const run = jest.fn().mockImplementation(({ status }) => {
        const prev = status.state.runState ?? status.state.setupState ?? 0;
        return Promise.resolve({ ...status.state, runState: prev + 1 });
      });
      const config = createMockConfig({ setup, run, initialState: { initial: 0 } });

      registerEntityMaintainerTask({
        taskManager: taskManagerSetup as any,
        logger,
        config,
        core: core as any,
        analytics,
      });
      await core.getStartServices();

      const [defs] = mockRegisterTaskDefinitions.mock.calls[0];
      const taskType = 'entity_store:v2:entity_maintainer_task:test-maintainer';
      const createTaskRunner = defs[taskType].createTaskRunner;
      const fakeRequest = { headers: {} } as KibanaRequest;

      const runner1 = createTaskRunner(
        taskManagerMock.createRunContext({
          taskInstance: { id: 'test-maintainer:default', state: { namespace: 'default' } } as any,
          fakeRequest,
        })
      );
      const result1 = await runner1.run();
      expect(result1.state.state.setupState).toBe(1);
      expect(result1.state.state.runState).toBe(2);

      const runner2 = createTaskRunner(
        taskManagerMock.createRunContext({
          taskInstance: { id: 'test-maintainer:default', state: result1.state } as any,
          fakeRequest,
        })
      );
      const result2 = await runner2.run();
      expect(result2.state.state.runState).toBe(3);
    });

    it('should populate lastErrorTimestamp when run throws', async () => {
      const { logger, taskManagerSetup, core, analytics } = createMockDeps();
      const run = jest.fn().mockRejectedValue(new Error('run failed'));
      const config = createMockConfig({ run });

      registerEntityMaintainerTask({
        taskManager: taskManagerSetup as any,
        logger,
        config,
        core: core as any,
        analytics,
      });
      await core.getStartServices();

      const [defs] = mockRegisterTaskDefinitions.mock.calls[0];
      const taskType = 'entity_store:v2:entity_maintainer_task:test-maintainer';
      const createTaskRunner = defs[taskType].createTaskRunner;
      const runner = createTaskRunner(
        taskManagerMock.createRunContext({
          taskInstance: { id: 'test-maintainer:default', state: { namespace: 'default' } } as any,
          fakeRequest: { headers: {} } as KibanaRequest,
        })
      );

      const result = await runner.run();

      expect(result.state.metadata.lastErrorTimestamp).toBeDefined();
      expect(typeof result.state.metadata.lastErrorTimestamp).toBe('string');
      expect(result.state.metadata.runs).toBe(1);
    });

    it('should set status.metadata lastSuccessTimestamp and runs correctly', async () => {
      const { logger, taskManagerSetup, core, analytics } = createMockDeps();
      const run = jest.fn().mockResolvedValue({ done: true });
      const config = createMockConfig({ run });

      registerEntityMaintainerTask({
        taskManager: taskManagerSetup as any,
        logger,
        config,
        core: core as any,
        analytics,
      });
      await core.getStartServices();

      const [defs] = mockRegisterTaskDefinitions.mock.calls[0];
      const taskType = 'entity_store:v2:entity_maintainer_task:test-maintainer';
      const createTaskRunner = defs[taskType].createTaskRunner;
      const runner = createTaskRunner(
        taskManagerMock.createRunContext({
          taskInstance: { id: 'test-maintainer:default', state: { namespace: 'default' } } as any,
          fakeRequest: { headers: {} } as KibanaRequest,
        })
      );

      const result = await runner.run();

      expect(result.state.metadata.runs).toBe(1);
      expect(result.state.metadata.lastSuccessTimestamp).toBeDefined();
      expect(typeof result.state.metadata.lastSuccessTimestamp).toBe('string');
      expect(result.state.metadata.lastErrorTimestamp).toBeNull();
    });

    it('should return current state without calling run when fakeRequest is missing', async () => {
      const { logger, taskManagerSetup, core, analytics } = createMockDeps();
      const run = jest.fn();
      const config = createMockConfig({ run });

      registerEntityMaintainerTask({
        taskManager: taskManagerSetup as any,
        logger,
        config,
        core: core as any,
        analytics,
      });
      await core.getStartServices();

      const [defs] = mockRegisterTaskDefinitions.mock.calls[0];
      const taskType = 'entity_store:v2:entity_maintainer_task:test-maintainer';
      const createTaskRunner = defs[taskType].createTaskRunner;
      const currentState = { metadata: { runs: 2 }, state: { x: 1 } };
      const runner = createTaskRunner(
        taskManagerMock.createRunContext({
          taskInstance: { id: 'test-maintainer:default', state: currentState } as any,
          fakeRequest: undefined,
        })
      );

      const result = await runner.run();

      expect(run).not.toHaveBeenCalled();
      expect(result.state.metadata.runs).toBe(currentState.metadata.runs);
      expect(result.state.state).toEqual(currentState.state);
    });
  });
});
