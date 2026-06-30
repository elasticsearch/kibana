/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { v4 as uuidv4 } from 'uuid';
import { lazyObject } from '@kbn/lazy-object';
import type { TaskManagerSetupContract, TaskManagerStartContract } from './plugin';
import type { ConcreteTaskInstance, RunContext } from './task';
import { TaskStatus } from './task';

const createSetupMock = () => {
  const mock: jest.Mocked<TaskManagerSetupContract> = lazyObject({
    index: '.kibana_task_manager',
    addMiddleware: jest.fn(),
    registerTaskDefinitions: jest.fn(),
    registerCanEncryptedSavedObjects: jest.fn(),
    registerTaskEventLogger: jest.fn(),
  });

  return mock;
};

const createStartMock = () => {
  const mock: jest.Mocked<TaskManagerStartContract> = lazyObject({
    fetch: jest.fn(),
    get: jest.fn(),
    bulkGet: jest.fn(),
    aggregate: jest.fn(),
    remove: jest.fn(),
    bulkRemove: jest.fn(),
    schedule: jest.fn(),
    runSoon: jest.fn(),
    ensureScheduled: jest.fn().mockResolvedValue(Promise.resolve()), // it's a promise and there are some places where it's followed by `.catch()`
    removeIfExists: jest.fn().mockResolvedValue(Promise.resolve()), // it's a promise and there are some places where it's followed by `.catch()`
    bulkUpdateSchedules: jest.fn(),
    bulkSchedule: jest.fn(),
    bulkDisable: jest.fn(),
    bulkEnable: jest.fn(),
    getRegisteredTypes: jest.fn(),
    bulkUpdateState: jest.fn(),
    registerEncryptedSavedObjectsClient: jest.fn(),
    registerApiKeyInvalidateFn: jest.fn(),
    registerUiamApiKeyInvalidateFn: jest.fn(),
  });

  return mock;
};

const createTaskMock = (overrides: Partial<ConcreteTaskInstance> = {}): ConcreteTaskInstance => {
  return {
    id: `task_${uuidv4()}`,
    attempts: 0,
    schedule: undefined,
    params: { hello: 'world' },
    retryAt: null,
    runAt: new Date(),
    scheduledAt: new Date(),
    scope: undefined,
    startedAt: null,
    state: { foo: 'bar' },
    status: TaskStatus.Idle,
    taskType: 'foo',
    user: undefined,
    version: '123',
    ownerId: '123',
    ...overrides,
  };
};

/**
 * Builds a complete {@link RunContext} for use in tests.
 *
 * Centralising construction here means future additions or type changes to
 * RunContext (e.g. narrowing `abortController` to `AbortSignal`) only require
 * updating this one helper rather than every individual test file.
 */
const createRunContextMock = (overrides: Partial<RunContext> = {}): RunContext => ({
  taskInstance: createTaskMock(),
  abortController: new AbortController(),
  executionUuid: 'test-execution-uuid',
  ...overrides,
});

export const taskManagerMock = {
  createSetup: createSetupMock,
  createStart: createStartMock,
  createTask: createTaskMock,
  createRunContext: createRunContextMock,
};
