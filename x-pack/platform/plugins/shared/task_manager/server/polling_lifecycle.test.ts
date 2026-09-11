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
import { SavedObjectsErrorHelpers } from '@kbn/core/server';
import {
  ADJUST_THROUGHPUT_INTERVAL,
  BACKPRESSURE_HOLD_INTERVALS,
} from './lib/create_managed_configuration';
import { BulkUpdateError } from './lib/errors';
import { FillPoolResult } from './lib/fill_pool';
import { SavedObjectsErrorHelpers } from '@kbn/core/server';
import { executionContextServiceMock } from '@kbn/core/server/mocks';
import { TaskCost } from './task';
import type { TaskEventLogger } from './task';
import { ApiKeyType, CLAIM_STRATEGY_MGET, DEFAULT_KIBANAS_PER_PARTITION } from './config';
import { TaskPartitioner } from './lib/task_partitioner';
import type { KibanaDiscoveryService } from './kibana_discovery_service';
import type { TaskManagerBackpressure } from './task_events';
import { TaskEventType } from './task_events';
import { EsApiKeyStrategy } from './api_key_strategy';
import { resetInFlightTasksOwnedByThisNode } from './lib/task_reconciliation';
import { ADJUST_THROUGHPUT_INTERVAL } from './lib/create_managed_configuration';
import type { TaskManagerClaimNudgeService } from './claim_nudge/claim_nudge_service';
import { taskExecutionControlServiceMock } from './execution_control/task_execution_control_service.mock';

const resetInFlightTasksMock = resetInFlightTasksOwnedByThisNode as jest.MockedFunction<
  typeof resetInFlightTasksOwnedByThisNode
>;

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

