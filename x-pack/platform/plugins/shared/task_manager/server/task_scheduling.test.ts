/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import sinon from 'sinon';
import moment from 'moment';

import { TaskScheduling } from './task_scheduling';
import { asOk } from './lib/result_type';
import type { ConcreteTaskInstance } from './task';
import { TaskStatus } from './task';
import { createInitialMiddleware } from './lib/middleware';
import { taskStoreMock } from './task_store.mock';
import { mockLogger } from './test_utils';
import { TaskTypeDictionary } from './task_type_dictionary';
import { taskManagerMock } from './mocks';
import { omit } from 'lodash';
import { httpServerMock } from '@kbn/core/server/mocks';
import { TaskAlreadyRunningError } from './lib/errors';
import { taskPollingLifecycleMock } from './polling_lifecycle.mock';

let fakeTimer: sinon.SinonFakeTimers;
jest.mock('uuid', () => ({
  v4: () => 'v4uuid',
}));

jest.mock('./constants', () => ({
  CONCURRENCY_ALLOW_LIST_BY_TASK_TYPE: ['foo'],
}));

jest.mock('elastic-apm-node', () => ({
  currentTraceparent: 'parent',
  currentTransaction: {
    type: 'taskManager run',
  },
}));

const getTask = (overrides = {}): ConcreteTaskInstance => ({
  id: 'my-foo-id',
  taskType: 'foo',
  params: {},
  state: {},
  schedule: { interval: '1m' },
  scheduledAt: new Date(),
  attempts: 0,
  startedAt: new Date(),
  retryAt: new Date(Date.now() + 5 * 60 * 1000),
  ownerId: '123',
  status: TaskStatus.Idle,
  runAt: new Date(),
  ...overrides,
});

