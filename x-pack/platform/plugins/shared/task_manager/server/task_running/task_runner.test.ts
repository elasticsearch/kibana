/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import _ from 'lodash';
import { errors } from '@elastic/elasticsearch';
import { secondsFromNow, secondsFromDate } from '../lib/intervals';
import { asOk, asErr } from '../lib/result_type';
import {
  createTaskRunError,
  TaskErrorSource,
  TaskManagerRunner,
  TaskRunningStage,
  TaskRunResult,
} from '.';
import type { TaskEvent, TaskRun } from '../task_events';
import {
  asTaskRunEvent,
  asTaskMarkRunningEvent,
  TaskPersistence,
  asTaskManagerStatEvent,
} from '../task_events';
import type { ConcreteTaskInstance, TaskEventLogger } from '../task';
import { getDeleteTaskRunResult, TaskStatus, TaskCost, InstanceTaskCost } from '../task';
import { SavedObjectsErrorHelpers } from '@kbn/core/server';
import moment from 'moment';
import type { TaskDefinitionRegistry } from '../task_type_dictionary';
import { TaskTypeDictionary } from '../task_type_dictionary';
import { mockLogger } from '../test_utils';
import { throwRetryableError, throwUnrecoverableError } from './errors';
import apm from 'elastic-apm-node';
import { SpanStatusCode, trace } from '@opentelemetry/api';
import { tracing } from '@elastic/opentelemetry-node/sdk';
import { executionContextServiceMock } from '@kbn/core/server/mocks';
import { usageCountersServiceMock } from '@kbn/usage-collection-plugin/server/usage_counters/usage_counters_service.mock';
import { bufferedTaskStoreMock } from '../buffered_task_store.mock';
import {
  TASK_MANAGER_RUN_TRANSACTION_TYPE,
  TASK_MANAGER_TRANSACTION_TYPE,
  TASK_MANAGER_TRANSACTION_TYPE_MARK_AS_RUNNING,
} from './task_runner';
import { schema } from '@kbn/config-schema';
import { CLAIM_STRATEGY_MGET, CLAIM_STRATEGY_UPDATE_BY_QUERY } from '../config';
import * as nextRunAtUtils from '../lib/get_next_run_at';
import { configMock } from '../config.mock';
import { EsApiKeyStrategy } from '../api_key_strategy';

const baseDelay = 5 * 60 * 1000;
const executionContext = executionContextServiceMock.createSetupContract();
const minutesFromNow = (mins: number): Date => secondsFromNow(mins * 60);
const minutesFromDate = (date: Date, mins: number): Date => secondsFromDate(date, mins * 60);
const getNextRunAtSpy = jest.spyOn(nextRunAtUtils, 'getNextRunAt');
const eventLoggerMock = { logEvent: jest.fn() } as unknown as TaskEventLogger;
const dateRegExp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;

jest.mock('uuid', () => ({
  v4: () => 'NEW_UUID',
}));

beforeAll(() => {
  jest.useFakeTimers();
});

beforeEach(() => {
  jest.setSystemTime(new Date('1970-01-01T00:00:00.000Z'));
});

afterAll(() => jest.useRealTimers());

