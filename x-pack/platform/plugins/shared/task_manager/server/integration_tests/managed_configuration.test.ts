/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import sinon from 'sinon';
import type { Client } from '@elastic/elasticsearch';
import { elasticsearchServiceMock, savedObjectsRepositoryMock } from '@kbn/core/server/mocks';
import type { Logger } from '@kbn/core/server';
import { SavedObjectsErrorHelpers } from '@kbn/core/server';
import { schema } from '@kbn/config-schema';
import { ADJUST_THROUGHPUT_INTERVAL } from '../lib/create_managed_configuration';
import type { TaskManagerStartContract } from '../plugin';
import { TaskManagerPlugin } from '../plugin';
import { coreMock } from '@kbn/core/server/mocks';
import { ApiKeyType, type TaskManagerConfig } from '../config';
import { BulkUpdateError } from '../lib/errors';
import { licensingMock } from '@kbn/licensing-plugin/server/mocks';

// This suite exercises managed configuration, not startup task reconciliation.
// The real reconciliation issues an Elasticsearch fetch on startup that would
// perturb the mocked ES interaction and startup timing these tests depend on,
// so stub it out to a no-op.
jest.mock('../lib/task_reconciliation', () => ({
  resetInFlightTasksOwnedByThisNode: jest.fn().mockResolvedValue(undefined),
}));

const mockTaskTypeRunFn = jest.fn();
const mockCreateTaskRunner = jest.fn();
const mockTaskType = {
  title: '',
  description: '',
  stateSchemaByVersion: {
    1: {
      up: (state: Record<string, unknown>) => ({ ...state, baz: state.baz || '' }),
      schema: schema.object({
        foo: schema.string(),
        bar: schema.string(),
        baz: schema.string(),
      }),
    },
  },
  createTaskRunner: mockCreateTaskRunner.mockImplementation(() => ({
    run: mockTaskTypeRunFn,
  })),
};