describe('TaskScheduling', () => {
  beforeAll(() => {
    fakeTimer = sinon.useFakeTimers();
  });
  afterAll(() => fakeTimer.restore());

  const mockTaskStore = taskStoreMock.create({});
  const definitions = new TaskTypeDictionary(mockLogger());
  const taskPollingLifecycle = taskPollingLifecycleMock.create({});
  const taskSchedulingOpts = {
    taskStore: mockTaskStore,
    logger: mockLogger(),
    middleware: createInitialMiddleware(),
    definitions,
    taskManagerId: '123',
    taskPollingLifecycle,
  };

  definitions.registerTaskDefinitions({
    foo: {
      title: 'foo',
      maxConcurrency: 2,
      createTaskRunner: jest.fn(),
    },
  });

  beforeEach(() => {
    jest.resetAllMocks();
  });

  test('allows scheduling tasks', async () => {
    const taskScheduling = new TaskScheduling(taskSchedulingOpts);
    const task = {
      taskType: 'foo',
      params: {},
      state: {},
    };
    await taskScheduling.schedule(task);
    expect(mockTaskStore.schedule).toHaveBeenCalled();
    expect(mockTaskStore.schedule).toHaveBeenCalledWith(
      {
        ...task,
        id: undefined,
        schedule: undefined,
        traceparent: 'parent',
        enabled: true,
      },
      undefined
    );
  });

  test('should call task store with request if provided', async () => {
    const taskScheduling = new TaskScheduling(taskSchedulingOpts);
    const task = {
      taskType: 'foo',
      params: {},
      state: {},
    };

    const mockRequest = httpServerMock.createKibanaRequest();

    await taskScheduling.schedule(task, { request: mockRequest });

    expect(mockTaskStore.schedule).toHaveBeenCalled();
    expect(mockTaskStore.schedule).toHaveBeenCalledWith(
      {
        ...task,
        id: undefined,
        schedule: undefined,
        traceparent: 'parent',
        enabled: true,
      },
      {
        request: mockRequest,
      }
    );
  });

  test('allows scheduling tasks that are disabled', async () => {
    const taskScheduling = new TaskScheduling(taskSchedulingOpts);
    const task = {
      taskType: 'foo',
      enabled: false,
      params: {},
      state: {},
    };
    await taskScheduling.schedule(task);
    expect(mockTaskStore.schedule).toHaveBeenCalled();
    expect(mockTaskStore.schedule).toHaveBeenCalledWith(
      {
        ...task,
        id: undefined,
        schedule: undefined,
        traceparent: 'parent',
        enabled: false,
      },
      undefined
    );
  });

  test('allows scheduling existing tasks that may have already been scheduled', async () => {
    const taskScheduling = new TaskScheduling(taskSchedulingOpts);
    mockTaskStore.schedule.mockRejectedValueOnce({
      statusCode: 409,
    });

    const result = await taskScheduling.ensureScheduled({
      id: 'my-foo-id',
      taskType: 'foo',
      params: {},
      state: {},
    });

    expect(result.id).toEqual('my-foo-id');
  });

  test('tries to updates schedule for tasks that have already been scheduled', async () => {
    const task = getTask();
    const taskScheduling = new TaskScheduling(taskSchedulingOpts);
    const bulkUpdateScheduleSpy = jest
      .spyOn(taskScheduling, 'bulkUpdateSchedules')
      .mockResolvedValue({ tasks: [task], errors: [] });
    mockTaskStore.schedule.mockRejectedValueOnce({
      statusCode: 409,
    });

    const result = await taskScheduling.ensureScheduled(task);

    expect(bulkUpdateScheduleSpy).toHaveBeenCalledWith(
      ['my-foo-id'],
      { interval: '1m' },
      undefined
    );

    expect(result.id).toEqual('my-foo-id');
  });

  test('forwards options to bulkUpdateSchedules when updating schedule for tasks that have already been scheduled', async () => {
    const task = getTask();
    const taskScheduling = new TaskScheduling(taskSchedulingOpts);
    const bulkUpdateScheduleSpy = jest
      .spyOn(taskScheduling, 'bulkUpdateSchedules')
      .mockResolvedValue({ tasks: [task], errors: [] });
    mockTaskStore.schedule.mockRejectedValueOnce({
      statusCode: 409,
    });

    const mockRequest = httpServerMock.createKibanaRequest();
    const result = await taskScheduling.ensureScheduled(task, { request: mockRequest });

    expect(bulkUpdateScheduleSpy).toHaveBeenCalledWith(
      ['my-foo-id'],
      { interval: '1m' },
      {
        request: mockRequest,
      }
    );

    expect(result.id).toEqual('my-foo-id');
  });

  test('does not try to update schedule for tasks that have already been scheduled if no schedule is provided', async () => {
    const taskScheduling = new TaskScheduling(taskSchedulingOpts);
    const bulkUpdateScheduleSpy = jest.spyOn(taskScheduling, 'bulkUpdateSchedules');
    mockTaskStore.schedule.mockRejectedValueOnce({
      statusCode: 409,
    });

    const result = await taskScheduling.ensureScheduled({
      id: 'my-foo-id',
      taskType: 'foo',
      params: {},
      state: {},
    });

    expect(bulkUpdateScheduleSpy).not.toHaveBeenCalled();

    expect(result.id).toEqual('my-foo-id');
  });

  test('propagates error when trying to update schedule for tasks that have already been scheduled', async () => {
    const task = getTask();
    const taskScheduling = new TaskScheduling(taskSchedulingOpts);
    const bulkUpdateScheduleSpy = jest
      .spyOn(taskScheduling, 'bulkUpdateSchedules')
      .mockResolvedValue({
        tasks: [],
        errors: [
          {
            id: 'my-foo-id',
            type: 'task',
            error: {
              error: 'error',
              message: 'Failed to update schedule for reasons',
              statusCode: 500,
            },
          },
        ],
      });
    mockTaskStore.schedule.mockRejectedValueOnce({
      statusCode: 409,
    });

    await expect(taskScheduling.ensureScheduled(task)).rejects.toMatchInlineSnapshot(
      `[Error: Tried to update schedule for existing task "my-foo-id" but failed with error: Failed to update schedule for reasons]`
    );

    expect(bulkUpdateScheduleSpy).toHaveBeenCalledWith(
      ['my-foo-id'],
      { interval: '1m' },
      undefined
    );
  });

  test('handles VERSION_CONFLICT_STATUS errors when trying to update schedule for tasks that have already been scheduled', async () => {
    const task = getTask();
    const taskScheduling = new TaskScheduling(taskSchedulingOpts);
    const bulkUpdateScheduleSpy = jest
      .spyOn(taskScheduling, 'bulkUpdateSchedules')
      .mockResolvedValue({
        tasks: [],
        errors: [
          {
            id: 'my-foo-id',
            type: 'task',
            error: {
              error: 'error',
              message: 'Failed to update schedule due to version conflict',
              statusCode: 409,
            },
          },
        ],
      });
    mockTaskStore.schedule.mockRejectedValueOnce({
      statusCode: 409,
    });

    const result = await taskScheduling.ensureScheduled(task);

    expect(bulkUpdateScheduleSpy).toHaveBeenCalledWith(
      ['my-foo-id'],
      { interval: '1m' },
      undefined
    );
    expect(result.id).toEqual('my-foo-id');
  });

  test('handles NOT_FOUND_STATUS errors when trying to update schedule for tasks that have already been scheduled', async () => {
    const task = getTask();
    const taskScheduling = new TaskScheduling(taskSchedulingOpts);
    const bulkUpdateScheduleSpy = jest
      .spyOn(taskScheduling, 'bulkUpdateSchedules')
      .mockResolvedValue({
        tasks: [],
        errors: [
          {
            id: 'my-foo-id',
            type: 'task',
            error: {
              error: 'Not Found',
              message: 'Saved object [task/my-foo-id] not found',
              statusCode: 404,
            },
          },
        ],
      });
    mockTaskStore.schedule.mockRejectedValueOnce({
      statusCode: 409,
    });

    const result = await taskScheduling.ensureScheduled(task);

    expect(bulkUpdateScheduleSpy).toHaveBeenCalledWith(
      ['my-foo-id'],
      { interval: '1m' },
      undefined
    );
    expect(result.id).toEqual('my-foo-id');
  });

  test('doesnt ignore failure to scheduling existing tasks for reasons other than already being scheduled', async () => {
    const taskScheduling = new TaskScheduling(taskSchedulingOpts);
    mockTaskStore.schedule.mockRejectedValueOnce({
      statusCode: 500,
    });

    return expect(
      taskScheduling.ensureScheduled({
        id: 'my-foo-id',
        taskType: 'foo',
        params: {},
        state: {},
      })
    ).rejects.toMatchObject({
      statusCode: 500,
    });
  });

  test('doesnt allow naively rescheduling existing tasks that have already been scheduled', async () => {
    const taskScheduling = new TaskScheduling(taskSchedulingOpts);
    mockTaskStore.schedule.mockRejectedValueOnce({
      statusCode: 409,
    });

    return expect(
      taskScheduling.schedule({
        id: 'my-foo-id',
        taskType: 'foo',
        params: {},
        state: {},
      })
    ).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  describe('bulkEnable', () => {
    const id = '01ddff11-e88a-4d13-bc4e-256164e755e2';
    beforeEach(() => {
      mockTaskStore.bulkUpdate.mockImplementation(() =>
        Promise.resolve([{ tag: 'ok', value: taskManagerMock.createTask() }])
      );
    });

    test('should split search on chunks when input ids array too large', async () => {
      mockTaskStore.bulkGet.mockResolvedValue([]);
      const taskScheduling = new TaskScheduling(taskSchedulingOpts);

      await taskScheduling.bulkEnable(Array.from({ length: 1250 }), false);

      expect(mockTaskStore.bulkGet).toHaveBeenCalledTimes(13);
    });

    test('should transform response into correct format', async () => {
      const successfulTask = taskManagerMock.createTask({
        id: 'task-1',
        enabled: false,
        schedule: { interval: '1h' },
      });
      const failedToUpdateTask = taskManagerMock.createTask({
        id: 'task-2',
        enabled: false,
        schedule: { interval: '1h' },
      });
      mockTaskStore.bulkUpdate.mockImplementation(() =>
        Promise.resolve([
          { tag: 'ok', value: successfulTask },
          {
            tag: 'err',
            error: {
              type: 'task',
              id: failedToUpdateTask.id,
              error: {
                statusCode: 400,
                error: 'fail',
                message: 'fail',
              },
            },
          },
        ])
      );
      mockTaskStore.bulkGet.mockResolvedValue([asOk(successfulTask), asOk(failedToUpdateTask)]);

      const taskScheduling = new TaskScheduling(taskSchedulingOpts);
      const result = await taskScheduling.bulkEnable([successfulTask.id, failedToUpdateTask.id]);

      expect(result).toEqual({
        tasks: [successfulTask],
        errors: [
          {
            type: 'task',
            id: failedToUpdateTask.id,
            error: {
              statusCode: 400,
              error: 'fail',
              message: 'fail',
            },
          },
        ],
      });
    });

    test('should not enable task if it is already enabled', async () => {
      const task = taskManagerMock.createTask({ id, enabled: true, schedule: { interval: '3h' } });

      mockTaskStore.bulkGet.mockResolvedValue([asOk(task)]);

      const taskScheduling = new TaskScheduling(taskSchedulingOpts);
      await taskScheduling.bulkEnable([id]);

      const bulkUpdatePayload = mockTaskStore.bulkUpdate.mock.calls[0][0];

      expect(bulkUpdatePayload).toHaveLength(0);
    });

    test('should set runAt and scheduledAt if runSoon is true', async () => {
      const task = taskManagerMock.createTask({
        id,
        enabled: false,
        schedule: { interval: '3h' },
        runAt: new Date('1969-09-13T21:33:58.285Z'),
        scheduledAt: new Date('1969-09-10T21:33:58.285Z'),
      });
      mockTaskStore.bulkUpdate.mockImplementation(() =>
        Promise.resolve([{ tag: 'ok', value: task }])
      );
      mockTaskStore.bulkGet.mockResolvedValue([asOk(task)]);

      const taskScheduling = new TaskScheduling(taskSchedulingOpts);
      await taskScheduling.bulkEnable([id]);

      const bulkUpdatePayload = mockTaskStore.bulkUpdate.mock.calls[0][0];

      expect(bulkUpdatePayload).toEqual([
        {
          ...task,
          enabled: true,
          runAt: new Date('1970-01-01T00:00:00.000Z'),
          scheduledAt: new Date('1970-01-01T00:00:00.000Z'),
        },
      ]);
    });

    test('should not set runAt and scheduledAt if runSoon is false', async () => {
      const task = taskManagerMock.createTask({
        id,
        enabled: false,
        schedule: { interval: '3h' },
        runAt: new Date('1969-09-13T21:33:58.285Z'),
        scheduledAt: new Date('1969-09-10T21:33:58.285Z'),
      });
      mockTaskStore.bulkUpdate.mockImplementation(() =>
        Promise.resolve([{ tag: 'ok', value: task }])
      );
      mockTaskStore.bulkGet.mockResolvedValue([asOk(task)]);

      const taskScheduling = new TaskScheduling(taskSchedulingOpts);
      await taskScheduling.bulkEnable([id], false);

      const bulkUpdatePayload = mockTaskStore.bulkUpdate.mock.calls[0][0];

      expect(bulkUpdatePayload).toEqual([
        {
          ...task,
          enabled: true,
        },
      ]);
    });

    test('should offset runAt and scheduledAt by no more than 5m if more than one task is enabled', async () => {
      const task = taskManagerMock.createTask({
        id: 'task-1',
        enabled: false,
        schedule: { interval: '3h' },
        runAt: new Date('1969-09-13T21:33:58.285Z'),
        scheduledAt: new Date('1969-09-10T21:33:58.285Z'),
      });
      const task2 = taskManagerMock.createTask({
        id: 'task-2',
        enabled: false,
        schedule: { interval: '3h' },
        runAt: new Date('1969-09-13T21:33:58.285Z'),
        scheduledAt: new Date('1969-09-10T21:33:58.285Z'),
      });
      mockTaskStore.bulkUpdate.mockImplementation(() =>
        Promise.resolve([{ tag: 'ok', value: task }])
      );
      mockTaskStore.bulkGet.mockResolvedValue([asOk(task), asOk(task2)]);

      const taskScheduling = new TaskScheduling(taskSchedulingOpts);
      await taskScheduling.bulkEnable([task.id, task2.id]);

      const bulkUpdatePayload = mockTaskStore.bulkUpdate.mock.calls[0][0];

      expect(bulkUpdatePayload.length).toBe(2);

      // When more than one task is enabled, every task is jittered (no task runs immediately).
      for (const payload of bulkUpdatePayload) {
        const sourceTask = payload.id === task.id ? task : task2;
        expect(omit(payload, 'runAt', 'scheduledAt')).toEqual({
          ...omit(sourceTask, 'runAt', 'scheduledAt'),
          enabled: true,
        });
        const { runAt, scheduledAt } = payload;
        expect(runAt.getTime()).toEqual(scheduledAt.getTime());
        expect(runAt.getTime()).toBeGreaterThanOrEqual(1);
        expect(runAt.getTime()).toBeLessThanOrEqual(5 * 60 * 1000);
      }
    });

    test('should call store bulk update with request when provided', async () => {
      const task = taskManagerMock.createTask({
        id,
        enabled: false,
        schedule: { interval: '3h' },
      });
      mockTaskStore.bulkUpdate.mockImplementation(() =>
        Promise.resolve([{ tag: 'ok', value: task }])
      );
      const mockRequest = httpServerMock.createKibanaRequest();
      mockTaskStore.bulkGet.mockResolvedValue([asOk(task)]);

      const taskScheduling = new TaskScheduling(taskSchedulingOpts);
      await taskScheduling.bulkEnable([id], false, { request: mockRequest });

      const bulkUpdatePayload = mockTaskStore.bulkUpdate.mock.calls[0];

      expect(bulkUpdatePayload).toEqual([
        [
          {
            ...task,
            enabled: true,
          },
        ],
        {
          validate: false,
          mergeAttributes: undefined,
          options: { request: mockRequest },
        },
      ]);
    });
  });

  describe('bulkDisable', () => {
    const id = '01ddff11-e88a-4d13-bc4e-256164e755e2';
    beforeEach(() => {
      mockTaskStore.bulkUpdate.mockImplementation(() =>
        Promise.resolve([{ tag: 'ok', value: taskManagerMock.createTask() }])
      );
    });

    test('should split search on chunks when input ids array too large', async () => {
      mockTaskStore.bulkGet.mockResolvedValue([]);
      const taskScheduling = new TaskScheduling(taskSchedulingOpts);

      await taskScheduling.bulkDisable(Array.from({ length: 1250 }));

      expect(mockTaskStore.bulkGet).toHaveBeenCalledTimes(13);
    });

    test('should transform response into correct format', async () => {
      const successfulTask = taskManagerMock.createTask({
        id: 'task-1',
        enabled: false,
        schedule: { interval: '1h' },
      });
      const failedToUpdateTask = taskManagerMock.createTask({
        id: 'task-2',
        enabled: true,
        schedule: { interval: '1h' },
      });
      mockTaskStore.bulkUpdate.mockImplementation(() =>
        Promise.resolve([
          { tag: 'ok', value: successfulTask },
          {
            tag: 'err',
            error: {
              type: 'task',
              id: failedToUpdateTask.id,
              error: {
                statusCode: 400,
                error: 'fail',
                message: 'fail',
              },
            },
          },
        ])
      );
      mockTaskStore.bulkGet.mockResolvedValue([asOk(successfulTask), asOk(failedToUpdateTask)]);

      const taskScheduling = new TaskScheduling(taskSchedulingOpts);
      const result = await taskScheduling.bulkDisable([successfulTask.id, failedToUpdateTask.id]);

      expect(result).toEqual({
        tasks: [successfulTask],
        errors: [
          {
            type: 'task',
            id: failedToUpdateTask.id,
            error: {
              statusCode: 400,
              error: 'fail',
              message: 'fail',
            },
          },
        ],
      });
    });

    test('should not disable task if it is already disabled', async () => {
      const task = taskManagerMock.createTask({ id, enabled: false, schedule: { interval: '3h' } });

      mockTaskStore.bulkGet.mockResolvedValue([asOk(task)]);

      const taskScheduling = new TaskScheduling(taskSchedulingOpts);
      await taskScheduling.bulkDisable([id]);

      const bulkUpdatePayload = mockTaskStore.bulkUpdate.mock.calls[0][0];

      expect(bulkUpdatePayload).toHaveLength(0);
    });

    test('should call store bulk update with request when provided', async () => {
      const task = taskManagerMock.createTask({
        id,
        enabled: true,
        schedule: { interval: '3h' },
      });
      mockTaskStore.bulkUpdate.mockImplementation(() =>
        Promise.resolve([{ tag: 'ok', value: task }])
      );
      const mockRequest = httpServerMock.createKibanaRequest();
      mockTaskStore.bulkGet.mockResolvedValue([asOk(task)]);

      const taskScheduling = new TaskScheduling(taskSchedulingOpts);
      await taskScheduling.bulkDisable([id], false, { request: mockRequest });

      const bulkUpdatePayload = mockTaskStore.bulkUpdate.mock.calls[0];

      expect(bulkUpdatePayload).toEqual([
        [
          {
            ...task,
            enabled: false,
          },
        ],
        {
          validate: false,
          mergeAttributes: undefined,
          options: { request: mockRequest },
        },
      ]);
    });
  });

  describe('bulkUpdateState', () => {
    const id = '01ddff11-e88a-4d13-bc4e-256164e755e2';
    beforeEach(() => {
      mockTaskStore.bulkUpdate.mockImplementation(() =>
        Promise.resolve([{ tag: 'ok', value: taskManagerMock.createTask() }])
      );
    });

    test('should split search on chunks when input ids array too large', async () => {
      mockTaskStore.bulkGet.mockResolvedValue([]);
      const taskScheduling = new TaskScheduling(taskSchedulingOpts);

      await taskScheduling.bulkUpdateState(Array.from({ length: 1250 }), jest.fn());

      expect(mockTaskStore.bulkGet).toHaveBeenCalledTimes(13);
    });

    test('should transform response into correct format', async () => {
      const successfulTask = taskManagerMock.createTask({
        id: 'task-1',
        enabled: false,
        schedule: { interval: '1h' },
        state: {
          'hello i am a state that has been modified': "not really but we're going to pretend",
        },
      });
      const failedToUpdateTask = taskManagerMock.createTask({
        id: 'task-2',
        enabled: true,
        schedule: { interval: '1h' },
        state: { 'this state is unchangeable': 'none shall update me' },
      });
      mockTaskStore.bulkUpdate.mockImplementation(() =>
        Promise.resolve([
          { tag: 'ok', value: successfulTask },
          {
            tag: 'err',
            error: {
              type: 'task',
              id: failedToUpdateTask.id,
              error: {
                statusCode: 400,
                error: 'fail',
                message: 'fail',
              },
            },
          },
        ])
      );
      mockTaskStore.bulkGet.mockResolvedValue([asOk(successfulTask), asOk(failedToUpdateTask)]);

      const taskScheduling = new TaskScheduling(taskSchedulingOpts);
      const result = await taskScheduling.bulkUpdateState(
        [successfulTask.id, failedToUpdateTask.id],
        jest.fn()
      );

      expect(result).toEqual({
        tasks: [successfulTask],
        errors: [
          {
            type: 'task',
            id: failedToUpdateTask.id,
            error: {
              statusCode: 400,
              error: 'fail',
              message: 'fail',
            },
          },
        ],
      });
    });

    test('should execute updater function on tasks', async () => {
      const task = taskManagerMock.createTask({
        id,
        enabled: false,
        schedule: { interval: '3h' },
        runAt: new Date('1969-09-13T21:33:58.285Z'),
        scheduledAt: new Date('1969-09-10T21:33:58.285Z'),
        state: { removeMe: 'please remove me i dont like being in this task manager state' },
      });
      const updaterFn = jest.fn((state) => {
        return {
          ...omit(state, 'removeMe'),
          expectedValue: 'HELLO I AM AN EXPECTED VALUE IT IS VERY NICE TO MEET YOU',
        };
      });
      mockTaskStore.bulkUpdate.mockImplementation(() =>
        Promise.resolve([{ tag: 'ok', value: task }])
      );
      mockTaskStore.bulkGet.mockResolvedValue([asOk(task)]);

      const taskScheduling = new TaskScheduling(taskSchedulingOpts);
      await taskScheduling.bulkUpdateState([id], updaterFn);

      const bulkUpdatePayload = mockTaskStore.bulkUpdate.mock.calls[0][0];

      expect(bulkUpdatePayload).toMatchInlineSnapshot(`
        Array [
          Object {
            "attempts": 0,
            "enabled": false,
            "id": "01ddff11-e88a-4d13-bc4e-256164e755e2",
            "ownerId": "123",
            "params": Object {
              "hello": "world",
            },
            "retryAt": null,
            "runAt": 1969-09-13T21:33:58.285Z,
            "schedule": Object {
              "interval": "3h",
            },
            "scheduledAt": 1969-09-10T21:33:58.285Z,
            "scope": undefined,
            "startedAt": null,
            "state": Object {
              "expectedValue": "HELLO I AM AN EXPECTED VALUE IT IS VERY NICE TO MEET YOU",
            },
            "status": "idle",
            "taskType": "foo",
            "user": undefined,
            "version": "123",
          },
        ]
      `);
    });
  });

  describe('bulkUpdateSchedules', () => {
    const id = '01ddff11-e88a-4d13-bc4e-256164e755e2';
    const rruleScheduleExample24h = {
      rrule: {
        freq: 3, // Daily
        interval: 1,
        tzid: 'UTC',
      },
    };

    beforeEach(() => {
      mockTaskStore.bulkUpdate.mockImplementation(() =>
        Promise.resolve([{ tag: 'ok', value: taskManagerMock.createTask() }])
      );
    });

    test('should split search on chunks when input ids array too large', async () => {
      mockTaskStore.bulkGet.mockResolvedValue([]);
      const taskScheduling = new TaskScheduling(taskSchedulingOpts);

      await taskScheduling.bulkUpdateSchedules(Array.from({ length: 1250 }), { interval: '1h' });

      expect(mockTaskStore.bulkGet).toHaveBeenCalledTimes(13);
    });

    test('should transform response into correct format', async () => {
      const successfulTask = taskManagerMock.createTask({
        id: 'task-1',
        schedule: { interval: '1h' },
      });
      const failedToUpdateTask = taskManagerMock.createTask({
        id: 'task-2',
        schedule: { interval: '1h' },
      });
      mockTaskStore.bulkUpdate.mockImplementation(() =>
        Promise.resolve([
          { tag: 'ok', value: successfulTask },
          {
            tag: 'err',
            error: {
              type: 'task',
              id: failedToUpdateTask.id,
              error: {
                statusCode: 400,
                error: 'fail',
                message: 'fail',
              },
            },
          },
        ])
      );
      mockTaskStore.bulkGet.mockResolvedValue([asOk(successfulTask), asOk(failedToUpdateTask)]);

      const taskScheduling = new TaskScheduling(taskSchedulingOpts);
      const result = await taskScheduling.bulkUpdateSchedules(
        [successfulTask.id, failedToUpdateTask.id],
        { interval: '1h' }
      );

      expect(result).toEqual({
        tasks: [successfulTask],
        errors: [
          {
            type: 'task',
            id: failedToUpdateTask.id,
            error: {
              statusCode: 400,
              error: 'fail',
              message: 'fail',
            },
          },
        ],
      });
    });

    test('should not update task if new schedule is equal to previous using interval', async () => {
      const task = taskManagerMock.createTask({ id, schedule: { interval: '3h' } });

      mockTaskStore.bulkGet.mockResolvedValue([asOk(task)]);

      const taskScheduling = new TaskScheduling(taskSchedulingOpts);
      await taskScheduling.bulkUpdateSchedules([id], { interval: '3h' });

      const bulkUpdatePayload = mockTaskStore.bulkUpdate.mock.calls[0][0];

      expect(bulkUpdatePayload).toHaveLength(0);
    });

    test('should update task if new schedule is equal to previous and regenerateApiKey is requested', async () => {
      const task = taskManagerMock.createTask({ id, schedule: { interval: '3h' } });
      const mockRequest = httpServerMock.createKibanaRequest();

      mockTaskStore.bulkGet.mockResolvedValue([asOk(task)]);

      const taskScheduling = new TaskScheduling(taskSchedulingOpts);
      await taskScheduling.bulkUpdateSchedules(
        [id],
        { interval: '3h' },
        {
          request: mockRequest,
          regenerateApiKey: true,
        }
      );

      const bulkUpdatePayload = mockTaskStore.bulkUpdate.mock.calls[0];

      expect(bulkUpdatePayload).toEqual([
        [task],
        {
          validate: false,
          mergeAttributes: false,
          options: { request: mockRequest, regenerateApiKey: true },
        },
      ]);
    });

    test('should not update running task if regenerateApiKey is requested', async () => {
      const task = taskManagerMock.createTask({
        id,
        schedule: { interval: '3h' },
        status: TaskStatus.Running,
      });
      const mockRequest = httpServerMock.createKibanaRequest();

      mockTaskStore.bulkGet.mockResolvedValue([asOk(task)]);

      const taskScheduling = new TaskScheduling(taskSchedulingOpts);
      await taskScheduling.bulkUpdateSchedules(
        [id],
        { interval: '3h' },
        {
          request: mockRequest,
          regenerateApiKey: true,
        }
      );

      const bulkUpdatePayload = mockTaskStore.bulkUpdate.mock.calls[0][0];

      expect(bulkUpdatePayload).toHaveLength(0);
    });

    test('should not update running task if regenerateApiKey is not requested', async () => {
      const task = taskManagerMock.createTask({
        id,
        schedule: { interval: '3h' },
        status: TaskStatus.Running,
      });

      mockTaskStore.bulkGet.mockResolvedValue([asOk(task)]);

      const taskScheduling = new TaskScheduling(taskSchedulingOpts);
      await taskScheduling.bulkUpdateSchedules([id], { interval: '5h' });

      const bulkUpdatePayload = mockTaskStore.bulkUpdate.mock.calls[0][0];

      expect(bulkUpdatePayload).toHaveLength(0);
    });

    test('should not update task if new schedule is equal to previous using rrule', async () => {
      const task = taskManagerMock.createTask({
        id,
        schedule: rruleScheduleExample24h,
      });

      mockTaskStore.bulkGet.mockResolvedValue([asOk(task)]);

      const taskScheduling = new TaskScheduling(taskSchedulingOpts);
      await taskScheduling.bulkUpdateSchedules([id], rruleScheduleExample24h);

      const bulkUpdatePayload = mockTaskStore.bulkUpdate.mock.calls[0][0];

      expect(bulkUpdatePayload).toHaveLength(0);
    });

    test('should postpone task run if new interval is greater than previous', async () => {
      // task set to be run in 3hrs from now
      const runInThreeHrs = new Date(Date.now() + moment.duration(3, 'hours').asMilliseconds());
      const task = taskManagerMock.createTask({
        id,
        schedule: { interval: '3h' },
        runAt: runInThreeHrs,
      });

      mockTaskStore.bulkGet.mockResolvedValue([asOk(task)]);

      const taskScheduling = new TaskScheduling(taskSchedulingOpts);
      await taskScheduling.bulkUpdateSchedules([id], { interval: '5h' });

      const bulkUpdatePayload = mockTaskStore.bulkUpdate.mock.calls[0][0];

      expect(bulkUpdatePayload).toHaveLength(1);
      expect(bulkUpdatePayload[0]).toHaveProperty('schedule', { interval: '5h' });
      // if tasks updated with schedule interval of '5h' and previous interval was 3h, task will be scheduled to run in 2 hours later
      expect(bulkUpdatePayload[0].runAt.getTime() - runInThreeHrs.getTime()).toBe(
        moment.duration(2, 'hours').asMilliseconds()
      );
    });

    test('should postpone task run if new rrule is greater than previous interval', async () => {
      const task = taskManagerMock.createTask({
        id,
        schedule: { interval: '3h' },
      });

      mockTaskStore.bulkGet.mockResolvedValue([asOk(task)]);

      const taskScheduling = new TaskScheduling(taskSchedulingOpts);
      await taskScheduling.bulkUpdateSchedules([id], rruleScheduleExample24h);

      const bulkUpdatePayload = mockTaskStore.bulkUpdate.mock.calls[0][0];

      expect(bulkUpdatePayload).toHaveLength(1);
      expect(bulkUpdatePayload[0]).toHaveProperty('schedule', rruleScheduleExample24h);
      expect(bulkUpdatePayload[0].runAt.getTime()).toBe(
        moment.duration(24, 'hours').asMilliseconds()
      );
    });

    test('should postpone task run if new interval is greater than previous rrule', async () => {
      const task = taskManagerMock.createTask({
        id,
        schedule: rruleScheduleExample24h,
      });

      mockTaskStore.bulkGet.mockResolvedValue([asOk(task)]);

      const taskScheduling = new TaskScheduling(taskSchedulingOpts);
      await taskScheduling.bulkUpdateSchedules([id], { interval: '25h' });

      const bulkUpdatePayload = mockTaskStore.bulkUpdate.mock.calls[0][0];

      expect(bulkUpdatePayload).toHaveLength(1);
      expect(bulkUpdatePayload[0]).toHaveProperty('schedule', { interval: '25h' });

      // last run(moment) + 25h
      expect(bulkUpdatePayload[0].runAt.getTime()).toBe(
        moment.duration(25, 'hours').asMilliseconds()
      );
    });

    test('should set task run sooner if new interval is lesser than previous', async () => {
      // task set to be run in one 2hrs from now
      const runInThreeHrs = new Date(Date.now() + moment.duration(3, 'hours').asMilliseconds());
      const task = taskManagerMock.createTask({
        id,
        schedule: { interval: '3h' },
        runAt: runInThreeHrs,
      });

      mockTaskStore.bulkGet.mockResolvedValue([asOk(task)]);

      const taskScheduling = new TaskScheduling(taskSchedulingOpts);
      await taskScheduling.bulkUpdateSchedules([id], { interval: '2h' });

      const bulkUpdatePayload = mockTaskStore.bulkUpdate.mock.calls[0][0];
      expect(bulkUpdatePayload[0]).toHaveProperty('schedule', { interval: '2h' });
      // if tasks updated with schedule interval of '2h' and previous interval was 3h, task will be scheduled to run in 1 hour sooner
      expect(runInThreeHrs.getTime() - bulkUpdatePayload[0].runAt.getTime()).toBe(
        moment.duration(1, 'hour').asMilliseconds()
      );
    });

    test('should set task run sooner if new rrule is lesser than previous interval', async () => {
      const task = taskManagerMock.createTask({
        id,
        schedule: { interval: '2d' },
      });

      mockTaskStore.bulkGet.mockResolvedValue([asOk(task)]);

      const taskScheduling = new TaskScheduling(taskSchedulingOpts);
      await taskScheduling.bulkUpdateSchedules([id], rruleScheduleExample24h);

      const bulkUpdatePayload = mockTaskStore.bulkUpdate.mock.calls[0][0];
      expect(bulkUpdatePayload[0]).toHaveProperty('schedule', rruleScheduleExample24h);
      expect(bulkUpdatePayload[0].runAt.getTime()).toBe(
        moment.duration(24, 'hour').asMilliseconds()
      );
    });

    test('should set task run sooner if new interval is lesser than previous rrule', async () => {
      const task = taskManagerMock.createTask({
        id,
        schedule: rruleScheduleExample24h,
      });

      mockTaskStore.bulkGet.mockResolvedValue([asOk(task)]);

      const taskScheduling = new TaskScheduling(taskSchedulingOpts);
      await taskScheduling.bulkUpdateSchedules([id], { interval: '12h' });

      const bulkUpdatePayload = mockTaskStore.bulkUpdate.mock.calls[0][0];
      expect(bulkUpdatePayload[0]).toHaveProperty('schedule', { interval: '12h' });
      expect(bulkUpdatePayload[0].runAt.getTime()).toBe(
        moment.duration(12, 'hour').asMilliseconds()
      );
    });

    test('should set task run to now if time that passed from last run is greater than new interval', async () => {
      // task scheduled now - 1h. With interval of '2h' the next run is in one hour(hwich is <30m).
      const minusOneHour = new Date(Date.now() - moment.duration(1, 'hour').asMilliseconds());
      const task = taskManagerMock.createTask({
        id,
        schedule: { interval: '2h' },
        scheduledAt: minusOneHour,
      });

      mockTaskStore.bulkGet.mockResolvedValue([asOk(task)]);

      const taskScheduling = new TaskScheduling(taskSchedulingOpts);
      await taskScheduling.bulkUpdateSchedules([id], { interval: '30m' });

      const bulkUpdatePayload = mockTaskStore.bulkUpdate.mock.calls[0][0];
      expect(bulkUpdatePayload[0]).toHaveProperty('schedule', { interval: '30m' });

      // if time that passed from last task run is greater than new interval, task should be set to run at now time
      expect(bulkUpdatePayload[0].runAt.getTime()).toBeLessThanOrEqual(Date.now());
    });

    test('should set task run to now if time that passed from last run is greater than new rrule', async () => {
      // last run yesterday. With interval of '3d', runAt is in 2 days.
      const yesterday = new Date(Date.now() - moment.duration(1, 'days').asMilliseconds());
      const task = taskManagerMock.createTask({
        id,
        schedule: { interval: '3d' },
        scheduledAt: yesterday,
      });

      mockTaskStore.bulkGet.mockResolvedValue([asOk(task)]);

      const taskScheduling = new TaskScheduling(taskSchedulingOpts);
      await taskScheduling.bulkUpdateSchedules([id], rruleScheduleExample24h);

      const bulkUpdatePayload = mockTaskStore.bulkUpdate.mock.calls[0][0];
      expect(bulkUpdatePayload[0]).toHaveProperty('schedule', rruleScheduleExample24h);

      // if time that passed from last task run is greater than new interval, task should be set to run at now time
      expect(bulkUpdatePayload[0].runAt.getTime()).toBeLessThanOrEqual(
        moment.duration(1, 'days').asMilliseconds()
      );
    });

    test('should call store bulk update with request when provided', async () => {
      const taskScheduling = new TaskScheduling(taskSchedulingOpts);
      const task = taskManagerMock.createTask({
        id,
        schedule: rruleScheduleExample24h,
      });

      const mockRequest = httpServerMock.createKibanaRequest();
      mockTaskStore.bulkGet.mockResolvedValue([asOk(task)]);

      await taskScheduling.bulkUpdateSchedules(
        [id],
        { interval: '12h' },
        {
          request: mockRequest,
        }
      );

      const bulkUpdatePayload = mockTaskStore.bulkUpdate.mock.calls[0];

      expect(bulkUpdatePayload).toEqual([
        [
          {
            ...task,
            runAt: expect.any(Date),
            schedule: { interval: '12h' },
          },
        ],
        {
          validate: false,
          mergeAttributes: false,
          options: { request: mockRequest },
        },
      ]);
    });
  });

  describe('runSoon', () => {
    test('resolves when the task update succeeds', async () => {
      const id = '01ddff11-e88a-4d13-bc4e-256164e755e2';
      const taskScheduling = new TaskScheduling(taskSchedulingOpts);

      mockTaskStore.get.mockResolvedValueOnce(
        taskManagerMock.createTask({ id, status: TaskStatus.Idle })
      );
      mockTaskStore.update.mockResolvedValueOnce(taskManagerMock.createTask({ id }));

      const result = await taskScheduling.runSoon(id);

      expect(mockTaskStore.update).toHaveBeenCalledWith(
        taskManagerMock.createTask({
          id,
          status: TaskStatus.Idle,
          runAt: expect.any(Date),
          scheduledAt: expect.any(Date),
        }),
        { validate: false }
      );
      expect(mockTaskStore.get).toHaveBeenCalledWith(id);
      expect(result).toEqual({ id, forced: false });
    });

    test('runs failed tasks too', async () => {
      const id = '01ddff11-e88a-4d13-bc4e-256164e755e2';
      const taskScheduling = new TaskScheduling(taskSchedulingOpts);

      mockTaskStore.get.mockResolvedValueOnce(
        taskManagerMock.createTask({ id, status: TaskStatus.Failed })
      );
      mockTaskStore.update.mockResolvedValueOnce(taskManagerMock.createTask({ id }));

      const result = await taskScheduling.runSoon(id);
      expect(mockTaskStore.update).toHaveBeenCalledWith(
        taskManagerMock.createTask({
          id,
          status: TaskStatus.Idle,
          runAt: expect.any(Date),
          scheduledAt: expect.any(Date),
        }),
        { validate: false }
      );
      expect(mockTaskStore.get).toHaveBeenCalledWith(id);
      expect(result).toEqual({ id, forced: false });
    });

    test('rejects when the task update fails', async () => {
      const id = '01ddff11-e88a-4d13-bc4e-256164e755e2';
      const taskScheduling = new TaskScheduling(taskSchedulingOpts);

      mockTaskStore.get.mockResolvedValueOnce(
        taskManagerMock.createTask({ id, status: TaskStatus.Idle })
      );
      mockTaskStore.update.mockRejectedValueOnce(500);

      const result = taskScheduling.runSoon(id);
      await expect(result).rejects.toEqual(500);
      expect(taskSchedulingOpts.logger.error).toHaveBeenCalledWith(
        'Failed to update the task (01ddff11-e88a-4d13-bc4e-256164e755e2) for runSoon'
      );
    });

    test('reports 409 conflict errors via the conflict flag without throwing', async () => {
      const id = '01ddff11-e88a-4d13-bc4e-256164e755e2';
      const taskScheduling = new TaskScheduling(taskSchedulingOpts);

      mockTaskStore.get.mockResolvedValueOnce(
        taskManagerMock.createTask({ id, status: TaskStatus.Idle })
      );
      mockTaskStore.update.mockRejectedValueOnce({ statusCode: 409 });

      const result = await taskScheduling.runSoon(id);
      expect(result).toEqual({ id, forced: false, conflict: true });
      expect(taskSchedulingOpts.logger.debug).toHaveBeenCalledWith(
        'Failed to update the task (01ddff11-e88a-4d13-bc4e-256164e755e2) for runSoon due to conflict (409)'
      );
    });

    test('rejects when the task is being claimed', async () => {
      const id = '01ddff11-e88a-4d13-bc4e-256164e755e2';
      const taskScheduling = new TaskScheduling(taskSchedulingOpts);

      mockTaskStore.get.mockResolvedValueOnce(
        taskManagerMock.createTask({ id, status: TaskStatus.Claiming })
      );
      mockTaskStore.update.mockRejectedValueOnce(409);

      try {
        await taskScheduling.runSoon(id);
      } catch (error) {
        expect(error).toBeInstanceOf(TaskAlreadyRunningError);
        expect(error.message).toBe(
          'Failed to run task "01ddff11-e88a-4d13-bc4e-256164e755e2" as it is currently running'
        );
      }
    });

    test('rejects with TaskAlreadyRunningError when the task status is "running" and force=false', async () => {
      const id = '01ddff11-e88a-4d13-bc4e-256164e755e2';
      const taskScheduling = new TaskScheduling(taskSchedulingOpts);

      mockTaskStore.get.mockResolvedValueOnce(
        taskManagerMock.createTask({ id, status: TaskStatus.Running })
      );
      mockTaskStore.update.mockRejectedValueOnce(409);

      try {
        await taskScheduling.runSoon(id);
      } catch (error) {
        expect(error).toBeInstanceOf(TaskAlreadyRunningError);
        expect(error.message).toBe(
          'Failed to run task "01ddff11-e88a-4d13-bc4e-256164e755e2" as it is currently running'
        );
      }
    });

    test('rejects with TaskAlreadyRunningError when the task status is "running" and force=true but the task is current in task pool', async () => {
      const id = '01ddff11-e88a-4d13-bc4e-256164e755e2';
      const taskScheduling = new TaskScheduling(taskSchedulingOpts);

      mockTaskStore.get.mockResolvedValueOnce(
        taskManagerMock.createTask({ id, status: TaskStatus.Running })
      );
      mockTaskStore.update.mockRejectedValueOnce(409);
      taskPollingLifecycle.getCurrentTasksInPool.mockReturnValueOnce([id]);

      try {
        await taskScheduling.runSoon(id, true);
      } catch (error) {
        expect(error).toBeInstanceOf(TaskAlreadyRunningError);
        expect(error.message).toBe(
          'Failed to run task "01ddff11-e88a-4d13-bc4e-256164e755e2" as it is currently running and cannot be forced'
        );
      }
    });

    test('updates task when the task status is "running" and force is true and task is not in task pool', async () => {
      const id = '01ddff11-e88a-4d13-bc4e-256164e755e2';
      const taskScheduling = new TaskScheduling(taskSchedulingOpts);

      mockTaskStore.get.mockResolvedValueOnce(
        taskManagerMock.createTask({ id, status: TaskStatus.Running })
      );
      mockTaskStore.update.mockResolvedValueOnce(taskManagerMock.createTask({ id }));
      taskPollingLifecycle.getCurrentTasksInPool.mockReturnValueOnce(['123']);

      const result = await taskScheduling.runSoon(id, true);

      expect(mockTaskStore.update).toHaveBeenCalledWith(
        taskManagerMock.createTask({
          id,
          status: TaskStatus.Idle,
          runAt: expect.any(Date),
          scheduledAt: expect.any(Date),
        }),
        { validate: false }
      );
      expect(mockTaskStore.get).toHaveBeenCalledWith(id);
      expect(result).toEqual({ id, forced: true });
    });

    test('rejects when the task status is Unrecognized', async () => {
      const id = '01ddff11-e88a-4d13-bc4e-256164e755e2';
      const taskScheduling = new TaskScheduling(taskSchedulingOpts);

      mockTaskStore.get.mockResolvedValueOnce(
        taskManagerMock.createTask({ id, status: TaskStatus.Unrecognized })
      );
      mockTaskStore.update.mockRejectedValueOnce(409);

      const result = taskScheduling.runSoon(id);
      await expect(result).rejects.toEqual(
        Error('Failed to run task "01ddff11-e88a-4d13-bc4e-256164e755e2" with status unrecognized')
      );
    });

    test('rejects when the task does not exist', async () => {
      const id = '01ddff11-e88a-4d13-bc4e-256164e755e2';
      const taskScheduling = new TaskScheduling(taskSchedulingOpts);

      mockTaskStore.get.mockRejectedValueOnce(404);

      const result = taskScheduling.runSoon(id);
      await expect(result).rejects.toEqual(404);
    });
  });

  describe('bulkSchedule', () => {
    test('allows scheduling tasks', async () => {
      const taskScheduling = new TaskScheduling(taskSchedulingOpts);
      const task = {
        taskType: 'foo',
        params: {},
        state: {},
      };
      await taskScheduling.bulkSchedule([task]);
      expect(mockTaskStore.bulkSchedule).toHaveBeenCalled();
      expect(mockTaskStore.bulkSchedule).toHaveBeenCalledWith(
        [
          {
            ...task,
            id: undefined,
            schedule: undefined,
            traceparent: 'parent',
            enabled: true,
            runAt: new Date(),
            scheduledAt: new Date(),
          },
        ],
        undefined
      );
    });

    test('allows scheduling tasks that are disabled', async () => {
      const taskScheduling = new TaskScheduling(taskSchedulingOpts);
      const task1 = {
        taskType: 'foo',
        params: {},
        state: {},
      };
      const task2 = {
        taskType: 'foo',
        params: {},
        state: {},
        enabled: false,
      };
      await taskScheduling.bulkSchedule([task1, task2]);
      expect(mockTaskStore.bulkSchedule).toHaveBeenCalled();
      expect(mockTaskStore.bulkSchedule).toHaveBeenCalledWith(
        [
          {
            ...task1,
            id: undefined,
            schedule: undefined,
            traceparent: 'parent',
            enabled: true,
            runAt: new Date(),
            scheduledAt: new Date(),
          },
          {
            ...task2,
            id: undefined,
            schedule: undefined,
            traceparent: 'parent',
            enabled: false,
          },
        ],
        undefined
      );
    });

    test('runs a single recurring task immediately', async () => {
      const taskScheduling = new TaskScheduling(taskSchedulingOpts);
      const task = {
        taskType: 'foo',
        params: {},
        state: {},
        schedule: { interval: '1m' },
      };
      await taskScheduling.bulkSchedule([task]);

      const bulkSchedulePayload = mockTaskStore.bulkSchedule.mock.calls[0][0];

      expect(bulkSchedulePayload).toEqual([
        {
          ...task,
          id: undefined,
          traceparent: 'parent',
          enabled: true,
          runAt: new Date(),
          scheduledAt: new Date(),
        },
      ]);
    });

    test('jitters every recurring task within min(interval, 5m) when more than one task is scheduled', async () => {
      const taskScheduling = new TaskScheduling(taskSchedulingOpts);
      const task0 = {
        taskType: 'foo',
        params: {},
        state: {},
        schedule: { interval: '1m' },
      };
      const task1 = {
        taskType: 'foo',
        params: {},
        state: {},
        schedule: { interval: '1m' },
      };
      const task2 = {
        taskType: 'foo',
        params: {},
        state: {},
        schedule: { interval: '1h' },
      };
      await taskScheduling.bulkSchedule([task0, task1, task2]);

      const bulkSchedulePayload = mockTaskStore.bulkSchedule.mock.calls[0][0];

      expect(bulkSchedulePayload.length).toBe(3);

      const inputs = [task0, task1, task2];
      const expectedUpperBounds = [60 * 1000, 60 * 1000, 5 * 60 * 1000];

      bulkSchedulePayload.forEach((payload, idx) => {
        expect(omit(payload, 'runAt', 'scheduledAt')).toEqual({
          ...inputs[idx],
          id: undefined,
          traceparent: 'parent',
          enabled: true,
        });
        const runAt = payload.runAt!.getTime();
        expect(payload.scheduledAt!.getTime()).toBe(runAt);
        expect(runAt).toBeGreaterThanOrEqual(1);
        expect(runAt).toBeLessThanOrEqual(expectedUpperBounds[idx]);
      });
    });

    test('runs ad-hoc tasks immediately without jitter even when scheduled alongside other tasks', async () => {
      const taskScheduling = new TaskScheduling(taskSchedulingOpts);
      const recurringTask = {
        taskType: 'foo',
        params: {},
        state: {},
        schedule: { interval: '1m' },
      };
      const adHocTask = {
        taskType: 'foo',
        params: {},
        state: {},
      };
      await taskScheduling.bulkSchedule([recurringTask, adHocTask]);

      const bulkSchedulePayload = mockTaskStore.bulkSchedule.mock.calls[0][0];

      expect(bulkSchedulePayload.length).toBe(2);

      // Recurring task is now jittered since there is more than one task.
      expect(omit(bulkSchedulePayload[0], 'runAt', 'scheduledAt')).toEqual({
        ...recurringTask,
        id: undefined,
        traceparent: 'parent',
        enabled: true,
      });
      const recurringRunAt = bulkSchedulePayload[0].runAt!.getTime();
      expect(bulkSchedulePayload[0].scheduledAt!.getTime()).toBe(recurringRunAt);
      expect(recurringRunAt).toBeGreaterThanOrEqual(1);
      expect(recurringRunAt).toBeLessThanOrEqual(60 * 1000);

      // Ad-hoc task still runs immediately because addJitter returns "now" when there is no interval.
      expect(bulkSchedulePayload[1]).toEqual({
        ...adHocTask,
        id: undefined,
        schedule: undefined,
        traceparent: 'parent',
        enabled: true,
        runAt: new Date(),
        scheduledAt: new Date(),
      });
    });

    test('does not jitter disabled tasks even if they have an interval schedule', async () => {
      const taskScheduling = new TaskScheduling(taskSchedulingOpts);
      const task = {
        taskType: 'foo',
        params: {},
        state: {},
        schedule: { interval: '1h' },
        enabled: false,
      };
      await taskScheduling.bulkSchedule([task]);

      const bulkSchedulePayload = mockTaskStore.bulkSchedule.mock.calls[0][0];

      expect(bulkSchedulePayload).toEqual([
        {
          ...task,
          id: undefined,
          traceparent: 'parent',
          enabled: false,
        },
      ]);
    });

    test('doesnt allow naively rescheduling existing tasks that have already been scheduled', async () => {
      const taskScheduling = new TaskScheduling(taskSchedulingOpts);
      mockTaskStore.bulkSchedule.mockRejectedValueOnce({
        statusCode: 409,
      });

      return expect(
        taskScheduling.bulkSchedule([
          {
            id: 'my-foo-id',
            taskType: 'foo',
            params: {},
            state: {},
          },
        ])
      ).rejects.toMatchObject({
        statusCode: 409,
      });
    });
  });
});
