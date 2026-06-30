/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { loggingSystemMock, savedObjectsRepositoryMock, coreMock } from '@kbn/core/server/mocks';
import { taskManagerMock } from '@kbn/task-manager-plugin/server/mocks';
import type { Logger } from '@kbn/core/server';
import {
  initializeUserConnectorTokenCleanupTask,
  scheduleUserConnectorTokenCleanupTask,
  USER_CONNECTOR_TOKEN_CLEANUP_TASK_ID,
  USER_CONNECTOR_TOKEN_CLEANUP_TASK_TYPE,
  USER_CONNECTOR_TOKEN_CLEANUP_SCHEDULE,
} from './user_connector_token_cleanup_task';
import { cleanupStaleUserConnectorTokens } from './cleanup_stale_user_connector_tokens';

jest.mock('./cleanup_stale_user_connector_tokens');

const logger = loggingSystemMock.create().get() as jest.Mocked<Logger>;

describe('initializeUserConnectorTokenCleanupTask()', () => {
  test('registers the task definition', () => {
    const taskManagerSetup = taskManagerMock.createSetup();
    const core = coreMock.createSetup();

    initializeUserConnectorTokenCleanupTask(logger, taskManagerSetup, core as never);

    expect(taskManagerSetup.registerTaskDefinitions).toHaveBeenCalledWith(
      expect.objectContaining({
        [USER_CONNECTOR_TOKEN_CLEANUP_TASK_TYPE]: expect.objectContaining({
          title: 'User connector token cleanup task',
          timeout: '1m',
          createTaskRunner: expect.any(Function),
        }),
      })
    );
  });
});

describe('scheduleUserConnectorTokenCleanupTask()', () => {
  test('calls ensureScheduled with correct parameters', async () => {
    const taskManagerStart = taskManagerMock.createStart();

    scheduleUserConnectorTokenCleanupTask(logger, taskManagerStart);

    // allow the async scheduleTask to run
    await new Promise((resolve) => setImmediate(resolve));

    expect(taskManagerStart.ensureScheduled).toHaveBeenCalledWith({
      id: USER_CONNECTOR_TOKEN_CLEANUP_TASK_ID,
      taskType: USER_CONNECTOR_TOKEN_CLEANUP_TASK_TYPE,
      state: {},
      params: {},
      schedule: USER_CONNECTOR_TOKEN_CLEANUP_SCHEDULE,
    });
  });

  test('logs error when ensureScheduled fails', async () => {
    const taskManagerStart = taskManagerMock.createStart();
    taskManagerStart.ensureScheduled.mockRejectedValue(new Error('scheduling failed'));

    scheduleUserConnectorTokenCleanupTask(logger, taskManagerStart);

    await new Promise((resolve) => setImmediate(resolve));

    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining(`Error scheduling ${USER_CONNECTOR_TOKEN_CLEANUP_TASK_ID}`)
    );
  });
});

describe('task runner', () => {
  const mockCleanupStaleUserConnectorTokens =
    cleanupStaleUserConnectorTokens as jest.MockedFunction<typeof cleanupStaleUserConnectorTokens>;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  const buildTaskRunner = () => {
    const taskManagerSetup = taskManagerMock.createSetup();
    const savedObjectsRepository = savedObjectsRepositoryMock.create();
    const coreSetup = coreMock.createSetup();

    coreSetup.getStartServices.mockResolvedValue([
      {
        savedObjects: {
          createInternalRepository: jest.fn().mockReturnValue(savedObjectsRepository),
        },
      } as never,
      {} as never,
      {} as never,
    ]);

    initializeUserConnectorTokenCleanupTask(logger, taskManagerSetup, coreSetup as never);

    const registeredDefinitions = taskManagerSetup.registerTaskDefinitions.mock.calls[0][0];
    const taskDef = registeredDefinitions[USER_CONNECTOR_TOKEN_CLEANUP_TASK_TYPE];

    return taskDef.createTaskRunner(
      taskManagerMock.createRunContext({ taskInstance: {} as never })
    );
  };

  test('calls cleanupStaleUserConnectorTokens and returns empty state', async () => {
    mockCleanupStaleUserConnectorTokens.mockResolvedValue(5);

    const runner = buildTaskRunner();
    const result = await runner.run();

    expect(mockCleanupStaleUserConnectorTokens).toHaveBeenCalled();
    expect(result).toEqual({
      state: {},
      schedule: USER_CONNECTOR_TOKEN_CLEANUP_SCHEDULE,
    });
  });

  test('logs error and returns empty state on failure', async () => {
    mockCleanupStaleUserConnectorTokens.mockRejectedValue(new Error('cleanup failed'));

    const runner = buildTaskRunner();
    const result = await runner.run();

    expect(result).toEqual({
      state: {},
      schedule: USER_CONNECTOR_TOKEN_CLEANUP_SCHEDULE,
    });
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('User connector token cleanup task failed')
    );
  });
});
