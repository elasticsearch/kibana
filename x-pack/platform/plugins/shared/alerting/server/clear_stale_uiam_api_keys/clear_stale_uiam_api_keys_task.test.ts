/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { loggingSystemMock, coreMock } from '@kbn/core/server/mocks';
import type { CoreSetup, CoreStart } from '@kbn/core/server';
import type { ConcreteTaskInstance } from '@kbn/task-manager-plugin/server';
import { cloudMock } from '@kbn/cloud-plugin/server/mocks';
import type { AlertingPluginsStart } from '../plugin';
import { ClearStaleUiamApiKeysTask } from './clear_stale_uiam_api_keys_task';
import {
  CLEAR_STALE_UIAM_API_KEYS_TARGET_PROJECT_ID,
  CLEAR_STALE_UIAM_API_KEYS_TASK_ID,
  CLEAR_STALE_UIAM_API_KEYS_TASK_SCHEDULE,
  CLEAR_STALE_UIAM_API_KEYS_TASK_TYPE,
  CLEAR_STALE_UIAM_API_KEYS_RESCHEDULE_DELAY_MS,
  CLEAR_STALE_UIAM_API_KEYS_TAGS,
} from './constants';
import { emptyState } from './clear_stale_uiam_api_keys_task_state';
import { stripStaleUiamApiKeysFromRules } from './lib/strip_stale_uiam_api_keys';

jest.mock('./lib/strip_stale_uiam_api_keys', () => ({
  stripStaleUiamApiKeysFromRules: jest.fn(),
}));

const targetCloud = (projectId: string | undefined) => {
  const cloud = cloudMock.createSetup();
  // The mock defaults `serverless` to an object whose fields are all `undefined`. Mutate
  // only the project id so the rest of the contract remains realistic.
  (cloud as unknown as { serverless: { projectId?: string } }).serverless.projectId = projectId;
  return cloud;
};

const buildCoreSetup = (): CoreSetup<AlertingPluginsStart> => {
  const coreSetup = coreMock.createSetup() as unknown as CoreSetup<AlertingPluginsStart>;
  const coreStart = coreMock.createStart() as unknown as CoreStart;
  (coreSetup as unknown as { getStartServices: jest.Mock }).getStartServices = jest
    .fn()
    .mockResolvedValue([coreStart, {}]);
  return coreSetup;
};

const taskInstance = (
  state: Partial<{ runs: number; cleared: boolean }> = {}
): ConcreteTaskInstance =>
  ({
    state: { runs: state.runs ?? 0, cleared: state.cleared ?? false },
  } as unknown as ConcreteTaskInstance);

