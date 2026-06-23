/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { AnalyticsServiceSetup, CoreSetup, CoreStart } from '@kbn/core/server';
import { loggingSystemMock } from '@kbn/core/server/mocks';
import type { ConvertUiamAPIKeysResponse } from '@kbn/core-security-server';
import type { TaskManagerPluginsStart, TaskManagerStartContract } from '../plugin';
import { TaskStatus, type ConcreteTaskInstance } from '../task';
import { markApiKeysForInvalidation } from '../api_key_strategy';
import { UiamApiKeyProvisioningTask } from './uiam_api_key_provisioning_task';
import { createProvisioningRunContext } from './lib/create_provisioning_run_context';
import { getExcludeTasksFilter } from './lib/get_exclude_tasks_filter';
import { fetchFirstBatchOfTasksToConvert } from './lib/fetch_first_batch_of_tasks_to_convert';
import { writeTaskUiamProvisioningObservabilityStatus } from './lib/task_uiam_provisioning_observability_status';
import { RUN_AT_INTERVAL_MS, TASK_TYPE } from './constants';
import { emptyState } from './task_state';
import type { UiamProvisioningRunTaskOutcome } from './lib/create_uiam_provisioning_task_runner';

jest.mock('./lib/create_provisioning_run_context');
jest.mock('./lib/get_exclude_tasks_filter');
jest.mock('./lib/fetch_first_batch_of_tasks_to_convert');
jest.mock('./lib/task_uiam_provisioning_observability_status');
jest.mock('../api_key_strategy', () => ({
  markApiKeysForInvalidation: jest.fn().mockResolvedValue(undefined),
}));

const createProvisioningRunContextMock = createProvisioningRunContext as jest.MockedFunction<
  typeof createProvisioningRunContext
>;
const getExcludeTasksFilterMock = getExcludeTasksFilter as jest.MockedFunction<
  typeof getExcludeTasksFilter
>;
const fetchFirstBatchOfTasksToConvertMock = fetchFirstBatchOfTasksToConvert as jest.MockedFunction<
  typeof fetchFirstBatchOfTasksToConvert
>;
const writeTaskUiamProvisioningObservabilityStatusMock =
  writeTaskUiamProvisioningObservabilityStatus as jest.MockedFunction<
    typeof writeTaskUiamProvisioningObservabilityStatus
  >;
const markApiKeysForInvalidationMock = markApiKeysForInvalidation as jest.MockedFunction<
  typeof markApiKeysForInvalidation
>;

const coreStartMock = {
  elasticsearch: { client: { asInternalUser: {} } },
} as unknown as CoreStart;

const uiamSuccess = (id: string, key: string) => ({
  status: 'success' as const,
  id,
  key,
  description: 'd',
  organization_id: 'o',
  internal: false,
  role_assignments: {} as Record<string, unknown>,
  creation_date: '2020-01-01T00:00:00.000Z',
  expiration_date: null as string | null,
});

const makeConcreteTask = (overrides: Partial<ConcreteTaskInstance> = {}): ConcreteTaskInstance => {
  const now = new Date();
  return {
    id: 'scheduled-task-doc',
    taskType: TASK_TYPE,
    params: {},
    state: { ...emptyState },
    scheduledAt: now,
    runAt: now,
    startedAt: now,
    attempts: 0,
    status: TaskStatus.Running,
    retryAt: null,
    ownerId: null,
    ...overrides,
  } as ConcreteTaskInstance;
};

interface UiamTaskPrivate {
  runTask: (
    taskInstance: ConcreteTaskInstance,
    coreSetup: CoreSetup<TaskManagerPluginsStart, TaskManagerStartContract>
  ) => Promise<UiamProvisioningRunTaskOutcome>;
}

