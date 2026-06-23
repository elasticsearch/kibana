/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import sinon from 'sinon';
import { Subject } from 'rxjs';

import type { TaskLifecycleEvent } from './polling_lifecycle';
import { TaskPollingLifecycle, claimAvailableTasks } from './polling_lifecycle';
import { createInitialMiddleware } from './lib/middleware';
import { TaskTypeDictionary } from './task_type_dictionary';
import { taskStoreMock } from './task_store.mock';
import { mockLogger } from './test_utils';
import { taskClaimingMock } from './queries/task_claiming.mock';
import { TaskClaiming } from './queries/task_claiming';
import type {
  TaskClaiming as TaskClaimingClass,
  ClaimOwnershipResult,
} from './queries/task_claiming';
import { TaskManagerRunner } from './task_running';
import type { ConcreteTaskInstance } from './task';
import type { Err, Ok } from './lib/result_type';
import { asOk, isErr, isOk } from './lib/result_type';
import { FillPoolResult } from './lib/fill_pool';
import { executionContextServiceMock } from '@kbn/core/server/mocks';
import { TaskCost } from './task';
import type { TaskEventLogger } from './task';
import { ApiKeyType, CLAIM_STRATEGY_MGET, DEFAULT_KIBANAS_PER_PARTITION } from './config';
import { TaskPartitioner } from './lib/task_partitioner';
import type { KibanaDiscoveryService } from './kibana_discovery_service';
import { TaskEventType } from './task_events';
import { EsApiKeyStrategy } from './api_key_strategy';

const executionContext = executionContextServiceMock.createSetupContract();
let mockTaskClaiming = taskClaimingMock.create({});
jest.mock('./queries/task_claiming', () => {
  return {
    TaskClaiming: jest.fn().mockImplementation(() => {
      return mockTaskClaiming;
    }),
  };
});

jest.mock('./constants', () => ({
  CONCURRENCY_ALLOW_LIST_BY_TASK_TYPE: ['report', 'quickReport'],
}));

jest.mock('./task_running', () => {
  const actual = jest.requireActual('./task_running');
  return {
    ...actual,
    TaskManagerRunner: jest.fn(),
  };
});

interface EsError extends Error {
  name: string;
  statusCode: number;
  meta: {
    body: {
      error: {
        type: string;
      };
    };
  };
}

const eventLoggerMock = { logEvent: jest.fn() } as unknown as TaskEventLogger;