describe('ClearStaleUiamApiKeysTask', () => {
  const logger = loggingSystemMock.createLogger();
  const stripMock = stripStaleUiamApiKeysFromRules as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('register', () => {
    it('does not register when not serverless', () => {
      const task = new ClearStaleUiamApiKeysTask({ logger, isServerless: false });
      const taskManager = { registerTaskDefinitions: jest.fn() } as never;
      task.register({ core: buildCoreSetup(), taskManager });
      expect(
        (taskManager as { registerTaskDefinitions: jest.Mock }).registerTaskDefinitions
      ).not.toHaveBeenCalled();
    });

    it('registers the task definition when serverless', () => {
      const task = new ClearStaleUiamApiKeysTask({ logger, isServerless: true });
      const taskManager = { registerTaskDefinitions: jest.fn() } as never;
      task.register({ core: buildCoreSetup(), taskManager });
      expect(
        (taskManager as { registerTaskDefinitions: jest.Mock }).registerTaskDefinitions
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          [CLEAR_STALE_UIAM_API_KEYS_TASK_TYPE]: expect.objectContaining({
            title: expect.stringContaining('Clear stale UIAM API keys'),
            timeout: '5m',
            createTaskRunner: expect.any(Function),
          }),
        })
      );
    });

    it('logs error when serverless but taskManager is missing', () => {
      const task = new ClearStaleUiamApiKeysTask({ logger, isServerless: true });
      task.register({
        core: buildCoreSetup(),
        taskManager: undefined as never,
      });
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining(`during registration of ${CLEAR_STALE_UIAM_API_KEYS_TASK_TYPE}`),
        { tags: CLEAR_STALE_UIAM_API_KEYS_TAGS }
      );
    });
  });

  describe('start', () => {
    it('does nothing when not serverless', async () => {
      const task = new ClearStaleUiamApiKeysTask({ logger, isServerless: false });
      const ensureScheduled = jest.fn();
      const removeIfExists = jest.fn();
      await task.start({ taskManager: { ensureScheduled, removeIfExists } as never });
      expect(ensureScheduled).not.toHaveBeenCalled();
      expect(removeIfExists).not.toHaveBeenCalled();
    });

    it('logs error when serverless but taskManager is missing', async () => {
      const task = new ClearStaleUiamApiKeysTask({ logger, isServerless: true });
      await task.start({ taskManager: undefined as never });
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining(`during start of ${CLEAR_STALE_UIAM_API_KEYS_TASK_TYPE}`),
        { tags: CLEAR_STALE_UIAM_API_KEYS_TAGS }
      );
    });

    it('schedules the task only for the target project id', async () => {
      const task = new ClearStaleUiamApiKeysTask({
        logger,
        isServerless: true,
        cloud: targetCloud(CLEAR_STALE_UIAM_API_KEYS_TARGET_PROJECT_ID),
      });
      const ensureScheduled = jest.fn().mockResolvedValue(undefined);
      const removeIfExists = jest.fn();
      await task.start({ taskManager: { ensureScheduled, removeIfExists } as never });

      expect(ensureScheduled).toHaveBeenCalledWith({
        id: CLEAR_STALE_UIAM_API_KEYS_TASK_ID,
        taskType: CLEAR_STALE_UIAM_API_KEYS_TASK_TYPE,
        schedule: CLEAR_STALE_UIAM_API_KEYS_TASK_SCHEDULE,
        state: emptyState,
        params: {},
      });
      expect(removeIfExists).not.toHaveBeenCalled();
    });

    it('removes any stray scheduled instance when the project id does not match', async () => {
      const task = new ClearStaleUiamApiKeysTask({
        logger,
        isServerless: true,
        cloud: targetCloud('some-other-project'),
      });
      const ensureScheduled = jest.fn();
      const removeIfExists = jest.fn().mockResolvedValue(undefined);
      await task.start({ taskManager: { ensureScheduled, removeIfExists } as never });

      expect(ensureScheduled).not.toHaveBeenCalled();
      expect(removeIfExists).toHaveBeenCalledWith(CLEAR_STALE_UIAM_API_KEYS_TASK_ID);
    });

    it('removes any stray scheduled instance when cloud is missing entirely', async () => {
      const task = new ClearStaleUiamApiKeysTask({ logger, isServerless: true });
      const ensureScheduled = jest.fn();
      const removeIfExists = jest.fn().mockResolvedValue(undefined);
      await task.start({ taskManager: { ensureScheduled, removeIfExists } as never });

      expect(ensureScheduled).not.toHaveBeenCalled();
      expect(removeIfExists).toHaveBeenCalledWith(CLEAR_STALE_UIAM_API_KEYS_TASK_ID);
    });

    it('logs but does not throw when ensureScheduled fails', async () => {
      const task = new ClearStaleUiamApiKeysTask({
        logger,
        isServerless: true,
        cloud: targetCloud(CLEAR_STALE_UIAM_API_KEYS_TARGET_PROJECT_ID),
      });
      const ensureScheduled = jest.fn().mockRejectedValue(new Error('boom'));
      const removeIfExists = jest.fn();
      await expect(
        task.start({ taskManager: { ensureScheduled, removeIfExists } as never })
      ).resolves.toBeUndefined();
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Error scheduling task'),
        expect.any(Object)
      );
    });
  });

  describe('runTask', () => {
    const runTaskViaRegister = async (
      task: ClearStaleUiamApiKeysTask,
      instance: ConcreteTaskInstance
    ) => {
      const definitions: Record<
        string,
        {
          createTaskRunner: (arg: { taskInstance: ConcreteTaskInstance }) => {
            run: () => Promise<unknown>;
          };
        }
      > = {};
      const taskManager = {
        registerTaskDefinitions: jest.fn((defs) => Object.assign(definitions, defs)),
      } as never;
      task.register({ core: buildCoreSetup(), taskManager });
      const runner = definitions[CLEAR_STALE_UIAM_API_KEYS_TASK_TYPE].createTaskRunner({
        taskInstance: instance,
      });
      return runner.run();
    };

    it('short-circuits when state.cleared is already true (no ES call)', async () => {
      const task = new ClearStaleUiamApiKeysTask({
        logger,
        isServerless: true,
        cloud: targetCloud(CLEAR_STALE_UIAM_API_KEYS_TARGET_PROJECT_ID),
      });
      const result = (await runTaskViaRegister(task, taskInstance({ runs: 5, cleared: true }))) as {
        state: { runs: number; cleared: boolean };
      };
      expect(stripMock).not.toHaveBeenCalled();
      expect(result.state).toEqual({ runs: 6, cleared: true });
    });

    it('refuses to run when projectId does not match (no ES call, no latch)', async () => {
      const task = new ClearStaleUiamApiKeysTask({
        logger,
        isServerless: true,
        cloud: targetCloud('some-other-project'),
      });
      const result = (await runTaskViaRegister(task, taskInstance())) as {
        state: { runs: number; cleared: boolean };
      };
      expect(stripMock).not.toHaveBeenCalled();
      expect(result).toEqual({ state: { runs: 1, cleared: false } });
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Refusing to run'), {
        tags: CLEAR_STALE_UIAM_API_KEYS_TAGS,
      });
    });

    it('latches when UBQ has no version conflicts', async () => {
      const task = new ClearStaleUiamApiKeysTask({
        logger,
        isServerless: true,
        cloud: targetCloud(CLEAR_STALE_UIAM_API_KEYS_TARGET_PROJECT_ID),
      });
      stripMock.mockResolvedValue({ updated: 3, versionConflicts: 0, noops: 17, total: 20 });
      const result = (await runTaskViaRegister(task, taskInstance())) as {
        state: { runs: number; cleared: boolean };
        runAt?: Date;
      };
      expect(stripMock).toHaveBeenCalledTimes(1);
      expect(result.state).toEqual({ runs: 1, cleared: true });
      expect(result.runAt).toBeUndefined();
    });

    it('reschedules and does NOT latch when UBQ reports version conflicts', async () => {
      const task = new ClearStaleUiamApiKeysTask({
        logger,
        isServerless: true,
        cloud: targetCloud(CLEAR_STALE_UIAM_API_KEYS_TARGET_PROJECT_ID),
      });
      stripMock.mockResolvedValue({ updated: 4, versionConflicts: 2, noops: 5, total: 11 });
      const before = Date.now();
      const result = (await runTaskViaRegister(task, taskInstance({ runs: 2 }))) as {
        state: { runs: number; cleared: boolean };
        runAt?: Date;
      };
      expect(result.state).toEqual({ runs: 3, cleared: false });
      expect(result.runAt).toBeInstanceOf(Date);
      const delta = result.runAt!.getTime() - before;
      expect(delta).toBeGreaterThanOrEqual(CLEAR_STALE_UIAM_API_KEYS_RESCHEDULE_DELAY_MS - 1000);
      expect(delta).toBeLessThanOrEqual(CLEAR_STALE_UIAM_API_KEYS_RESCHEDULE_DELAY_MS + 1000);
    });

    it('rethrows when the UBQ helper throws (Task Manager retry path)', async () => {
      const task = new ClearStaleUiamApiKeysTask({
        logger,
        isServerless: true,
        cloud: targetCloud(CLEAR_STALE_UIAM_API_KEYS_TARGET_PROJECT_ID),
      });
      stripMock.mockRejectedValue(new Error('ubq exploded'));
      await expect(runTaskViaRegister(task, taskInstance())).rejects.toThrow('ubq exploded');
    });
  });
});