describe('UiamApiKeyProvisioningTask', () => {
  const coreSetup = {} as CoreSetup<TaskManagerPluginsStart, TaskManagerStartContract>;
  const logger = loggingSystemMock.createLogger();
  const analytics = { reportEvent: jest.fn() } as unknown as AnalyticsServiceSetup;

  const convertibleTask: ConcreteTaskInstance = {
    id: 't1',
    taskType: 'sample',
    params: {},
    state: {},
    scheduledAt: new Date(),
    runAt: new Date(),
    startedAt: new Date(),
    attempts: 0,
    status: TaskStatus.Running,
    retryAt: null,
    apiKey: 'es-k',
    uiamApiKey: undefined,
    userScope: { apiKeyId: 'es-api', apiKeyCreatedByUser: false },
    version: 'ver-1',
  } as unknown as ConcreteTaskInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    getExcludeTasksFilterMock.mockResolvedValue([]);
    markApiKeysForInvalidationMock.mockResolvedValue(undefined);
  });

  const createTask = () =>
    new UiamApiKeyProvisioningTask({ logger, isServerless: true, analytics });

  it('end-to-end: fetches, converts, bulk-updates, writes status, and bumps state', async () => {
    const uiamConvert = jest.fn().mockResolvedValue({
      results: [uiamSuccess('uiam-id', 'raw-secret')],
    } as ConvertUiamAPIKeysResponse);
    const bulkUpdate = jest.fn().mockResolvedValue({
      saved_objects: [{ id: 't1' }],
    });

    createProvisioningRunContextMock.mockResolvedValue({
      coreStart: coreStartMock,
      taskManager: {} as never,
      savedObjectsClient: {} as never,
      unsafeSavedObjectsClient: { bulkUpdate } as never,
      uiamConvert,
    });
    fetchFirstBatchOfTasksToConvertMock.mockResolvedValue({
      tasks: [convertibleTask],
      hasMore: false,
    });

    const result = await (createTask() as unknown as UiamTaskPrivate).runTask(
      makeConcreteTask({ state: { runs: 0 } }),
      coreSetup
    );

    expect(getExcludeTasksFilterMock).toHaveBeenCalled();
    expect(uiamConvert).toHaveBeenCalledWith(['es-k']);
    expect(bulkUpdate).toHaveBeenCalled();
    expect(writeTaskUiamProvisioningObservabilityStatusMock).toHaveBeenCalled();
    const writePayload = writeTaskUiamProvisioningObservabilityStatusMock.mock.calls[0][2];
    expect(writePayload.completed).toHaveLength(1);
    expect(writePayload.skipped).toEqual([]);
    expect(result.state).toEqual({ runs: 1 });
    expect(result.runAt).toBeUndefined();
    expect(result.telemetry.total).toBe(1);
    expect(result.telemetry.completed).toBe(1);
    expect(markApiKeysForInvalidationMock).not.toHaveBeenCalled();
  });

  it('sets runAt when the fetch batch indicates more work', async () => {
    jest.useFakeTimers();
    const now = Date.parse('2026-04-20T12:00:00.000Z');
    jest.setSystemTime(now);
    const uiamConvert = jest.fn().mockResolvedValue({
      results: [uiamSuccess('u', 'k')],
    } as ConvertUiamAPIKeysResponse);
    const bulkUpdate = jest.fn().mockResolvedValue({ saved_objects: [{ id: 't1' }] });
    createProvisioningRunContextMock.mockResolvedValue({
      coreStart: coreStartMock,
      taskManager: {} as never,
      savedObjectsClient: {} as never,
      unsafeSavedObjectsClient: { bulkUpdate } as never,
      uiamConvert,
    });
    fetchFirstBatchOfTasksToConvertMock.mockResolvedValue({
      tasks: [convertibleTask],
      hasMore: true,
    });

    const result = await (createTask() as unknown as UiamTaskPrivate).runTask(
      makeConcreteTask(),
      coreSetup
    );
    expect(result.runAt).toEqual(new Date(now + RUN_AT_INTERVAL_MS));
    jest.useRealTimers();
  });

  it('does not call uiam when no tasks are eligible to convert (all classified as skip)', async () => {
    const uiamConvert = jest.fn();
    const bulkUpdate = jest.fn();
    const skippedTask = {
      ...convertibleTask,
      apiKey: undefined,
    } as unknown as ConcreteTaskInstance;
    createProvisioningRunContextMock.mockResolvedValue({
      coreStart: coreStartMock,
      taskManager: {} as never,
      savedObjectsClient: {} as never,
      unsafeSavedObjectsClient: { bulkUpdate } as never,
      uiamConvert,
    });
    fetchFirstBatchOfTasksToConvertMock.mockResolvedValue({ tasks: [skippedTask], hasMore: false });

    await (createTask() as unknown as UiamTaskPrivate).runTask(
      makeConcreteTask({ state: { runs: 2 } }),
      coreSetup
    );

    expect(uiamConvert).not.toHaveBeenCalled();
    expect(bulkUpdate).not.toHaveBeenCalled();
    const writePayload = writeTaskUiamProvisioningObservabilityStatusMock.mock.calls[0][2];
    expect(writePayload.skipped.length).toBeGreaterThan(0);
    expect(writePayload.completed).toEqual([]);
  });

  it('throws from convert when UIAM is disabled (null response) after logging', async () => {
    const uiamConvert = jest.fn().mockResolvedValue(null);
    const bulkUpdate = jest.fn();
    createProvisioningRunContextMock.mockResolvedValue({
      coreStart: coreStartMock,
      taskManager: {} as never,
      savedObjectsClient: {} as never,
      unsafeSavedObjectsClient: { bulkUpdate } as never,
      uiamConvert,
    });
    fetchFirstBatchOfTasksToConvertMock.mockResolvedValue({
      tasks: [convertibleTask],
      hasMore: false,
    });

    await expect(
      (createTask() as unknown as UiamTaskPrivate).runTask(makeConcreteTask(), coreSetup)
    ).rejects.toThrow('License required');
    expect(logger.error).toHaveBeenCalled();
  });

  it('rethrows when bulkUpdate fails without invalidating minted UIAM keys', async () => {
    const uiamConvert = jest.fn().mockResolvedValue({
      results: [uiamSuccess('uiam-x', 'sec')],
    } as ConvertUiamAPIKeysResponse);
    const bulkUpdate = jest.fn().mockRejectedValue(new Error('es unavailable'));
    createProvisioningRunContextMock.mockResolvedValue({
      coreStart: coreStartMock,
      taskManager: {} as never,
      savedObjectsClient: {} as never,
      unsafeSavedObjectsClient: { bulkUpdate } as never,
      uiamConvert,
    });
    fetchFirstBatchOfTasksToConvertMock.mockResolvedValue({
      tasks: [convertibleTask],
      hasMore: false,
    });

    await expect(
      (createTask() as unknown as UiamTaskPrivate).runTask(makeConcreteTask(), coreSetup)
    ).rejects.toThrow('es unavailable');
    expect(markApiKeysForInvalidationMock).not.toHaveBeenCalled();
  });

  it('invalidates orphan keys when bulk update reports per-item error', async () => {
    const uiamConvert = jest.fn().mockResolvedValue({
      results: [uiamSuccess('orph-uiam', 'sec')],
    } as ConvertUiamAPIKeysResponse);
    const bulkUpdate = jest.fn().mockResolvedValue({
      saved_objects: [{ id: 't1', error: { message: 'version conflict' } }],
    });
    createProvisioningRunContextMock.mockResolvedValue({
      coreStart: coreStartMock,
      taskManager: {} as never,
      savedObjectsClient: {} as never,
      unsafeSavedObjectsClient: { bulkUpdate } as never,
      uiamConvert,
    });
    fetchFirstBatchOfTasksToConvertMock.mockResolvedValue({
      tasks: [convertibleTask],
      hasMore: false,
    });

    const result = await (createTask() as unknown as UiamTaskPrivate).runTask(
      makeConcreteTask(),
      coreSetup
    );

    expect(result.telemetry.failed).toBe(1);
    expect(markApiKeysForInvalidationMock).toHaveBeenCalledWith(
      [{ apiKeyId: 'orph-uiam', uiamApiKey: expect.any(String) }],
      logger,
      expect.anything()
    );
  });

  it('rethrows and logs when getApiKeysToConvert fails', async () => {
    getExcludeTasksFilterMock.mockRejectedValue(new Error('so down'));
    createProvisioningRunContextMock.mockResolvedValue({
      coreStart: coreStartMock,
      taskManager: {} as never,
      savedObjectsClient: {} as never,
      unsafeSavedObjectsClient: { bulkUpdate: jest.fn() } as never,
      uiamConvert: jest.fn(),
    });

    await expect(
      (createTask() as unknown as UiamTaskPrivate).runTask(makeConcreteTask(), coreSetup)
    ).rejects.toThrow('so down');
    expect(logger.error).toHaveBeenCalledWith(
      'Error getting API keys to convert: so down',
      expect.any(Object)
    );
  });
});