describe('managed configuration', () => {
  let taskManagerStart: TaskManagerStartContract;
  let logger: Logger;

  let clock: sinon.SinonFakeTimers;
  const savedObjectsClient = savedObjectsRepositoryMock.create();
  const esStart = elasticsearchServiceMock.createStart();

  const inlineScriptError = new Error('cannot execute [inline] scripts" error') as Error & {
    meta: unknown;
  };
  inlineScriptError.meta = {
    body: {
      error: {
        caused_by: {
          reason: 'cannot execute [inline] scripts',
        },
      },
    },
  };

  const config = {
    discovery: {
      active_nodes_lookback: '30s',
      interval: 10000,
    },
    execution_control: {
      poll_interval: 5000,
    },
    kibanas_per_partition: 2,
    capacity: 10,
    max_attempts: 9,
    invalidate_api_key_task: {
      interval: '5m',
      removalDelay: '1h',
    },
    poll_interval: 500,
    allow_reading_invalid_state: false,
    version_conflict_threshold: 80,
    monitored_aggregated_stats_refresh_rate: 60000,
    monitored_stats_health_verbose_log: {
      enabled: false,
      level: 'debug' as const,
      warn_delayed_task_start_in_seconds: 60,
    },
    monitored_stats_required_freshness: 4000,
    monitored_stats_running_average_window: 50,
    request_capacity: 1000,
    monitored_task_execution_thresholds: {
      default: {
        error_threshold: 90,
        warn_threshold: 80,
      },
      custom: {},
    },
    unsafe: {
      exclude_task_types: [],
      authenticate_background_task_utilization: true,
    },
    event_loop_delay: {
      monitor: true,
      warn_threshold: 5000,
    },
    worker_utilization_running_average_window: 5,
    metrics_reset_interval: 3000,
    claim_strategy: 'mget',
    request_timeouts: {
      update_by_query: 1000,
    },
    auto_calculate_default_ech_capacity: false,
    api_key_type: ApiKeyType.ES,
    grant_uiam_api_keys: false,
    claim_nudge: {
      enabled: true,
    },
  };

  async function runSetTimeout0() {
    const promiseResult = new Promise((resolve) => setTimeout(resolve, 0));
    clock.tick(0);
    await promiseResult;
  }

  afterEach(() => {
    clock.restore();
    jest.restoreAllMocks();
  });

  beforeEach(async () => {
    jest.resetAllMocks();
    clock = sinon.useFakeTimers();

    const context = coreMock.createPluginInitializerContext<TaskManagerConfig>(config);
    logger = context.logger.get('taskManager');

    const taskManager = new TaskManagerPlugin(context);
    (
      await taskManager.setup(coreMock.createSetup(), { usageCollection: undefined })
    ).registerTaskDefinitions({
      fooType: mockTaskType,
    });

    const coreStart = coreMock.createStart();
    coreStart.elasticsearch = esStart;
    esStart.client.asInternalUser.child.mockReturnValue(
      esStart.client.asInternalUser as unknown as Client
    );
    coreStart.savedObjects.createInternalRepository.mockReturnValue(savedObjectsClient);
    // No task execution control document exists, so the execution control
    // service resolves to "not paused" immediately and startup can proceed.
    savedObjectsClient.get.mockRejectedValue(
      SavedObjectsErrorHelpers.createGenericNotFoundError('task-execution-control')
    );
    taskManagerStart = await taskManager.start(coreStart, {
      licensing: licensingMock.createStart(),
    });

    // force rxjs timers to fire when they are scheduled for setTimeout(0) as the
    // sinon fake timers cause them to stall. We need to do this a few times for the
    // startup code to start monitoring the poll configuration properly.
    await runSetTimeout0();
    await runSetTimeout0();
  });

  describe('managed poll interval with mget claim strategy', () => {
    test('should increase poll interval when Elasticsearch returns a cluster_block_exception error', async () => {
      savedObjectsClient.create.mockRejectedValueOnce(
        new BulkUpdateError({
          statusCode: 403,
          message: 'index is blocked',
          type: 'cluster_block_exception',
        })
      );

      await expect(
        taskManagerStart.schedule({
          taskType: 'fooType',
          params: { foo: true },
          state: { foo: 'test', bar: 'test', baz: 'test' },
        })
      ).rejects.toThrowErrorMatchingInlineSnapshot(`"index is blocked"`);
      clock.tick(100000);

      expect(logger.warn).toHaveBeenCalledWith(
        'Poll interval configuration changing from 500 to 61000 after seeing 1 "too many request" and/or "execute [inline] script" error(s) and/or "cluster_block_exception" error(s).'
      );
      expect(logger.debug).toHaveBeenCalledWith('Task poller now using interval of 61000ms');
    });

    test('should increase poll interval when Elasticsearch returns 429 error', async () => {
      savedObjectsClient.create.mockRejectedValueOnce(
        SavedObjectsErrorHelpers.createTooManyRequestsError('a', 'b')
      );

      // Cause "too many requests" error to be thrown
      await expect(
        taskManagerStart.schedule({
          taskType: 'fooType',
          params: { foo: true },
          state: { foo: 'test', bar: 'test', baz: 'test' },
        })
      ).rejects.toThrowErrorMatchingInlineSnapshot(`"Too Many Requests"`);
      clock.tick(ADJUST_THROUGHPUT_INTERVAL);

      expect(logger.warn).toHaveBeenCalledWith(
        'Poll interval configuration changing from 500 to 600 after seeing 1 "too many request" and/or "execute [inline] script" error(s) and/or "cluster_block_exception" error(s).'
      );
      expect(logger.debug).toHaveBeenCalledWith('Task poller now using interval of 600ms');
    });

    test('should increase poll interval when Elasticsearch returns "cannot execute [inline] scripts" error', async () => {
      const childEsClient = esStart.client.asInternalUser.child({}) as jest.Mocked<Client>;
      childEsClient.search.mockImplementationOnce(async () => {
        throw inlineScriptError;
      });

      await expect(taskManagerStart.fetch({})).rejects.toThrowErrorMatchingInlineSnapshot(
        `"cannot execute [inline] scripts\\" error"`
      );

      clock.tick(ADJUST_THROUGHPUT_INTERVAL);
      expect(logger.warn).toHaveBeenCalledWith(
        'Poll interval configuration changing from 500 to 600 after seeing 1 "too many request" and/or "execute [inline] script" error(s) and/or "cluster_block_exception" error(s).'
      );
      expect(logger.debug).toHaveBeenCalledWith('Task poller now using interval of 600ms');
    });

    test('should increase poll interval TM utilization is low', async () => {
      savedObjectsClient.create.mockImplementationOnce(
        async (type: string, attributes: unknown) => ({
          id: 'testid',
          type,
          attributes,
          references: [],
          version: '123',
        })
      );

      await taskManagerStart.schedule({
        taskType: 'fooType',
        params: { foo: true },
        state: { foo: 'test', bar: 'test', baz: 'test' },
      });

      mockTaskTypeRunFn.mockImplementation(() => {
        return { state: {} };
      });

      clock.tick(ADJUST_THROUGHPUT_INTERVAL);

      expect(logger.debug).toHaveBeenCalledWith(
        'Poll interval configuration changing from 500 to 3000 after a change in the average task load: 0.'
      );
      expect(logger.debug).toHaveBeenCalledWith('Task poller now using interval of 3000ms');
    });
  });

  describe('managed capacity with mget claim strategy', () => {
    test('should lower capacity when Elasticsearch returns 429 error', async () => {
      savedObjectsClient.create.mockRejectedValueOnce(
        SavedObjectsErrorHelpers.createTooManyRequestsError('a', 'b')
      );

      // Cause "too many requests" error to be thrown
      await expect(
        taskManagerStart.schedule({
          taskType: 'fooType',
          params: { foo: true },
          state: { foo: 'test', bar: 'test', baz: 'test' },
        })
      ).rejects.toThrowErrorMatchingInlineSnapshot(`"Too Many Requests"`);
      clock.tick(ADJUST_THROUGHPUT_INTERVAL);

      expect(logger.warn).toHaveBeenCalledWith(
        'Capacity configuration is temporarily reduced after Elasticsearch returned 1 "too many request" and/or "execute [inline] script" error(s).'
      );
      expect(logger.debug).toHaveBeenCalledWith(
        'Capacity configuration changing from 10 to 8 after seeing 1 "too many request" and/or "execute [inline] script" error(s)'
      );
      expect(logger.debug).toHaveBeenCalledWith(
        'Task pool now using 20 as the max allowed cost which is based on a capacity of 10'
      );
    });

    test('should lower capacity when Elasticsearch returns "cannot execute [inline] scripts" error', async () => {
      const childEsClient = esStart.client.asInternalUser.child({}) as jest.Mocked<Client>;
      childEsClient.search.mockImplementationOnce(async () => {
        throw inlineScriptError;
      });

      await expect(taskManagerStart.fetch({})).rejects.toThrowErrorMatchingInlineSnapshot(
        `"cannot execute [inline] scripts\\" error"`
      );
      clock.tick(ADJUST_THROUGHPUT_INTERVAL);

      expect(logger.warn).toHaveBeenCalledWith(
        'Capacity configuration is temporarily reduced after Elasticsearch returned 1 "too many request" and/or "execute [inline] script" error(s).'
      );
      expect(logger.debug).toHaveBeenCalledWith(
        'Capacity configuration changing from 10 to 8 after seeing 1 "too many request" and/or "execute [inline] script" error(s)'
      );
      expect(logger.debug).toHaveBeenCalledWith(
        'Task pool now using 20 as the max allowed cost which is based on a capacity of 10'
      );
    });
  });
});
