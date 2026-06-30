/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import sinon from 'sinon';
import { ActionExecutor } from './action_executor';
import type { ConcreteTaskInstance } from '@kbn/task-manager-plugin/server';
import { TaskErrorSource, TaskStatus } from '@kbn/task-manager-plugin/server';
import { taskManagerMock } from '@kbn/task-manager-plugin/server/mocks';
import { TaskRunnerFactory } from './task_runner_factory';
import { actionTypeRegistryMock } from '../action_type_registry.mock';
import { actionExecutorMock } from './action_executor.mock';
import { encryptedSavedObjectsMock } from '@kbn/encrypted-saved-objects-plugin/server/mocks';
import {
  savedObjectsClientMock,
  loggingSystemMock,
  savedObjectsRepositoryMock,
  analyticsServiceMock,
  securityServiceMock,
} from '@kbn/core/server/mocks';
import { eventLoggerMock } from '@kbn/event-log-plugin/server/mocks';
import { ActionTypeDisabledError } from './errors';
import { actionsAuthorizationMock } from '../mocks';
import { inMemoryMetricsMock } from '../monitoring/in_memory_metrics.mock';
import { IN_MEMORY_METRICS } from '../monitoring';
import { pick } from 'lodash';
import {
  getErrorSource,
  isRetryableError,
  isUnrecoverableError,
} from '@kbn/task-manager-plugin/server/task_running';
import { SavedObjectsErrorHelpers } from '@kbn/core-saved-objects-server';
import { ConnectorRateLimiter } from './connector_rate_limiter';

const executeParamsFields = [
  'actionId',
  'params',
  'relatedSavedObjects',
  'executionId',
  'request.headers',
  'taskInfo',
  'source',
];
const spaceIdToNamespace = jest.fn();
const actionTypeRegistry = actionTypeRegistryMock.create();
const mockedEncryptedSavedObjectsClient = encryptedSavedObjectsMock.createClient();
const mockedActionExecutor = actionExecutorMock.create();
const eventLogger = eventLoggerMock.create();
const inMemoryMetrics = inMemoryMetricsMock.create();

let fakeTimer: sinon.SinonFakeTimers;
let taskRunnerFactory: TaskRunnerFactory;
let mockedTaskInstance: ConcreteTaskInstance;

beforeAll(() => {
  fakeTimer = sinon.useFakeTimers();
  mockedTaskInstance = {
    id: '',
    runAt: new Date(),
    state: {},
    attempts: 0,
    ownerId: '',
    status: TaskStatus.Running,
    startedAt: new Date(),
    scheduledAt: new Date(),
    retryAt: new Date(Date.now() + 5 * 60 * 1000),
    params: {
      spaceId: 'test',
      actionTaskParamsId: '3',
    },
    taskType: 'actions:1',
  };
  taskRunnerFactory = new TaskRunnerFactory(mockedActionExecutor, inMemoryMetrics);
  mockedActionExecutor.initialize(actionExecutorInitializerParams);
  taskRunnerFactory.initialize(taskRunnerFactoryInitializerParams);
});

afterAll(() => fakeTimer.restore());

const services = {
  log: jest.fn(),
  savedObjectsClient: savedObjectsClientMock.create(),
};

const unsecuredServices = {
  log: jest.fn(),
  savedObjectsClient: savedObjectsRepositoryMock.create(),
};

const actionExecutorInitializerParams = {
  logger: loggingSystemMock.create().get(),
  getServices: jest.fn().mockReturnValue(services),
  getUnsecuredServices: jest.fn().mockReturnValue(unsecuredServices),
  actionTypeRegistry,
  getActionsAuthorizationWithRequest: jest.fn().mockReturnValue(actionsAuthorizationMock.create()),
  encryptedSavedObjectsClient: mockedEncryptedSavedObjectsClient,
  eventLogger,
  inMemoryConnectors: [],
  analyticsService: analyticsServiceMock.createAnalyticsServiceStart(),
  security: securityServiceMock.createStart(),
  getCurrentUserProfileIdFromAPIKey: jest.fn().mockResolvedValue(undefined),
};

const taskRunnerFactoryInitializerParams = {
  spaceIdToNamespace,
  actionTypeRegistry,
  logger: loggingSystemMock.create().get(),
  encryptedSavedObjectsClient: mockedEncryptedSavedObjectsClient,
  savedObjectsRepository: savedObjectsRepositoryMock.create(),
};