jest.mock('./lib/task_reconciliation', () => ({
  resetInFlightTasksOwnedByThisNode: jest.fn(),
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
      execution_control: {
        poll_interval: 5000,
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
    },
    taskStore: mockTaskStore,
    executionControlService: taskExecutionControlServiceMock.create(),
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
    resetInFlightTasksMock.mockReset().mockResolvedValue(undefined);
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

    test('begins polling once the ES and SavedObjects services are available', async () => {
      clock.restore();
      const elasticsearchAndSOAvailability$ = new Subject<boolean>();
      new TaskPollingLifecycle({ ...taskManagerOpts, elasticsearchAndSOAvailability$ });

      expect(mockTaskClaiming.claimAvailableTasksIfCapacityIsAvailable).not.toHaveBeenCalled();

      elasticsearchAndSOAvailability$.next(true);

      await retryUntil(
        'polling started',
        () => mockTaskClaiming.claimAvailableTasksIfCapacityIsAvailable.mock.calls.length > 0
      );
    });

    test('waits for the startup task reconciliation to finish before polling', async () => {
      clock.restore();
      let resolveReconciliation: () => void = () => {};
      resetInFlightTasksMock.mockReturnValue(
        new Promise<void>((resolve) => {
          resolveReconciliation = resolve;
        })
      );
      const elasticsearchAndSOAvailability$ = new Subject<boolean>();
      new TaskPollingLifecycle({ ...taskManagerOpts, elasticsearchAndSOAvailability$ });

      elasticsearchAndSOAvailability$.next(true);

      await retryUntil(
        'reconciliation started',
        () => resetInFlightTasksMock.mock.calls.length > 0
      );
      expect(resetInFlightTasksMock).toHaveBeenCalledWith({
        logger: taskManagerLogger,
        taskStore: mockTaskStore,
      });
      // the poller must not start until reconciliation resolves
      await delay(100);
      expect(mockTaskClaiming.claimAvailableTasksIfCapacityIsAvailable).not.toHaveBeenCalled();

      resolveReconciliation();
      await retryUntil(
        'polling started',
        () => mockTaskClaiming.claimAvailableTasksIfCapacityIsAvailable.mock.calls.length > 0
      );
    });

    test('begins polling even when the startup task reconciliation fails', async () => {
      clock.restore();
      resetInFlightTasksMock.mockRejectedValue(new Error('reconciliation failed'));
      const elasticsearchAndSOAvailability$ = new Subject<boolean>();
      new TaskPollingLifecycle({ ...taskManagerOpts, elasticsearchAndSOAvailability$ });

      elasticsearchAndSOAvailability$.next(true);

      await retryUntil(
        'polling started',
        () => mockTaskClaiming.claimAvailableTasksIfCapacityIsAvailable.mock.calls.length > 0
      );
    });

    test('runs the startup task reconciliation only once across availability changes', async () => {
      clock.restore();
      const elasticsearchAndSOAvailability$ = new Subject<boolean>();
      new TaskPollingLifecycle({ ...taskManagerOpts, elasticsearchAndSOAvailability$ });

      elasticsearchAndSOAvailability$.next(true);
      await retryUntil(
        'reconciliation started',
        () => resetInFlightTasksMock.mock.calls.length > 0
      );
      elasticsearchAndSOAvailability$.next(false);
      elasticsearchAndSOAvailability$.next(true);
      await delay(100);

      expect(resetInFlightTasksMock).toHaveBeenCalledTimes(1);
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
    test('stops polling if stop() is called', async () => {
      clock.restore();
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

      await retryUntil(
        'polling started',
        () => mockTaskClaiming.claimAvailableTasksIfCapacityIsAvailable.mock.calls.length > 0
      );

      pollingLifecycle.stop();
      const callsAfterStop =
        mockTaskClaiming.claimAvailableTasksIfCapacityIsAvailable.mock.calls.length;

      await delay(300);
      expect(mockTaskClaiming.claimAvailableTasksIfCapacityIsAvailable).toHaveBeenCalledTimes(
        callsAfterStop
      );
    });

    test('does not begin polling if stopped while the startup task reconciliation is in flight', async () => {
      clock.restore();
      let resolveReconciliation: () => void = () => {};
      resetInFlightTasksMock.mockReturnValue(
        new Promise<void>((resolve) => {
          resolveReconciliation = resolve;
        })
      );
      const elasticsearchAndSOAvailability$ = new Subject<boolean>();
      const pollingLifecycle = new TaskPollingLifecycle({
        elasticsearchAndSOAvailability$,
        ...taskManagerOpts,
      });

      elasticsearchAndSOAvailability$.next(true);
      await retryUntil(
        'reconciliation started',
        () => resetInFlightTasksMock.mock.calls.length > 0
      );
      pollingLifecycle.stop();

      resolveReconciliation();
      await delay(100);
      expect(mockTaskClaiming.claimAvailableTasksIfCapacityIsAvailable).not.toHaveBeenCalled();
    });
  });

  describe('execution control', () => {
    test('cancels all running tasks when execution is paused', () => {
      const executionControlService = taskExecutionControlServiceMock.create();
      const elasticsearchAndSOAvailability$ = new Subject<boolean>();
      const pollingLifecycle = new TaskPollingLifecycle({
        ...taskManagerOpts,
        executionControlService,
        elasticsearchAndSOAvailability$,
      });
      const cancelSpy = jest.spyOn(pollingLifecycle.pool, 'cancelRunningTasks');

      executionControlService.state.next({ paused: true, pausedTaskTypes: [] });

      expect(cancelSpy).toHaveBeenCalledTimes(1);
    });

    test('cancels only the newly paused task types', () => {
      const executionControlService = taskExecutionControlServiceMock.create();
      const elasticsearchAndSOAvailability$ = new Subject<boolean>();
      const pollingLifecycle = new TaskPollingLifecycle({
        ...taskManagerOpts,
        executionControlService,
        elasticsearchAndSOAvailability$,
      });
      const cancelByTypesSpy = jest.spyOn(pollingLifecycle.pool, 'cancelRunningTasksByTypes');

      executionControlService.state.next({ paused: false, pausedTaskTypes: ['foo'] });

      expect(cancelByTypesSpy).toHaveBeenCalledWith(['foo']);
    });

    test('does not cancel running tasks when execution is resumed', () => {
      const executionControlService = taskExecutionControlServiceMock.create({
        paused: true,
        pausedTaskTypes: [],
      });
      const elasticsearchAndSOAvailability$ = new Subject<boolean>();
      const pollingLifecycle = new TaskPollingLifecycle({
        ...taskManagerOpts,
        executionControlService,
        elasticsearchAndSOAvailability$,
      });
      const cancelSpy = jest.spyOn(pollingLifecycle.pool, 'cancelRunningTasks');

      executionControlService.state.next({ paused: false, pausedTaskTypes: [] });

      expect(cancelSpy).not.toHaveBeenCalled();
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
      // flush the microtask queue so the startup task reconciliation
      // completes and the poller starts
      await new Promise((resolve) => setImmediate(resolve));
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
      // flush the microtask queue so the startup task reconciliation
      // completes and the poller starts
      await new Promise((resolve) => setImmediate(resolve));
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
      // flush the microtask queue so the startup task reconciliation
      // completes and the poller starts
      await new Promise((resolve) => setImmediate(resolve));
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
      // flush the microtask queue so the startup task reconciliation
      // completes and the poller starts
      await new Promise((resolve) => setImmediate(resolve));
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
      // flush the microtask queue so the startup task reconciliation
      // completes and the poller starts
      await new Promise((resolve) => setImmediate(resolve));
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
      // flush the microtask queue so the startup task reconciliation
      // completes and the poller starts
      await new Promise((resolve) => setImmediate(resolve));
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

  describe('claim nudge error backoff', () => {
    const claimResult = {
      docs: [],
      stats: { tasksUpdated: 0, tasksConflicted: 0, tasksClaimed: 0 },
    };

    // Drain chained microtasks without advancing sinon's fake timers
    const flushPromises = async (times: number = 10) => {
      for (let i = 0; i < times; i++) {
        await Promise.resolve();
      }
    };

    const claimCalls = () =>
      mockTaskClaiming.claimAvailableTasksIfCapacityIsAvailable.mock.calls.length;

    const startLifecycleWithNudge = async () => {
      const errors$ = new Subject<Error>();
      const claimNudgeSubject = new Subject<void>();
      const taskStore = taskStoreMock.create({});
      Object.assign(taskStore, { errors$ });
      mockTaskClaiming.claimAvailableTasksIfCapacityIsAvailable.mockImplementation(() =>
        Promise.resolve(asOk(claimResult))
      );

      const elasticsearchAndSOAvailability$ = new Subject<boolean>();
      new TaskPollingLifecycle({
        ...taskManagerOpts,
        taskStore,
        elasticsearchAndSOAvailability$,
        claimNudgeService: {
          claimNudge$: claimNudgeSubject.asObservable(),
        } as unknown as TaskManagerClaimNudgeService,
      });

      elasticsearchAndSOAvailability$.next(true);
      // let the startup reconciliation resolve and the initial poll cycle complete
      await flushPromises();
      // fire the deferred `setTimeout(() => subscribe(), 0)` that activates claimNudge$
      clock.tick(0);
      await flushPromises();

      return { errors$, claimNudgeSubject };
    };

    test('a claim nudge triggers an immediate claim cycle when there is no error backoff', async () => {
      const { claimNudgeSubject } = await startLifecycleWithNudge();
      const baseline = claimCalls();

      claimNudgeSubject.next();
      await flushPromises();

      expect(claimCalls()).toBe(baseline + 1);
    });

    test('swallows claim nudges while the error backoff is active and resumes after a clean window', async () => {
      const { errors$, claimNudgeSubject } = await startLifecycleWithNudge();
      const baseline = claimCalls();

      // a qualifying error, flushed into the next error-count window, activates the backoff
      errors$.next(SavedObjectsErrorHelpers.createTooManyRequestsError('a', 'b'));
      clock.tick(ADJUST_THROUGHPUT_INTERVAL);
      await flushPromises();

      claimNudgeSubject.next();
      await flushPromises();
      expect(claimCalls()).toBe(baseline);
      expect(taskManagerLogger.debug).toHaveBeenCalledWith(
        'Ignoring claim nudge because task manager is backing off after Elasticsearch errors; the next regular poll cycle will claim the task'
      );

      clock.tick(ADJUST_THROUGHPUT_INTERVAL);
      await flushPromises();

      claimNudgeSubject.next();
      await flushPromises();
      expect(claimCalls()).toBe(baseline + 1);
    });
  });

  describe('backpressure events', () => {
    const collectBackpressureEvents = (lifecycle: TaskPollingLifecycle) => {
      const events: TaskManagerBackpressure[] = [];
      lifecycle.events.subscribe((event) => {
        if (event.type === TaskEventType.TASK_MANAGER_BACKPRESSURE) {
          events.push(event as TaskManagerBackpressure);
        }
      });
      return events;
    };

    test('emits an active backpressure event with the ES-pressure reason when Elasticsearch errors', () => {
      const errors$ = new Subject<Error>();
      const store = taskStoreMock.create({});
      (store as unknown as { errors$: Subject<Error> }).errors$ = errors$;

      const lifecycle = new TaskPollingLifecycle({
        ...taskManagerOpts,
        taskStore: store,
        elasticsearchAndSOAvailability$: new Subject<boolean>(),
      });
      const events = collectBackpressureEvents(lifecycle);

      errors$.next(SavedObjectsErrorHelpers.createTooManyRequestsError('a', 'b'));
      clock.tick(ADJUST_THROUGHPUT_INTERVAL);

      const active = events
        .map((event) => (isOk(event.event) ? event.event.value : undefined))
        .filter((snapshot) => snapshot?.active);
      expect(active.length).toBeGreaterThan(0);
      expect(active[active.length - 1]).toMatchObject({
        active: true,
        reason: 'too_many_requests',
      });
    });

    test('stays inactive under the low-utilization poll-interval change (capacity-driven, not ES)', () => {
      const errors$ = new Subject<Error>();
      const store = taskStoreMock.create({});
      (store as unknown as { errors$: Subject<Error> }).errors$ = errors$;

      const lifecycle = new TaskPollingLifecycle({
        ...taskManagerOpts,
        taskStore: store,
        elasticsearchAndSOAvailability$: new Subject<boolean>(),
      });
      const events = collectBackpressureEvents(lifecycle);

      // No ES errors: advancing time exercises the managed-config loop without
      // reducing capacity, so backpressure must never report active.
      clock.tick(ADJUST_THROUGHPUT_INTERVAL);

      const anyActive = events.some((event) => isOk(event.event) && event.event.value.active);
      expect(anyActive).toBe(false);
    });

    test('stays continuously active across the idle windows of a sustained cluster block', () => {
      const errors$ = new Subject<Error>();
      const store = taskStoreMock.create({});
      (store as unknown as { errors$: Subject<Error> }).errors$ = errors$;

      const lifecycle = new TaskPollingLifecycle({
        ...taskManagerOpts,
        taskStore: store,
        elasticsearchAndSOAvailability$: new Subject<boolean>(),
      });
      const events = collectBackpressureEvents(lifecycle);

      const clusterBlockError = () =>
        new BulkUpdateError({ statusCode: 403, type: 'cluster_block_exception' });

      // A real block re-errors only ~once per 61s poll, so model one block error
      // followed by error-free windows within the hold.
      errors$.next(clusterBlockError());
      clock.tick(ADJUST_THROUGHPUT_INTERVAL);
      for (let i = 0; i < BACKPRESSURE_HOLD_INTERVALS - 1; i++) {
        clock.tick(ADJUST_THROUGHPUT_INTERVAL);
      }

      // Once active it must not flip back mid-block (one inactive snapshot is
      // expected at startup, before the block error arrives).
      const snapshots = events
        .map((event) => (isOk(event.event) ? event.event.value : undefined))
        .filter((snapshot): snapshot is NonNullable<typeof snapshot> => snapshot !== undefined);
      const activeStates = snapshots.map((snapshot) => snapshot.active);
      const firstActive = activeStates.indexOf(true);
      expect(firstActive).toBeGreaterThanOrEqual(0);
      expect(activeStates.slice(firstActive).every(Boolean)).toBe(true);
      expect(snapshots[snapshots.length - 1]).toMatchObject({
        active: true,
        reason: 'cluster_block',
      });
    });

    test('clears once the hold elapses with no further ES errors', () => {
      const errors$ = new Subject<Error>();
      const store = taskStoreMock.create({});
      (store as unknown as { errors$: Subject<Error> }).errors$ = errors$;

      const lifecycle = new TaskPollingLifecycle({
        ...taskManagerOpts,
        taskStore: store,
        elasticsearchAndSOAvailability$: new Subject<boolean>(),
      });
      const events = collectBackpressureEvents(lifecycle);

      errors$.next(new BulkUpdateError({ statusCode: 403, type: 'cluster_block_exception' }));
      // Advance well past the hold with no further errors so backpressure clears.
      for (let i = 0; i < BACKPRESSURE_HOLD_INTERVALS + 2; i++) {
        clock.tick(ADJUST_THROUGHPUT_INTERVAL);
      }

      const last = events
        .map((event) => (isOk(event.event) ? event.event.value : undefined))
        .filter((snapshot): snapshot is NonNullable<typeof snapshot> => snapshot !== undefined)
        .pop();
      expect(last).toMatchObject({ active: false, reason: null });
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