describe('TaskManagerRunner', () => {
  const pendingStageSetup = (opts: TestOpts) => testOpts(TaskRunningStage.PENDING, opts);
  const readyToRunStageSetup = (opts: TestOpts) => testOpts(TaskRunningStage.READY_TO_RUN, opts);
  const mockApmTrans = {
    end: jest.fn(),
    addLabels: jest.fn(),
    setLabel: jest.fn(),
  };

  let otelExporter: tracing.InMemorySpanExporter;
  let otelProvider: tracing.BasicTracerProvider;

  beforeAll(() => {
    otelExporter = new tracing.InMemorySpanExporter();
    otelProvider = new tracing.BasicTracerProvider({
      spanProcessors: [new tracing.SimpleSpanProcessor(otelExporter)],
    });
    trace.setGlobalTracerProvider(otelProvider);
  });

  beforeEach(() => {
    otelExporter?.reset();
  });

  afterAll(async () => {
    await otelProvider.shutdown();
  });

  test('execution ID', async () => {
    const { runner } = await pendingStageSetup({
      instance: {
        id: 'foo',
        taskType: 'bar',
      },
    });

    expect(runner.taskExecutionId).toEqual(`foo::NEW_UUID`);
    expect(runner.isSameTask(`foo::ANOTHER_UUID`)).toEqual(true);
    expect(runner.isSameTask(`bar::ANOTHER_UUID`)).toEqual(false);
  });

  describe('Pending Stage', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      jest
        .spyOn(apm, 'startTransaction')

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .mockImplementation(() => mockApmTrans as any);
    });

    test('makes calls to APM as expected when task markedAsRunning is success', async () => {
      const { runner } = await pendingStageSetup({
        instance: {
          schedule: {
            interval: '10m',
          },
        },
        definitions: {
          bar: {
            title: 'Bar!',
            createTaskRunner: () => ({
              run: async () => undefined,
            }),
          },
        },
      });
      await runner.markTaskAsRunning();
      expect(apm.startTransaction).toHaveBeenCalledWith(
        TASK_MANAGER_TRANSACTION_TYPE_MARK_AS_RUNNING,
        TASK_MANAGER_TRANSACTION_TYPE
      );
      expect(mockApmTrans.end).toHaveBeenCalledWith('success');

      const spans = otelExporter.getFinishedSpans();
      const span = spans.find((s) => s.name === 'mark-task-as-running');
      expect(span).toBeDefined();
      expect(span!.attributes['transaction.type']).toBe(TASK_MANAGER_TRANSACTION_TYPE);
      expect(span!.status.code).not.toBe(SpanStatusCode.ERROR);
    });

    test('makes calls to APM as expected when task markedAsRunning fails', async () => {
      const { runner, store } = await pendingStageSetup({
        instance: {
          schedule: {
            interval: '10m',
          },
        },
        definitions: {
          bar: {
            title: 'Bar!',
            createTaskRunner: () => ({
              run: async () => undefined,
            }),
          },
        },
      });
      store.update.mockRejectedValue(
        SavedObjectsErrorHelpers.createGenericNotFoundError('type', 'id')
      );
      await expect(runner.markTaskAsRunning()).rejects.toMatchInlineSnapshot(
        `[Error: Saved object [type/id] not found]`
      );
      // await runner.markTaskAsRunning();
      expect(apm.startTransaction).toHaveBeenCalledWith(
        TASK_MANAGER_TRANSACTION_TYPE_MARK_AS_RUNNING,
        TASK_MANAGER_TRANSACTION_TYPE
      );
      expect(mockApmTrans.end).toHaveBeenCalledWith('failure');

      const spans = otelExporter.getFinishedSpans();
      const span = spans.find((s) => s.name === 'mark-task-as-running');
      expect(span).toBeDefined();
      expect(span!.status.code).toBe(SpanStatusCode.ERROR);
    });

    test('provides execution context on run', async () => {
      const { runner } = await readyToRunStageSetup({
        definitions: {
          bar: {
            title: 'Bar!',
            createTaskRunner: () => ({
              async run() {
                return { state: {} };
              },
            }),
          },
        },
      });
      await runner.run();
      expect(executionContext.withContext).toHaveBeenCalledTimes(1);
      expect(executionContext.withContext).toHaveBeenCalledWith(
        {
          description: 'run task',
          id: 'foo',
          name: 'run bar',
          type: 'task manager',
        },
        expect.any(Function)
      );
    });

    test('provides details about the task that is running', async () => {
      const { runner } = await pendingStageSetup({
        instance: {
          id: 'foo',
          taskType: 'bar',
        },
      });

      expect(runner.id).toEqual('foo');
      expect(runner.taskType).toEqual('bar');
      expect(runner.toString()).toEqual('bar "foo"');
    });

    test('calculates retryAt by schedule when running a recurring task', async () => {
      const intervalMinutes = 10;
      const id = _.random(1, 20).toString();
      const initialAttempts = _.random(0, 2);
      const { runner, store } = await pendingStageSetup({
        instance: {
          id,
          attempts: initialAttempts,
          schedule: {
            interval: `${intervalMinutes}m`,
          },
          enabled: true,
        },
        definitions: {
          bar: {
            title: 'Bar!',
            createTaskRunner: () => ({
              run: async () => undefined,
            }),
          },
        },
      });

      await runner.markTaskAsRunning();

      expect(store.update).toHaveBeenCalledTimes(1);
      const instance = store.update.mock.calls[0][0];

      expect(instance.retryAt!.getTime()).toEqual(
        instance.startedAt!.getTime() + intervalMinutes * 60 * 1000
      );
      expect(instance.enabled).not.toBeDefined();
    });

    test('calculates retryAt by default timout when it exceeds the schedule of a recurring task', async () => {
      const intervalSeconds = 20;
      const id = _.random(1, 20).toString();
      const initialAttempts = _.random(0, 2);
      const { runner, store } = await pendingStageSetup({
        instance: {
          id,
          attempts: initialAttempts,
          schedule: {
            interval: `${intervalSeconds}s`,
          },
          enabled: true,
        },
        definitions: {
          bar: {
            title: 'Bar!',
            createTaskRunner: () => ({
              run: async () => undefined,
            }),
          },
        },
      });

      await runner.markTaskAsRunning();

      expect(store.update).toHaveBeenCalledTimes(1);
      const instance = store.update.mock.calls[0][0];

      expect(instance.retryAt!.getTime()).toEqual(instance.startedAt!.getTime() + 5 * 60 * 1000);
      expect(instance.enabled).not.toBeDefined();
    });

    test('calculates retryAt by task type timeout if it exceeds the schedule when running a recurring task', async () => {
      const timeoutMinutes = 1;
      const intervalSeconds = 20;
      const id = _.random(1, 20).toString();
      const initialAttempts = _.random(0, 2);
      const { runner, store } = await pendingStageSetup({
        instance: {
          id,
          attempts: initialAttempts,
          schedule: {
            interval: `${intervalSeconds}s`,
          },
          enabled: true,
        },
        definitions: {
          bar: {
            title: 'Bar!',
            timeout: `${timeoutMinutes}m`,
            createTaskRunner: () => ({
              run: async () => undefined,
            }),
          },
        },
      });

      await runner.markTaskAsRunning();

      expect(store.update).toHaveBeenCalledTimes(1);
      const instance = store.update.mock.calls[0][0];

      expect(instance.retryAt!.getTime()).toEqual(
        instance.startedAt!.getTime() + timeoutMinutes * 60 * 1000
      );
      expect(instance.enabled).not.toBeDefined();
    });

    test('does not calculate retryAt by task instance timeout if defined for a recurring task', async () => {
      const timeoutMinutes = 1;
      const timeoutOverrideSeconds = 90;
      const intervalSeconds = 20;
      const id = _.random(1, 20).toString();
      const initialAttempts = _.random(0, 2);
      const { runner, store } = await pendingStageSetup({
        instance: {
          id,
          attempts: initialAttempts,
          schedule: {
            interval: `${intervalSeconds}s`,
          },
          timeoutOverride: `${timeoutOverrideSeconds}s`,
          enabled: true,
        },
        definitions: {
          bar: {
            title: 'Bar!',
            timeout: `${timeoutMinutes}m`,
            createTaskRunner: () => ({
              run: async () => undefined,
            }),
          },
        },
      });

      await runner.markTaskAsRunning();

      expect(store.update).toHaveBeenCalledTimes(1);
      const instance = store.update.mock.calls[0][0];

      expect(instance.retryAt!.getTime()).toEqual(
        instance.startedAt!.getTime() + timeoutMinutes * 60 * 1000
      );
      expect(instance.enabled).not.toBeDefined();
    });

    test('sets startedAt, status, attempts and retryAt when claiming a task', async () => {
      const timeoutMinutes = 1;
      const id = _.random(1, 20).toString();
      const initialAttempts = _.random(0, 2);
      const { runner, store } = await pendingStageSetup({
        instance: {
          id,
          enabled: true,
          attempts: initialAttempts,
          schedule: undefined,
        },
        definitions: {
          bar: {
            title: 'Bar!',
            timeout: `${timeoutMinutes}m`,
            createTaskRunner: () => ({
              run: async () => undefined,
            }),
          },
        },
      });

      await runner.markTaskAsRunning();

      expect(store.update).toHaveBeenCalledTimes(1);
      const instance = store.update.mock.calls[0][0];

      expect(instance.attempts).toEqual(initialAttempts + 1);
      expect(instance.status).toBe('running');
      expect(instance.startedAt!.getTime()).toEqual(Date.now());

      const minRunAt = Date.now();
      const maxRunAt = minRunAt + baseDelay * Math.pow(2, initialAttempts - 1);
      expect(instance.retryAt!.getTime()).toBeGreaterThanOrEqual(
        minRunAt + timeoutMinutes * 60 * 1000
      );
      expect(instance.retryAt!.getTime()).toBeLessThanOrEqual(
        maxRunAt + timeoutMinutes * 60 * 1000
      );

      expect(instance.enabled).not.toBeDefined();
    });

    test('sets retryAt to task instance timeout override when defined when claiming an ad hoc task', async () => {
      const timeoutSeconds = 60;
      const timeoutOverrideSeconds = 90;
      const id = _.random(1, 20).toString();
      const initialAttempts = _.random(0, 2);
      const { runner, store } = await pendingStageSetup({
        instance: {
          id,
          enabled: true,
          attempts: initialAttempts,
          timeoutOverride: `${timeoutOverrideSeconds}s`,
          schedule: undefined,
        },
        definitions: {
          bar: {
            title: 'Bar!',
            timeout: `${timeoutSeconds}s`,
            createTaskRunner: () => ({
              run: async () => undefined,
            }),
          },
        },
      });

      await runner.markTaskAsRunning();

      expect(store.update).toHaveBeenCalledTimes(1);
      const instance = store.update.mock.calls[0][0];

      expect(instance.attempts).toEqual(initialAttempts + 1);
      expect(instance.status).toBe('running');
      expect(instance.startedAt!.getTime()).toEqual(Date.now());

      const minRunAt = Date.now();
      const maxRunAt = minRunAt + baseDelay * Math.pow(2, initialAttempts - 1);
      expect(instance.retryAt!.getTime()).toBeGreaterThanOrEqual(
        minRunAt + timeoutOverrideSeconds * 1000
      );
      expect(instance.retryAt!.getTime()).toBeLessThanOrEqual(
        maxRunAt + timeoutOverrideSeconds * 1000
      );

      expect(instance.enabled).not.toBeDefined();
    });

    test('sets retryAt when there is an error', async () => {
      const id = _.random(1, 20).toString();
      const initialAttempts = _.random(1, 3);
      const timeoutMinutes = 1;
      const { runner, store } = await pendingStageSetup({
        instance: {
          id,
          attempts: initialAttempts,
          schedule: undefined,
          enabled: true,
        },
        definitions: {
          bar: {
            title: 'Bar!',
            timeout: `${timeoutMinutes}m`,
            createTaskRunner: () => ({
              run: async () => undefined,
            }),
          },
        },
      });

      await runner.markTaskAsRunning();

      expect(store.update).toHaveBeenCalledTimes(1);
      const instance = store.update.mock.calls[0][0];

      const minRunAt = Date.now();
      const maxRunAt = minRunAt + baseDelay * Math.pow(2, initialAttempts - 1);
      expect(instance.retryAt!.getTime()).toBeGreaterThanOrEqual(
        minRunAt + timeoutMinutes * 60 * 1000
      );
      expect(instance.retryAt!.getTime()).toBeLessThanOrEqual(
        maxRunAt + timeoutMinutes * 60 * 1000
      );
      expect(instance.enabled).not.toBeDefined();
    });

    test('it returns false when markTaskAsRunning fails due to VERSION_CONFLICT_STATUS', async () => {
      const id = _.random(1, 20).toString();
      const initialAttempts = _.random(1, 3);
      const timeoutMinutes = 1;
      const { runner, store } = await pendingStageSetup({
        instance: {
          id,
          attempts: initialAttempts,
          schedule: undefined,
        },
        definitions: {
          bar: {
            title: 'Bar!',
            timeout: `${timeoutMinutes}m`,
            createTaskRunner: () => ({
              run: async () => undefined,
            }),
          },
        },
      });

      store.update.mockRejectedValue(
        SavedObjectsErrorHelpers.decorateConflictError(new Error('repo error'))
      );

      expect(await runner.markTaskAsRunning()).toEqual(false);
    });

    test('it throw when markTaskAsRunning fails for unexpected reasons', async () => {
      const id = _.random(1, 20).toString();
      const initialAttempts = _.random(1, 3);
      const timeoutMinutes = 1;
      const { runner, store } = await pendingStageSetup({
        instance: {
          id,
          attempts: initialAttempts,
          schedule: undefined,
        },
        definitions: {
          bar: {
            title: 'Bar!',
            timeout: `${timeoutMinutes}m`,
            createTaskRunner: () => ({
              run: async () => undefined,
            }),
          },
        },
      });

      store.update.mockRejectedValue(
        SavedObjectsErrorHelpers.createGenericNotFoundError('type', 'id')
      );

      return expect(runner.markTaskAsRunning()).rejects.toMatchInlineSnapshot(
        `[Error: Saved object [type/id] not found]`
      );
    });

    test(`it tries to increment a task's attempts when markTaskAsRunning fails for unexpected reasons`, async () => {
      const id = _.random(1, 20).toString();
      const initialAttempts = _.random(1, 3);
      const timeoutMinutes = 1;
      const { runner, store } = await pendingStageSetup({
        instance: {
          id,
          attempts: initialAttempts,
          schedule: undefined,
        },
        definitions: {
          bar: {
            title: 'Bar!',
            timeout: `${timeoutMinutes}m`,
            createTaskRunner: () => ({
              run: async () => undefined,
            }),
          },
        },
      });

      store.update.mockRejectedValueOnce(SavedObjectsErrorHelpers.createBadRequestError('type'));
      store.update.mockResolvedValueOnce(
        mockInstance({
          id,
          attempts: initialAttempts,
          schedule: undefined,
        })
      );

      await expect(runner.markTaskAsRunning()).rejects.toMatchInlineSnapshot(
        `[Error: type: Bad Request]`
      );

      expect(store.update).toHaveBeenCalledTimes(1);
      expect(store.partialUpdate).toHaveBeenCalledTimes(1);
      expect(store.partialUpdate).toHaveBeenCalledWith(
        {
          id,
          status: TaskStatus.Idle,
          startedAt: null,
          retryAt: null,
          ownerId: null,
          attempts: initialAttempts + 1,
        },
        {
          validate: false,
          doc: mockInstance({
            id,
            attempts: initialAttempts,
            schedule: undefined,
          }),
        }
      );
    });

    test(`it logs an error when failing to increment a task's attempts when markTaskAsRunning fails and throws an error object`, async () => {
      const id = _.random(1, 20).toString();
      const initialAttempts = _.random(1, 3);
      const timeoutMinutes = 1;
      const { runner, store, logger } = await pendingStageSetup({
        instance: {
          id,
          attempts: initialAttempts,
          schedule: undefined,
        },
        definitions: {
          bar: {
            title: 'Bar!',
            timeout: `${timeoutMinutes}m`,
            createTaskRunner: () => ({
              run: async () => undefined,
            }),
          },
        },
      });

      store.update.mockRejectedValueOnce(SavedObjectsErrorHelpers.createBadRequestError('type'));
      store.partialUpdate.mockRejectedValueOnce({
        type: 'type',
        id: 'id',
        error: {
          statusCode: 409,
          error: 'Conflict',
          message: 'Saved object [type/id] conflict',
        },
      });

      await expect(runner.markTaskAsRunning()).rejects.toMatchInlineSnapshot(
        `[Error: type: Bad Request]`
      );

      const loggerCall = logger.error.mock.calls[0][0];
      expect(loggerCall as string).toMatchInlineSnapshot(
        `"[Task Runner] Task ${id} failed to release claim after failure: Error: Saved object [type/id] conflict"`
      );

      expect(store.partialUpdate).toHaveBeenCalledWith(
        {
          id,
          status: TaskStatus.Idle,
          startedAt: null,
          retryAt: null,
          ownerId: null,
          attempts: initialAttempts + 1,
        },
        {
          validate: false,
          doc: mockInstance({
            id,
            attempts: initialAttempts,
            schedule: undefined,
          }),
        }
      );
    });

    test(`it logs an error when failing to increment a task's attempts when markTaskAsRunning fails`, async () => {
      const id = _.random(1, 20).toString();
      const initialAttempts = _.random(1, 3);
      const timeoutMinutes = 1;
      const { runner, store, logger } = await pendingStageSetup({
        instance: {
          id,
          attempts: initialAttempts,
          schedule: undefined,
        },
        definitions: {
          bar: {
            title: 'Bar!',
            timeout: `${timeoutMinutes}m`,
            createTaskRunner: () => ({
              run: async () => undefined,
            }),
          },
        },
      });

      store.update.mockRejectedValueOnce(SavedObjectsErrorHelpers.createBadRequestError('type'));
      store.partialUpdate.mockRejectedValueOnce(
        SavedObjectsErrorHelpers.createBadRequestError('type')
      );

      await expect(runner.markTaskAsRunning()).rejects.toMatchInlineSnapshot(
        `[Error: type: Bad Request]`
      );

      const loggerCall = logger.error.mock.calls[0][0];
      expect(loggerCall as string).toMatchInlineSnapshot(
        `"[Task Runner] Task ${id} failed to release claim after failure: Error: type: Bad Request"`
      );

      expect(store.partialUpdate).toHaveBeenCalledWith(
        {
          id,
          status: TaskStatus.Idle,
          startedAt: null,
          retryAt: null,
          ownerId: null,
          attempts: initialAttempts + 1,
        },
        {
          validate: false,
          doc: mockInstance({
            id,
            attempts: initialAttempts,
            schedule: undefined,
          }),
        }
      );
    });

    test(`it doesnt try to increment a task's attempts when markTaskAsRunning fails for version conflict`, async () => {
      const id = _.random(1, 20).toString();
      const initialAttempts = _.random(1, 3);
      const timeoutMinutes = 1;
      const { runner, store } = await pendingStageSetup({
        instance: {
          id,
          attempts: initialAttempts,
          schedule: undefined,
        },
        definitions: {
          bar: {
            title: 'Bar!',
            timeout: `${timeoutMinutes}m`,
            createTaskRunner: () => ({
              run: async () => undefined,
            }),
          },
        },
      });

      store.update.mockRejectedValueOnce(
        SavedObjectsErrorHelpers.createConflictError('type', 'id')
      );
      store.update.mockResolvedValueOnce(
        mockInstance({
          id,
          attempts: initialAttempts,
          schedule: undefined,
        })
      );

      await expect(runner.markTaskAsRunning()).resolves.toMatchInlineSnapshot(`false`);

      expect(store.update).toHaveBeenCalledTimes(1);
    });

    test(`it doesnt try to increment a task's attempts when markTaskAsRunning fails due to Saved Object not being found`, async () => {
      const id = _.random(1, 20).toString();
      const initialAttempts = _.random(1, 3);
      const timeoutMinutes = 1;
      const { runner, store } = await pendingStageSetup({
        instance: {
          id,
          attempts: initialAttempts,
          schedule: undefined,
        },
        definitions: {
          bar: {
            title: 'Bar!',
            timeout: `${timeoutMinutes}m`,
            createTaskRunner: () => ({
              run: async () => undefined,
            }),
          },
        },
      });

      store.update.mockRejectedValueOnce(
        SavedObjectsErrorHelpers.createGenericNotFoundError('type', 'id')
      );
      store.update.mockResolvedValueOnce(
        mockInstance({
          id,
          attempts: initialAttempts,
          schedule: undefined,
        })
      );

      await expect(runner.markTaskAsRunning()).rejects.toMatchInlineSnapshot(
        `[Error: Saved object [type/id] not found]`
      );

      expect(store.update).toHaveBeenCalledTimes(1);
    });

    test('bypasses getRetry (returning false) of a recurring task to set retryAt when defined', async () => {
      const id = _.random(1, 20).toString();
      const initialAttempts = _.random(1, 3);
      const timeoutMinutes = 1;
      const { runner, store } = await pendingStageSetup({
        instance: {
          id,
          attempts: initialAttempts,
          schedule: { interval: '1m' },
          startedAt: new Date(),
          enabled: true,
        },
        definitions: {
          bar: {
            title: 'Bar!',
            timeout: `${timeoutMinutes}m`,
            createTaskRunner: () => ({
              run: async () => undefined,
            }),
          },
        },
      });

      await runner.markTaskAsRunning();

      expect(store.update).toHaveBeenCalledTimes(1);
      const instance = store.update.mock.calls[0][0];

      const timeoutDelay = timeoutMinutes * 60 * 1000;
      expect(instance.retryAt!.getTime()).toEqual(new Date(Date.now() + timeoutDelay).getTime());
      expect(instance.enabled).not.toBeDefined();
    });

    test('skips marking task as running for mget claim strategy', async () => {
      const { runner, store } = await pendingStageSetup({
        instance: {
          schedule: {
            interval: '10m',
          },
        },
        definitions: {
          bar: {
            title: 'Bar!',
            createTaskRunner: () => ({
              run: async () => undefined,
            }),
          },
        },
        strategy: CLAIM_STRATEGY_MGET,
      });
      const result = await runner.markTaskAsRunning();

      expect(result).toBe(true);
      expect(apm.startTransaction).not.toHaveBeenCalled();
      expect(mockApmTrans.end).not.toHaveBeenCalled();

      const spans = otelExporter.getFinishedSpans();
      expect(spans.find((s) => s.name === 'mark-task-as-running')).toBeUndefined();

      expect(runner.id).toEqual('foo');
      expect(runner.taskType).toEqual('bar');
      expect(runner.toString()).toEqual('bar "foo"');

      expect(store.update).not.toHaveBeenCalled();
    });

    describe('cost', () => {
      test('task instance cost takes precedence over task definition cost', async () => {
        const { runner } = await pendingStageSetup({
          instance: { id: 'foo', taskType: 'bar', cost: InstanceTaskCost.Tiny },
          definitions: {
            bar: {
              title: 'Bar!',
              cost: TaskCost.ExtraLarge,
              createTaskRunner: () => ({ run: async () => ({ state: {} }) }),
            },
          },
        });
        expect(runner.cost).toEqual(TaskCost.Tiny);
      });

      test('uses task definition cost when there is no task instance cost set', async () => {
        const { runner } = await pendingStageSetup({
          instance: { id: 'foo', taskType: 'bar' },
          definitions: {
            bar: {
              title: 'Bar!',
              cost: TaskCost.Tiny,
              createTaskRunner: () => ({ run: async () => ({ state: {} }) }),
            },
          },
        });
        expect(runner.cost).toEqual(TaskCost.Tiny);
      });

      test('uses "normal" cost when there is no task instance or definition cost set', async () => {
        const { runner } = await pendingStageSetup({
          instance: { id: 'foo', taskType: 'bar' },
          definitions: {
            bar: {
              title: 'Bar!',
              createTaskRunner: () => ({ run: async () => ({ state: {} }) }),
            },
          },
        });
        expect(runner.cost).toEqual(TaskCost.Normal);
      });
    });

    describe('TaskEvents', () => {
      test('emits TaskEvent when a task is marked as running', async () => {
        const id = _.random(1, 20).toString();
        const onTaskEvent = jest.fn();
        const { runner, instance, store } = await pendingStageSetup({
          onTaskEvent,
          instance: {
            id,
          },
          definitions: {
            bar: {
              title: 'Bar!',
              timeout: `1m`,
              createTaskRunner: () => ({
                run: async () => undefined,
              }),
            },
          },
        });

        store.update.mockResolvedValueOnce(instance);

        await runner.markTaskAsRunning();

        expect(onTaskEvent).toHaveBeenCalledWith(asTaskMarkRunningEvent(id, asOk(instance)));
      });

      test('emits TaskEvent when a task fails to be marked as running', async () => {
        expect.assertions(2);

        const id = _.random(1, 20).toString();
        const onTaskEvent = jest.fn();
        const { runner, store } = await pendingStageSetup({
          onTaskEvent,
          instance: {
            id,
          },
          definitions: {
            bar: {
              title: 'Bar!',
              timeout: `1m`,
              createTaskRunner: () => ({
                run: async () => undefined,
              }),
            },
          },
        });

        store.update.mockRejectedValueOnce(new Error('cant mark as running'));

        try {
          await runner.markTaskAsRunning();
        } catch (err) {
          expect(onTaskEvent).toHaveBeenCalledWith(asTaskMarkRunningEvent(id, asErr(err)));
        }
        expect(onTaskEvent).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('Ready To Run Stage', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });
    test('makes calls to APM as expected when task runs successfully', async () => {
      const { runner } = await readyToRunStageSetup({
        instance: {
          params: { a: 'b' },
          state: { hey: 'there' },
        },
        definitions: {
          bar: {
            title: 'Bar!',
            createTaskRunner: () => ({
              async run() {
                return { state: {} };
              },
            }),
          },
        },
      });
      await runner.run();
      expect(apm.startTransaction).toHaveBeenCalledWith('bar', TASK_MANAGER_RUN_TRANSACTION_TYPE, {
        childOf: 'apmTraceparent',
      });
      expect(mockApmTrans.end).toHaveBeenCalledWith('success');

      const spans = otelExporter.getFinishedSpans();
      const span = spans.find((s) => s.name === 'task-manager-run');
      expect(span).toBeDefined();
      expect(span!.attributes['transaction.type']).toBe(TASK_MANAGER_RUN_TRANSACTION_TYPE);
      expect(span!.attributes['kibana.task.type']).toBe('bar');
      expect(span!.status.code).not.toBe(SpanStatusCode.ERROR);
    });
    test('makes calls to APM and logs errors as expected when task fails', async () => {
      const { runner, logger } = await readyToRunStageSetup({
        instance: {
          params: { a: 'b' },
          state: { hey: 'there' },
        },
        definitions: {
          bar: {
            title: 'Bar!',
            createTaskRunner: () => ({
              async run() {
                throw new Error('rar');
              },
            }),
          },
        },
      });
      await runner.run();
      expect(apm.startTransaction).toHaveBeenCalledWith('bar', TASK_MANAGER_RUN_TRANSACTION_TYPE, {
        childOf: 'apmTraceparent',
      });
      expect(mockApmTrans.end).toHaveBeenCalledWith('failure');

      const spans = otelExporter.getFinishedSpans();
      const span = spans.find((s) => s.name === 'task-manager-run');
      expect(span).toBeDefined();
      expect(span!.attributes['transaction.type']).toBe(TASK_MANAGER_RUN_TRANSACTION_TYPE);
      expect(span!.attributes['kibana.task.type']).toBe('bar');

      const loggerCall = logger.error.mock.calls[0][0];
      const loggerMeta = logger.error.mock.calls[0][1];
      expect(loggerCall as string).toMatchInlineSnapshot(`"Task bar \\"foo\\" failed: Error: rar"`);
      expect(loggerMeta?.tags).toEqual(['bar', 'foo', 'task-run-failed', 'framework-error']);
      expect(loggerMeta?.error?.stack_trace).toBeDefined();
    });
    test('logs user errors as expected when task fails', async () => {
      const { runner, logger } = await readyToRunStageSetup({
        instance: {
          params: { a: 'b' },
          state: { hey: 'there' },
        },
        definitions: {
          bar: {
            title: 'Bar!',
            createTaskRunner: () => ({
              async run() {
                throw createTaskRunError(new Error('rar'), TaskErrorSource.USER);
              },
            }),
          },
        },
      });
      await runner.run();

      const loggerCall = logger.error.mock.calls[0][0];
      const loggerMeta = logger.error.mock.calls[0][1];
      expect(loggerCall as string).toMatchInlineSnapshot(`"Task bar \\"foo\\" failed: Error: rar"`);
      expect(loggerMeta?.tags).toEqual(['bar', 'foo', 'task-run-failed', 'user-error']);
    });
    test('logs ES auth errors as user errors', async () => {
      const { runner, logger } = await readyToRunStageSetup({
        instance: {
          params: { a: 'b' },
          state: { hey: 'there' },
        },
        definitions: {
          bar: {
            title: 'Bar!',
            createTaskRunner: () => ({
              async run() {
                throw new errors.ResponseError({
                  warnings: [],
                  meta: {} as never,
                  statusCode: 401,
                });
              },
            }),
          },
        },
      });
      await runner.run();

      const loggerCall = logger.error.mock.calls[0][0];
      const loggerMeta = logger.error.mock.calls[0][1];
      expect(loggerCall as string).toMatchInlineSnapshot(
        `"Task bar \\"foo\\" failed: ResponseError: Response Error"`
      );
      expect(loggerMeta?.tags).toEqual(['bar', 'foo', 'task-run-failed', 'user-error']);
    });
    test('logs plain object errors with JSON.stringify instead of [object Object]', async () => {
      const { runner, logger } = await readyToRunStageSetup({
        instance: {
          params: { a: 'b' },
          state: { hey: 'there' },
        },
        definitions: {
          bar: {
            title: 'Bar!',
            createTaskRunner: () => ({
              async run() {
                // eslint-disable-next-line no-throw-literal
                throw { message: 'some error', statusCode: 500 };
              },
            }),
          },
        },
      });
      await runner.run();

      const loggerCall = logger.error.mock.calls[0][0];
      const loggerMeta = logger.error.mock.calls[0][1];
      expect(loggerCall as string).toMatchInlineSnapshot(
        `"Task bar \\"foo\\" failed: {\\"message\\":\\"some error\\",\\"statusCode\\":500}"`
      );
      expect(loggerMeta?.tags).toEqual(['bar', 'foo', 'task-run-failed', 'framework-error']);
      expect(loggerMeta?.error?.stack_trace).toBeUndefined();
    });
    test('provides execution context on run', async () => {
      const { runner } = await readyToRunStageSetup({
        definitions: {
          bar: {
            title: 'Bar!',
            createTaskRunner: () => ({
              async run() {
                return { state: {} };
              },
            }),
          },
        },
      });
      await runner.run();
      expect(executionContext.withContext).toHaveBeenCalledTimes(1);
      expect(executionContext.withContext).toHaveBeenCalledWith(
        {
          description: 'run task',
          id: 'foo',
          name: 'run bar',
          type: 'task manager',
        },
        expect.any(Function)
      );
    });
    test('provides fakeRequest when task has apiKey', async () => {
      const createTaskRunnerFn = jest.fn();
      const instance = mockInstance();
      const { runner } = await readyToRunStageSetup({
        instance: {
          ...instance,
          apiKey: 'aw4badfg333',
          userScope: {
            apiKeyId: 'abcdefg',
            spaceId: 'default',
            apiKeyCreatedByUser: false,
          },
        },
        definitions: {
          bar: {
            title: 'Bar!',
            createTaskRunner: createTaskRunnerFn,
          },
        },
      });
      await runner.run();
      const createTaskRunnerParams = createTaskRunnerFn.mock.calls[0][0];
      expect(createTaskRunnerParams.fakeRequest).toBeDefined();
      expect(createTaskRunnerParams.taskInstance).toEqual(instance);
    });

    test('calls enrichFakeRequest with the fake request and userProfileId when both are present', async () => {
      const enrichFakeRequest = jest.fn();
      const createTaskRunnerFn = jest.fn();
      const { runner } = await readyToRunStageSetup({
        instance: {
          ...mockInstance(),
          apiKey: 'aw4badfg333',
          userScope: {
            apiKeyId: 'abcdefg',
            spaceId: 'default',
            apiKeyCreatedByUser: false,
            userProfileId: 'u_profile_123',
          },
        },
        definitions: {
          bar: {
            title: 'Bar!',
            createTaskRunner: createTaskRunnerFn,
          },
        },
        enrichFakeRequest,
      });

      await runner.run();

      expect(enrichFakeRequest).toHaveBeenCalledTimes(1);
      expect(enrichFakeRequest).toHaveBeenCalledWith(
        expect.objectContaining({ headers: expect.any(Object) }),
        'u_profile_123'
      );
    });

    test('passes enrichRequest on RunContext when userProfileId is present', async () => {
      const enrichFakeRequest = jest.fn();
      const createTaskRunnerFn = jest.fn();
      const { runner } = await readyToRunStageSetup({
        instance: {
          ...mockInstance(),
          apiKey: 'aw4badfg333',
          userScope: {
            apiKeyId: 'abcdefg',
            spaceId: 'default',
            apiKeyCreatedByUser: false,
            userProfileId: 'u_profile_123',
          },
        },
        definitions: {
          bar: {
            title: 'Bar!',
            createTaskRunner: createTaskRunnerFn,
          },
        },
        enrichFakeRequest,
      });

      await runner.run();

      const createTaskRunnerParams = createTaskRunnerFn.mock.calls[0][0];
      expect(createTaskRunnerParams.enrichRequest).toBeDefined();
      expect(typeof createTaskRunnerParams.enrichRequest).toBe('function');
    });

    test('enrichRequest is undefined when userProfileId is absent', async () => {
      const enrichFakeRequest = jest.fn();
      const createTaskRunnerFn = jest.fn();
      const { runner } = await readyToRunStageSetup({
        instance: {
          ...mockInstance(),
          apiKey: 'aw4badfg333',
          userScope: {
            apiKeyId: 'abcdefg',
            spaceId: 'default',
            apiKeyCreatedByUser: false,
          },
        },
        definitions: {
          bar: {
            title: 'Bar!',
            createTaskRunner: createTaskRunnerFn,
          },
        },
        enrichFakeRequest,
      });

      await runner.run();

      expect(enrichFakeRequest).not.toHaveBeenCalled();
      const createTaskRunnerParams = createTaskRunnerFn.mock.calls[0][0];
      expect(createTaskRunnerParams.enrichRequest).toBeUndefined();
    });

    test('enrichRequest calls enrichFakeRequest for child requests', async () => {
      const enrichFakeRequest = jest.fn();
      const createTaskRunnerFn = jest.fn();
      const { runner } = await readyToRunStageSetup({
        instance: {
          ...mockInstance(),
          apiKey: 'aw4badfg333',
          userScope: {
            apiKeyId: 'abcdefg',
            spaceId: 'default',
            apiKeyCreatedByUser: false,
            userProfileId: 'u_profile_123',
          },
        },
        definitions: {
          bar: {
            title: 'Bar!',
            createTaskRunner: createTaskRunnerFn,
          },
        },
        enrichFakeRequest,
      });

      await runner.run();

      const createTaskRunnerParams = createTaskRunnerFn.mock.calls[0][0];
      const childRequest = { fake: 'child-request' };
      createTaskRunnerParams.enrichRequest(childRequest);

      expect(enrichFakeRequest).toHaveBeenCalledTimes(2);
      expect(enrichFakeRequest).toHaveBeenLastCalledWith(childRequest, 'u_profile_123');
    });

    test('runs without error and passes undefined enrichRequest when no enrichFakeRequest hook is provided', async () => {
      const createTaskRunnerFn = jest.fn();
      const { runner } = await readyToRunStageSetup({
        instance: {
          ...mockInstance(),
          apiKey: 'aw4badfg333',
          userScope: {
            apiKeyId: 'abcdefg',
            spaceId: 'default',
            apiKeyCreatedByUser: false,
            userProfileId: 'u_profile_123',
          },
        },
        definitions: {
          bar: {
            title: 'Bar!',
            createTaskRunner: createTaskRunnerFn,
          },
        },
        // no enrichFakeRequest supplied (simulates Core without the hook)
      });

      await runner.run();

      const createTaskRunnerParams = createTaskRunnerFn.mock.calls[0][0];
      expect(createTaskRunnerParams.fakeRequest).toBeDefined();
      expect(createTaskRunnerParams.enrichRequest).toBeUndefined();
    });

    test('still enriches when apiKeyCreatedByUser is true but userProfileId is present', async () => {
      const enrichFakeRequest = jest.fn();
      const createTaskRunnerFn = jest.fn();
      const { runner } = await readyToRunStageSetup({
        instance: {
          ...mockInstance(),
          apiKey: 'aw4badfg333',
          userScope: {
            apiKeyId: 'abcdefg',
            spaceId: 'default',
            apiKeyCreatedByUser: true,
            userProfileId: 'u_profile_123',
          },
        },
        definitions: {
          bar: {
            title: 'Bar!',
            createTaskRunner: createTaskRunnerFn,
          },
        },
        enrichFakeRequest,
      });

      await runner.run();

      expect(enrichFakeRequest).toHaveBeenCalledTimes(1);
      expect(enrichFakeRequest).toHaveBeenCalledWith(
        expect.objectContaining({ headers: expect.any(Object) }),
        'u_profile_123'
      );
      const createTaskRunnerParams = createTaskRunnerFn.mock.calls[0][0];
      expect(createTaskRunnerParams.enrichRequest).toBeDefined();
    });

    test('propagates enrichFakeRequest errors when enrichRequest is called on a non-fake child request', async () => {
      let callCount = 0;
      const enrichFakeRequest = jest.fn().mockImplementation(() => {
        callCount += 1;
        // succeed on the initial fake-request enrichment, throw on the child request
        if (callCount > 1) {
          throw new Error('boom');
        }
      });
      const createTaskRunnerFn = jest.fn();
      const { runner } = await readyToRunStageSetup({
        instance: {
          ...mockInstance(),
          apiKey: 'aw4badfg333',
          userScope: {
            apiKeyId: 'abcdefg',
            spaceId: 'default',
            apiKeyCreatedByUser: false,
            userProfileId: 'u_profile_123',
          },
        },
        definitions: {
          bar: {
            title: 'Bar!',
            createTaskRunner: createTaskRunnerFn,
          },
        },
        enrichFakeRequest,
      });

      await runner.run();

      const createTaskRunnerParams = createTaskRunnerFn.mock.calls[0][0];
      const childRequest = { fake: 'child-request' };

      expect(() => createTaskRunnerParams.enrichRequest(childRequest)).toThrow('boom');
    });

    test('queues a reattempt if the task fails', async () => {
      const initialAttempts = _.random(0, 2);
      const id = Date.now().toString();
      const { runner, store } = await readyToRunStageSetup({
        instance: {
          id,
          attempts: initialAttempts,
          params: { a: 'b' },
          state: { hey: 'there' },
          enabled: true,
        },
        definitions: {
          bar: {
            title: 'Bar!',
            createTaskRunner: () => ({
              async run() {
                throw new Error('Dangit!');
              },
            }),
          },
        },
      });

      await runner.run();

      expect(store.partialUpdate).toHaveBeenCalledTimes(1);
      const instance = store.partialUpdate.mock.calls[0][0];

      expect(instance.id).toEqual(id);

      const minRunAt = Date.now();
      const maxRunAt = minRunAt + baseDelay * Math.pow(2, initialAttempts - 2);
      expect(instance.runAt?.getTime()).toBeGreaterThanOrEqual(minRunAt);
      expect(instance.runAt?.getTime()).toBeLessThanOrEqual(maxRunAt);

      expect(instance.params).not.toBeDefined();
      expect(instance.enabled).not.toBeDefined();
      expect(instance.state).toEqual({ hey: 'there' });

      expect(getNextRunAtSpy).not.toHaveBeenCalled();
    });

    test('reschedules tasks that have an schedule', async () => {
      const { runner, store } = await readyToRunStageSetup({
        instance: {
          schedule: { interval: '10m' },
          status: TaskStatus.Running,
          startedAt: new Date(),
          enabled: true,
        },
        definitions: {
          bar: {
            title: 'Bar!',
            createTaskRunner: () => ({
              async run() {
                return { state: {} };
              },
            }),
          },
        },
      });

      await runner.run();

      expect(store.partialUpdate).toHaveBeenCalledTimes(1);
      const instance = store.partialUpdate.mock.calls[0][0];

      expect(instance.runAt?.getTime()).toBeGreaterThan(minutesFromNow(9).getTime());
      expect(instance.runAt?.getTime()).toBeLessThanOrEqual(minutesFromNow(10).getTime());
      expect(instance.enabled).not.toBeDefined();

      expect(getNextRunAtSpy).toHaveBeenCalled();
    });

    test('expiration returns time after which timeout will have elapsed from start', async () => {
      const now = moment();
      const { runner } = await readyToRunStageSetup({
        instance: {
          schedule: { interval: '10m' },
          status: TaskStatus.Running,
          startedAt: now.toDate(),
        },
        definitions: {
          bar: {
            title: 'Bar!',
            timeout: `1m`,
            createTaskRunner: () => ({
              async run() {
                return { state: {} };
              },
            }),
          },
        },
      });

      await runner.run();

      expect(runner.isExpired).toBe(false);
      expect(runner.expiration).toEqual(now.add(1, 'm').toDate());
    });

    test('runDuration returns duration which has elapsed since start', async () => {
      const now = moment().subtract(30, 's').toDate();
      const { runner } = await readyToRunStageSetup({
        instance: {
          schedule: { interval: '10m' },
          status: TaskStatus.Running,
          startedAt: now,
        },
        definitions: {
          bar: {
            title: 'Bar!',
            timeout: `1m`,
            createTaskRunner: () => ({
              async run() {
                return { state: {} };
              },
            }),
          },
        },
      });

      await runner.run();

      expect(runner.isExpired).toBe(false);
      expect(runner.startedAt).toEqual(now);
    });

    test('reschedules tasks that return a runAt', async () => {
      const runAt = minutesFromNow(_.random(1, 10));
      const { instance, runner, store } = await readyToRunStageSetup({
        definitions: {
          bar: {
            title: 'Bar!',
            createTaskRunner: () => ({
              async run() {
                return { runAt, state: {} };
              },
            }),
          },
        },
      });

      await runner.run();

      expect(store.partialUpdate).toHaveBeenCalledTimes(1);
      expect(store.partialUpdate).toHaveBeenCalledWith(expect.objectContaining({ runAt }), {
        validate: true,
        doc: instance,
      });

      expect(getNextRunAtSpy).not.toHaveBeenCalled();
    });

    test('reschedules tasks that return a schedule', async () => {
      const runAt = minutesFromNow(1);
      const schedule = {
        interval: '1m',
      };
      const { instance, runner, store, logger } = await readyToRunStageSetup({
        instance: {
          status: TaskStatus.Running,
          startedAt: new Date(),
        },
        definitions: {
          bar: {
            title: 'Bar!',
            createTaskRunner: () => ({
              async run() {
                return { schedule, state: {} };
              },
            }),
          },
        },
      });

      await runner.run();

      expect(store.partialUpdate).toHaveBeenCalledTimes(1);
      expect(store.partialUpdate).toHaveBeenCalledWith(expect.objectContaining({ runAt }), {
        validate: true,
        doc: instance,
      });

      expect(getNextRunAtSpy).toHaveBeenCalledWith(
        expect.objectContaining({ schedule }),
        expect.any(Number),
        logger
      );
    });

    test(`doesn't reschedule recurring tasks that throw an unrecoverable error`, async () => {
      const id = _.random(1, 20).toString();
      const error = new Error('Dangit!');
      const onTaskEvent = jest.fn();
      const {
        runner,
        store,
        instance: originalInstance,
      } = await readyToRunStageSetup({
        onTaskEvent,
        instance: {
          id,
          schedule: { interval: '20m' },
          status: TaskStatus.Running,
          startedAt: new Date(),
          enabled: true,
        },
        definitions: {
          bar: {
            title: 'Bar!',
            createTaskRunner: () => ({
              async run() {
                throwUnrecoverableError(error);
              },
            }),
          },
        },
      });

      await runner.run();

      expect(store.remove).toHaveBeenCalled();
      expect(store.update).not.toHaveBeenCalled();

      expect(onTaskEvent).toHaveBeenCalledWith(
        withAnyTiming(
          asTaskRunEvent(
            id,
            asErr({
              error,
              persistence: TaskPersistence.Recurring,
              task: originalInstance,
              result: TaskRunResult.Failed,
              isExpired: false,
            })
          )
        )
      );
      expect(onTaskEvent).toHaveBeenCalledWith(
        asTaskManagerStatEvent('runDelay', asOk(expect.any(Number)))
      );
      expect(onTaskEvent).toHaveBeenCalledTimes(2);
    });

    test(`doesn't reschedule recurring tasks that return shouldDeleteTask = true`, async () => {
      const id = _.random(1, 20).toString();
      const onTaskEvent = jest.fn();
      const {
        runner,
        store,
        instance: originalInstance,
      } = await readyToRunStageSetup({
        onTaskEvent,
        instance: {
          id,
          schedule: { interval: '20m' },
          status: TaskStatus.Running,
          startedAt: new Date(),
          enabled: true,
        },
        definitions: {
          bar: {
            title: 'Bar!',
            createTaskRunner: () => ({
              async run() {
                return getDeleteTaskRunResult();
              },
            }),
          },
        },
      });

      await runner.run();

      expect(store.remove).toHaveBeenCalled();
      expect(store.update).not.toHaveBeenCalled();

      expect(onTaskEvent).toHaveBeenCalledWith(
        withAnyTiming(
          asTaskRunEvent(
            id,
            asOk({
              persistence: TaskPersistence.Recurring,
              task: originalInstance,
              result: TaskRunResult.Deleted,
              isExpired: false,
            })
          )
        )
      );
      expect(onTaskEvent).toHaveBeenCalledWith(
        asTaskManagerStatEvent('runDelay', asOk(expect.any(Number)))
      );
      expect(onTaskEvent).toHaveBeenCalledTimes(2);
    });

    test('tasks that return runAt override the schedule', async () => {
      const runAt = minutesFromNow(_.random(5));
      const { instance, runner, store } = await readyToRunStageSetup({
        instance: {
          schedule: { interval: '20m' },
        },
        definitions: {
          bar: {
            title: 'Bar!',
            createTaskRunner: () => ({
              async run() {
                return { runAt, state: {} };
              },
            }),
          },
        },
      });

      await runner.run();

      expect(store.partialUpdate).toHaveBeenCalledTimes(1);
      expect(store.partialUpdate).toHaveBeenCalledWith(expect.objectContaining({ runAt }), {
        validate: true,
        doc: instance,
      });
    });

    test('removes non-recurring tasks after they complete', async () => {
      const id = _.random(1, 20).toString();
      const { runner, store } = await readyToRunStageSetup({
        instance: {
          id,
          schedule: undefined,
        },
        definitions: {
          bar: {
            title: 'Bar!',
            createTaskRunner: () => ({
              async run() {
                return undefined;
              },
            }),
          },
        },
      });

      await runner.run();

      expect(store.remove).toHaveBeenCalledTimes(1);
      expect(store.remove).toHaveBeenCalledWith(id);
    });

    test('cancel cancels the task runner, if it is cancellable', async () => {
      let wasCancelled = false;
      const abortSpy = jest.spyOn(AbortController.prototype, 'abort');

      const { runner, logger } = await readyToRunStageSetup({
        definitions: {
          bar: {
            title: 'Bar!',
            createTaskRunner: () => ({
              async run() {
                const promise = new Promise((r) => setTimeout(r, 1000));
                jest.advanceTimersByTime(1000);
                await promise;
              },
              async cancel() {
                wasCancelled = true;
              },
            }),
          },
        },
      });

      const promise = runner.run();
      await Promise.resolve();
      await runner.cancel();
      await promise;

      expect(wasCancelled).toBeTruthy();
      expect(abortSpy).toHaveBeenCalledTimes(1);
      expect(logger.warn).not.toHaveBeenCalled();
    });

    test('debug logs if cancel is called on a non-cancellable task', async () => {
      const { runner, logger } = await readyToRunStageSetup({
        definitions: {
          bar: {
            title: 'Bar!',
            createTaskRunner: () => ({
              run: async () => undefined,
            }),
          },
        },
      });

      const promise = runner.run();
      await runner.cancel();
      await promise;

      expect(logger.debug).toHaveBeenCalledWith(`The task bar "foo" is not cancellable.`);
    });

    test('throws retry error (returning date) on error when defined', async () => {
      const initialAttempts = _.random(1, 3);
      const nextRetry = new Date(Date.now() + _.random(15, 100) * 1000);
      const id = Date.now().toString();
      const error = new Error('Dangit!');
      const {
        instance: taskInstance,
        runner,
        store,
      } = await readyToRunStageSetup({
        instance: {
          id,
          attempts: initialAttempts,
          enabled: true,
        },
        definitions: {
          bar: {
            title: 'Bar!',
            createTaskRunner: () => ({
              async run() {
                throw throwRetryableError(error, nextRetry);
              },
            }),
          },
        },
      });

      await runner.run();

      expect(store.partialUpdate).toHaveBeenCalledTimes(1);
      expect(store.partialUpdate).toHaveBeenCalledWith(expect.any(Object), {
        validate: true,
        doc: taskInstance,
      });
      const instance = store.partialUpdate.mock.calls[0][0];

      expect(instance.runAt?.getTime()).toEqual(nextRetry.getTime());
      expect(instance.enabled).not.toBeDefined();
    });

    test('throws retry error (returning true) on error when defined', async () => {
      const initialAttempts = _.random(1, 3);
      const id = Date.now().toString();
      const error = new Error('Dangit!');
      const {
        instance: taskInstance,
        runner,
        store,
      } = await readyToRunStageSetup({
        instance: {
          id,
          attempts: initialAttempts,
          enabled: true,
        },
        definitions: {
          bar: {
            title: 'Bar!',
            createTaskRunner: () => ({
              run: async () => {
                throwRetryableError(error, true);
              },
            }),
          },
        },
      });

      await runner.run();

      expect(store.partialUpdate).toHaveBeenCalledTimes(1);
      expect(store.partialUpdate).toHaveBeenCalledWith(expect.any(Object), {
        validate: true,
        doc: taskInstance,
      });

      const instance = store.partialUpdate.mock.calls[0][0];

      const minRunAt = Date.now();
      const maxRunAt = minRunAt + baseDelay * Math.pow(2, initialAttempts - 2);
      expect(instance.runAt?.getTime()).toBeGreaterThanOrEqual(minRunAt);
      expect(instance.runAt?.getTime()).toBeLessThanOrEqual(maxRunAt);

      expect(instance.enabled).not.toBeDefined();
    });

    test('throws retry error (returning false) on error when defined', async () => {
      const initialAttempts = _.random(1, 3);
      const id = Date.now().toString();
      const error = new Error('Dangit!');
      const { runner, store } = await readyToRunStageSetup({
        instance: {
          id,
          attempts: initialAttempts,
          enabled: true,
        },
        definitions: {
          bar: {
            title: 'Bar!',
            createTaskRunner: () => ({
              async run() {
                throwRetryableError(error, false);
              },
            }),
          },
        },
      });

      await runner.run();

      expect(store.remove).toHaveBeenCalled();
      expect(store.update).not.toHaveBeenCalled();
    });

    test('bypasses getRetry function (returning false) on error of a recurring task', async () => {
      const initialAttempts = _.random(1, 3);
      const id = Date.now().toString();
      const error = new Error('Dangit!');
      const {
        instance: taskInstance,
        runner,
        store,
      } = await readyToRunStageSetup({
        instance: {
          id,
          attempts: initialAttempts,
          schedule: { interval: '1m' },
          startedAt: new Date(),
          enabled: true,
        },
        definitions: {
          bar: {
            title: 'Bar!',
            createTaskRunner: () => ({
              async run() {
                throw error;
              },
            }),
          },
        },
      });

      await runner.run();

      expect(store.partialUpdate).toHaveBeenCalledTimes(1);
      expect(store.partialUpdate).toHaveBeenCalledWith(expect.any(Object), {
        validate: true,
        doc: taskInstance,
      });

      const instance = store.partialUpdate.mock.calls[0][0];

      const nextIntervalDelay = 60000; // 1m
      const expectedRunAt = new Date(Date.now() + nextIntervalDelay);
      expect(instance.runAt?.getTime()).toEqual(expectedRunAt.getTime());
      expect(instance.enabled).not.toBeDefined();
    });

    test('Fails non-recurring task when maxAttempts reached', async () => {
      const id = _.random(1, 20).toString();
      const initialAttempts = 3;
      const { runner, store } = await readyToRunStageSetup({
        instance: {
          id,
          attempts: initialAttempts,
          schedule: undefined,
          enabled: true,
        },
        definitions: {
          bar: {
            title: 'Bar!',
            maxAttempts: 3,
            createTaskRunner: () => ({
              run: async () => {
                throw new Error();
              },
            }),
          },
        },
      });

      await runner.run();

      expect(store.remove).toHaveBeenCalled();
      expect(store.partialUpdate).not.toHaveBeenCalled();
    });

    test(`Doesn't fail recurring tasks when maxAttempts reached`, async () => {
      const id = _.random(1, 20).toString();
      const initialAttempts = 3;
      const intervalSeconds = 10;
      const {
        instance: taskInstance,
        runner,
        store,
      } = await readyToRunStageSetup({
        instance: {
          id,
          attempts: initialAttempts,
          schedule: { interval: `${intervalSeconds}s` },
          startedAt: new Date(),
          enabled: true,
        },
        definitions: {
          bar: {
            title: 'Bar!',
            maxAttempts: 3,
            createTaskRunner: () => ({
              run: async () => {
                throw new Error();
              },
            }),
          },
        },
      });

      await runner.run();

      expect(store.partialUpdate).toHaveBeenCalledTimes(1);
      const instance = store.partialUpdate.mock.calls[0][0];
      expect(instance.attempts).toEqual(3);
      expect(instance.status).toEqual('idle');
      expect(instance.runAt?.getTime()).toEqual(
        new Date(Date.now() + intervalSeconds * 1000).getTime()
      );
      expect(instance.enabled).not.toBeDefined();
      expect(store.partialUpdate).toHaveBeenCalledWith(expect.any(Object), {
        validate: true,
        doc: taskInstance,
      });
    });

    test('throws error when the task has invalid state', async () => {
      const mockTaskInstance: Partial<ConcreteTaskInstance> = {
        schedule: { interval: '10m' },
        status: TaskStatus.Idle,
        startedAt: new Date(),
        enabled: true,
        runAt: new Date(),
        params: { foo: true },
        state: { foo: true, bar: 'test', baz: 'test' },
        stateVersion: 4,
      };

      const {
        instance: taskInstance,
        runner,
        logger,
        store,
      } = await readyToRunStageSetup({
        instance: mockTaskInstance,
        definitions: {
          bar: {
            title: 'Bar!',
            createTaskRunner: () => ({
              async run() {
                return { state: { foo: 'bar' } };
              },
            }),
            stateSchemaByVersion: {
              1: {
                up: (state: Record<string, unknown>) => ({ foo: state.foo || '' }),
                schema: schema.object({
                  foo: schema.string(),
                }),
              },
              2: {
                up: (state: Record<string, unknown>) => ({ ...state, bar: state.bar || '' }),
                schema: schema.object({
                  foo: schema.string(),
                  bar: schema.string(),
                }),
              },
              3: {
                up: (state: Record<string, unknown>) => ({ ...state, baz: state.baz || '' }),
                schema: schema.object({
                  foo: schema.string(),
                  bar: schema.string(),
                  baz: schema.string(),
                }),
              },
            },
          },
        },
      });

      expect(await runner.run()).toEqual({
        error: {
          error: new Error('[foo]: expected value of type [string] but got [boolean]'),
          shouldValidate: false,
          state: { bar: 'test', baz: 'test', foo: true },
        },
        tag: 'err',
      });
      expect(logger.warn).toHaveBeenCalledTimes(1);
      expect(logger.warn).toHaveBeenCalledWith(
        'Task (bar/foo) has a validation error: [foo]: expected value of type [string] but got [boolean]'
      );
      expect(store.partialUpdate).toHaveBeenCalledWith(expect.any(Object), {
        validate: false,
        doc: taskInstance,
      });
    });

    test('does not throw error and runs when the task has invalid state and allowReadingInvalidState = true', async () => {
      const mockTaskInstance: Partial<ConcreteTaskInstance> = {
        schedule: { interval: '10m' },
        status: TaskStatus.Idle,
        startedAt: new Date(),
        enabled: true,
        runAt: new Date(),
        params: { foo: true },
        state: { foo: true, bar: 'test', baz: 'test' },
        stateVersion: 4,
      };

      const { runner, store, logger } = await readyToRunStageSetup({
        instance: mockTaskInstance,
        definitions: {
          bar: {
            title: 'Bar!',
            createTaskRunner: () => ({
              async run() {
                return { state: { foo: 'bar' } };
              },
            }),
            stateSchemaByVersion: {
              1: {
                up: (state: Record<string, unknown>) => ({ foo: state.foo || '' }),
                schema: schema.object({
                  foo: schema.string(),
                }),
              },
              2: {
                up: (state: Record<string, unknown>) => ({ ...state, bar: state.bar || '' }),
                schema: schema.object({
                  foo: schema.string(),
                  bar: schema.string(),
                }),
              },
              3: {
                up: (state: Record<string, unknown>) => ({ ...state, baz: state.baz || '' }),
                schema: schema.object({
                  foo: schema.string(),
                  bar: schema.string(),
                  baz: schema.string(),
                }),
              },
            },
          },
        },
        allowReadingInvalidState: true,
      });

      const result = await runner.run();

      expect(store.partialUpdate).toHaveBeenCalledTimes(1);
      const instance = store.partialUpdate.mock.calls[0][0];
      expect(instance.state).toEqual({
        foo: 'bar',
      });
      expect(instance.attempts).toBe(0);
      expect(logger.warn).not.toHaveBeenCalled();
      expect(result).toEqual(asOk({ state: { foo: 'bar' } }));
    });

    test('updates retryAt on an interval for long running tasks', async () => {
      const { runner, store } = await readyToRunStageSetup({
        instance: {
          status: TaskStatus.Running,
          startedAt: new Date(),
          enabled: true,
        },
        definitions: {
          bar: {
            title: 'Bar!',
            timeout: `365d`,
            createTaskRunner: () => ({
              async run() {
                const promise = new Promise((r) => setTimeout(r, 60000));
                jest.advanceTimersByTime(60000);
                await promise;
                return { state: {} };
              },
            }),
          },
        },
      });
      const now = new Date();
      await runner.run();

      expect(store.partialUpdate).toHaveBeenCalledTimes(1);

      const instance = store.partialUpdate.mock.calls[0][0];
      expect(instance.retryAt?.getTime()).toBeGreaterThan(minutesFromDate(now, 5).getTime());
      expect(instance.retryAt?.getTime()).toBeLessThan(minutesFromDate(now, 6.5).getTime());
    });

    test('stops the interval and cancels the task if there is 409 error updating retryAt for long running tasks', async () => {
      let wasCancelled = false;
      const { runner, store, logger } = await readyToRunStageSetup({
        instance: {
          status: TaskStatus.Running,
          startedAt: new Date(),
          enabled: true,
        },
        definitions: {
          bar: {
            title: 'Bar!',
            timeout: `365d`,
            createTaskRunner: () => ({
              async run() {
                const promise = new Promise((r) => setTimeout(r, 60000));
                jest.advanceTimersByTime(60000);
                await promise;
                return { state: {} };
              },
              async cancel() {
                wasCancelled = true;
              },
            }),
          },
        },
      });
      store.partialUpdate.mockRejectedValueOnce(
        SavedObjectsErrorHelpers.decorateConflictError(new Error('Saved object [type/id] conflict'))
      );
      await runner.run();

      expect(store.partialUpdate).toHaveBeenCalledTimes(1);
      expect(logger.warn).toHaveBeenCalledWith(
        'Conflict error trying to update retryAt for a long-running task. Cancelling task: foo',
        {
          tags: ['foo', 'bar'],
        }
      );
      expect(wasCancelled).toBeTruthy();
    });

    test('does not run heartbeat updates while processing recurring task result', async () => {
      let sawProcessResultUpdate = false;
      let heartbeatUpdateCount = 0;
      let heartbeatCountBeforeProcessResult: number | undefined;
      const { runner, store } = await readyToRunStageSetup({
        instance: {
          id: 'foo',
          status: TaskStatus.Running,
          startedAt: new Date(),
          enabled: true,
          schedule: { interval: '1m' },
        },
        definitions: {
          bar: {
            title: 'Bar!',
            timeout: `365d`,
            createTaskRunner: () => ({
              async run() {
                const promise = new Promise((r) => setTimeout(r, 60000));
                jest.advanceTimersByTime(60000);
                await promise;
                return { state: {} };
              },
            }),
          },
        },
      });

      store.partialUpdate.mockImplementation(async (doc) => {
        if (doc.retryAt && !doc.status) {
          heartbeatUpdateCount += 1;
        }

        if (doc.status === TaskStatus.Idle) {
          sawProcessResultUpdate = true;
          heartbeatCountBeforeProcessResult = heartbeatUpdateCount;
          // If heartbeat timer is still running while processResult persists task state,
          // advancing time here will trigger an additional retryAt update.
          jest.advanceTimersByTime(60000);
        }
        return mockInstance({
          ...doc,
          schedule: { interval: '1m' },
        }) as ConcreteTaskInstance;
      });

      await runner.run();

      expect(sawProcessResultUpdate).toBe(true);
      expect(heartbeatUpdateCount).toBeGreaterThan(0);
      expect(heartbeatCountBeforeProcessResult).toBeDefined();
      expect(heartbeatUpdateCount).toBe(heartbeatCountBeforeProcessResult);
    });

    describe('TaskEvents', () => {
      test('emits TaskEvent when a task is run successfully', async () => {
        const id = _.random(1, 20).toString();
        const onTaskEvent = jest.fn();
        const { runner, instance } = await readyToRunStageSetup({
          onTaskEvent,
          instance: {
            id,
          },
          definitions: {
            bar: {
              title: 'Bar!',
              createTaskRunner: () => ({
                async run() {
                  return { state: {} };
                },
              }),
            },
          },
        });

        await runner.run();

        expect(onTaskEvent).toHaveBeenCalledWith(
          withAnyTiming(
            asTaskRunEvent(
              id,
              asOk({
                task: instance,
                persistence: TaskPersistence.NonRecurring,
                result: TaskRunResult.Success,
                isExpired: false,
              })
            )
          )
        );
      });

      test('emits TaskEvent when a task is run successfully but completes after timeout', async () => {
        jest.setSystemTime(new Date(2023, 1, 1, 0, 0, 0, 0));
        const id = _.random(1, 20).toString();
        const onTaskEvent = jest.fn();
        const { runner, instance } = await readyToRunStageSetup({
          onTaskEvent,
          instance: {
            id,
          },
          definitions: {
            bar: {
              title: 'Bar!',
              timeout: `1s`,
              createTaskRunner: () => ({
                async run() {
                  return { state: {} };
                },
              }),
            },
          },
        });

        jest.setSystemTime(new Date(2023, 1, 1, 0, 10, 0, 0));
        await runner.run();

        expect(onTaskEvent).toHaveBeenCalledWith(
          withAnyTiming(
            asTaskRunEvent(
              id,
              asOk({
                task: instance,
                persistence: TaskPersistence.NonRecurring,
                result: TaskRunResult.Success,
                isExpired: true,
              })
            )
          )
        );
        expect(onTaskEvent).toHaveBeenCalledWith(
          asTaskManagerStatEvent('runDelay', asOk(expect.any(Number)))
        );
      });

      test('emits TaskEvent when a recurring task is run successfully', async () => {
        const id = _.random(1, 20).toString();
        const runAt = minutesFromNow(_.random(5));
        const onTaskEvent = jest.fn();
        const { runner, instance } = await readyToRunStageSetup({
          onTaskEvent,
          instance: {
            id,
            schedule: { interval: '1m' },
          },
          definitions: {
            bar: {
              title: 'Bar!',
              createTaskRunner: () => ({
                async run() {
                  return { runAt, state: {} };
                },
              }),
            },
          },
        });

        await runner.run();

        expect(onTaskEvent).toHaveBeenCalledWith(
          withAnyTiming(
            asTaskRunEvent(
              id,
              asOk({
                task: instance,
                persistence: TaskPersistence.Recurring,
                result: TaskRunResult.Success,
                isExpired: false,
              })
            )
          )
        );
      });

      test('emits TaskEvent when a recurring task is run successfully but completes after timeout', async () => {
        jest.setSystemTime(new Date(2023, 1, 1, 0, 0, 0, 0));
        const id = _.random(1, 20).toString();
        const runAt = minutesFromNow(_.random(5));
        const onTaskEvent = jest.fn();
        const { runner, instance } = await readyToRunStageSetup({
          onTaskEvent,
          instance: {
            id,
            schedule: { interval: '1m' },
          },
          definitions: {
            bar: {
              title: 'Bar!',
              timeout: `1s`,
              createTaskRunner: () => ({
                async run() {
                  return { runAt, state: {} };
                },
              }),
            },
          },
        });

        jest.setSystemTime(new Date(2023, 1, 1, 0, 10, 0, 0));
        await runner.run();

        expect(onTaskEvent).toHaveBeenCalledWith(
          withAnyTiming(
            asTaskRunEvent(
              id,
              asOk({
                task: instance,
                persistence: TaskPersistence.Recurring,
                result: TaskRunResult.Success,
                isExpired: true,
              })
            )
          )
        );
        expect(onTaskEvent).toHaveBeenCalledWith(
          asTaskManagerStatEvent('runDelay', asOk(expect.any(Number)))
        );
      });

      test('emits TaskEvent when a recurring task returns a success result with taskRunError', async () => {
        const id = _.random(1, 20).toString();
        const runAt = minutesFromNow(_.random(5));
        const onTaskEvent = jest.fn();
        const { runner, instance } = await readyToRunStageSetup({
          onTaskEvent,
          instance: {
            id,
            schedule: { interval: '1m' },
          },
          definitions: {
            bar: {
              title: 'Bar!',
              createTaskRunner: () => ({
                async run() {
                  return {
                    runAt,
                    state: {},
                    taskRunError: createTaskRunError(new Error('test'), TaskErrorSource.FRAMEWORK),
                  };
                },
              }),
            },
          },
        });

        await runner.run();

        expect(onTaskEvent).toHaveBeenCalledWith(
          withAnyTiming(
            asTaskRunEvent(
              id,
              asErr({
                task: instance,
                persistence: TaskPersistence.Recurring,
                result: TaskRunResult.Success,
                error: new Error(`test`),
                isExpired: false,
              })
            )
          )
        );
      });

      test('emits TaskEvent when a recurring task returns a success result with taskRunError but completes after timeout', async () => {
        jest.setSystemTime(new Date(2023, 1, 1, 0, 0, 0, 0));
        const id = _.random(1, 20).toString();
        const runAt = minutesFromNow(_.random(5));
        const onTaskEvent = jest.fn();
        const { runner, instance } = await readyToRunStageSetup({
          onTaskEvent,
          instance: {
            id,
            schedule: { interval: '1m' },
          },
          definitions: {
            bar: {
              title: 'Bar!',
              timeout: `1s`,
              createTaskRunner: () => ({
                async run() {
                  return {
                    runAt,
                    state: {},
                    taskRunError: createTaskRunError(new Error('test'), TaskErrorSource.FRAMEWORK),
                  };
                },
              }),
            },
          },
        });

        jest.setSystemTime(new Date(2023, 1, 1, 0, 10, 0, 0));
        await runner.run();

        expect(onTaskEvent).toHaveBeenCalledWith(
          withAnyTiming(
            asTaskRunEvent(
              id,
              asErr({
                task: instance,
                persistence: TaskPersistence.Recurring,
                result: TaskRunResult.Success,
                isExpired: true,
                error: new Error(`test`),
              })
            )
          )
        );
      });

      test('emits TaskEvent when a task run throws an error', async () => {
        const id = _.random(1, 20).toString();
        const error = new Error('Dangit!');
        const onTaskEvent = jest.fn();
        const { runner, instance } = await readyToRunStageSetup({
          onTaskEvent,
          instance: {
            id,
          },
          definitions: {
            bar: {
              title: 'Bar!',
              createTaskRunner: () => ({
                async run() {
                  throw error;
                },
              }),
            },
          },
        });
        await runner.run();

        expect(onTaskEvent).toHaveBeenCalledWith(
          withAnyTiming(
            asTaskRunEvent(
              id,
              asErr({
                error,
                task: instance,
                persistence: TaskPersistence.NonRecurring,
                result: TaskRunResult.RetryScheduled,
                isExpired: false,
              })
            )
          )
        );
        expect(onTaskEvent).toHaveBeenCalledTimes(2);
      });

      test('emits TaskEvent when a recurring task run throws an error due to timeout', async () => {
        jest.setSystemTime(new Date(2023, 1, 1, 0, 0, 0, 0));
        const id = _.random(1, 20).toString();
        const error = new Error('Task was cancelled');
        const onTaskEvent = jest.fn();
        let wasCancelled = false;
        const { runner, instance } = await readyToRunStageSetup({
          onTaskEvent,
          instance: {
            id,
            schedule: { interval: '1s' },
          },
          definitions: {
            bar: {
              title: 'Bar!',
              timeout: `15s`,
              createTaskRunner: () => ({
                async run() {
                  const promise = new Promise((r) => setTimeout(r, 20000));
                  jest.advanceTimersByTime(20000);
                  await promise;
                  if (wasCancelled) {
                    throw error;
                  }
                },
                async cancel() {
                  wasCancelled = true;
                },
              }),
            },
          },
        });
        jest.setSystemTime(new Date(2023, 1, 1, 0, 10, 0, 0));
        const promise = runner.run();
        await Promise.resolve();
        await runner.cancel();
        await promise;

        expect(onTaskEvent).toHaveBeenCalledWith(
          withAnyTiming(
            asTaskRunEvent(
              id,
              asErr({
                error,
                task: instance,
                persistence: TaskPersistence.Recurring,
                result: TaskRunResult.RetryScheduled,
                isExpired: true,
              })
            )
          )
        );
        expect(onTaskEvent).toHaveBeenCalledWith(
          asTaskManagerStatEvent('runDelay', asOk(expect.any(Number)))
        );
        expect(onTaskEvent).toHaveBeenCalledTimes(2);
      });

      test('emits TaskEvent when an ad-hoc task run throws an error due to timeout', async () => {
        jest.setSystemTime(new Date(2023, 1, 1, 0, 0, 0, 0));
        const id = _.random(1, 20).toString();
        const error = new Error('Task was cancelled');
        const onTaskEvent = jest.fn();
        let wasCancelled = false;
        const { runner, instance } = await readyToRunStageSetup({
          onTaskEvent,
          instance: { id },
          definitions: {
            bar: {
              title: 'Bar!',
              timeout: `15s`,
              createTaskRunner: () => ({
                async run() {
                  const promise = new Promise((r) => setTimeout(r, 20000));
                  jest.advanceTimersByTime(20000);
                  await promise;
                  if (wasCancelled) {
                    throw error;
                  }
                },
                async cancel() {
                  wasCancelled = true;
                },
              }),
            },
          },
        });
        jest.setSystemTime(new Date(2023, 1, 1, 0, 10, 0, 0));
        const promise = runner.run();
        await Promise.resolve();
        await runner.cancel();
        await promise;

        expect(onTaskEvent).toHaveBeenCalledWith(
          withAnyTiming(
            asTaskRunEvent(
              id,
              asErr({
                error,
                task: instance,
                persistence: TaskPersistence.NonRecurring,
                result: TaskRunResult.Failed,
                isExpired: true,
              })
            )
          )
        );
        expect(onTaskEvent).toHaveBeenCalledWith(
          asTaskManagerStatEvent('runDelay', asOk(expect.any(Number)))
        );
        expect(onTaskEvent).toHaveBeenCalledTimes(2);
      });

      test('emits TaskEvent when a recurring task run times out without throwing error', async () => {
        jest.setSystemTime(new Date(2023, 1, 1, 0, 0, 0, 0));
        const id = _.random(1, 20).toString();
        const onTaskEvent = jest.fn();
        const { runner, instance } = await readyToRunStageSetup({
          onTaskEvent,
          instance: {
            id,
            schedule: { interval: '1s' },
          },
          definitions: {
            bar: {
              title: 'Bar!',
              timeout: `15s`,
              createTaskRunner: () => ({
                async run() {
                  const promise = new Promise((r) => setTimeout(r, 20000));
                  jest.advanceTimersByTime(20000);
                  await promise;
                },
              }),
            },
          },
        });
        jest.setSystemTime(new Date(2023, 1, 1, 0, 10, 0, 0));
        const promise = runner.run();
        await Promise.resolve();
        await runner.cancel();
        await promise;

        expect(onTaskEvent).toHaveBeenCalledWith(
          withAnyTiming(
            asTaskRunEvent(
              id,
              asOk({
                persistence: TaskPersistence.Recurring,
                task: instance,
                result: TaskRunResult.Success,
                isExpired: true,
              })
            )
          )
        );
        expect(onTaskEvent).toHaveBeenCalledWith(
          asTaskManagerStatEvent('runDelay', asOk(expect.any(Number)))
        );
        expect(onTaskEvent).toHaveBeenCalledTimes(2);
      });

      test('emits TaskEvent when an ad-hoc task run times out without throwing error', async () => {
        jest.setSystemTime(new Date(2023, 1, 1, 0, 0, 0, 0));
        const id = _.random(1, 20).toString();
        const onTaskEvent = jest.fn();
        const { runner, instance } = await readyToRunStageSetup({
          onTaskEvent,
          instance: { id },
          definitions: {
            bar: {
              title: 'Bar!',
              timeout: `15s`,
              createTaskRunner: () => ({
                async run() {
                  const promise = new Promise((r) => setTimeout(r, 20000));
                  jest.advanceTimersByTime(20000);
                  await promise;
                },
              }),
            },
          },
        });
        jest.setSystemTime(new Date(2023, 1, 1, 0, 10, 0, 0));
        const promise = runner.run();
        await Promise.resolve();
        await runner.cancel();
        await promise;

        expect(onTaskEvent).toHaveBeenCalledWith(
          withAnyTiming(
            asTaskRunEvent(
              id,
              asOk({
                persistence: TaskPersistence.NonRecurring,
                task: instance,
                result: TaskRunResult.Success,
                isExpired: true,
              })
            )
          )
        );
        expect(onTaskEvent).toHaveBeenCalledWith(
          asTaskManagerStatEvent('runDelay', asOk(expect.any(Number)))
        );
        expect(onTaskEvent).toHaveBeenCalledTimes(2);
      });

      test('emits TaskEvent when a task run returns an error', async () => {
        const id = _.random(1, 20).toString();
        const error = new Error('Dangit!');
        const onTaskEvent = jest.fn();
        const { runner, instance } = await readyToRunStageSetup({
          onTaskEvent,
          instance: {
            id,
            schedule: { interval: '1m' },
            startedAt: new Date(),
          },
          definitions: {
            bar: {
              title: 'Bar!',
              createTaskRunner: () => ({
                async run() {
                  return { error, state: {} };
                },
              }),
            },
          },
        });

        await runner.run();

        expect(onTaskEvent).toHaveBeenCalledWith(
          withAnyTiming(
            asTaskRunEvent(
              id,
              asErr({
                error,
                task: instance,
                persistence: TaskPersistence.Recurring,
                result: TaskRunResult.RetryScheduled,
                isExpired: false,
              })
            )
          )
        );
        expect(onTaskEvent).toHaveBeenCalledWith(
          asTaskManagerStatEvent('runDelay', asOk(expect.any(Number)))
        );
        expect(onTaskEvent).toHaveBeenCalledTimes(2);
      });

      test('emits TaskEvent when a task returns an error and is marked as failed', async () => {
        const id = _.random(1, 20).toString();
        const error = new Error('Dangit!');
        const onTaskEvent = jest.fn();
        const {
          runner,
          store,
          instance: originalInstance,
        } = await readyToRunStageSetup({
          onTaskEvent,
          instance: {
            id,
            startedAt: new Date(),
            enabled: true,
          },
          definitions: {
            bar: {
              title: 'Bar!',
              createTaskRunner: () => ({
                async run() {
                  try {
                    throwUnrecoverableError(error);
                  } catch (e) {
                    return { error: e, state: {} };
                  }
                },
              }),
            },
          },
        });

        await runner.run();

        expect(store.remove).toHaveBeenCalled();
        expect(store.partialUpdate).not.toHaveBeenCalled();

        expect(onTaskEvent).toHaveBeenCalledWith(
          withAnyTiming(
            asTaskRunEvent(
              id,
              asErr({
                error,
                task: originalInstance,
                persistence: TaskPersistence.NonRecurring,
                result: TaskRunResult.Failed,
                isExpired: false,
              })
            )
          )
        );
        expect(onTaskEvent).toHaveBeenCalledWith(
          asTaskManagerStatEvent('runDelay', asOk(expect.any(Number)))
        );
        expect(onTaskEvent).toHaveBeenCalledTimes(2);
      });

      test('emits TaskEvent when failing to update a recurring task', async () => {
        const id = _.random(1, 20).toString();
        const runAt = minutesFromNow(_.random(5));
        const onTaskEvent = jest.fn();
        const { runner, instance, store } = await readyToRunStageSetup({
          onTaskEvent,
          instance: {
            id,
            schedule: { interval: '1m' },
          },
          definitions: {
            bar: {
              title: 'Bar!',
              createTaskRunner: () => ({
                async run() {
                  return { runAt, state: {} };
                },
              }),
            },
          },
        });

        const error = new Error('fail');

        store.partialUpdate.mockImplementation(() => {
          throw error;
        });

        await expect(runner.run()).rejects.toThrowError('fail');

        expect(onTaskEvent).toHaveBeenCalledWith(
          withAnyTiming(
            asTaskRunEvent(
              id,
              asErr({
                task: instance,
                persistence: TaskPersistence.Recurring,
                result: TaskRunResult.Failed,
                isExpired: false,
                error,
              })
            )
          )
        );
      });

      test('emits TaskEvent when failing to update a non-recurring task', async () => {
        const id = _.random(1, 20).toString();
        const runAt = minutesFromNow(_.random(5));
        const onTaskEvent = jest.fn();
        const { runner, instance, store } = await readyToRunStageSetup({
          onTaskEvent,
          instance: {
            id,
          },
          definitions: {
            bar: {
              title: 'Bar!',
              createTaskRunner: () => ({
                async run() {
                  return { runAt, state: {} };
                },
              }),
            },
          },
        });

        const error = new Error('fail');

        store.partialUpdate.mockImplementation(() => {
          throw error;
        });

        await expect(runner.run()).rejects.toThrowError('fail');

        expect(onTaskEvent).toHaveBeenCalledWith(
          withAnyTiming(
            asTaskRunEvent(
              id,
              asErr({
                task: instance,
                persistence: TaskPersistence.NonRecurring,
                result: TaskRunResult.Failed,
                isExpired: false,
                error,
              })
            )
          )
        );
      });
    });

    describe('logTaskRunStartEvent', () => {
      test('eventLog logs a start event when a task begins running', async () => {
        const id = _.random(1, 20).toString();
        const { runner, instance } = await readyToRunStageSetup({
          instance: { id },
          definitions: {
            bar: {
              title: 'Bar!',
              createTaskRunner: () => ({
                async run() {
                  return { state: {} };
                },
              }),
            },
          },
        });

        await runner.run();

        expect(eventLoggerMock.logEvent).toHaveBeenCalledWith({
          event: {
            action: 'task-run-start',
            // start must equal task.startedAt so it aligns with the stored task document
            start: instance.startedAt?.toISOString(),
          },
          kibana: {
            task: {
              id,
              type: 'bar',
              schedule_delay: expect.any(String),
              scheduled: expect.any(String),
            },
          },
          message: `Task bar "${id}" started.`,
        });
      });

      test('eventLog logs the start event before the end event', async () => {
        const id = _.random(1, 20).toString();
        const { runner } = await readyToRunStageSetup({
          instance: { id },
          definitions: {
            bar: {
              title: 'Bar!',
              createTaskRunner: () => ({
                async run() {
                  return { state: {} };
                },
              }),
            },
          },
        });

        await runner.run();

        const calls = (eventLoggerMock.logEvent as jest.Mock).mock.calls;
        const startCallIndex = calls.findIndex((c) => c[0].event.action === 'task-run-start');
        const endCallIndex = calls.findIndex((c) => c[0].event.action === 'task-run');
        expect(startCallIndex).toBeGreaterThanOrEqual(0);
        expect(endCallIndex).toBeGreaterThanOrEqual(0);
        expect(startCallIndex).toBeLessThan(endCallIndex);
      });

      test('eventLog logs a start event even when a task run fails', async () => {
        const id = _.random(1, 20).toString();
        const { runner } = await readyToRunStageSetup({
          instance: { id },
          definitions: {
            bar: {
              title: 'Bar!',
              createTaskRunner: () => ({
                async run() {
                  throw new Error('Dangit!');
                },
              }),
            },
          },
        });

        await runner.run();

        expect(eventLoggerMock.logEvent).toHaveBeenCalledWith(
          expect.objectContaining({
            event: expect.objectContaining({ action: 'task-run-start' }),
          })
        );
      });
    });

    describe('logTaskRunEvent', () => {
      test('eventLog logs an event when a task is run successfully', async () => {
        const id = _.random(1, 20).toString();
        const onTaskEvent = jest.fn();
        const { runner } = await readyToRunStageSetup({
          onTaskEvent,
          instance: {
            id,
          },
          definitions: {
            bar: {
              title: 'Bar!',
              createTaskRunner: () => ({
                async run() {
                  return { state: {} };
                },
              }),
            },
          },
        });

        await runner.run();

        expect(eventLoggerMock.logEvent).toHaveBeenCalledWith({
          event: {
            action: 'task-run',
            duration: expect.any(String),
            end: expect.stringMatching(dateRegExp),
            outcome: 'success',
            start: expect.stringMatching(dateRegExp),
          },
          kibana: {
            task: {
              id,
              type: 'bar',
              schedule_delay: expect.any(String),
              scheduled: expect.any(String),
            },
          },
          message: `Task bar "${id}" completed successfully.`,
        });
      });

      test('eventLog logs a failure event when a recurring task returns a success result with taskRunError', async () => {
        const id = _.random(1, 20).toString();
        const runAt = minutesFromNow(_.random(5));
        const onTaskEvent = jest.fn();
        const { runner } = await readyToRunStageSetup({
          onTaskEvent,
          instance: {
            id,
            schedule: { interval: '1m' },
          },
          definitions: {
            bar: {
              title: 'Bar!',
              createTaskRunner: () => ({
                async run() {
                  return {
                    runAt,
                    state: {},
                    taskRunError: createTaskRunError(new Error('test'), TaskErrorSource.FRAMEWORK),
                  };
                },
              }),
            },
          },
        });

        await runner.run();

        expect(eventLoggerMock.logEvent).toHaveBeenCalledWith({
          error: expect.any(Object),
          event: {
            action: 'task-run',
            duration: expect.any(String),
            end: expect.stringMatching(dateRegExp),
            outcome: 'failure',
            start: expect.stringMatching(dateRegExp),
          },
          kibana: {
            task: {
              id,
              type: 'bar',
              schedule_delay: expect.any(String),
              scheduled: expect.any(String),
            },
          },
          message: `Task bar "${id}" failed with a taskRunError.`,
        });
      });

      test('eventLog logs a failure event when a task run throws an error', async () => {
        const id = _.random(1, 20).toString();
        const error = new Error('Dangit!');
        const onTaskEvent = jest.fn();
        const { runner } = await readyToRunStageSetup({
          onTaskEvent,
          instance: {
            id,
          },
          definitions: {
            bar: {
              title: 'Bar!',
              createTaskRunner: () => ({
                async run() {
                  throw error;
                },
              }),
            },
          },
        });
        await runner.run();

        expect(eventLoggerMock.logEvent).toHaveBeenCalledWith({
          error: expect.any(Object),
          event: {
            action: 'task-run',
            duration: expect.any(String),
            end: expect.stringMatching(dateRegExp),
            outcome: 'failure',
            start: expect.stringMatching(dateRegExp),
          },
          kibana: {
            task: {
              id,
              type: 'bar',
              schedule_delay: expect.any(String),
              scheduled: expect.any(String),
            },
          },
          message: `Task bar "${id}" failed.`,
        });
        expect(eventLoggerMock.logEvent).toHaveBeenCalledTimes(2);
      });

      test('eventLog logs failure and cancel events when a recurring task run throws an error due to timeout', async () => {
        jest.setSystemTime(new Date(2023, 1, 1, 0, 0, 0, 0));
        const id = _.random(1, 20).toString();
        const error = new Error('Task was cancelled');
        const onTaskEvent = jest.fn();
        let wasCancelled = false;
        const { runner } = await readyToRunStageSetup({
          onTaskEvent,
          instance: {
            id,
            schedule: { interval: '1s' },
          },
          definitions: {
            bar: {
              title: 'Bar!',
              timeout: `15s`,
              createTaskRunner: () => ({
                async run() {
                  const promise = new Promise((r) => setTimeout(r, 20000));
                  jest.advanceTimersByTime(20000);
                  await promise;
                  if (wasCancelled) {
                    throw error;
                  }
                },
                async cancel() {
                  wasCancelled = true;
                },
              }),
            },
          },
        });
        jest.setSystemTime(new Date(2023, 1, 1, 0, 10, 0, 0));
        const promise = runner.run();
        await Promise.resolve();
        await runner.cancel();
        await promise;

        expect(eventLoggerMock.logEvent).toHaveBeenCalledWith({
          event: {
            action: 'task-cancel',
            duration: expect.any(String),
            end: expect.stringMatching(dateRegExp),
            start: expect.stringMatching(dateRegExp),
          },
          kibana: {
            task: { id, type: 'bar', scheduled: expect.any(String) },
          },
          message: `Task bar "${id}" has been cancelled.`,
        });

        expect(eventLoggerMock.logEvent).toHaveBeenCalledWith({
          error: expect.any(Object),
          event: {
            action: 'task-run',
            duration: expect.any(String),
            end: expect.stringMatching(dateRegExp),
            outcome: 'failure',
            start: expect.stringMatching(dateRegExp),
            reason: `Task "${id}" was cancelled.`,
          },
          kibana: {
            task: {
              id,
              type: 'bar',
              schedule_delay: expect.any(String),
              scheduled: expect.any(String),
            },
          },
          message: `Task bar "${id}" failed.`,
        });

        expect(eventLoggerMock.logEvent).toHaveBeenCalledTimes(3);
      });

      test('eventLog logs failure and cancel events when an ad-hoc task run throws an error due to timeout', async () => {
        jest.setSystemTime(new Date(2023, 1, 1, 0, 0, 0, 0));
        const id = _.random(1, 20).toString();
        const error = new Error('Task was cancelled');
        const onTaskEvent = jest.fn();
        let wasCancelled = false;
        const { runner } = await readyToRunStageSetup({
          onTaskEvent,
          instance: { id },
          definitions: {
            bar: {
              title: 'Bar!',
              timeout: `15s`,
              createTaskRunner: () => ({
                async run() {
                  const promise = new Promise((r) => setTimeout(r, 20000));
                  jest.advanceTimersByTime(20000);
                  await promise;
                  if (wasCancelled) {
                    throw error;
                  }
                },
                async cancel() {
                  wasCancelled = true;
                },
              }),
            },
          },
        });
        jest.setSystemTime(new Date(2023, 1, 1, 0, 10, 0, 0));
        const promise = runner.run();
        await Promise.resolve();
        await runner.cancel();
        await promise;

        expect(eventLoggerMock.logEvent).toHaveBeenCalledWith({
          event: {
            action: 'task-cancel',
            duration: expect.any(String),
            end: expect.stringMatching(dateRegExp),
            start: expect.stringMatching(dateRegExp),
          },
          kibana: {
            task: { id, type: 'bar', scheduled: expect.any(String) },
          },
          message: `Task bar "${id}" has been cancelled.`,
        });
        expect(eventLoggerMock.logEvent).toHaveBeenCalledWith({
          error: expect.any(Object),
          event: {
            action: 'task-run',
            duration: expect.any(String),
            end: expect.stringMatching(dateRegExp),
            outcome: 'failure',
            start: expect.stringMatching(dateRegExp),
            reason: `Task "${id}" was cancelled.`,
          },
          kibana: {
            task: {
              id,
              type: 'bar',
              schedule_delay: expect.any(String),
              scheduled: expect.any(String),
            },
          },
          message: `Task bar "${id}" failed.`,
        });

        expect(onTaskEvent).toHaveBeenCalledTimes(2);
      });

      test('emits TaskEvent when a recurring task run times out without throwing error', async () => {
        jest.setSystemTime(new Date(2023, 1, 1, 0, 0, 0, 0));
        const id = _.random(1, 20).toString();
        const onTaskEvent = jest.fn();
        const { runner } = await readyToRunStageSetup({
          onTaskEvent,
          instance: {
            id,
            schedule: { interval: '1s' },
          },
          definitions: {
            bar: {
              title: 'Bar!',
              timeout: `15s`,
              createTaskRunner: () => ({
                async run() {
                  const promise = new Promise((r) => setTimeout(r, 20000));
                  jest.advanceTimersByTime(20000);
                  await promise;
                },
              }),
            },
          },
        });
        jest.setSystemTime(new Date(2023, 1, 1, 0, 10, 0, 0));
        const promise = runner.run();
        await Promise.resolve();
        await runner.cancel();
        await promise;

        expect(eventLoggerMock.logEvent).toHaveBeenCalledWith({
          event: {
            action: 'task-cancel',
            duration: expect.any(String),
            end: expect.stringMatching(dateRegExp),
            start: expect.stringMatching(dateRegExp),
          },
          kibana: {
            task: { id, type: 'bar', scheduled: expect.any(String) },
          },
          message: `Task bar "${id}" has been cancelled.`,
        });
        expect(eventLoggerMock.logEvent).toHaveBeenCalledWith({
          event: {
            action: 'task-run',
            duration: expect.any(String),
            end: expect.stringMatching(dateRegExp),
            outcome: 'success',
            start: expect.stringMatching(dateRegExp),
          },
          kibana: {
            task: {
              id,
              type: 'bar',
              schedule_delay: expect.any(String),
              scheduled: expect.any(String),
            },
          },
          message: `Task bar "${id}" completed successfully.`,
        });

        expect(onTaskEvent).toHaveBeenCalledTimes(2);
      });

      test('emits TaskEvent when an ad-hoc task run times out without throwing error', async () => {
        jest.setSystemTime(new Date(2023, 1, 1, 0, 0, 0, 0));
        const id = _.random(1, 20).toString();
        const onTaskEvent = jest.fn();
        const { runner } = await readyToRunStageSetup({
          onTaskEvent,
          instance: { id },
          definitions: {
            bar: {
              title: 'Bar!',
              timeout: `15s`,
              createTaskRunner: () => ({
                async run() {
                  const promise = new Promise((r) => setTimeout(r, 20000));
                  jest.advanceTimersByTime(20000);
                  await promise;
                },
              }),
            },
          },
        });
        jest.setSystemTime(new Date(2023, 1, 1, 0, 10, 0, 0));
        const promise = runner.run();
        await Promise.resolve();
        await runner.cancel();
        await promise;

        expect(eventLoggerMock.logEvent).toHaveBeenCalledWith({
          event: {
            action: 'task-cancel',
            duration: expect.any(String),
            end: expect.stringMatching(dateRegExp),
            start: expect.stringMatching(dateRegExp),
          },
          kibana: {
            task: { id, type: 'bar', scheduled: expect.any(String) },
          },
          message: `Task bar "${id}" has been cancelled.`,
        });
        expect(eventLoggerMock.logEvent).toHaveBeenCalledWith({
          event: {
            action: 'task-run',
            duration: expect.any(String),
            end: expect.stringMatching(dateRegExp),
            outcome: 'success',
            start: expect.stringMatching(dateRegExp),
          },
          kibana: {
            task: {
              id,
              type: 'bar',
              schedule_delay: expect.any(String),
              scheduled: expect.any(String),
            },
          },
          message: `Task bar "${id}" completed successfully.`,
        });

        expect(onTaskEvent).toHaveBeenCalledTimes(2);
      });
    });

    test('does not update saved object if recurring task expires without throwing error and timeout is greater than schedule', async () => {
      const id = _.random(1, 20).toString();
      const onTaskEvent = jest.fn();
      const { runner, store, usageCounter } = await readyToRunStageSetup({
        onTaskEvent,
        instance: {
          id,
          startedAt: moment().subtract(5, 'm').toDate(),
          schedule: { interval: '1s' },
        },
        definitions: {
          bar: {
            title: 'Bar!',
            timeout: '15s',
            createTaskRunner: () => ({
              async run() {
                const promise = new Promise((r) => setTimeout(r, 20000));
                jest.advanceTimersByTime(20000);
                await promise;
              },
            }),
          },
        },
      });

      const promise = runner.run();
      await Promise.resolve();
      await runner.cancel();
      await promise;

      expect(store.partialUpdate).not.toHaveBeenCalled();
      expect(usageCounter.incrementCounter).toHaveBeenCalledWith({
        counterName: 'taskManagerUpdateSkippedDueToTaskExpiration',
        counterType: 'taskManagerTaskRunner',
        incrementBy: 1,
      });
    });

    test('does not update saved object if recurring task throws error due to expiration and timeout is greater than schedule', async () => {
      const id = _.random(1, 20).toString();
      const onTaskEvent = jest.fn();
      let wasCancelled = false;
      const { runner, store, usageCounter } = await readyToRunStageSetup({
        onTaskEvent,
        instance: {
          id,
          startedAt: moment().subtract(5, 'm').toDate(),
          schedule: { interval: '1s' },
        },
        definitions: {
          bar: {
            title: 'Bar!',
            timeout: '15s',
            createTaskRunner: () => ({
              async run() {
                const promise = new Promise((r) => setTimeout(r, 20000));
                jest.advanceTimersByTime(20000);
                await promise;
                if (wasCancelled) {
                  throw new Error('Task was cancelled');
                }
              },
              async cancel() {
                wasCancelled = true;
              },
            }),
          },
        },
      });

      const promise = runner.run();
      await Promise.resolve();
      await runner.cancel();
      await promise;

      expect(store.partialUpdate).not.toHaveBeenCalled();
      expect(usageCounter.incrementCounter).toHaveBeenCalledWith({
        counterName: 'taskManagerUpdateSkippedDueToTaskExpiration',
        counterType: 'taskManagerTaskRunner',
        incrementBy: 1,
      });
    });

    test('updates saved object if recurring task expires without throwing error and schedule is greater than timeout', async () => {
      const id = _.random(1, 20).toString();
      const onTaskEvent = jest.fn();
      const {
        instance: taskInstance,
        runner,
        store,
        usageCounter,
      } = await readyToRunStageSetup({
        onTaskEvent,
        instance: {
          id,
          startedAt: moment().subtract(5, 'm').toDate(),
          schedule: { interval: '30s' },
        },
        definitions: {
          bar: {
            title: 'Bar!',
            timeout: '15s',
            createTaskRunner: () => ({
              async run() {
                const promise = new Promise((r) => setTimeout(r, 20000));
                jest.advanceTimersByTime(20000);
                await promise;
              },
            }),
          },
        },
      });

      const promise = runner.run();
      await Promise.resolve();
      await runner.cancel();
      await promise;

      expect(store.partialUpdate).toHaveBeenCalledTimes(1);
      expect(store.partialUpdate).toHaveBeenCalledWith(
        {
          id: expect.any(String),
          ownerId: null,
          retryAt: null,
          runAt: expect.any(Date),
          startedAt: null,
          status: 'idle',
          version: undefined,
        },
        {
          validate: true,
          doc: taskInstance,
        }
      );
      expect(usageCounter.incrementCounter).toHaveBeenCalledWith({
        counterName: 'taskManagerUpdateSkippedDueToTaskExpiration',
        counterType: 'taskManagerTaskRunner',
        incrementBy: 1,
      });
    });

    test('updates saved object if recurring task throws error due to expiration and schedule is greater than timeout', async () => {
      const id = _.random(1, 20).toString();
      const onTaskEvent = jest.fn();
      let wasCancelled = false;
      const {
        instance: taskInstance,
        runner,
        store,
        usageCounter,
      } = await readyToRunStageSetup({
        onTaskEvent,
        instance: {
          id,
          startedAt: moment().subtract(5, 'm').toDate(),
          schedule: { interval: '30s' },
        },
        definitions: {
          bar: {
            title: 'Bar!',
            timeout: '15s',
            createTaskRunner: () => ({
              async run() {
                const promise = new Promise((r) => setTimeout(r, 20000));
                jest.advanceTimersByTime(20000);
                await promise;
                if (wasCancelled) {
                  throw new Error('Task was cancelled');
                }
              },
              async cancel() {
                wasCancelled = true;
              },
            }),
          },
        },
      });

      const promise = runner.run();
      await Promise.resolve();
      await runner.cancel();
      await promise;

      expect(store.partialUpdate).toHaveBeenCalledTimes(1);
      expect(store.partialUpdate).toHaveBeenCalledWith(
        {
          id: expect.any(String),
          ownerId: null,
          retryAt: null,
          runAt: expect.any(Date),
          startedAt: null,
          status: 'idle',
          version: undefined,
        },
        {
          validate: true,
          doc: taskInstance,
        }
      );
      expect(usageCounter.incrementCounter).toHaveBeenCalledWith({
        counterName: 'taskManagerUpdateSkippedDueToTaskExpiration',
        counterType: 'taskManagerTaskRunner',
        incrementBy: 1,
      });
    });

    test('Prints debug logs on task start/end', async () => {
      const { runner, logger } = await readyToRunStageSetup({
        definitions: {
          bar: {
            title: 'Bar!',
            createTaskRunner: () => ({
              async run() {
                return { state: {} };
              },
            }),
          },
        },
      });
      await runner.run();

      expect(logger.debug).toHaveBeenCalledTimes(2);
      expect(logger.debug).toHaveBeenNthCalledWith(1, 'Running task bar "foo"', {
        tags: ['task:start', 'foo', 'bar'],
      });
      expect(logger.debug).toHaveBeenNthCalledWith(2, 'Task bar "foo" ended', {
        tags: ['task:end', 'foo', 'bar'],
      });
    });

    test('Prints debug logs on task start/end even if it throws error', async () => {
      const { runner, logger } = await readyToRunStageSetup({
        definitions: {
          bar: {
            title: 'Bar!',
            createTaskRunner: () => ({
              async run() {
                throw new Error();
              },
            }),
          },
        },
      });
      await runner.run();

      expect(logger.debug).toHaveBeenCalledTimes(3);
      expect(logger.debug).toHaveBeenNthCalledWith(1, 'Running task bar "foo"', {
        tags: ['task:start', 'foo', 'bar'],
      });
      expect(logger.debug).toHaveBeenNthCalledWith(3, 'Task bar "foo" ended', {
        tags: ['task:end', 'foo', 'bar'],
      });
    });

    test('Disables task if shouldDisableTask: true is returned', async () => {
      const { runner, store, logger } = await readyToRunStageSetup({
        instance: {
          schedule: {
            interval: `1m`,
          },
        },
        definitions: {
          bar: {
            title: 'Bar!',
            createTaskRunner: () => ({
              async run() {
                return {
                  state: {},
                  shouldDisableTask: true,
                };
              },
            }),
          },
        },
      });
      await runner.run();
      expect(store.partialUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          enabled: false,
          id: 'foo',
          status: 'idle',
        }),
        expect.anything()
      );
      expect(logger.warn).toBeCalledTimes(1);
      expect(logger.warn).toBeCalledWith(
        'Disabling task bar:foo as it indicated it should disable itself',
        { tags: ['bar'] }
      );
    });
  });

  describe('isAdHocTaskAndOutOfAttempts', () => {
    it(`should return false if the task doesn't have a schedule`, async () => {
      const { runner } = await pendingStageSetup({
        instance: {
          id: 'foo',
          taskType: 'testbar',
        },
      });

      expect(runner.isAdHocTaskAndOutOfAttempts).toEqual(false);
    });

    it(`should return false if the recurring task still has attempts remaining`, async () => {
      const { runner } = await pendingStageSetup({
        instance: {
          id: 'foo',
          taskType: 'testbar',
          attempts: 4,
        },
      });

      expect(runner.isAdHocTaskAndOutOfAttempts).toEqual(false);
    });

    it(`should return true if the recurring task is out of attempts`, async () => {
      const { runner } = await pendingStageSetup({
        instance: {
          id: 'foo',
          taskType: 'testbar',
          attempts: 5,
        },
      });

      expect(runner.isAdHocTaskAndOutOfAttempts).toEqual(true);
    });

    it(`should return true if attempts = max attempts and in claiming status`, async () => {
      const { runner } = await pendingStageSetup({
        instance: {
          id: 'foo',
          taskType: 'testbar',
          attempts: 5,
          status: TaskStatus.Claiming,
        },
      });

      expect(runner.isAdHocTaskAndOutOfAttempts).toEqual(true);
    });

    it(`should return false if attempts = max attempts and in running status`, async () => {
      const { runner } = await pendingStageSetup({
        instance: {
          id: 'foo',
          taskType: 'testbar',
          attempts: 5,
          status: TaskStatus.Running,
        },
      });

      expect(runner.isAdHocTaskAndOutOfAttempts).toEqual(false);
    });
  });

  describe('removeTask()', () => {
    it(`should remove the task saved-object`, async () => {
      const { runner, store } = await readyToRunStageSetup({
        instance: {
          id: 'foo',
          taskType: 'testbar',
        },
      });

      await runner.run();
      await runner.removeTask();
      expect(store.remove).toHaveBeenCalledWith('foo');
    });

    it(`should call the task cleanup function if defined`, async () => {
      const cleanupFn = jest.fn();
      const { runner } = await readyToRunStageSetup({
        instance: {
          id: 'foo',
          taskType: 'testbar2',
        },
        definitions: {
          testbar2: {
            title: 'Bar!',
            createTaskRunner: () => ({
              async run() {
                return { state: {} };
              },
              cancel: jest.fn(),
              cleanup: cleanupFn,
            }),
          },
        },
      });

      // Remove task is called after run() with the this.task object defined
      await runner.run();
      expect(cleanupFn).toHaveBeenCalledTimes(1);
    });

    it(`doesn't throw an error if the cleanup function throws an error`, async () => {
      const cleanupFn = jest.fn().mockRejectedValue(new Error('Fail'));
      const { runner, logger } = await readyToRunStageSetup({
        instance: {
          id: 'foo',
          taskType: 'testbar2',
        },
        definitions: {
          testbar2: {
            title: 'Bar!',
            createTaskRunner: () => ({
              async run() {
                return { state: {} };
              },
              cancel: jest.fn(),
              cleanup: cleanupFn,
            }),
          },
        },
      });

      // Remove task is called after run() with the this.task object defined
      await runner.run();
      expect(cleanupFn).toHaveBeenCalledTimes(1);
      expect(logger.error).toHaveBeenCalledWith(
        `Error encountered when running onTaskRemoved() hook for testbar2 "foo": Fail`
      );
    });
  });

  interface TestOpts {
    instance?: Partial<ConcreteTaskInstance>;
    definitions?: TaskDefinitionRegistry;
    onTaskEvent?: jest.Mock<(event: TaskEvent<unknown, unknown>) => void>;
    allowReadingInvalidState?: boolean;
    strategy?: string;
    enrichFakeRequest?: jest.Mock;
  }

  function withAnyTiming(taskRun: TaskRun) {
    return {
      ...taskRun,
      timing: {
        start: expect.any(Number),
        stop: expect.any(Number),
        eventLoopBlockMs: expect.any(Number),
      },
    };
  }

  function mockInstance(instance: Partial<ConcreteTaskInstance> = {}) {
    return Object.assign(
      {
        id: 'foo',
        taskType: 'bar',
        sequenceNumber: 32,
        primaryTerm: 32,
        runAt: new Date(),
        scheduledAt: new Date(),
        startedAt: new Date(),
        retryAt: null,
        attempts: 0,
        params: {},
        scope: ['reporting'],
        state: {},
        status: 'idle',
        user: 'example',
        ownerId: null,
        traceparent: 'apmTraceparent',
      },
      instance
    );
  }

  async function testOpts(stage: TaskRunningStage, opts: TestOpts) {
    const logger = mockLogger();

    const instance = mockInstance(opts.instance);

    const store = bufferedTaskStoreMock.create();
    const usageCounter = usageCountersServiceMock.createSetupContract().createUsageCounter('test');

    store.update.mockResolvedValue(instance);
    store.partialUpdate.mockResolvedValue(instance);

    const definitions = new TaskTypeDictionary(logger);
    definitions.registerTaskDefinitions({
      testbar: {
        title: 'Bar!',
        createTaskRunner: jest.fn(),
      },
    });
    if (opts.definitions) {
      definitions.registerTaskDefinitions(opts.definitions);
    }

    const runner = new TaskManagerRunner({
      defaultMaxAttempts: 5,
      beforeRun: (context) => Promise.resolve(context),
      beforeMarkRunning: (context) => Promise.resolve(context),
      logger,
      store,
      instance,
      definitions,
      onTaskEvent: opts.onTaskEvent,
      executionContext,
      usageCounter,
      config: configMock.create({
        event_loop_delay: {
          monitor: true,
          warn_threshold: 5000,
        },
      }),
      allowReadingInvalidState: opts.allowReadingInvalidState || false,
      strategy: opts.strategy ?? CLAIM_STRATEGY_UPDATE_BY_QUERY,
      getPollInterval: () => 500,
      apiKeyStrategy: new EsApiKeyStrategy(),
      eventLogger: eventLoggerMock,
      enrichFakeRequest: opts.enrichFakeRequest,
    });

    if (stage === TaskRunningStage.READY_TO_RUN) {
      await runner.markTaskAsRunning();
      // as we're testing the ReadyToRun stage specifically, clear mocks cakked by setup
      store.update.mockClear();
      if (opts.onTaskEvent) {
        opts.onTaskEvent.mockClear();
      }
    }

    return {
      runner,
      logger,
      store,
      instance,
      usageCounter,
    };
  }
});