describe('Task Runner Factory', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    jest.clearAllMocks();
    actionExecutorInitializerParams.getServices.mockReturnValue(services);
  });

  test(`throws an error if factory isn't initialized`, () => {
    const factory = new TaskRunnerFactory(
      new ActionExecutor({
        isESOCanEncrypt: true,
        connectorRateLimiter: new ConnectorRateLimiter({
          config: { email: { limit: 100, lookbackWindow: '1m' } },
        }),
      }),
      inMemoryMetrics
    );
    expect(() =>
      factory.create(taskManagerMock.createRunContext({ taskInstance: mockedTaskInstance }))
    ).toThrowErrorMatchingInlineSnapshot(`"TaskRunnerFactory not initialized"`);
  });

  test(`throws an error if factory is already initialized`, () => {
    const factory = new TaskRunnerFactory(
      new ActionExecutor({
        isESOCanEncrypt: true,
        connectorRateLimiter: new ConnectorRateLimiter({
          config: { email: { limit: 100, lookbackWindow: '1m' } },
        }),
      }),
      inMemoryMetrics
    );
    factory.initialize(taskRunnerFactoryInitializerParams);
    expect(() =>
      factory.initialize(taskRunnerFactoryInitializerParams)
    ).toThrowErrorMatchingInlineSnapshot(`"TaskRunnerFactory already initialized"`);
  });

  test('executes the task by calling the executor with proper parameters, using given actionId when no actionRef in references', async () => {
    const taskRunner = taskRunnerFactory.create(
      taskManagerMock.createRunContext({ taskInstance: mockedTaskInstance })
    );

    mockedActionExecutor.execute.mockResolvedValueOnce({ status: 'ok', actionId: '2' });
    spaceIdToNamespace.mockReturnValueOnce('namespace-test');
    mockedEncryptedSavedObjectsClient.getDecryptedAsInternalUser.mockResolvedValueOnce({
      id: '3',
      type: 'action_task_params',
      attributes: {
        actionId: '2',
        params: { baz: true },
        executionId: '123abc',
        apiKey: Buffer.from('123:abc').toString('base64'),
      },
      references: [],
    });

    const runnerResult = await taskRunner.run();

    expect(runnerResult).toBeUndefined();
    expect(spaceIdToNamespace).toHaveBeenCalledWith('test');
    expect(mockedEncryptedSavedObjectsClient.getDecryptedAsInternalUser).toHaveBeenCalledWith(
      'action_task_params',
      '3',
      { namespace: 'namespace-test' }
    );

    const [executeParams] = mockedActionExecutor.execute.mock.calls[0];
    expect(pick(executeParams, executeParamsFields)).toEqual({
      actionId: '2',
      params: { baz: true },
      relatedSavedObjects: [],
      executionId: '123abc',
      request: {
        headers: {
          // base64 encoded "123:abc"
          authorization: 'ApiKey MTIzOmFiYw==',
        },
      },
      taskInfo: {
        scheduled: new Date(),
        attempts: 0,
      },
    });
  });

  test('executes the task by calling the executor with proper parameters, using stored actionId when actionRef is in references', async () => {
    const taskRunner = taskRunnerFactory.create(
      taskManagerMock.createRunContext({ taskInstance: mockedTaskInstance })
    );

    mockedActionExecutor.execute.mockResolvedValueOnce({ status: 'ok', actionId: '2' });
    spaceIdToNamespace.mockReturnValueOnce('namespace-test');
    mockedEncryptedSavedObjectsClient.getDecryptedAsInternalUser.mockResolvedValueOnce({
      id: '3',
      type: 'action_task_params',
      attributes: {
        actionId: '2',
        params: { baz: true },
        executionId: '123abc',
        apiKey: Buffer.from('123:abc').toString('base64'),
      },
      references: [
        {
          id: '9',
          name: 'actionRef',
          type: 'action',
        },
      ],
    });

    const runnerResult = await taskRunner.run();

    expect(runnerResult).toBeUndefined();
    expect(spaceIdToNamespace).toHaveBeenCalledWith('test');
    expect(mockedEncryptedSavedObjectsClient.getDecryptedAsInternalUser).toHaveBeenCalledWith(
      'action_task_params',
      '3',
      { namespace: 'namespace-test' }
    );

    const [executeParams] = mockedActionExecutor.execute.mock.calls[0];
    expect(pick(executeParams, executeParamsFields)).toEqual({
      actionId: '9',
      params: { baz: true },
      executionId: '123abc',
      relatedSavedObjects: [],
      request: {
        headers: {
          // base64 encoded "123:abc"
          authorization: 'ApiKey MTIzOmFiYw==',
        },
      },
      taskInfo: {
        scheduled: new Date(),
        attempts: 0,
      },
    });
  });

  test('executes the task by calling the executor with proper parameters when consumer is provided', async () => {
    const taskRunner = taskRunnerFactory.create(
      taskManagerMock.createRunContext({ taskInstance: mockedTaskInstance })
    );

    mockedActionExecutor.execute.mockResolvedValueOnce({ status: 'ok', actionId: '2' });
    spaceIdToNamespace.mockReturnValueOnce('namespace-test');
    mockedEncryptedSavedObjectsClient.getDecryptedAsInternalUser.mockResolvedValueOnce({
      id: '3',
      type: 'action_task_params',
      attributes: {
        actionId: '2',
        consumer: 'test-consumer',
        params: { baz: true },
        executionId: '123abc',
        apiKey: Buffer.from('123:abc').toString('base64'),
      },
      references: [],
    });

    const runnerResult = await taskRunner.run();

    expect(runnerResult).toBeUndefined();
    expect(spaceIdToNamespace).toHaveBeenCalledWith('test');
    expect(mockedEncryptedSavedObjectsClient.getDecryptedAsInternalUser).toHaveBeenCalledWith(
      'action_task_params',
      '3',
      { namespace: 'namespace-test' }
    );

    const [executeParams] = mockedActionExecutor.execute.mock.calls[0];
    expect(pick(executeParams, [...executeParamsFields, 'consumer'])).toEqual({
      actionId: '2',
      consumer: 'test-consumer',
      params: { baz: true },
      relatedSavedObjects: [],
      executionId: '123abc',
      request: {
        headers: {
          // base64 encoded "123:abc"
          authorization: 'ApiKey MTIzOmFiYw==',
        },
      },
      taskInfo: {
        scheduled: new Date(),
        attempts: 0,
      },
    });
  });

  test('executes the task by calling the executor with proper parameters when saved_object source is provided', async () => {
    const taskRunner = taskRunnerFactory.create(
      taskManagerMock.createRunContext({ taskInstance: mockedTaskInstance })
    );

    mockedActionExecutor.execute.mockResolvedValueOnce({ status: 'ok', actionId: '2' });
    spaceIdToNamespace.mockReturnValueOnce('namespace-test');
    mockedEncryptedSavedObjectsClient.getDecryptedAsInternalUser.mockResolvedValueOnce({
      id: '3',
      type: 'action_task_params',
      attributes: {
        actionId: '2',
        consumer: 'test-consumer',
        params: { baz: true },
        executionId: '123abc',
        source: 'SAVED_OBJECT',
        apiKey: Buffer.from('123:abc').toString('base64'),
      },
      references: [{ name: 'source', id: 'abc', type: 'alert' }],
    });

    const runnerResult = await taskRunner.run();

    expect(runnerResult).toBeUndefined();
    expect(spaceIdToNamespace).toHaveBeenCalledWith('test');
    expect(mockedEncryptedSavedObjectsClient.getDecryptedAsInternalUser).toHaveBeenCalledWith(
      'action_task_params',
      '3',
      { namespace: 'namespace-test' }
    );

    const [executeParams] = mockedActionExecutor.execute.mock.calls[0];
    expect(pick(executeParams, [...executeParamsFields, 'consumer'])).toEqual({
      actionId: '2',
      consumer: 'test-consumer',
      params: { baz: true },
      relatedSavedObjects: [],
      executionId: '123abc',
      request: {
        headers: {
          // base64 encoded "123:abc"
          authorization: 'ApiKey MTIzOmFiYw==',
        },
      },
      source: {
        type: 'SAVED_OBJECT',
        source: { id: 'abc', type: 'alert' },
      },
      taskInfo: {
        scheduled: new Date(),
        attempts: 0,
      },
    });
  });

  test('executes the task by calling the executor with proper parameters when notification source is provided', async () => {
    const taskRunner = taskRunnerFactory.create(
      taskManagerMock.createRunContext({ taskInstance: mockedTaskInstance })
    );

    mockedActionExecutor.execute.mockResolvedValueOnce({ status: 'ok', actionId: '2' });
    spaceIdToNamespace.mockReturnValueOnce('namespace-test');
    mockedEncryptedSavedObjectsClient.getDecryptedAsInternalUser.mockResolvedValueOnce({
      id: '3',
      type: 'action_task_params',
      attributes: {
        actionId: '2',
        consumer: 'test-consumer',
        params: { baz: true },
        executionId: '123abc',
        source: 'NOTIFICATION',
        apiKey: Buffer.from('123:abc').toString('base64'),
      },
      references: [],
    });

    const runnerResult = await taskRunner.run();

    expect(runnerResult).toBeUndefined();
    expect(spaceIdToNamespace).toHaveBeenCalledWith('test');
    expect(mockedEncryptedSavedObjectsClient.getDecryptedAsInternalUser).toHaveBeenCalledWith(
      'action_task_params',
      '3',
      { namespace: 'namespace-test' }
    );

    const [executeParams] = mockedActionExecutor.execute.mock.calls[0];
    expect(pick(executeParams, [...executeParamsFields, 'consumer'])).toEqual({
      actionId: '2',
      consumer: 'test-consumer',
      params: { baz: true },
      relatedSavedObjects: [],
      executionId: '123abc',
      request: {
        headers: {
          // base64 encoded "123:abc"
          authorization: 'ApiKey MTIzOmFiYw==',
        },
      },
      source: {
        type: 'NOTIFICATION',
        source: {},
      },
      taskInfo: {
        scheduled: new Date(),
        attempts: 0,
      },
    });
  });

  test('should pass abort signal to the action executor', async () => {
    const abortController = new AbortController();
    const taskRunner = taskRunnerFactory.create(
      taskManagerMock.createRunContext({ taskInstance: mockedTaskInstance, abortController })
    );

    mockedActionExecutor.execute.mockResolvedValueOnce({ status: 'ok', actionId: '2' });
    spaceIdToNamespace.mockReturnValueOnce('namespace-test');
    mockedEncryptedSavedObjectsClient.getDecryptedAsInternalUser.mockResolvedValueOnce({
      id: '3',
      type: 'action_task_params',
      attributes: {
        actionId: '2',
        params: { baz: true },
        executionId: '123abc',
        apiKey: Buffer.from('123:abc').toString('base64'),
      },
      references: [],
    });

    await taskRunner.run();

    const [executeParams] = mockedActionExecutor.execute.mock.calls[0];
    expect(executeParams.signal).toBe(abortController.signal);
  });

  test('passes executionUuid from RunContext as actionExecutionId to the executor', async () => {
    const executionUuid = 'test-execution-uuid-from-run-context';
    const taskRunner = taskRunnerFactory.create(
      taskManagerMock.createRunContext({ taskInstance: mockedTaskInstance, executionUuid })
    );

    mockedActionExecutor.execute.mockResolvedValueOnce({ status: 'ok', actionId: '2' });
    spaceIdToNamespace.mockReturnValueOnce('namespace-test');
    mockedEncryptedSavedObjectsClient.getDecryptedAsInternalUser.mockResolvedValueOnce({
      id: '3',
      type: 'action_task_params',
      attributes: {
        actionId: '2',
        params: { baz: true },
        executionId: '123abc',
        apiKey: Buffer.from('123:abc').toString('base64'),
      },
      references: [],
    });

    await taskRunner.run();

    const [executeParams] = mockedActionExecutor.execute.mock.calls[0];
    expect(executeParams.actionExecutionId).toBe(executionUuid);
  });

  test('cleans up action_task_params object through the cleanup runner method', async () => {
    const taskRunner = taskRunnerFactory.create(
      taskManagerMock.createRunContext({ taskInstance: mockedTaskInstance })
    );

    await taskRunner.cleanup();

    expect(taskRunnerFactoryInitializerParams.savedObjectsRepository.delete).toHaveBeenCalledWith(
      'action_task_params',
      '3',
      { refresh: false }
    );
  });

  test('task runner should implement CancellableTask cancel method with logging warning message', async () => {
    mockedEncryptedSavedObjectsClient.getDecryptedAsInternalUser.mockResolvedValueOnce({
      id: '3',
      type: 'action_task_params',
      attributes: {
        actionId: '2',
        params: { baz: true },
        executionId: '123abc',
        apiKey: Buffer.from('123:abc').toString('base64'),
      },
      references: [
        {
          id: '2',
          name: 'actionRef',
          type: 'action',
        },
      ],
    });
    const taskRunner = taskRunnerFactory.create(
      taskManagerMock.createRunContext({ taskInstance: mockedTaskInstance })
    );

    await taskRunner.cancel();
    expect(mockedActionExecutor.logCancellation.mock.calls[0][0].actionId).toBe('2');

    expect(mockedActionExecutor.logCancellation.mock.calls.length).toBe(1);

    expect(taskRunnerFactoryInitializerParams.logger.debug).toHaveBeenCalledWith(
      `Cancelling action task for action with id 2 - execution error due to timeout.`
    );
  });

  test('cleanup runs successfully when action_task_params cleanup fails and logs the error', async () => {
    const taskRunner = taskRunnerFactory.create(
      taskManagerMock.createRunContext({ taskInstance: mockedTaskInstance })
    );

    taskRunnerFactoryInitializerParams.savedObjectsRepository.delete.mockRejectedValueOnce(
      new Error('Fail')
    );

    await taskRunner.cleanup();

    expect(taskRunnerFactoryInitializerParams.savedObjectsRepository.delete).toHaveBeenCalledWith(
      'action_task_params',
      '3',
      { refresh: false }
    );
    expect(taskRunnerFactoryInitializerParams.logger.error).toHaveBeenCalledWith(
      'Failed to cleanup action_task_params object [id="3"]: Fail'
    );
  });

  test('throws an error with suggested retry logic when return status is error', async () => {
    const taskRunner = taskRunnerFactory.create(
      taskManagerMock.createRunContext({ taskInstance: mockedTaskInstance })
    );

    mockedEncryptedSavedObjectsClient.getDecryptedAsInternalUser.mockResolvedValueOnce({
      id: '3',
      type: 'action_task_params',
      attributes: {
        actionId: '2',
        params: { baz: true },
        executionId: '123abc',
        apiKey: Buffer.from('123:abc').toString('base64'),
      },
      references: [
        {
          id: '2',
          name: 'actionRef',
          type: 'action',
        },
      ],
    });
    mockedActionExecutor.execute.mockResolvedValueOnce({
      status: 'error',
      actionId: '2',
      message: 'Error message',
      data: { foo: true },
      retry: false,
      errorSource: TaskErrorSource.USER,
    });

    try {
      await taskRunner.run();
    } catch (e) {
      expect(getErrorSource(e)).toBe(TaskErrorSource.USER);
      expect(isRetryableError(e)).toEqual(false);
    }
  });

  test('uses API key when provided', async () => {
    const taskRunner = taskRunnerFactory.create(
      taskManagerMock.createRunContext({ taskInstance: mockedTaskInstance })
    );

    mockedActionExecutor.execute.mockResolvedValueOnce({ status: 'ok', actionId: '2' });
    spaceIdToNamespace.mockReturnValueOnce('namespace-test');
    mockedEncryptedSavedObjectsClient.getDecryptedAsInternalUser.mockResolvedValueOnce({
      id: '3',
      type: 'action_task_params',
      attributes: {
        actionId: '2',
        params: { baz: true },
        executionId: '123abc',
        apiKey: Buffer.from('123:abc').toString('base64'),
      },
      references: [
        {
          id: '2',
          name: 'actionRef',
          type: 'action',
        },
      ],
    });

    await taskRunner.run();

    const [executeParams] = mockedActionExecutor.execute.mock.calls[0];
    expect(pick(executeParams, executeParamsFields)).toEqual({
      actionId: '2',
      params: { baz: true },
      executionId: '123abc',
      relatedSavedObjects: [],
      request: {
        headers: {
          // base64 encoded "123:abc"
          authorization: 'ApiKey MTIzOmFiYw==',
        },
      },
      taskInfo: {
        scheduled: new Date(),
        attempts: 0,
      },
    });
  });

  test('uses relatedSavedObjects merged with references when provided', async () => {
    const taskRunner = taskRunnerFactory.create(
      taskManagerMock.createRunContext({ taskInstance: mockedTaskInstance })
    );

    mockedActionExecutor.execute.mockResolvedValueOnce({ status: 'ok', actionId: '2' });
    spaceIdToNamespace.mockReturnValueOnce('namespace-test');
    mockedEncryptedSavedObjectsClient.getDecryptedAsInternalUser.mockResolvedValueOnce({
      id: '3',
      type: 'action_task_params',
      attributes: {
        actionId: '2',
        params: { baz: true },
        executionId: '123abc',
        apiKey: Buffer.from('123:abc').toString('base64'),
        relatedSavedObjects: [{ id: 'related_some-type_0', type: 'some-type' }],
      },
      references: [
        {
          id: '2',
          name: 'actionRef',
          type: 'action',
        },
        {
          id: 'some-id',
          name: 'related_some-type_0',
          type: 'some-type',
        },
      ],
    });

    await taskRunner.run();

    const [executeParams] = mockedActionExecutor.execute.mock.calls[0];
    expect(pick(executeParams, executeParamsFields)).toEqual({
      actionId: '2',
      params: { baz: true },
      executionId: '123abc',
      relatedSavedObjects: [
        {
          id: 'some-id',
          type: 'some-type',
        },
      ],
      request: {
        headers: {
          // base64 encoded "123:abc"
          authorization: 'ApiKey MTIzOmFiYw==',
        },
      },
      taskInfo: {
        scheduled: new Date(),
        attempts: 0,
      },
    });
  });

  test('uses relatedSavedObjects as is when references are empty', async () => {
    const taskRunner = taskRunnerFactory.create(
      taskManagerMock.createRunContext({ taskInstance: mockedTaskInstance })
    );

    mockedActionExecutor.execute.mockResolvedValueOnce({ status: 'ok', actionId: '2' });
    spaceIdToNamespace.mockReturnValueOnce('namespace-test');
    mockedEncryptedSavedObjectsClient.getDecryptedAsInternalUser.mockResolvedValueOnce({
      id: '3',
      type: 'action_task_params',
      attributes: {
        actionId: '2',
        params: { baz: true },
        executionId: '123abc',
        apiKey: Buffer.from('123:abc').toString('base64'),
        relatedSavedObjects: [{ id: 'abc', type: 'some-type', namespace: 'yo' }],
      },
      references: [
        {
          id: '2',
          name: 'actionRef',
          type: 'action',
        },
      ],
    });

    await taskRunner.run();

    const [executeParams] = mockedActionExecutor.execute.mock.calls[0];
    expect(pick(executeParams, executeParamsFields)).toEqual({
      actionId: '2',
      params: { baz: true },
      executionId: '123abc',
      relatedSavedObjects: [
        {
          id: 'abc',
          type: 'some-type',
          namespace: 'yo',
        },
      ],
      request: {
        headers: {
          // base64 encoded "123:abc"
          authorization: 'ApiKey MTIzOmFiYw==',
        },
      },
      taskInfo: {
        scheduled: new Date(),
        attempts: 0,
      },
    });
  });

  test('sanitizes invalid relatedSavedObjects when provided', async () => {
    const taskRunner = taskRunnerFactory.create(
      taskManagerMock.createRunContext({ taskInstance: mockedTaskInstance })
    );

    mockedActionExecutor.execute.mockResolvedValueOnce({ status: 'ok', actionId: '2' });
    spaceIdToNamespace.mockReturnValueOnce('namespace-test');
    mockedEncryptedSavedObjectsClient.getDecryptedAsInternalUser.mockResolvedValueOnce({
      id: '3',
      type: 'action_task_params',
      attributes: {
        actionId: '2',
        params: { baz: true },
        executionId: '123abc',
        apiKey: Buffer.from('123:abc').toString('base64'),
        relatedSavedObjects: [{ Xid: 'related_some-type_0', type: 'some-type' }],
      },
      references: [
        {
          id: '2',
          name: 'actionRef',
          type: 'action',
        },
        {
          id: 'some-id',
          name: 'related_some-type_0',
          type: 'some-type',
        },
      ],
    });

    await taskRunner.run();

    const [executeParams] = mockedActionExecutor.execute.mock.calls[0];
    expect(pick(executeParams, executeParamsFields)).toEqual({
      actionId: '2',
      params: { baz: true },
      request: {
        headers: {
          // base64 encoded "123:abc"
          authorization: 'ApiKey MTIzOmFiYw==',
        },
      },
      executionId: '123abc',
      relatedSavedObjects: [],
      taskInfo: {
        scheduled: new Date(),
        attempts: 0,
      },
    });
  });

  test(`doesn't use API key when not provided`, async () => {
    const factory = new TaskRunnerFactory(mockedActionExecutor, inMemoryMetrics);
    factory.initialize(taskRunnerFactoryInitializerParams);
    const taskRunner = factory.create(
      taskManagerMock.createRunContext({ taskInstance: mockedTaskInstance })
    );

    mockedActionExecutor.execute.mockResolvedValueOnce({ status: 'ok', actionId: '2' });
    spaceIdToNamespace.mockReturnValueOnce('namespace-test');
    mockedEncryptedSavedObjectsClient.getDecryptedAsInternalUser.mockResolvedValueOnce({
      id: '3',
      type: 'action_task_params',
      attributes: {
        actionId: '2',
        params: { baz: true },
        executionId: '123abc',
      },
      references: [
        {
          id: '2',
          name: 'actionRef',
          type: 'action',
        },
      ],
    });

    await taskRunner.run();

    const [executeParams] = mockedActionExecutor.execute.mock.calls[0];
    expect(pick(executeParams, executeParamsFields)).toEqual({
      actionId: '2',
      params: { baz: true },
      executionId: '123abc',
      relatedSavedObjects: [],
      request: {
        headers: {},
      },
      taskInfo: {
        scheduled: new Date(),
        attempts: 0,
      },
    });
  });

  test(`throws an error when license doesn't support the action type`, async () => {
    const taskRunner = taskRunnerFactory.create(
      taskManagerMock.createRunContext({ taskInstance: { ...mockedTaskInstance, attempts: 1 } })
    );

    mockedEncryptedSavedObjectsClient.getDecryptedAsInternalUser.mockResolvedValueOnce({
      id: '3',
      type: 'action_task_params',
      attributes: {
        actionId: '2',
        params: { baz: true },
        executionId: '123abc',
        apiKey: Buffer.from('123:abc').toString('base64'),
      },
      references: [
        {
          id: '2',
          name: 'actionRef',
          type: 'action',
        },
      ],
    });
    mockedActionExecutor.execute.mockImplementation(() => {
      throw new ActionTypeDisabledError('Fail', 'license_invalid');
    });

    try {
      await taskRunner.run();
      throw new Error('Should have thrown');
    } catch (e) {
      expect(isUnrecoverableError(e)).toEqual(true);
      expect(getErrorSource(e)).toBe(TaskErrorSource.USER);
    }
  });

  test(`will throw an error with retry: false if the task is not retryable`, async () => {
    const taskRunner = taskRunnerFactory.create(
      taskManagerMock.createRunContext({ taskInstance: { ...mockedTaskInstance, attempts: 0 } })
    );

    mockedEncryptedSavedObjectsClient.getDecryptedAsInternalUser.mockResolvedValueOnce({
      id: '3',
      type: 'action_task_params',
      attributes: {
        actionId: '2',
        params: { baz: true },
        executionId: '123abc',
        apiKey: Buffer.from('123:abc').toString('base64'),
      },
      references: [
        {
          id: '2',
          name: 'actionRef',
          type: 'action',
        },
      ],
    });
    mockedActionExecutor.execute.mockResolvedValueOnce({
      status: 'error',
      actionId: '2',
      message: 'Error message',
      data: { foo: true },
      retry: false,
      errorSource: TaskErrorSource.FRAMEWORK,
    });

    let err;
    try {
      await taskRunner.run();
    } catch (e) {
      err = e;
    }
    expect(err).toBeDefined();
    expect(isRetryableError(err)).toEqual(false);
    expect(taskRunnerFactoryInitializerParams.logger.error as jest.Mock).toHaveBeenCalledWith(
      `Action '2' failed: Error message`,
      { tags: ['connector-run-failed', 'framework-error'] }
    );
    expect(getErrorSource(err)).toBe(TaskErrorSource.FRAMEWORK);
  });

  test(`will throw an error and log the error message with the serviceMessage`, async () => {
    const taskRunner = taskRunnerFactory.create(
      taskManagerMock.createRunContext({ taskInstance: { ...mockedTaskInstance, attempts: 0 } })
    );

    mockedEncryptedSavedObjectsClient.getDecryptedAsInternalUser.mockResolvedValueOnce({
      id: '3',
      type: 'action_task_params',
      attributes: {
        actionId: '2',
        params: { baz: true },
        executionId: '123abc',
        apiKey: Buffer.from('123:abc').toString('base64'),
      },
      references: [
        {
          id: '2',
          name: 'actionRef',
          type: 'action',
        },
      ],
    });
    mockedActionExecutor.execute.mockResolvedValueOnce({
      status: 'error',
      actionId: '2',
      message: 'Error message',
      serviceMessage: 'Service message',
      data: { foo: true },
      retry: false,
      errorSource: TaskErrorSource.FRAMEWORK,
    });

    let err;
    try {
      await taskRunner.run();
    } catch (e) {
      err = e;
    }

    expect(err).toBeDefined();
    expect(taskRunnerFactoryInitializerParams.logger.error as jest.Mock).toHaveBeenCalledWith(
      `Action '2' failed: Error message: Service message`,
      { tags: ['connector-run-failed', 'framework-error'] }
    );
  });

  test(`fallbacks to FRAMEWORK error if ActionExecutor does not return any type of source'`, async () => {
    const taskRunner = taskRunnerFactory.create(
      taskManagerMock.createRunContext({ taskInstance: { ...mockedTaskInstance, attempts: 0 } })
    );

    mockedEncryptedSavedObjectsClient.getDecryptedAsInternalUser.mockResolvedValueOnce({
      id: '3',
      type: 'action_task_params',
      attributes: {
        actionId: '2',
        params: { baz: true },
        executionId: '123abc',
        apiKey: Buffer.from('123:abc').toString('base64'),
      },
      references: [
        {
          id: '2',
          name: 'actionRef',
          type: 'action',
        },
      ],
    });
    mockedActionExecutor.execute.mockResolvedValueOnce({
      status: 'error',
      actionId: '2',
      message: 'Error message',
      data: { foo: true },
      retry: false,
    });

    try {
      await taskRunner.run();
    } catch (e) {
      expect(getErrorSource(e)).toBe(TaskErrorSource.FRAMEWORK);
    }
  });

  test(`Should return USER error for a "not found SO"`, async () => {
    const taskRunner = taskRunnerFactory.create(
      taskManagerMock.createRunContext({ taskInstance: { ...mockedTaskInstance, attempts: 0 } })
    );

    mockedEncryptedSavedObjectsClient.getDecryptedAsInternalUser.mockRejectedValue(
      SavedObjectsErrorHelpers.createGenericNotFoundError()
    );

    try {
      await taskRunner.run();
    } catch (e) {
      expect(getErrorSource(e)).toBe(TaskErrorSource.USER);
    }
  });

  test('will rethrow the error if the error is thrown instead of returned', async () => {
    const taskRunner = taskRunnerFactory.create(
      taskManagerMock.createRunContext({ taskInstance: { ...mockedTaskInstance, attempts: 0 } })
    );

    mockedEncryptedSavedObjectsClient.getDecryptedAsInternalUser.mockResolvedValueOnce({
      id: '3',
      type: 'action_task_params',
      attributes: {
        actionId: '2',
        params: { baz: true },
        executionId: '123abc',
        apiKey: Buffer.from('123:abc').toString('base64'),
      },
      references: [
        {
          id: '2',
          name: 'actionRef',
          type: 'action',
        },
      ],
    });
    const thrownError = new Error('Fail');
    mockedActionExecutor.execute.mockRejectedValueOnce(thrownError);

    let err;
    try {
      await taskRunner.run();
    } catch (e) {
      err = e;
    }
    expect(err).toBeDefined();
    expect(taskRunnerFactoryInitializerParams.logger.error as jest.Mock).toHaveBeenCalledWith(
      `Action '2' failed: Fail`,
      { tags: ['connector-run-failed', 'framework-error'] }
    );
    expect(thrownError).toEqual(err);
    expect(getErrorSource(err)).toBe(TaskErrorSource.FRAMEWORK);
  });

  test('increments monitoring metrics after execution', async () => {
    const taskRunner = taskRunnerFactory.create(
      taskManagerMock.createRunContext({ taskInstance: mockedTaskInstance })
    );

    mockedActionExecutor.execute.mockResolvedValueOnce({ status: 'ok', actionId: '2' });
    spaceIdToNamespace.mockReturnValueOnce('namespace-test');
    mockedEncryptedSavedObjectsClient.getDecryptedAsInternalUser.mockResolvedValueOnce({
      id: '3',
      type: 'action_task_params',
      attributes: {
        actionId: '2',
        params: { baz: true },
        executionId: '123abc',
        apiKey: Buffer.from('123:abc').toString('base64'),
      },
      references: [],
    });

    await taskRunner.run();

    expect(inMemoryMetrics.increment).toHaveBeenCalledTimes(1);
    expect(inMemoryMetrics.increment.mock.calls[0][0]).toBe(IN_MEMORY_METRICS.ACTION_EXECUTIONS);
  });

  test('increments monitoring metrics after a failed execution', async () => {
    const taskRunner = taskRunnerFactory.create(
      taskManagerMock.createRunContext({ taskInstance: mockedTaskInstance })
    );

    mockedActionExecutor.execute.mockResolvedValueOnce({
      status: 'error',
      actionId: '2',
      message: 'Error message',
      data: { foo: true },
      retry: false,
    });

    spaceIdToNamespace.mockReturnValueOnce('namespace-test');
    mockedEncryptedSavedObjectsClient.getDecryptedAsInternalUser.mockResolvedValueOnce({
      id: '3',
      type: 'action_task_params',
      attributes: {
        actionId: '2',
        params: { baz: true },
        executionId: '123abc',
        apiKey: Buffer.from('123:abc').toString('base64'),
      },
      references: [],
    });

    let err;
    try {
      await taskRunner.run();
    } catch (e) {
      err = e;
    }

    expect(err).toBeDefined();
    expect(inMemoryMetrics.increment).toHaveBeenCalledTimes(2);
    expect(inMemoryMetrics.increment.mock.calls[0][0]).toBe(IN_MEMORY_METRICS.ACTION_EXECUTIONS);
    expect(inMemoryMetrics.increment.mock.calls[1][0]).toBe(IN_MEMORY_METRICS.ACTION_FAILURES);
  });

  test('increments monitoring metrics after a timeout', async () => {
    const taskRunner = taskRunnerFactory.create(
      taskManagerMock.createRunContext({ taskInstance: mockedTaskInstance })
    );

    mockedActionExecutor.execute.mockResolvedValueOnce({ status: 'ok', actionId: '2' });
    spaceIdToNamespace.mockReturnValueOnce('namespace-test');
    mockedEncryptedSavedObjectsClient.getDecryptedAsInternalUser.mockResolvedValueOnce({
      id: '3',
      type: 'action_task_params',
      attributes: {
        actionId: '2',
        params: { baz: true },
        executionId: '123abc',
        apiKey: Buffer.from('123:abc').toString('base64'),
      },
      references: [],
    });

    await taskRunner.cancel();

    expect(inMemoryMetrics.increment).toHaveBeenCalledTimes(1);
    expect(inMemoryMetrics.increment.mock.calls[0][0]).toBe(IN_MEMORY_METRICS.ACTION_TIMEOUTS);
  });

  test('throws error if it cannot fetch task data', async () => {
    jest.resetAllMocks();
    const error = new Error('test');
    mockedEncryptedSavedObjectsClient.getDecryptedAsInternalUser.mockRejectedValueOnce(error);

    const taskRunner = taskRunnerFactory.create(
      taskManagerMock.createRunContext({ taskInstance: mockedTaskInstance })
    );
    spaceIdToNamespace.mockReturnValueOnce('namespace-test');

    try {
      await taskRunner.run();
      throw new Error('Should have thrown');
    } catch (e) {
      expect(mockedEncryptedSavedObjectsClient.getDecryptedAsInternalUser).toHaveBeenCalledTimes(1);
      expect(getErrorSource(e)).toBe(TaskErrorSource.FRAMEWORK);
      expect(e).toEqual(error);

      expect(taskRunnerFactoryInitializerParams.logger.error).toHaveBeenCalledWith(
        `Failed to load action task params ${mockedTaskInstance.params.actionTaskParamsId}: test`,
        { tags: ['connector-run-failed', 'framework-error'] }
      );
    }
  });
});