describe('TaskPollingLifecycle', () => {
  let clock: sinon.SinonFakeTimers;
  const taskManagerLogger = mockLogger();
  const mockTaskStore = taskStoreMock.create({});
  const taskManagerOpts = {
    config: {
      discovery: {
        active_nodes_lookback: '30s',
        interval: 10000,
      },
      kibanas_per_partition: 2,
      invalidate_api_key_task: {
        interval: '5m',
        removalDelay: '1h',
      },
      enabled: true,
      index: 'foo',
      max_attempts: 9,
      poll_interval: 6000000,
      version_conflict_threshold: 80,
      request_capacity: 1000,
      allow_reading_invalid_state: false,
      monitored_aggregated_stats_refresh_rate: 5000,
      monitored_stats_health_verbose_log: {
        enabled: false,
        level: 'debug' as const,
        warn_delayed_task_start_in_seconds: 60,
      },
      monitored_stats_required_freshness: 5000,
      monitored_stats_running_average_window: 50,
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
      claim_strategy: 'update_by_query',
      request_timeouts: {
        update_by_query: 1000,
      },
      auto_calculate_default_ech_capacity: false,
      api_key_type: ApiKeyType.ES,
      grant_uiam_api_keys: false,
    },
    taskStore: mockTaskStore,
    logger: taskManagerLogger,
    definitions: new TaskTypeDictionary(taskManagerLogger),
    middleware: createInitialMiddleware(),
    startingCapacity: 20,
    executionContext,
    taskPartitioner: new TaskPartitioner({
      logger: taskManagerLogger,
      podName: 'test',
      kibanaDiscoveryService: {} as KibanaDiscoveryService,
      kibanasPerPartition: DEFAULT_KIBANAS_PER_PARTITION,
    }),
    apiKeyStrategy: new EsApiKeyStrategy(),
    eventLogger: eventLoggerMock,
  };

  beforeEach(() => {
    mockTaskClaiming = taskClaimingMock.create({});
    (TaskClaiming as jest.Mock<TaskClaimingClass>).mockClear();
    (TaskManagerRunner as jest.Mock).mockClear();
    clock = sinon.useFakeTimers();
  });

  afterEach(() => clock.restore());

  describe('start', () => {
    taskManagerOpts.definitions.registerTaskDefinitions({
      report: {
        title: 'report',
        maxConcurrency: 1,
        cost: TaskCost.ExtraLarge,
        createTaskRunner: jest.fn(),
      },
      quickReport: {
        title: 'quickReport',
        maxConcurrency: 5,
        createTaskRunner: jest.fn(),
      },
    });

    test('begins polling once the ES and SavedObjects services are available', () => {
      const elasticsearchAndSOAvailability$ = new Subject<boolean>();
      new TaskPollingLifecycle({ ...taskManagerOpts, elasticsearchAndSOAvailability$ });

      clock.tick(150);
      expect(mockTaskClaiming.claimAvailableTasksIfCapacityIsAvailable).not.toHaveBeenCalled();

      elasticsearchAndSOAvailability$.next(true);

      clock.tick(150);
      expect(mockTaskClaiming.claimAvailableTasksIfCapacityIsAvailable).toHaveBeenCalled();
    });

    test('provides TaskClaiming with the capacity available when strategy = CLAIM_STRATEGY_UPDATE_BY_QUERY', () => {
      const elasticsearchAndSOAvailability$ = new Subject<boolean>();

      new TaskPollingLifecycle({
        ...taskManagerOpts,
        elasticsearchAndSOAvailability$,
        startingCapacity: 40,
      });
      const taskClaimingGetCapacity = (TaskClaiming as jest.Mock<TaskClaimingClass>).mock
        .calls[0][0].getAvailableCapacity;

      expect(taskClaimingGetCapacity()).toEqual(40);
      expect(taskClaimingGetCapacity('report')).toEqual(1);
      expect(taskClaimingGetCapacity('quickReport')).toEqual(5);
    });

    test('provides TaskClaiming with the capacity available when strategy = CLAIM_STRATEGY_MGET', () => {
      const elasticsearchAndSOAvailability$ = new Subject<boolean>();
      new TaskPollingLifecycle({
        ...taskManagerOpts,
        config: { ...taskManagerOpts.config, claim_strategy: CLAIM_STRATEGY_MGET },
        elasticsearchAndSOAvailability$,
        startingCapacity: 40,
      });

      const taskClaimingGetCapacity = (TaskClaiming as jest.Mock<TaskClaimingClass>).mock
        .calls[0][0].getAvailableCapacity;

      expect(taskClaimingGetCapacity()).toEqual(80);
      expect(taskClaimingGetCapacity('report')).toEqual(10);
      expect(taskClaimingGetCapacity('quickReport')).toEqual(10);
    });
  });

  describe('stop', () => {
    test('stops polling if stop() is called', () => {
      const elasticsearchAndSOAvailability$ = new Subject<boolean>();
      const pollingLifecycle = new TaskPollingLifecycle({
        elasticsearchAndSOAvailability$,
        ...taskManagerOpts,
        config: {
          ...taskManagerOpts.config,
          poll_interval: 100,
        },
      });

      expect(mockTaskClaiming.claimAvailableTasksIfCapacityIsAvailable).toHaveBeenCalledTimes(0);
      elasticsearchAndSOAvailability$.next(true);

      clock.tick(50);
      expect(mockTaskClaiming.claimAvailableTasksIfCapacityIsAvailable).toHaveBeenCalledTimes(1);

      pollingLifecycle.stop();

      clock.tick(100);
      expect(mockTaskClaiming.claimAvailableTasksIfCapacityIsAvailable).toHaveBeenCalledTimes(1);
    });
  });

  describe('claimAvailableTasks', () => {
    test('should claim Available Tasks when there are available workers', async () => {
      const claimResult = {
        docs: [],
        stats: { tasksUpdated: 0, tasksConflicted: 0, tasksClaimed: 0 },
      };
      const logger = mockLogger();
      const taskClaiming = taskClaimingMock.create({});
      taskClaiming.claimAvailableTasksIfCapacityIsAvailable.mockImplementation(() =>
        Promise.resolve(asOk(claimResult))
      );

      const result = await claimAvailableTasks(taskClaiming, logger);
      expect(isOk(result)).toBeTruthy();
      expect((result as Ok<ClaimOwnershipResult>).value).toEqual(claimResult);

      expect(taskClaiming.claimAvailableTasksIfCapacityIsAvailable).toHaveBeenCalledTimes(1);
    });

    /**
     * This handles the case in which Elasticsearch has had inline script disabled.
     * This is achieved by setting the `script.allowed_types` flag on Elasticsearch to `none`
     */
    test('handles failure due to inline scripts being disabled', async () => {
      const logger = mockLogger();
      const taskClaiming = taskClaimingMock.create({});
      taskClaiming.claimAvailableTasksIfCapacityIsAvailable.mockImplementation(() => {
        const error = new Error(`fail`) as EsError;
        error.name = 'ResponseError';
        error.meta = {
          body: {
            error: {
              // @ts-ignore
              root_cause: [
                {
                  type: 'illegal_argument_exception',
                  reason: 'cannot execute [inline] scripts',
                },
              ],
              type: 'search_phase_execution_exception',
              reason: 'all shards failed',
              phase: 'query',
              grouped: true,
              failed_shards: [
                {
                  shard: 0,
                  index: '.kibana_task_manager_1',
                  node: '24A4QbjHSK6prvtopAKLKw',
                  reason: {
                    type: 'illegal_argument_exception',
                    reason: 'cannot execute [inline] scripts',
                  },
                },
              ],
              caused_by: {
                type: 'illegal_argument_exception',
                reason: 'cannot execute [inline] scripts',
                caused_by: {
                  type: 'illegal_argument_exception',
                  reason: 'cannot execute [inline] scripts',
                },
              },
            },
            status: 400,
          },
        };
        error.statusCode = 400;
        throw error;
      });

      const claimErr = await claimAvailableTasks(taskClaiming, logger);

      expect(isErr(claimErr)).toBeTruthy();
      expect((claimErr as Err<FillPoolResult>).error).toEqual(FillPoolResult.Failed);

      expect(logger.warn).toHaveBeenCalledTimes(1);
      expect(logger.warn).toHaveBeenCalledWith(
        `Task Manager cannot operate when inline scripts are disabled in Elasticsearch`
      );
    });
  });

  describe('workerUtilization events', () => {
    test('should emit event when polling is successful', async () => {
      clock.restore();
      mockTaskClaiming.claimAvailableTasksIfCapacityIsAvailable.mockImplementation(() =>
        Promise.resolve(
          asOk({
            docs: [],
            stats: { tasksUpdated: 0, tasksConflicted: 0, tasksClaimed: 0 },
          })
        )
      );
      const elasticsearchAndSOAvailability$ = new Subject<boolean>();
      const taskPollingLifecycle = new TaskPollingLifecycle({
        ...taskManagerOpts,
        elasticsearchAndSOAvailability$,
      });

      const emittedEvents: TaskLifecycleEvent[] = [];

      taskPollingLifecycle.events.subscribe((event: TaskLifecycleEvent) =>
        emittedEvents.push(event)
      );

      elasticsearchAndSOAvailability$.next(true);
      expect(mockTaskClaiming.claimAvailableTasksIfCapacityIsAvailable).toHaveBeenCalled();
      await retryUntil('workerUtilizationEvent emitted', () => {
        return !!emittedEvents.find(
          (event: TaskLifecycleEvent) => event.id === 'workerUtilization'
        );
      });

      const workerUtilizationEvent = emittedEvents.find(
        (event: TaskLifecycleEvent) => event.id === 'workerUtilization'
      );
      expect(workerUtilizationEvent).toEqual({
        id: 'workerUtilization',
        type: 'TASK_MANAGER_STAT',
        event: { tag: 'ok', value: 0 },
      });
    });

    test('should set utilization to max when capacity is not fully reached but there are tasks left unclaimed', async () => {
      clock.restore();
      mockTaskClaiming.claimAvailableTasksIfCapacityIsAvailable.mockImplementation(() =>
        Promise.resolve(
          asOk({
            docs: [],
            stats: { tasksUpdated: 0, tasksConflicted: 0, tasksClaimed: 0, tasksLeftUnclaimed: 2 },
          })
        )
      );
      const elasticsearchAndSOAvailability$ = new Subject<boolean>();
      const taskPollingLifecycle = new TaskPollingLifecycle({
        ...taskManagerOpts,
        elasticsearchAndSOAvailability$,
      });

      const emittedEvents: TaskLifecycleEvent[] = [];

      taskPollingLifecycle.events.subscribe((event: TaskLifecycleEvent) =>
        emittedEvents.push(event)
      );

      elasticsearchAndSOAvailability$.next(true);
      expect(mockTaskClaiming.claimAvailableTasksIfCapacityIsAvailable).toHaveBeenCalled();
      await retryUntil('workerUtilizationEvent emitted', () => {
        return !!emittedEvents.find(
          (event: TaskLifecycleEvent) => event.id === 'workerUtilization'
        );
      });

      const workerUtilizationEvent = emittedEvents.find(
        (event: TaskLifecycleEvent) => event.id === 'workerUtilization'
      );
      expect(workerUtilizationEvent).toEqual({
        id: 'workerUtilization',
        type: 'TASK_MANAGER_STAT',
        event: { tag: 'ok', value: 100 },
      });
    });

    test('should emit event when polling error occurs', async () => {
      clock.restore();
      mockTaskClaiming.claimAvailableTasksIfCapacityIsAvailable.mockImplementation(() => {
        throw new Error('booo');
      });
      const elasticsearchAndSOAvailability$ = new Subject<boolean>();
      const taskPollingLifecycle = new TaskPollingLifecycle({
        ...taskManagerOpts,
        elasticsearchAndSOAvailability$,
      });

      const emittedEvents: TaskLifecycleEvent[] = [];

      taskPollingLifecycle.events.subscribe((event: TaskLifecycleEvent) =>
        emittedEvents.push(event)
      );

      elasticsearchAndSOAvailability$.next(true);
      expect(mockTaskClaiming.claimAvailableTasksIfCapacityIsAvailable).toHaveBeenCalled();
      await retryUntil('workerUtilizationEvent emitted', () => {
        return !!emittedEvents.find(
          (event: TaskLifecycleEvent) => event.id === 'workerUtilization'
        );
      });
    });
  });

  describe('pollingLifecycleEvents events', () => {
    test('should emit success event when polling is successful', async () => {
      clock.restore();
      mockTaskClaiming.claimAvailableTasksIfCapacityIsAvailable.mockImplementation(() =>
        Promise.resolve(
          asOk({
            docs: [],
            stats: { tasksUpdated: 0, tasksConflicted: 0, tasksClaimed: 0 },
          })
        )
      );
      const elasticsearchAndSOAvailability$ = new Subject<boolean>();
      const taskPollingLifecycle = new TaskPollingLifecycle({
        ...taskManagerOpts,
        elasticsearchAndSOAvailability$,
      });

      const emittedEvents: TaskLifecycleEvent[] = [];

      taskPollingLifecycle.events.subscribe((event: TaskLifecycleEvent) =>
        emittedEvents.push(event)
      );

      elasticsearchAndSOAvailability$.next(true);
      expect(mockTaskClaiming.claimAvailableTasksIfCapacityIsAvailable).toHaveBeenCalled();
      await retryUntil('pollingCycleEvent emitted', () => {
        return !!emittedEvents.find(
          (event: TaskLifecycleEvent) => event.type === TaskEventType.TASK_POLLING_CYCLE
        );
      });

      const pollingCycleEvent = emittedEvents.find(
        (event: TaskLifecycleEvent) => event.type === TaskEventType.TASK_POLLING_CYCLE
      );

      expect(pollingCycleEvent!.event).toEqual({
        tag: 'ok',
        value: {
          result: 'NoTasksClaimed',
          stats: {
            tasksUpdated: 0,
            tasksConflicted: 0,
            tasksClaimed: 0,
          },
        },
      });
    });

    test('should emit failure event when polling error occurs', async () => {
      clock.restore();
      mockTaskClaiming.claimAvailableTasksIfCapacityIsAvailable.mockImplementation(() => {
        throw new Error('booo');
      });
      const elasticsearchAndSOAvailability$ = new Subject<boolean>();
      const taskPollingLifecycle = new TaskPollingLifecycle({
        ...taskManagerOpts,
        elasticsearchAndSOAvailability$,
      });

      const emittedEvents: TaskLifecycleEvent[] = [];

      taskPollingLifecycle.events.subscribe((event: TaskLifecycleEvent) =>
        emittedEvents.push(event)
      );

      elasticsearchAndSOAvailability$.next(true);
      expect(mockTaskClaiming.claimAvailableTasksIfCapacityIsAvailable).toHaveBeenCalled();
      await retryUntil('pollingCycleEvent emitted', () => {
        return !!emittedEvents.find(
          (event: TaskLifecycleEvent) => event.type === TaskEventType.TASK_POLLING_CYCLE
        );
      });

      const pollingCycleEvent = emittedEvents.find(
        (event: TaskLifecycleEvent) => event.type === TaskEventType.TASK_POLLING_CYCLE
      );

      expect(pollingCycleEvent!.event.tag).toEqual('err');
      expect(pollingCycleEvent!.event).toEqual({
        tag: 'err',
        error: new Error(`Failed to poll for work: booo`),
      });
    });

    test('should emit failure event when polling is successful but individual task errors reported', async () => {
      clock.restore();
      mockTaskClaiming.claimAvailableTasksIfCapacityIsAvailable.mockImplementation(() =>
        Promise.resolve(
          asOk({
            docs: [],
            stats: { tasksUpdated: 0, tasksConflicted: 0, tasksClaimed: 0, tasksErrors: 2 },
          })
        )
      );
      const elasticsearchAndSOAvailability$ = new Subject<boolean>();
      const taskPollingLifecycle = new TaskPollingLifecycle({
        ...taskManagerOpts,
        elasticsearchAndSOAvailability$,
      });

      const emittedEvents: TaskLifecycleEvent[] = [];

      taskPollingLifecycle.events.subscribe((event: TaskLifecycleEvent) =>
        emittedEvents.push(event)
      );

      elasticsearchAndSOAvailability$.next(true);
      expect(mockTaskClaiming.claimAvailableTasksIfCapacityIsAvailable).toHaveBeenCalled();
      await retryUntil('pollingCycleEvent emitted', () => {
        return !!emittedEvents.find(
          (event: TaskLifecycleEvent) => event.type === TaskEventType.TASK_POLLING_CYCLE
        );
      });

      const pollingCycleEvent = emittedEvents.find(
        (event: TaskLifecycleEvent) => event.type === TaskEventType.TASK_POLLING_CYCLE
      );

      expect(pollingCycleEvent!.event).toEqual({
        tag: 'err',
        error: new Error(`Partially failed to poll for work: some tasks could not be claimed.`),
      });
    });
  });

  describe('pollingLifecycleEvents capacity and poll interval', () => {
    test('returns observables with initialized values', async () => {
      const elasticsearchAndSOAvailability$ = new Subject<boolean>();
      const taskPollingLifecycle = new TaskPollingLifecycle({
        ...taskManagerOpts,
        config: {
          ...taskManagerOpts.config,
          poll_interval: 2,
        },
        elasticsearchAndSOAvailability$,
      });

      elasticsearchAndSOAvailability$.next(true);

      const capacitySubscription = jest.fn();
      const pollIntervalSubscription = jest.fn();

      taskPollingLifecycle.capacityConfiguration$.subscribe(capacitySubscription);
      taskPollingLifecycle.pollIntervalConfiguration$.subscribe(pollIntervalSubscription);
      expect(capacitySubscription).toHaveBeenCalledTimes(1);
      expect(capacitySubscription).toHaveBeenNthCalledWith(1, 20);
      expect(pollIntervalSubscription).toHaveBeenCalledTimes(1);
      expect(pollIntervalSubscription).toHaveBeenNthCalledWith(1, 2);
    });
  });

  describe('enrichFakeRequest', () => {
    const buildMockTaskInstance = (): ConcreteTaskInstance => ({
      id: 'foo',
      taskType: 'bar',
      runAt: new Date(),
      scheduledAt: new Date(),
      startedAt: new Date(),
      retryAt: null,
      attempts: 0,
      params: {},
      state: {},
      status: 'idle' as ConcreteTaskInstance['status'],
      ownerId: null,
      traceparent: '',
    });

    test('stores the enrichFakeRequest option on the lifecycle instance', () => {
      const enrichFakeRequest = jest.fn();
      const elasticsearchAndSOAvailability$ = new Subject<boolean>();
      const lifecycle = new TaskPollingLifecycle({
        ...taskManagerOpts,
        elasticsearchAndSOAvailability$,
        enrichFakeRequest,
      });

      expect(
        (lifecycle as unknown as { enrichFakeRequest: typeof enrichFakeRequest }).enrichFakeRequest
      ).toBe(enrichFakeRequest);
    });

    test('forwards enrichFakeRequest to TaskManagerRunner when creating a runner for a task', () => {
      const enrichFakeRequest = jest.fn();
      const elasticsearchAndSOAvailability$ = new Subject<boolean>();
      const lifecycle = new TaskPollingLifecycle({
        ...taskManagerOpts,
        elasticsearchAndSOAvailability$,
        enrichFakeRequest,
      });

      (
        lifecycle as unknown as {
          createTaskRunnerForTask: (instance: ConcreteTaskInstance) => void;
        }
      ).createTaskRunnerForTask(buildMockTaskInstance());

      expect(TaskManagerRunner).toHaveBeenCalledTimes(1);
      expect(TaskManagerRunner).toHaveBeenCalledWith(
        expect.objectContaining({ enrichFakeRequest })
      );
    });
  });
});

type RetryableFunction = () => boolean;

const RETRY_UNTIL_DEFAULT_COUNT = 20;
const RETRY_UNTIL_DEFAULT_WAIT = 1000; // milliseconds

async function retryUntil(
  label: string,
  fn: RetryableFunction,
  count: number = RETRY_UNTIL_DEFAULT_COUNT,
  wait: number = RETRY_UNTIL_DEFAULT_WAIT
): Promise<boolean> {
  while (count > 0) {
    count--;

    if (fn()) return true;

    // eslint-disable-next-line no-console
    console.log(`attempt failed waiting for "${label}", attempts left: ${count}`);

    if (count === 0) return false;
    await delay(wait);
  }

  return false;
}

async function delay(millis: number) {
  await new Promise((resolve) => setTimeout(resolve, millis));
}
