/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import sinon from 'sinon';
import { Subject } from 'rxjs';
import { take, bufferCount, skip } from 'rxjs';
import { loggingSystemMock } from '@kbn/core/server/mocks';
import {
  isTaskManagerMetricEvent,
  isTaskManagerStatEvent,
  isTaskPollingCycleEvent,
  isTaskRunEvent,
} from '../task_events';
import type { TaskLifecycleEvent } from '../polling_lifecycle';
import type { AggregatedStat } from '../lib/runtime_statistics_aggregator';
import { ApiKeyType, type TaskManagerConfig } from '../config';
import { createAggregator } from './create_aggregator';
import type { TaskClaimMetric } from './task_claim_metrics_aggregator';
import { TaskClaimMetricsAggregator } from './task_claim_metrics_aggregator';
import { taskClaimFailureEvent, taskClaimSuccessEvent } from './task_claim_metrics_aggregator.test';
import {
  getTaskRunFailedEvent,
  getTaskRunSuccessEvent,
  getTaskManagerStatEvent,
} from './task_run_metrics_aggregator.test';
import type { TaskRunMetric } from './task_run_metrics_aggregator';
import { TaskRunMetricsAggregator } from './task_run_metrics_aggregator';
import * as TaskClaimMetricsAggregatorModule from './task_claim_metrics_aggregator';
import { metricsAggregatorMock } from './metrics_aggregator.mock';
import { getTaskManagerMetricEvent } from './task_overdue_metrics_aggregator.test';
import type { TaskOverdueMetric } from './task_overdue_metrics_aggregator';
import { TaskOverdueMetricsAggregator } from './task_overdue_metrics_aggregator';

const logger = loggingSystemMock.createLogger();
const mockMetricsAggregator = metricsAggregatorMock.create();
const config: TaskManagerConfig = {
  discovery: {
    active_nodes_lookback: '30s',
    interval: 10000,
  },
  kibanas_per_partition: 2,
  invalidate_api_key_task: {
    interval: '5m',
    removalDelay: '1h',
  },
  allow_reading_invalid_state: false,
  event_loop_delay: {
    monitor: true,
    warn_threshold: 5000,
  },
  max_attempts: 9,
  metrics_reset_interval: 30000,
  monitored_aggregated_stats_refresh_rate: 5000,
  monitored_stats_health_verbose_log: {
    enabled: false,
    level: 'debug' as const,
    warn_delayed_task_start_in_seconds: 60,
  },
  monitored_stats_required_freshness: 6000000,
  monitored_stats_running_average_window: 50,
  monitored_task_execution_thresholds: {
    custom: {},
    default: {
      error_threshold: 90,
      warn_threshold: 80,
    },
  },
  poll_interval: 6000000,
  request_capacity: 1000,
  unsafe: {
    authenticate_background_task_utilization: true,
    exclude_task_types: [],
  },
  version_conflict_threshold: 80,
  worker_utilization_running_average_window: 5,
  claim_strategy: 'update_by_query',
  request_timeouts: {
    update_by_query: 1000,
  },
  auto_calculate_default_ech_capacity: false,
  api_key_type: ApiKeyType.ES,
  grant_uiam_api_keys: false,
};

describe('createAggregator', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('with TaskClaimMetricsAggregator', () => {
    test('returns a cumulative count of successful polling cycles and total polling cycles', async () => {
      const events = [
        taskClaimSuccessEvent,
        taskClaimSuccessEvent,
        taskClaimSuccessEvent,
        taskClaimSuccessEvent,
        taskClaimFailureEvent,
        taskClaimSuccessEvent,
        taskClaimSuccessEvent,
        taskClaimSuccessEvent,
        taskClaimSuccessEvent,
        taskClaimFailureEvent,
        taskClaimSuccessEvent,
      ];
      const events$ = new Subject<TaskLifecycleEvent>();

      const taskClaimAggregator = createAggregator({
        key: 'task_claim',
        events$,
        config,
        reset$: new Subject<boolean>(),
        eventFilter: (event: TaskLifecycleEvent) => isTaskPollingCycleEvent(event),
        metricsAggregator: new TaskClaimMetricsAggregator(),
      });

      return new Promise<void>((resolve) => {
        taskClaimAggregator
          .pipe(
            // skip initial metric which is just initialized data which
            // ensures we don't stall on combineLatest
            skip(1),
            take(events.length),
            bufferCount(events.length)
          )
          .subscribe((metrics: Array<AggregatedStat<TaskClaimMetric>>) => {
            expect(metrics[0]).toEqual({
              key: 'task_claim',
              value: {
                success: 1,
                total: 1,
                total_errors: 0,
                duration: { counts: [1], values: [100] },
                duration_values: [10],
              },
            });
            expect(metrics[1]).toEqual({
              key: 'task_claim',
              value: {
                success: 2,
                total: 2,
                total_errors: 0,
                duration: { counts: [2], values: [100] },
                duration_values: [10, 10],
              },
            });
            expect(metrics[2]).toEqual({
              key: 'task_claim',
              value: {
                success: 3,
                total: 3,
                total_errors: 0,
                duration: { counts: [3], values: [100] },
                duration_values: [10, 10, 10],
              },
            });
            expect(metrics[3]).toEqual({
              key: 'task_claim',
              value: {
                success: 4,
                total: 4,
                total_errors: 0,
                duration: { counts: [4], values: [100] },
                duration_values: [10, 10, 10, 10],
              },
            });
            expect(metrics[4]).toEqual({
              key: 'task_claim',
              value: {
                success: 4,
                total: 5,
                total_errors: 1,
                duration: { counts: [4], values: [100] },
                duration_values: [10, 10, 10, 10],
              },
            });
            expect(metrics[5]).toEqual({
              key: 'task_claim',
              value: {
                success: 5,
                total: 6,
                total_errors: 1,
                duration: { counts: [5], values: [100] },
                duration_values: [10, 10, 10, 10, 10],
              },
            });
            expect(metrics[6]).toEqual({
              key: 'task_claim',
              value: {
                success: 6,
                total: 7,
                total_errors: 1,
                duration: { counts: [6], values: [100] },
                duration_values: [10, 10, 10, 10, 10, 10],
              },
            });
            expect(metrics[7]).toEqual({
              key: 'task_claim',
              value: {
                success: 7,
                total: 8,
                total_errors: 1,
                duration: { counts: [7], values: [100] },
                duration_values: [10, 10, 10, 10, 10, 10, 10],
              },
            });
            expect(metrics[8]).toEqual({
              key: 'task_claim',
              value: {
                success: 8,
                total: 9,
                total_errors: 1,
                duration: { counts: [8], values: [100] },
                duration_values: [10, 10, 10, 10, 10, 10, 10, 10],
              },
            });
            expect(metrics[9]).toEqual({
              key: 'task_claim',
              value: {
                success: 8,
                total: 10,
                total_errors: 2,
                duration: { counts: [8], values: [100] },
                duration_values: [10, 10, 10, 10, 10, 10, 10, 10],
              },
            });
            expect(metrics[10]).toEqual({
              key: 'task_claim',
              value: {
                success: 9,
                total: 11,
                total_errors: 2,
                duration: { counts: [9], values: [100] },
                duration_values: [10, 10, 10, 10, 10, 10, 10, 10, 10],
              },
            });
            resolve();
          });

        for (const event of events) {
          events$.next(event);
        }
      });
    });

    test('resets count when reset$ event is received', async () => {
      const reset$ = new Subject<boolean>();
      const events1 = [
        taskClaimSuccessEvent,
        taskClaimSuccessEvent,
        taskClaimSuccessEvent,
        taskClaimSuccessEvent,
        taskClaimFailureEvent,
        taskClaimSuccessEvent,
      ];

      const events2 = [
        taskClaimSuccessEvent,
        taskClaimFailureEvent,
        taskClaimFailureEvent,
        taskClaimSuccessEvent,
        taskClaimSuccessEvent,
      ];
      const events$ = new Subject<TaskLifecycleEvent>();

      const taskClaimAggregator = createAggregator({
        key: 'task_claim',
        events$,
        config,
        reset$,
        eventFilter: (event: TaskLifecycleEvent) => isTaskPollingCycleEvent(event),
        metricsAggregator: new TaskClaimMetricsAggregator(),
      });

      return new Promise<void>((resolve) => {
        taskClaimAggregator
          .pipe(
            // skip initial metric which is just initialized data which
            // ensures we don't stall on combineLatest
            skip(1),
            take(events1.length + events2.length),
            bufferCount(events1.length + events2.length)
          )
          .subscribe((metrics: Array<AggregatedStat<TaskClaimMetric>>) => {
            expect(metrics[0]).toEqual({
              key: 'task_claim',
              value: {
                success: 1,
                total: 1,
                total_errors: 0,
                duration: { counts: [1], values: [100] },
                duration_values: [10],
              },
            });
            expect(metrics[1]).toEqual({
              key: 'task_claim',
              value: {
                success: 2,
                total: 2,
                total_errors: 0,
                duration: { counts: [2], values: [100] },
                duration_values: [10, 10],
              },
            });
            expect(metrics[2]).toEqual({
              key: 'task_claim',
              value: {
                success: 3,
                total: 3,
                total_errors: 0,
                duration: { counts: [3], values: [100] },
                duration_values: [10, 10, 10],
              },
            });
            expect(metrics[3]).toEqual({
              key: 'task_claim',
              value: {
                success: 4,
                total: 4,
                total_errors: 0,
                duration: { counts: [4], values: [100] },
                duration_values: [10, 10, 10, 10],
              },
            });
            expect(metrics[4]).toEqual({
              key: 'task_claim',
              value: {
                success: 4,
                total: 5,
                total_errors: 1,
                duration: { counts: [4], values: [100] },
                duration_values: [10, 10, 10, 10],
              },
            });
            expect(metrics[5]).toEqual({
              key: 'task_claim',
              value: {
                success: 5,
                total: 6,
                total_errors: 1,
                duration: { counts: [5], values: [100] },
                duration_values: [10, 10, 10, 10, 10],
              },
            });
            // reset event should have been received here
            expect(metrics[6]).toEqual({
              key: 'task_claim',
              value: {
                success: 1,
                total: 1,
                total_errors: 0,
                duration: { counts: [1], values: [100] },
                duration_values: [10],
              },
            });
            expect(metrics[7]).toEqual({
              key: 'task_claim',
              value: {
                success: 1,
                total: 2,
                total_errors: 1,
                duration: { counts: [1], values: [100] },
                duration_values: [10],
              },
            });
            expect(metrics[8]).toEqual({
              key: 'task_claim',
              value: {
                success: 1,
                total: 3,
                total_errors: 2,
                duration: { counts: [1], values: [100] },
                duration_values: [10],
              },
            });
            expect(metrics[9]).toEqual({
              key: 'task_claim',
              value: {
                success: 2,
                total: 4,
                total_errors: 2,
                duration: { counts: [2], values: [100] },
                duration_values: [10, 10],
              },
            });
            expect(metrics[10]).toEqual({
              key: 'task_claim',
              value: {
                success: 3,
                total: 5,
                total_errors: 2,
                duration: { counts: [3], values: [100] },
                duration_values: [10, 10, 10],
              },
            });
            resolve();
          });

        for (const event of events1) {
          events$.next(event);
        }
        reset$.next(true);
        for (const event of events2) {
          events$.next(event);
        }
      });
    });

    test('resets count when configured metrics reset interval expires', async () => {
      const clock = sinon.useFakeTimers();
      clock.tick(0);
      const events1 = [
        taskClaimSuccessEvent,
        taskClaimSuccessEvent,
        taskClaimSuccessEvent,
        taskClaimSuccessEvent,
        taskClaimFailureEvent,
        taskClaimSuccessEvent,
      ];

      const events2 = [
        taskClaimSuccessEvent,
        taskClaimFailureEvent,
        taskClaimFailureEvent,
        taskClaimSuccessEvent,
        taskClaimSuccessEvent,
      ];
      const events$ = new Subject<TaskLifecycleEvent>();

      const taskClaimAggregator = createAggregator({
        key: 'task_claim',
        events$,
        config: {
          ...config,
          metrics_reset_interval: 10,
        },
        reset$: new Subject<boolean>(),
        eventFilter: (event: TaskLifecycleEvent) => isTaskPollingCycleEvent(event),
        metricsAggregator: new TaskClaimMetricsAggregator(),
      });

      return new Promise<void>((resolve) => {
        taskClaimAggregator
          .pipe(
            // skip initial metric which is just initialized data which
            // ensures we don't stall on combineLatest
            skip(1),
            take(events1.length + events2.length),
            bufferCount(events1.length + events2.length)
          )
          .subscribe((metrics: Array<AggregatedStat<TaskClaimMetric>>) => {
            expect(metrics[0]).toEqual({
              key: 'task_claim',
              value: {
                success: 1,
                total: 1,
                total_errors: 0,
                duration: { counts: [1], values: [100] },
                duration_values: [10],
              },
            });
            expect(metrics[1]).toEqual({
              key: 'task_claim',
              value: {
                success: 2,
                total: 2,
                total_errors: 0,
                duration: { counts: [2], values: [100] },
                duration_values: [10, 10],
              },
            });
            expect(metrics[2]).toEqual({
              key: 'task_claim',
              value: {
                success: 3,
                total: 3,
                total_errors: 0,
                duration: { counts: [3], values: [100] },
                duration_values: [10, 10, 10],
              },
            });
            expect(metrics[3]).toEqual({
              key: 'task_claim',
              value: {
                success: 4,
                total: 4,
                total_errors: 0,
                duration: { counts: [4], values: [100] },
                duration_values: [10, 10, 10, 10],
              },
            });
            expect(metrics[4]).toEqual({
              key: 'task_claim',
              value: {
                success: 4,
                total: 5,
                total_errors: 1,
                duration: { counts: [4], values: [100] },
                duration_values: [10, 10, 10, 10],
              },
            });
            expect(metrics[5]).toEqual({
              key: 'task_claim',
              value: {
                success: 5,
                total: 6,
                total_errors: 1,
                duration: { counts: [5], values: [100] },
                duration_values: [10, 10, 10, 10, 10],
              },
            });
            // reset interval should have fired here
            expect(metrics[6]).toEqual({
              key: 'task_claim',
              value: {
                success: 1,
                total: 1,
                total_errors: 0,
                duration: { counts: [1], values: [100] },
                duration_values: [10],
              },
            });
            expect(metrics[7]).toEqual({
              key: 'task_claim',
              value: {
                success: 1,
                total: 2,
                total_errors: 1,
                duration: { counts: [1], values: [100] },
                duration_values: [10],
              },
            });
            expect(metrics[8]).toEqual({
              key: 'task_claim',
              value: {
                success: 1,
                total: 3,
                total_errors: 2,
                duration: { counts: [1], values: [100] },
                duration_values: [10],
              },
            });
            expect(metrics[9]).toEqual({
              key: 'task_claim',
              value: {
                success: 2,
                total: 4,
                total_errors: 2,
                duration: { counts: [2], values: [100] },
                duration_values: [10, 10],
              },
            });
            expect(metrics[10]).toEqual({
              key: 'task_claim',
              value: {
                success: 3,
                total: 5,
                total_errors: 2,
                duration: { counts: [3], values: [100] },
                duration_values: [10, 10, 10],
              },
            });
            resolve();
          });

        for (const event of events1) {
          events$.next(event);
        }
        clock.tick(20);
        for (const event of events2) {
          events$.next(event);
        }

        clock.restore();
      });
    });

    test('does not reset count when configured metrics reset interval expires if metrics have been reset via reset$ event', async () => {
      const reset$ = new Subject<boolean>();
      const clock = sinon.useFakeTimers();
      clock.tick(0);
      const events1 = [
        taskClaimSuccessEvent,
        taskClaimSuccessEvent,
        taskClaimSuccessEvent,
        taskClaimSuccessEvent,
        taskClaimFailureEvent,
        taskClaimSuccessEvent,
      ];

      const events2 = [
        taskClaimSuccessEvent,
        taskClaimFailureEvent,
        taskClaimFailureEvent,
        taskClaimSuccessEvent,
        taskClaimSuccessEvent,
      ];
      const events$ = new Subject<TaskLifecycleEvent>();

      const taskClaimAggregator = createAggregator({
        key: 'task_claim',
        events$,
        config: {
          ...config,
          metrics_reset_interval: 50,
        },
        reset$,
        eventFilter: (event: TaskLifecycleEvent) => isTaskPollingCycleEvent(event),
        metricsAggregator: new TaskClaimMetricsAggregator(),
      });

      return new Promise<void>((resolve) => {
        taskClaimAggregator
          .pipe(
            // skip initial metric which is just initialized data which
            // ensures we don't stall on combineLatest
            skip(1),
            take(events1.length + events2.length + 1),
            bufferCount(events1.length + events2.length + 1)
          )
          .subscribe((metrics: Array<AggregatedStat<TaskClaimMetric>>) => {
            expect(metrics[0]).toEqual({
              key: 'task_claim',
              value: {
                success: 1,
                total: 1,
                total_errors: 0,
                duration: { counts: [1], values: [100] },
                duration_values: [10],
              },
            });
            expect(metrics[1]).toEqual({
              key: 'task_claim',
              value: {
                success: 2,
                total: 2,
                total_errors: 0,
                duration: { counts: [2], values: [100] },
                duration_values: [10, 10],
              },
            });
            expect(metrics[2]).toEqual({
              key: 'task_claim',
              value: {
                success: 3,
                total: 3,
                total_errors: 0,
                duration: { counts: [3], values: [100] },
                duration_values: [10, 10, 10],
              },
            });
            expect(metrics[3]).toEqual({
              key: 'task_claim',
              value: {
                success: 4,
                total: 4,
                total_errors: 0,
                duration: { counts: [4], values: [100] },
                duration_values: [10, 10, 10, 10],
              },
            });
            expect(metrics[4]).toEqual({
              key: 'task_claim',
              value: {
                success: 4,
                total: 5,
                total_errors: 1,
                duration: { counts: [4], values: [100] },
                duration_values: [10, 10, 10, 10],
              },
            });
            expect(metrics[5]).toEqual({
              key: 'task_claim',
              value: {
                success: 5,
                total: 6,
                total_errors: 1,
                duration: { counts: [5], values: [100] },
                duration_values: [10, 10, 10, 10, 10],
              },
            });
            // reset interval fired here but stats should not clear
            expect(metrics[6]).toEqual({
              key: 'task_claim',
              value: {
                success: 6,
                total: 7,
                total_errors: 1,
                duration: { counts: [6], values: [100] },
                duration_values: [10, 10, 10, 10, 10, 10],
              },
            });
            expect(metrics[7]).toEqual({
              key: 'task_claim',
              value: {
                success: 6,
                total: 8,
                total_errors: 2,
                duration: { counts: [6], values: [100] },
                duration_values: [10, 10, 10, 10, 10, 10],
              },
            });
            expect(metrics[8]).toEqual({
              key: 'task_claim',
              value: {
                success: 6,
                total: 9,
                total_errors: 3,
                duration: { counts: [6], values: [100] },
                duration_values: [10, 10, 10, 10, 10, 10],
              },
            });
            expect(metrics[9]).toEqual({
              key: 'task_claim',
              value: {
                success: 7,
                total: 10,
                total_errors: 3,
                duration: { counts: [7], values: [100] },
                duration_values: [10, 10, 10, 10, 10, 10, 10],
              },
            });
            expect(metrics[10]).toEqual({
              key: 'task_claim',
              value: {
                success: 8,
                total: 11,
                total_errors: 3,
                duration: { counts: [8], values: [100] },
                duration_values: [10, 10, 10, 10, 10, 10, 10, 10],
              },
            });
            // reset interval fired here and stats should have cleared
            expect(metrics[11]).toEqual({
              key: 'task_claim',
              value: {
                success: 1,
                total: 1,
                total_errors: 0,
                duration: { counts: [1], values: [100] },
                duration_values: [10],
              },
            });
            resolve();
          });

        // reset$ event at 10 seconds
        clock.tick(10);
        reset$.next(true);
        for (const event of events1) {
          events$.next(event);
        }
        // metrics reset event but counts should not reset
        clock.tick(40);
        for (const event of events2) {
          events$.next(event);
        }
        // metric reset event should clear
        clock.tick(50);
        events$.next(taskClaimSuccessEvent);

        clock.restore();
      });
    });
  });

  describe('with TaskRunMetricsAggregator', () => {
    test('returns a cumulative count of successful task runs, on time task runs and total task runs, broken down by type, along with histogram of run delays', async () => {
      const taskRunEvents = [
        getTaskManagerStatEvent(3.234),
        getTaskRunSuccessEvent('alerting:example'),
        getTaskManagerStatEvent(10.45),
        getTaskRunSuccessEvent('telemetry'),
        getTaskManagerStatEvent(3.454),
        getTaskRunSuccessEvent('alerting:example'),
        getTaskManagerStatEvent(35.45),
        getTaskRunSuccessEvent('report'),
        getTaskManagerStatEvent(8.85673),
        getTaskRunFailedEvent('alerting:example'),
        getTaskManagerStatEvent(4.5745),
        getTaskRunSuccessEvent('alerting:.index-threshold'),
        getTaskManagerStatEvent(11.564),
        getTaskRunSuccessEvent('alerting:example'),
        getTaskManagerStatEvent(3.78),
        getTaskRunFailedEvent('alerting:example'),
        getTaskManagerStatEvent(3.7863),
        getTaskRunSuccessEvent('alerting:example'),
        getTaskManagerStatEvent(3.245),
        getTaskRunFailedEvent('actions:webhook'),
      ];
      const events$ = new Subject<TaskLifecycleEvent>();

      const taskRunAggregator = createAggregator({
        key: 'task_run',
        events$,
        config,
        reset$: new Subject<boolean>(),
        eventFilter: (event: TaskLifecycleEvent) =>
          isTaskRunEvent(event) || isTaskManagerStatEvent(event),
        metricsAggregator: new TaskRunMetricsAggregator(logger),
      });

      return new Promise<void>((resolve) => {
        taskRunAggregator
          .pipe(
            // skip initial metric which is just initialized data which
            // ensures we don't stall on combineLatest
            skip(1),
            take(taskRunEvents.length),
            bufferCount(taskRunEvents.length)
          )
          .subscribe((metrics: Array<AggregatedStat<TaskRunMetric>>) => {
            expect(metrics[0]).toEqual({
              key: 'task_run',
              value: {
                overall: {
                  success: 0,
                  not_timed_out: 0,
                  total: 0,
                  delay: { counts: [1], values: [10] },
                  delay_values: [3],
                  framework_errors: 0,
                  user_errors: 0,
                  total_errors: 0,
                  rescheduled_failures: 0,
                  duration: { counts: [], values: [] },
                  duration_values: [],
                },
              },
            });
            expect(metrics[1]).toEqual({
              key: 'task_run',
              value: {
                overall: {
                  success: 1,
                  not_timed_out: 1,
                  total: 1,
                  delay: { counts: [1], values: [10] },
                  delay_values: [3],
                  framework_errors: 0,
                  user_errors: 0,
                  total_errors: 0,
                  rescheduled_failures: 0,
                  duration: { counts: [1], values: [10000] },
                  duration_values: [10],
                },
                by_type: {
                  alerting: {
                    success: 1,
                    not_timed_out: 1,
                    total: 1,
                    framework_errors: 0,
                    user_errors: 0,
                    total_errors: 0,
                    rescheduled_failures: 0,
                    duration: { counts: [1], values: [10000] },
                    duration_values: [10],
                  },
                  'alerting:example': {
                    success: 1,
                    not_timed_out: 1,
                    total: 1,
                    framework_errors: 0,
                    user_errors: 0,
                    total_errors: 0,
                    rescheduled_failures: 0,
                    duration: { counts: [1], values: [10000] },
                    duration_values: [10],
                  },
                },
              },
            });
            expect(metrics[2]).toEqual({
              key: 'task_run',
              value: {
                overall: {
                  success: 1,
                  not_timed_out: 1,
                  total: 1,
                  delay: { counts: [1, 1], values: [10, 20] },
                  delay_values: [3, 10],
                  framework_errors: 0,
                  user_errors: 0,
                  total_errors: 0,
                  rescheduled_failures: 0,
                  duration: { counts: [1], values: [10000] },
                  duration_values: [10],
                },
                by_type: {
                  alerting: {
                    success: 1,
                    not_timed_out: 1,
                    total: 1,
                    framework_errors: 0,
                    user_errors: 0,
                    total_errors: 0,
                    rescheduled_failures: 0,
                    duration: { counts: [1], values: [10000] },
                    duration_values: [10],
                  },
                  'alerting:example': {
                    success: 1,
                    not_timed_out: 1,
                    total: 1,
                    framework_errors: 0,
                    user_errors: 0,
                    total_errors: 0,
                    rescheduled_failures: 0,
                    duration: { counts: [1], values: [10000] },
                    duration_values: [10],
                  },
                },
              },
            });
            expect(metrics[3]).toEqual({
              key: 'task_run',
              value: {
                overall: {
                  success: 2,
                  not_timed_out: 2,
                  total: 2,
                  delay: { counts: [1, 1], values: [10, 20] },
                  delay_values: [3, 10],
                  framework_errors: 0,
                  user_errors: 0,
                  total_errors: 0,
                  rescheduled_failures: 0,
                  duration: { counts: [2], values: [10000] },
                  duration_values: [10, 10],
                },
                by_type: {
                  alerting: {
                    success: 1,
                    not_timed_out: 1,
                    total: 1,
                    framework_errors: 0,
                    user_errors: 0,
                    total_errors: 0,
                    rescheduled_failures: 0,
                    duration: { counts: [1], values: [10000] },
                    duration_values: [10],
                  },
                  'alerting:example': {
                    success: 1,
                    not_timed_out: 1,
                    total: 1,
                    framework_errors: 0,
                    user_errors: 0,
                    total_errors: 0,
                    rescheduled_failures: 0,
                    duration: { counts: [1], values: [10000] },
                    duration_values: [10],
                  },
                  telemetry: {
                    success: 1,
                    not_timed_out: 1,
                    total: 1,
                    framework_errors: 0,
                    user_errors: 0,
                    total_errors: 0,
                    rescheduled_failures: 0,
                    duration: { counts: [1], values: [10000] },
                    duration_values: [10],
                  },
                },
              },
            });
            expect(metrics[4]).toEqual({
              key: 'task_run',
              value: {
                overall: {
                  success: 2,
                  not_timed_out: 2,
                  total: 2,
                  delay: { counts: [2, 1], values: [10, 20] },
                  delay_values: [3, 10, 3],
                  framework_errors: 0,
                  user_errors: 0,
                  total_errors: 0,
                  rescheduled_failures: 0,
                  duration: { counts: [2], values: [10000] },
                  duration_values: [10, 10],
                },
                by_type: {
                  alerting: {
                    success: 1,
                    not_timed_out: 1,
                    total: 1,
                    framework_errors: 0,
                    user_errors: 0,
                    total_errors: 0,
                    rescheduled_failures: 0,
                    duration: { counts: [1], values: [10000] },
                    duration_values: [10],
                  },
                  'alerting:example': {
                    success: 1,
                    not_timed_out: 1,
                    total: 1,
                    framework_errors: 0,
                    user_errors: 0,
                    total_errors: 0,
                    rescheduled_failures: 0,
                    duration: { counts: [1], values: [10000] },
                    duration_values: [10],
                  },
                  telemetry: {
                    success: 1,
                    not_timed_out: 1,
                    total: 1,
                    framework_errors: 0,
                    user_errors: 0,
                    total_errors: 0,
                    rescheduled_failures: 0,
                    duration: { counts: [1], values: [10000] },
                    duration_values: [10],
                  },
                },
              },
            });
            expect(metrics[5]).toEqual({
              key: 'task_run',
              value: {
                overall: {
                  success: 3,
                  not_timed_out: 3,
                  total: 3,
                  delay: { counts: [2, 1], values: [10, 20] },
                  delay_values: [3, 10, 3],
                  framework_errors: 0,
                  user_errors: 0,
                  total_errors: 0,
                  rescheduled_failures: 0,
                  duration: { counts: [3], values: [10000] },
                  duration_values: [10, 10, 10],
                },
                by_type: {
                  alerting: {
                    success: 2,
                    not_timed_out: 2,
                    total: 2,
                    framework_errors: 0,
                    user_errors: 0,
                    total_errors: 0,
                    rescheduled_failures: 0,
                    duration: { counts: [2], values: [10000] },
                    duration_values: [10, 10],
                  },
                  'alerting:example': {
                    success: 2,
                    not_timed_out: 2,
                    total: 2,
                    framework_errors: 0,
                    user_errors: 0,
                    total_errors: 0,
                    rescheduled_failures: 0,
                    duration: { counts: [2], values: [10000] },
                    duration_values: [10, 10],
                  },
                  telemetry: {
                    success: 1,
                    not_timed_out: 1,
                    total: 1,
                    framework_errors: 0,
                    user_errors: 0,
                    total_errors: 0,
                    rescheduled_failures: 0,
                    duration: { counts: [1], values: [10000] },
                    duration_values: [10],
                  },
                },
              },
            });
            expect(metrics[6]).toEqual({
              key: 'task_run',
              value: {
                overall: {
                  success: 3,
                  not_timed_out: 3,
                  total: 3,
                  delay: { counts: [2, 1, 0, 1], values: [10, 20, 30, 40] },
                  delay_values: [3, 10, 3, 35],
                  framework_errors: 0,
                  user_errors: 0,
                  total_errors: 0,
                  rescheduled_failures: 0,
                  duration: { counts: [3], values: [10000] },
                  duration_values: [10, 10, 10],
                },
                by_type: {
                  alerting: {
                    success: 2,
                    not_timed_out: 2,
                    total: 2,
                    framework_errors: 0,
                    user_errors: 0,
                    total_errors: 0,
                    rescheduled_failures: 0,
                    duration: { counts: [2], values: [10000] },
                    duration_values: [10, 10],
                  },
                  'alerting:example': {
                    success: 2,
                    not_timed_out: 2,
                    total: 2,
                    framework_errors: 0,
                    user_errors: 0,
                    total_errors: 0,
                    rescheduled_failures: 0,
                    duration: { counts: [2], values: [10000] },
                    duration_values: [10, 10],
                  },
                  telemetry: {
                    success: 1,
                    not_timed_out: 1,
                    total: 1,
                    framework_errors: 0,
                    user_errors: 0,
                    total_errors: 0,
                    rescheduled_failures: 0,
                    duration: { counts: [1], values: [10000] },
                    duration_values: [10],
                  },
                },
              },
            });
            expect(metrics[7]).toEqual({
              key: 'task_run',
              value: {
                overall: {
                  success: 4,
                  not_timed_out: 4,
                  total: 4,
                  delay: { counts: [2, 1, 0, 1], values: [10, 20, 30, 40] },
                  delay_values: [3, 10, 3, 35],
                  framework_errors: 0,
                  user_errors: 0,
                  total_errors: 0,
                  rescheduled_failures: 0,
                  duration: { counts: [4], values: [10000] },
                  duration_values: [10, 10, 10, 10],
                },
                by_type: {
                  alerting: {
                    success: 2,
                    not_timed_out: 2,
                    total: 2,
                    framework_errors: 0,
                    user_errors: 0,
                    total_errors: 0,
                    rescheduled_failures: 0,
                    duration: { counts: [2], values: [10000] },
                    duration_values: [10, 10],
                  },
                  'alerting:example': {
                    success: 2,
                    not_timed_out: 2,
                    total: 2,
                    framework_errors: 0,
                    user_errors: 0,
                    total_errors: 0,
                    rescheduled_failures: 0,
                    duration: { counts: [2], values: [10000] },
                    duration_values: [10, 10],
                  },
                  report: {
                    success: 1,
                    not_timed_out: 1,
                    total: 1,
                    framework_errors: 0,
                    user_errors: 0,
                    total_errors: 0,
                    rescheduled_failures: 0,
                    duration: { counts: [1], values: [10000] },
                    duration_values: [10],
                  },
                  telemetry: {
                    success: 1,
                    not_timed_out: 1,
                    total: 1,
                    framework_errors: 0,
                    user_errors: 0,
                    total_errors: 0,
                    rescheduled_failures: 0,
                    duration: { counts: [1], values: [10000] },
                    duration_values: [10],
                  },
                },
              },
            });
            expect(metrics[8]).toEqual({
              key: 'task_run',
              value: {
                overall: {
                  success: 4,
                  not_timed_out: 4,
                  total: 4,
                  delay: { counts: [3, 1, 0, 1], values: [10, 20, 30, 40] },
                  delay_values: [3, 10, 3, 35, 9],
                  framework_errors: 0,
                  user_errors: 0,
                  total_errors: 0,
                  rescheduled_failures: 0,
                  duration: { counts: [4], values: [10000] },
                  duration_values: [10, 10, 10, 10],
                },
                by_type: {
                  alerting: {
                    success: 2,
                    not_timed_out: 2,
                    total: 2,
                    framework_errors: 0,
                    user_errors: 0,
                    total_errors: 0,
                    rescheduled_failures: 0,
                    duration: { counts: [2], values: [10000] },
                    duration_values: [10, 10],
                  },
                  'alerting:example': {
                    success: 2,
                    not_timed_out: 2,
                    total: 2,
                    framework_errors: 0,
                    user_errors: 0,
                    total_errors: 0,
                    rescheduled_failures: 0,
                    duration: { counts: [2], values: [10000] },
                    duration_values: [10, 10],
                  },
                  report: {
                    success: 1,
                    not_timed_out: 1,
                    total: 1,
                    framework_errors: 0,
                    user_errors: 0,
                    total_errors: 0,
                    rescheduled_failures: 0,
                    duration: { counts: [1], values: [10000] },
                    duration_values: [10],
                  },
                  telemetry: {
                    success: 1,
                    not_timed_out: 1,
                    total: 1,
                    framework_errors: 0,
                    user_errors: 0,
                    total_errors: 0,
                    rescheduled_failures: 0,
                    duration: { counts: [1], values: [10000] },
                    duration_values: [10],
                  },
                },
              },
            });
            expect(metrics[9]).toEqual({
              key: 'task_run',
              value: {
                overall: {
                  success: 4,
                  not_timed_out: 5,
                  total: 5,
                  delay: { counts: [3, 1, 0, 1], values: [10, 20, 30, 40] },
                  delay_values: [3, 10, 3, 35, 9],
                  framework_errors: 1,
                  user_errors: 0,
                  total_errors: 1,
                  rescheduled_failures: 0,
                  duration: { counts: [4], values: [10000] },
                  duration_values: [10, 10, 10, 10],
                },
                by_type: {
                  alerting: {
                    success: 2,
                    not_timed_out: 3,
                    total: 3,
                    framework_errors: 1,
                    user_errors: 0,
                    total_errors: 1,
                    rescheduled_failures: 0,
                    duration: { counts: [2], values: [10000] },
                    duration_values: [10, 10],
                  },
                  'alerting:example': {
                    success: 2,
                    not_timed_out: 3,
                    total: 3,
                    framework_errors: 1,
                    user_errors: 0,
                    total_errors: 1,
                    rescheduled_failures: 0,
                    duration: { counts: [2], values: [10000] },
                    duration_values: [10, 10],
                  },
                  report: {
                    success: 1,
                    not_timed_out: 1,
                    total: 1,
                    framework_errors: 0,
                    user_errors: 0,
                    total_errors: 0,
                    rescheduled_failures: 0,
                    duration: { counts: [1], values: [10000] },
                    duration_values: [10],
                  },
                  telemetry: {
                    success: 1,
                    not_timed_out: 1,
                    total: 1,
                    framework_errors: 0,
                    user_errors: 0,
                    total_errors: 0,
                    rescheduled_failures: 0,
                    duration: { counts: [1], values: [10000] },
                    duration_values: [10],
                  },
                },
              },
            });
            expect(metrics[10]).toEqual({
              key: 'task_run',
              value: {
                overall: {
                  success: 4,
                  not_timed_out: 5,
                  total: 5,
                  delay: { counts: [4, 1, 0, 1], values: [10, 20, 30, 40] },
                  delay_values: [3, 10, 3, 35, 9, 5],
                  framework_errors: 1,
                  user_errors: 0,
                  total_errors: 1,
                  rescheduled_failures: 0,
                  duration: { counts: [4], values: [10000] },
                  duration_values: [10, 10, 10, 10],
                },
                by_type: {
                  alerting: {
                    success: 2,
                    not_timed_out: 3,
                    total: 3,
                    framework_errors: 1,
                    user_errors: 0,
                    total_errors: 1,
                    rescheduled_failures: 0,
                    duration: { counts: [2], values: [10000] },
                    duration_values: [10, 10],
                  },
                  'alerting:example': {
                    success: 2,
                    not_timed_out: 3,
                    total: 3,
                    framework_errors: 1,
                    user_errors: 0,
                    total_errors: 1,
                    rescheduled_failures: 0,
                    duration: { counts: [2], values: [10000] },
                    duration_values: [10, 10],
                  },
                  report: {
                    success: 1,
                    not_timed_out: 1,
                    total: 1,
                    framework_errors: 0,
                    user_errors: 0,
                    total_errors: 0,
                    rescheduled_failures: 0,
                    duration: { counts: [1], values: [10000] },
                    duration_values: [10],
                  },
                  telemetry: {
                    success: 1,
                    not_timed_out: 1,
                    total: 1,
                    framework_errors: 0,
                    user_errors: 0,
                    total_errors: 0,
                    rescheduled_failures: 0,
                    duration: { counts: [1], values: [10000] },
                    duration_values: [10],
                  },
                },
              },
            });
            expect(metrics[11]).toEqual({
              key: 'task_run',
              value: {
                overall: {
                  success: 5,
                  not_timed_out: 6,
                  total: 6,
                  delay: { counts: [4, 1, 0, 1], values: [10, 20, 30, 40] },
                  delay_values: [3, 10, 3, 35, 9, 5],
                  framework_errors: 1,
                  user_errors: 0,
                  total_errors: 1,
                  rescheduled_failures: 0,
                  duration: { counts: [5], values: [10000] },
                  duration_values: [10, 10, 10, 10, 10],
                },
                by_type: {
                  alerting: {
                    success: 3,
                    not_timed_out: 4,
                    total: 4,
                    framework_errors: 1,
                    user_errors: 0,
                    total_errors: 1,
                    rescheduled_failures: 0,
                    duration: { counts: [3], values: [10000] },
                    duration_values: [10, 10, 10],
                  },
                  'alerting:__index-threshold': {
                    success: 1,
                    not_timed_out: 1,
                    total: 1,
                    framework_errors: 0,
                    user_errors: 0,
                    total_errors: 0,
                    rescheduled_failures: 0,
                    duration: { counts: [1], values: [10000] },
                    duration_values: [10],
                  },
                  'alerting:example': {
                    success: 2,
                    not_timed_out: 3,
                    total: 3,
                    framework_errors: 1,
                    user_errors: 0,
                    total_errors: 1,
                    rescheduled_failures: 0,
                    duration: { counts: [2], values: [10000] },
                    duration_values: [10, 10],
                  },
                  report: {
                    success: 1,
                    not_timed_out: 1,
                    total: 1,
                    framework_errors: 0,
                    user_errors: 0,
                    total_errors: 0,
                    rescheduled_failures: 0,
                    duration: { counts: [1], values: [10000] },
                    duration_values: [10],
                  },
                  telemetry: {
                    success: 1,
                    not_timed_out: 1,
                    total: 1,
                    framework_errors: 0,
                    user_errors: 0,
                    total_errors: 0,
                    rescheduled_failures: 0,
                    duration: { counts: [1], values: [10000] },
                    duration_values: [10],
                  },
                },
              },
            });
            expect(metrics[12]).toEqual({
              key: 'task_run',
              value: {
                overall: {
                  success: 5,
                  not_timed_out: 6,
                  total: 6,
                  delay: { counts: [4, 2, 0, 1], values: [10, 20, 30, 40] },
                  delay_values: [3, 10, 3, 35, 9, 5, 12],
                  framework_errors: 1,
                  user_errors: 0,
                  total_errors: 1,
                  rescheduled_failures: 0,
                  duration: { counts: [5], values: [10000] },
                  duration_values: [10, 10, 10, 10, 10],
                },
                by_type: {
                  alerting: {
                    success: 3,
                    not_timed_out: 4,
                    total: 4,
                    framework_errors: 1,
                    user_errors: 0,
                    total_errors: 1,
                    rescheduled_failures: 0,
                    duration: { counts: [3], values: [10000] },
                    duration_values: [10, 10, 10],
                  },
                  'alerting:__index-threshold': {
                    success: 1,
                    not_timed_out: 1,
                    total: 1,
                    framework_errors: 0,
                    user_errors: 0,
                    total_errors: 0,
                    rescheduled_failures: 0,
                    duration: { counts: [1], values: [10000] },
                    duration_values: [10],
                  },
                  'alerting:example': {
                    success: 2,
                    not_timed_out: 3,
                    total: 3,
                    framework_errors: 1,
                    user_errors: 0,
                    total_errors: 1,
                    rescheduled_failures: 0,
                    duration: { counts: [2], values: [10000] },
                    duration_values: [10, 10],
                  },
                  report: {
                    success: 1,
                    not_timed_out: 1,
                    total: 1,
                    framework_errors: 0,
                    user_errors: 0,
                    total_errors: 0,
                    rescheduled_failures: 0,
                    duration: { counts: [1], values: [10000] },
                    duration_values: [10],
                  },
                  telemetry: {
                    success: 1,
                    not_timed_out: 1,
                    total: 1,
                    framework_errors: 0,
                    user_errors: 0,
                    total_errors: 0,
                    rescheduled_failures: 0,
                    duration: { counts: [1], values: [10000] },
                    duration_values: [10],
                  },
                },
              },
            });
            expect(metrics[13]).toEqual({
              key: 'task_run',
              value: {
                overall: {
                  success: 6,
                  not_timed_out: 7,
                  total: 7,
                  delay: { counts: [4, 2, 0, 1], values: [10, 20, 30, 40] },
                  delay_values: [3, 10, 3, 35, 9, 5, 12],
                  framework_errors: 1,
                  user_errors: 0,
                  total_errors: 1,
                  rescheduled_failures: 0,
                  duration: { counts: [6], values: [10000] },
                  duration_values: [10, 10, 10, 10, 10, 10],
                },
                by_type: {
                  alerting: {
                    success: 4,
                    not_timed_out: 5,
                    total: 5,
                    framework_errors: 1,
                    user_errors: 0,
                    total_errors: 1,
                    rescheduled_failures: 0,
                    duration: { counts: [4], values: [10000] },
                    duration_values: [10, 10, 10, 10],
                  },
                  'alerting:__index-threshold': {
                    success: 1,
                    not_timed_out: 1,
                    total: 1,
                    framework_errors: 0,
                    user_errors: 0,
                    total_errors: 0,
                    rescheduled_failures: 0,
                    duration: { counts: [1], values: [10000] },
                    duration_values: [10],
                  },
                  'alerting:example': {
                    success: 3,
                    not_timed_out: 4,
                    total: 4,
                    framework_errors: 1,
                    user_errors: 0,
                    total_errors: 1,
                    rescheduled_failures: 0,
                    duration: { counts: [3], values: [10000] },
                    duration_values: [10, 10, 10],
                  },
                  report: {
                    success: 1,
                    not_timed_out: 1,
                    total: 1,
                    framework_errors: 0,
                    user_errors: 0,
                    total_errors: 0,
                    rescheduled_failures: 0,
                    duration: { counts: [1], values: [10000] },
                    duration_values: [10],
                  },
                  telemetry: {
                    success: 1,
                    not_timed_out: 1,
                    total: 1,
                    framework_errors: 0,
                    user_errors: 0,
                    total_errors: 0,
                    rescheduled_failures: 0,
                    duration: { counts: [1], values: [10000] },
                    duration_values: [10],
                  },
                },
              },
            });
            expect(metrics[14]).toEqual({
              key: 'task_run',
              value: {
                overall: {
                  success: 6,
                  not_timed_out: 7,
                  total: 7,
                  delay: { counts: [5, 2, 0, 1], values: [10, 20, 30, 40] },
                  delay_values: [3, 10, 3, 35, 9, 5, 12, 4],
                  framework_errors: 1,
                  user_errors: 0,
                  total_errors: 1,
                  rescheduled_failures: 0,
                  duration: { counts: [6], values: [10000] },
                  duration_values: [10, 10, 10, 10, 10, 10],
                },
                by_type: {
                  alerting: {
                    success: 4,
                    not_timed_out: 5,
                    total: 5,
                    framework_errors: 1,
                    user_errors: 0,
                    total_errors: 1,
                    rescheduled_failures: 0,
                    duration: { counts: [4], values: [10000] },
                    duration_values: [10, 10, 10, 10],
                  },
                  'alerting:__index-threshold': {
                    success: 1,
                    not_timed_out: 1,
                    total: 1,
                    framework_errors: 0,
                    user_errors: 0,
                    total_errors: 0,
                    rescheduled_failures: 0,
                    duration: { counts: [1], values: [10000] },
                    duration_values: [10],
                  },
                  'alerting:example': {
                    success: 3,
                    not_timed_out: 4,
                    total: 4,
                    framework_errors: 1,
                    user_errors: 0,
                    total_errors: 1,
                    rescheduled_failures: 0,
                    duration: { counts: [3], values: [10000] },
                    duration_values: [10, 10, 10],
                  },
                  report: {
                    success: 1,
                    not_timed_out: 1,
                    total: 1,
                    framework_errors: 0,
                    user_errors: 0,
                    total_errors: 0,
                    rescheduled_failures: 0,
                    duration: { counts: [1], values: [10000] },
                    duration_values: [10],
                  },
                  telemetry: {
                    success: 1,
                    not_timed_out: 1,
                    total: 1,
                    framework_errors: 0,
                    user_errors: 0,
                    total_errors: 0,
                    rescheduled_failures: 0,
                    duration: { counts: [1], values: [10000] },
                    duration_values: [10],
                  },
                },
              },
            });
            expect(metrics[15]).toEqual({
              key: 'task_run',
              value: {
                overall: {
                  success: 6,
                  not_timed_out: 8,
                  total: 8,
                  delay: { counts: [5, 2, 0, 1], values: [10, 20, 30, 40] },
                  delay_values: [3, 10, 3, 35, 9, 5, 12, 4],
                  framework_errors: 2,
                  user_errors: 0,
                  total_errors: 2,
                  rescheduled_failures: 0,
                  duration: { counts: [6], values: [10000] },
                  duration_values: [10, 10, 10, 10, 10, 10],
                },
                by_type: {
                  alerting: {
                    success: 4,
                    not_timed_out: 6,
                    total: 6,
                    framework_errors: 2,
                    user_errors: 0,
                    total_errors: 2,
                    rescheduled_failures: 0,
                    duration: { counts: [4], values: [10000] },
                    duration_values: [10, 10, 10, 10],
                  },
                  'alerting:__index-threshold': {
                    success: 1,
                    not_timed_out: 1,
                    total: 1,
                    framework_errors: 0,
                    user_errors: 0,
                    total_errors: 0,
                    rescheduled_failures: 0,
                    duration: { counts: [1], values: [10000] },
                    duration_values: [10],
                  },
                  'alerting:example': {
                    success: 3,
                    not_timed_out: 5,
                    total: 5,
                    framework_errors: 2,
                    user_errors: 0,
                    total_errors: 2,
                    rescheduled_failures: 0,
                    duration: { counts: [3], values: [10000] },
                    duration_values: [10, 10, 10],
                  },
                  report: {
                    success: 1,
                    not_timed_out: 1,
                    total: 1,
                    framework_errors: 0,
                    user_errors: 0,
                    total_errors: 0,
                    rescheduled_failures: 0,
                    duration: { counts: [1], values: [10000] },
                    duration_values: [10],
                  },
                  telemetry: {
                    success: 1,
                    not_timed_out: 1,
                    total: 1,
                    framework_errors: 0,
                    user_errors: 0,
                    total_errors: 0,
                    rescheduled_failures: 0,
                    duration: { counts: [1], values: [10000] },
                    duration_values: [10],
                  },
                },
              },
            });
            expect(metrics[16]).toEqual({
              key: 'task_run',
              value: {
                overall: {
                  success: 6,
                  not_timed_out: 8,
                  total: 8,
                  delay: { counts: [6, 2, 0, 1], values: [10, 20, 30, 40] },
                  delay_values: [3, 10, 3, 35, 9, 5, 12, 4, 4],
                  framework_errors: 2,
                  user_errors: 0,
                  total_errors: 2,
                  rescheduled_failures: 0,
                  duration: { counts: [6], values: [10000] },
                  duration_values: [10, 10, 10, 10, 10, 10],
                },
                by_type: {
                  alerting: {
                    success: 4,
                    not_timed_out: 6,
                    total: 6,
                    framework_errors: 2,
                    user_errors: 0,
                    total_errors: 2,
                    rescheduled_failures: 0,
                    duration: { counts: [4], values: [10000] },
                    duration_values: [10, 10, 10, 10],
                  },
                  'alerting:__index-threshold': {
                    success: 1,
                    not_timed_out: 1,
                    total: 1,
                    framework_errors: 0,
                    user_errors: 0,
                    total_errors: 0,
                    rescheduled_failures: 0,
                    duration: { counts: [1], values: [10000] },
                    duration_values: [10],
                  },
                  'alerting:example': {
                    success: 3,
                    not_timed_out: 5,
                    total: 5,
                    framework_errors: 2,
                    user_errors: 0,
                    total_errors: 2,
                    rescheduled_failures: 0,
                    duration: { counts: [3], values: [10000] },
                    duration_values: [10, 10, 10],
                  },
                  report: {
                    success: 1,
                    not_timed_out: 1,
                    total: 1,
                    framework_errors: 0,
                    user_errors: 0,
                    total_errors: 0,
                    rescheduled_failures: 0,
                    duration: { counts: [1], values: [10000] },
                    duration_values: [10],
                  },
                  telemetry: {
                    success: 1,
                    not_timed_out: 1,
                    total: 1,
                    framework_errors: 0,
                    user_errors: 0,
                    total_errors: 0,
                    rescheduled_failures: 0,
                    duration: { counts: [1], values: [10000] },
                    duration_values: [10],
                  },
                },
              },
            });
            expect(metrics[17]).toEqual({
              key: 'task_run',
              value: {
                overall: {
                  success: 7,
                  not_timed_out: 9,
                  total: 9,
                  delay: { counts: [6, 2, 0, 1], values: [10, 20, 30, 40] },
                  delay_values: [3, 10, 3, 35, 9, 5, 12, 4, 4],
                  framework_errors: 2,
                  user_errors: 0,
                  total_errors: 2,
                  rescheduled_failures: 0,
                  duration: { counts: [7], values: [10000] },
                  duration_values: [10, 10, 10, 10, 10, 10, 10],
                },
                by_type: {
                  alerting: {
                    success: 5,
                    not_timed_out: 7,
                    total: 7,
                    framework_errors: 2,
                    user_errors: 0,
                    total_errors: 2,
                    rescheduled_failures: 0,
                    duration: { counts: [5], values: [10000] },
                    duration_values: [10, 10, 10, 10, 10],
                  },
                  'alerting:__index-threshold': {
                    success: 1,
                    not_timed_out: 1,
                    total: 1,
                    framework_errors: 0,
                    user_errors: 0,
                    total_errors: 0,
                    rescheduled_failures: 0,
                    duration: { counts: [1], values: [10000] },
                    duration_values: [10],
                  },
                  'alerting:example': {
                    success: 4,
                    not_timed_out: 6,
                    total: 6,
                    framework_errors: 2,
                    user_errors: 0,
                    total_errors: 2,
                    rescheduled_failures: 0,
                    duration: { counts: [4], values: [10000] },
                    duration_values: [10, 10, 10, 10],
                  },
                  report: {
                    success: 1,
                    not_timed_out: 1,
                    total: 1,
                    framework_errors: 0,
                    user_errors: 0,
                    total_errors: 0,
                    rescheduled_failures: 0,
                    duration: { counts: [1], values: [10000] },
                    duration_values: [10],
                  },
                  telemetry: {
                    success: 1,
                    not_timed_out: 1,
                    total: 1,
                    framework_errors: 0,
                    user_errors: 0,
                    total_errors: 0,
                    rescheduled_failures: 0,
                    duration: { counts: [1], values: [10000] },
                    duration_values: [10],
                  },
                },
              },
            });
            expect(metrics[18]).toEqual({
              key: 'task_run',
              value: {
                overall: {
                  success: 7,
                  not_timed_out: 9,
                  total: 9,
                  delay: { counts: [7, 2, 0, 1], values: [10, 20, 30, 40] },
                  delay_values: [3, 10, 3, 35, 9, 5, 12, 4, 4, 3],
                  framework_errors: 2,
                  user_errors: 0,
                  total_errors: 2,
                  rescheduled_failures: 0,
                  duration: { counts: [7], values: [10000] },
                  duration_values: [10, 10, 10, 10, 10, 10, 10],
                },
                by_type: {
                  alerting: {
                    success: 5,
                    not_timed_out: 7,
                    total: 7,
                    framework_errors: 2,
                    user_errors: 0,
                    total_errors: 2,
                    rescheduled_failures: 0,
                    duration: { counts: [5], values: [10000] },
                    duration_values: [10, 10, 10, 10, 10],
                  },
                  'alerting:__index-threshold': {
                    success: 1,
                    not_timed_out: 1,
                    total: 1,
                    framework_errors: 0,
                    user_errors: 0,
                    total_errors: 0,
                    rescheduled_failures: 0,
                    duration: { counts: [1], values: [10000] },
                    duration_values: [10],
                  },
                  'alerting:example': {
                    success: 4,
                    not_timed_out: 6,
                    total: 6,
                    framework_errors: 2,
                    user_errors: 0,
                    total_errors: 2,
                    rescheduled_failures: 0,
                    duration: { counts: [4], values: [10000] },
                    duration_values: [10, 10, 10, 10],
                  },
                  report: {
                    success: 1,
                    not_timed_out: 1,
                    total: 1,
                    framework_errors: 0,
                    user_errors: 0,
                    total_errors: 0,
                    rescheduled_failures: 0,
                    duration: { counts: [1], values: [10000] },
                    duration_values: [10],
                  },
                  telemetry: {
                    success: 1,
                    not_timed_out: 1,
                    total: 1,
                    framework_errors: 0,
                    user_errors: 0,
                    total_errors: 0,
                    rescheduled_failures: 0,
                    duration: { counts: [1], values: [10000] },
                    duration_values: [10],
                  },
                },
              },
            });
            expect(metrics[19]).toEqual({
              key: 'task_run',
              value: {
                overall: {
                  success: 7,
                  not_timed_out: 10,
                  total: 10,
                  delay: { counts: [7, 2, 0, 1], values: [10, 20, 30, 40] },
                  delay_values: [3, 10, 3, 35, 9, 5, 12, 4, 4, 3],
                  framework_errors: 3,
                  user_errors: 0,
                  total_errors: 3,
                  rescheduled_failures: 0,
                  duration: { counts: [7], values: [10000] },
                  duration_values: [10, 10, 10, 10, 10, 10, 10],
                },
                by_type: {
                  actions: {
                    success: 0,
                    not_timed_out: 1,
                    total: 1,
                    framework_errors: 1,
                    user_errors: 0,
                    total_errors: 1,
                    rescheduled_failures: 0,
                    duration: { counts: [], values: [] },
                    duration_values: [],
                  },
                  alerting: {
                    success: 5,
                    not_timed_out: 7,
                    total: 7,
                    framework_errors: 2,
                    user_errors: 0,
                    total_errors: 2,
                    rescheduled_failures: 0,
                    duration: { counts: [5], values: [10000] },
                    duration_values: [10, 10, 10, 10, 10],
                  },
                  'actions:webhook': {
                    success: 0,
                    not_timed_out: 1,
                    total: 1,
                    framework_errors: 1,
                    user_errors: 0,
                    total_errors: 1,
                    rescheduled_failures: 0,
                    duration: { counts: [], values: [] },
                    duration_values: [],
                  },
                  'alerting:__index-threshold': {
                    success: 1,
                    not_timed_out: 1,
                    total: 1,
                    framework_errors: 0,
                    user_errors: 0,
                    total_errors: 0,
                    rescheduled_failures: 0,
                    duration: { counts: [1], values: [10000] },
                    duration_values: [10],
                  },
                  'alerting:example': {
                    success: 4,
                    not_timed_out: 6,
                    total: 6,
                    framework_errors: 2,
                    user_errors: 0,
                    total_errors: 2,
                    rescheduled_failures: 0,
                    duration: { counts: [4], values: [10000] },
                    duration_values: [10, 10, 10, 10],
                  },
                  report: {
                    success: 1,
                    not_timed_out: 1,
                    total: 1,
                    framework_errors: 0,
                    user_errors: 0,
                    total_errors: 0,
                    rescheduled_failures: 0,
                    duration: { counts: [1], values: [10000] },
                    duration_values: [10],
                  },
                  telemetry: {
                    success: 1,
                    not_timed_out: 1,
                    total: 1,
                    framework_errors: 0,
                    user_errors: 0,
                    total_errors: 0,
                    rescheduled_failures: 0,
                    duration: { counts: [1], values: [10000] },
                    duration_values: [10],
                  },
                },
              },
            });
            resolve();
          });

        for (const event of taskRunEvents) {
          events$.next(event);
        }
      });
    });

    test('resets count when resetMetric$ event is received', async () => {
      const reset$ = new Subject<boolean>();
      const taskRunEvents1 = [
        getTaskManagerStatEvent(3.234),
        getTaskRunSuccessEvent('alerting:example'),
        getTaskManagerStatEvent(10.45),
        getTaskRunSuccessEvent('telemetry'),
        getTaskManagerStatEvent(3.454),
        getTaskRunSuccessEvent('alerting:example'),
        getTaskManagerStatEvent(35.45),
        getTaskRunSuccessEvent('report'),
        getTaskManagerStatEvent(8.85673),
        getTaskRunFailedEvent('alerting:example'),
      ];

      const taskRunEvents2 = [
        getTaskManagerStatEvent(4.5745),
        getTaskRunSuccessEvent('alerting:example'),
        getTaskManagerStatEvent(11.564),
        getTaskRunSuccessEvent('alerting:example'),
        getTaskManagerStatEvent(3.78),
        getTaskRunFailedEvent('alerting:example'),
        getTaskManagerStatEvent(3.7863),
        getTaskRunSuccessEvent('alerting:example'),
        getTaskManagerStatEvent(3.245),
        getTaskRunFailedEvent('actions:webhook'),
      ];
      const events$ = new Subject<TaskLifecycleEvent>();

      const taskRunAggregator = createAggregator({
        key: 'task_run',
        events$,
        config,
        reset$,
        eventFilter: (event: TaskLifecycleEvent) =>
          isTaskRunEvent(event) || isTaskManagerStatEvent(event),
        metricsAggregator: new TaskRunMetricsAggregator(logger),
      });

      return new Promise<void>((resolve) => {
        taskRunAggregator
          .pipe(
            // skip initial metric which is just initialized data which
            // ensures we don't stall on combineLatest
            skip(1),
            take(taskRunEvents1.length + taskRunEvents2.length),
            bufferCount(taskRunEvents1.length + taskRunEvents2.length)
          )
          .subscribe((metrics: Array<AggregatedStat<TaskRunMetric>>) => {
            expect(metrics[0]).toEqual({
              key: 'task_run',
              value: {
                overall: {
                  success: 0,
                  not_timed_out: 0,
                  total: 0,
                  delay: { counts: [1], values: [10] },
                  delay_values: [3],
                  framework_errors: 0,
                  user_errors: 0,
                  total_errors: 0,
                  rescheduled_failures: 0,
                  duration: { counts: [], values: [] },
                  duration_values: [],
                },
              },
            });
            expect(metrics[1]).toEqual({
              key: 'task_run',
              value: {
                overall: {
                  success: 1,
                  not_timed_out: 1,
                  total: 1,
                  delay: { counts: [1], values: [10] },
                  delay_values: [3],
                  framework_errors: 0,
                  user_errors: 0,
                  total_errors: 0,
                  rescheduled_failures: 0,
                  duration: { counts: [1], values: [10000] },
                  duration_values: [10],
                },
                by_type: {
                  alerting: {
                    success: 1,
                    not_timed_out: 1,
                    total: 1,
                    framework_errors: 0,
                    user_errors: 0,
                    total_errors: 0,
                    rescheduled_failures: 0,
                    duration: { counts: [1], values: [10000] },
                    duration_values: [10],
                  },
                  'alerting:example': {
                    success: 1,
                    not_timed_out: 1,
                    total: 1,
                    framework_errors: 0,
                    user_errors: 0,
                    total_errors: 0,
                    rescheduled_failures: 0,
                    duration: { counts: [1], values: [10000] },
                    duration_values: [10],
                  },
                },
              },
            });
            expect(metrics[2]).toEqual({
              key: 'task_run',
              value: {
                overall: {
                  success: 1,
                  not_timed_out: 1,
                  total: 1,
                  delay: { counts: [1, 1], values: [10, 20] },
                  delay_values: [3, 10],
                  framework_errors: 0,
                  user_errors: 0,
                  total_errors: 0,
                  rescheduled_failures: 0,
                  duration: { counts: [1], values: [10000] },
                  duration_values: [10],
                },
                by_type: {
                  alerting: {
                    success: 1,
                    not_timed_out: 1,
                    total: 1,
                    framework_errors: 0,
                    user_errors: 0,
                    total_errors: 0,
                    rescheduled_failures: 0,
                    duration: { counts: [1], values: [10000] },
                    duration_values: [10],
                  },
                  'alerting:example': {
                    success: 1,
                    not_timed_out: 1,
                    total: 1,
                    framework_errors: 0,
                    user_errors: 0,
                    total_errors: 0,
                    rescheduled_failures: 0,
                    duration: { counts: [1], values: [10000] },
                    duration_values: [10],
                  },
                },
              },
            });
            expect(metrics[3]).toEqual({
              key: 'task_run',
              value: {
                overall: {
                  success: 2,
                  not_timed_out: 2,
                  total: 2,
                  delay: { counts: [1, 1], values: [10, 20] },
                  delay_values: [3, 10],
                  framework_errors: 0,
                  user_errors: 0,
                  total_errors: 0,
                  rescheduled_failures: 0,
                  duration: { counts: [2], values: [10000] },
                  duration_values: [10, 10],
                },
                by_type: {
                  alerting: {
                    success: 1,
                    not_timed_out: 1,
                    total: 1,
                    framework_errors: 0,
                    user_errors: 0,
                    total_errors: 0,
                    rescheduled_failures: 0,
                    duration: { counts: [1], values: [10000] },
                    duration_values: [10],
                  },
                  'alerting:example': {
                    success: 1,
                    not_timed_out: 1,
                    total: 1,
                    framework_errors: 0,
                    user_errors: 0,
                    total_errors: 0,
                    rescheduled_failures: 0,
                    duration: { counts: [1], values: [10000] },
                    duration_values: [10],
                  },
                  telemetry: {
                    success: 1,
                    not_timed_out: 1,
                    total: 1,
                    framework_errors: 0,
                    user_errors: 0,
                    total_errors: 0,
                    rescheduled_failures: 0,
                    duration: { counts: [1], values: [10000] },
                    duration_values: [10],
                  },
                },
              },
            });
            expect(metrics[4]).toEqual({
              key: 'task_run',
              value: {
                overall: {
                  success: 2,
                  not_timed_out: 2,
                  total: 2,
                  delay: { counts: [2, 1], values: [10, 20] },
                  delay_values: [3, 10, 3],
                  framework_errors: 0,
                  user_errors: 0,
                  total_errors: 0,
                  rescheduled_failures: 0,
                  duration: { counts: [2], values: [10000] },
                  duration_values: [10, 10],
                },
                by_type: {
                  alerting: {
                    success: 1,
                    not_timed_out: 1,
                    total: 1,
                    framework_errors: 0,
                    user_errors: 0,
                    total_errors: 0,
                    rescheduled_failures: 0,
                    duration: { counts: [1], values: [10000] },
                    duration_values: [10],
                  },
                  'alerting:example': {
                    success: 1,
                    not_timed_out: 1,
                    total: 1,
                    framework_errors: 0,
                    user_errors: 0,
                    total_errors: 0,
                    rescheduled_failures: 0,
                    duration: { counts: [1], values: [10000] },
                    duration_values: [10],
                  },
                  telemetry: {
                    success: 1,
                    not_timed_out: 1,
                    total: 1,
                    framework_errors: 0,
                    user_errors: 0,
                    total_errors: 0,
                    rescheduled_failures: 0,
                    duration: { counts: [1], values: [10000] },
                    duration_values: [10],
                  },
                },
              },
            });
            expect(metrics[5]).toEqual({
              key: 'task_run',
              value: {
                overall: {
                  success: 3,
                  not_timed_out: 3,
                  total: 3,
                  delay: { counts: [2, 1], values: [10, 20] },
                  delay_values: [3, 10, 3],
                  framework_errors: 0,
                  user_errors: 0,
                  total_errors: 0,
                  rescheduled_failures: 0,
                  duration: { counts: [3], values: [10000] },
                  duration_values: [10, 10, 10],
                },
                by_type: {
                  alerting: {
                    success: 2,
                    not_timed_out: 2,
                    total: 2,
                    framework_errors: 0,
                    user_errors: 0,
                    total_errors: 0,
                    rescheduled_failures: 0,
                    duration: { counts: [2], values: [10000] },
                    duration_values: [10, 10],
                  },
                  'alerting:example': {
                    success: 2,
                    not_timed_out: 2,
                    total: 2,
                    framework_errors: 0,
                    user_errors: 0,
                    total_errors: 0,
                    rescheduled_failures: 0,
                    duration: { counts: [2], values: [10000] },
                    duration_values: [10, 10],
                  },
                  telemetry: {
                    success: 1,
                    not_timed_out: 1,
                    total: 1,
                    framework_errors: 0,
                    user_errors: 0,
                    total_errors: 0,
                    rescheduled_failures: 0,
                    duration: { counts: [1], values: [10000] },
                    duration_values: [10],
                  },
                },
              },
            });
            expect(metrics[6]).toEqual({
              key: 'task_run',
              value: {
                overall: {
                  success: 3,
                  not_timed_out: 3,
                  total: 3,
                  delay: { counts: [2, 1, 0, 1], values: [10, 20, 30, 40] },
                  delay_values: [3, 10, 3, 35],
                  framework_errors: 0,
                  user_errors: 0,
                  total_errors: 0,
                  rescheduled_failures: 0,
                  duration: { counts: [3], values: [10000] },
                  duration_values: [10, 10, 10],
                },
                by_type: {
                  alerting: {
                    success: 2,
                    not_timed_out: 2,
                    total: 2,
                    framework_errors: 0,
                    user_errors: 0,
                    total_errors: 0,
                    rescheduled_failures: 0,
                    duration: { counts: [2], values: [10000] },
                    duration_values: [10, 10],
                  },
                  'alerting:example': {
                    success: 2,
                    not_timed_out: 2,
                    total: 2,
                    framework_errors: 0,
                    user_errors: 0,
                    total_errors: 0,
                    rescheduled_failures: 0,
                    duration: { counts: [2], values: [10000] },
                    duration_values: [10, 10],
                  },
                  telemetry: {
                    success: 1,
                    not_timed_out: 1,
                    total: 1,
                    framework_errors: 0,
                    user_errors: 0,
                    total_errors: 0,
                    rescheduled_failures: 0,
                    duration: { counts: [1], values: [10000] },
                    duration_values: [10],
                  },
                },
              },
            });
            expect(metrics[7]).toEqual({
              key: 'task_run',
              value: {
                overall: {
                  success: 4,
                  not_timed_out: 4,
                  total: 4,
                  delay: { counts: [2, 1, 0, 1], values: [10, 20, 30, 40] },
                  delay_values: [3, 10, 3, 35],
                  framework_errors: 0,
                  user_errors: 0,
                  total_errors: 0,
                  rescheduled_failures: 0,
                  duration: { counts: [4], values: [10000] },
                  duration_values: [10, 10, 10, 10],
                },
                by_type: {
                  alerting: {
                    success: 2,
                    not_timed_out: 2,
                    total: 2,
                    framework_errors: 0,
                    user_errors: 0,
                    total_errors: 0,
                    rescheduled_failures: 0,
                    duration: { counts: [2], values: [10000] },
                    duration_values: [10, 10],
                  },
                  'alerting:example': {
                    success: 2,
                    not_timed_out: 2,
                    total: 2,
                    framework_errors: 0,
                    user_errors: 0,
                    total_errors: 0,
                    rescheduled_failures: 0,
                    duration: { counts: [2], values: [10000] },
                    duration_values: [10, 10],
                  },
                  report: {
                    success: 1,
                    not_timed_out: 1,
                    total: 1,
                    framework_errors: 0,
                    user_errors: 0,
                    total_errors: 0,
                    rescheduled_failures: 0,
                    duration: { counts: [1], values: [10000] },
                    duration_values: [10],
                  },
                  telemetry: {
                    success: 1,
                    not_timed_out: 1,
                    total: 1,
                    framework_errors: 0,
                    user_errors: 0,
                    total_errors: 0,
                    rescheduled_failures: 0,
                    duration: { counts: [1], values: [10000] },
                    duration_values: [10],
                  },
                },
              },
            });
            expect(metrics[8]).toEqual({
              key: 'task_run',
              value: {
                overall: {
                  success: 4,
                  not_timed_out: 4,
                  total: 4,
                  delay: { counts: [3, 1, 0, 1], values: [10, 20, 30, 40] },
                  delay_values: [3, 10, 3, 35, 9],
                  framework_errors: 0,
                  user_errors: 0,
                  total_errors: 0,
                  rescheduled_failures: 0,
                  duration: { counts: [4], values: [10000] },
                  duration_values: [10, 10, 10, 10],
                },
                by_type: {
                  alerting: {
                    success: 2,
                    not_timed_out: 2,
                    total: 2,
                    framework_errors: 0,
                    user_errors: 0,
                    total_errors: 0,
                    rescheduled_failures: 0,
                    duration: { counts: [2], values: [10000] },
                    duration_values: [10, 10],
                  },
                  'alerting:example': {
                    success: 2,
                    not_timed_out: 2,
                    total: 2,
                    framework_errors: 0,
                    user_errors: 0,
                    total_errors: 0,
                    rescheduled_failures: 0,
                    duration: { counts: [2], values: [10000] },
                    duration_values: [10, 10],
                  },
                  report: {
                    success: 1,
                    not_timed_out: 1,
                    total: 1,
                    framework_errors: 0,
                    user_errors: 0,
                    total_errors: 0,
                    rescheduled_failures: 0,
                    duration: { counts: [1], values: [10000] },
                    duration_values: [10],
                  },
                  telemetry: {
                    success: 1,
                    not_timed_out: 1,
                    total: 1,
                    framework_errors: 0,
                    user_errors: 0,
                    total_errors: 0,
                    rescheduled_failures: 0,
                    duration: { counts: [1], values: [10000] },
                    duration_values: [10],
                  },
                },
              },
            });
            expect(metrics[9]).toEqual({
              key: 'task_run',
              value: {
                overall: {
                  success: 4,
                  not_timed_out: 5,
                  total: 5,
                  delay: { counts: [3, 1, 0, 1], values: [10, 20, 30, 40] },
                  delay_values: [3, 10, 3, 35, 9],
                  framework_errors: 1,
                  user_errors: 0,
                  total_errors: 1,
                  rescheduled_failures: 0,
                  duration: { counts: [4], values: [10000] },
                  duration_values: [10, 10, 10, 10],
                },
                by_type: {
                  alerting: {
                    success: 2,
                    not_timed_out: 3,
                    total: 3,
                    framework_errors: 1,
                    user_errors: 0,
                    total_errors: 1,
                    rescheduled_failures: 0,
                    duration: { counts: [2], values: [10000] },
                    duration_values: [10, 10],
                  },
                  'alerting:example': {
                    success: 2,
                    not_timed_out: 3,
                    total: 3,
                    framework_errors: 1,
                    user_errors: 0,
                    total_errors: 1,
                    rescheduled_failures: 0,
                    duration: { counts: [2], values: [10000] },
                    duration_values: [10, 10],
                  },
                  report: {
                    success: 1,
                    not_timed_out: 1,
                    total: 1,
                    framework_errors: 0,
                    user_errors: 0,
                    total_errors: 0,
                    rescheduled_failures: 0,
                    duration: { counts: [1], values: [10000] },
                    duration_values: [10],
                  },
                  telemetry: {
                    success: 1,
                    not_timed_out: 1,
                    total: 1,
                    framework_errors: 0,
                    user_errors: 0,
                    total_errors: 0,
                    rescheduled_failures: 0,
                    duration: { counts: [1], values: [10000] },
                    duration_values: [10],
                  },
                },
              },
            });
            // reset event should have been received here
            expect(metrics[10]).toEqual({
              key: 'task_run',
              value: {
                overall: {
                  success: 0,
                  not_timed_out: 0,
                  total: 0,
                  delay: { counts: [1], values: [10] },
                  delay_values: [5],
                  framework_errors: 0,
                  user_errors: 0,
                  total_errors: 0,
                  rescheduled_failures: 0,
                  duration: { counts: [], values: [] },
                  duration_values: [],
                },
                by_type: {
                  alerting: {
                    success: 0,
                    not_timed_out: 0,
                    total: 0,
                    framework_errors: 0,
                    user_errors: 0,
                    total_errors: 0,
                    rescheduled_failures: 0,
                    duration: { counts: [], values: [] },
                    duration_values: [],
                  },
                  'alerting:example': {
                    success: 0,
                    not_timed_out: 0,
                    total: 0,
                    framework_errors: 0,
                    user_errors: 0,
                    total_errors: 0,
                    rescheduled_failures: 0,
                    duration: { counts: [], values: [] },
                    duration_values: [],
                  },
                  report: {
                    success: 0,
                    not_timed_out: 0,
                    total: 0,
                    framework_errors: 0,
                    user_errors: 0,
                    total_errors: 0,
                    rescheduled_failures: 0,
                    duration: { counts: [], values: [] },
                    duration_values: [],
                  },
                  telemetry: {
                    success: 0,
                    not_timed_out: 0,
                    total: 0,
                    framework_errors: 0,
                    user_errors: 0,
                    total_errors: 0,
                    rescheduled_failures: 0,
                    duration: { counts: [], values: [] },
                    duration_values: [],
                  },
                },
              },
            });
            expect(metrics[11]).toEqual({
              key: 'task_run',
              value: {
                overall: {
                  success: 1,
                  not_timed_out: 1,
                  total: 1,
                  delay: { counts: [1], values: [10] },
                  delay_values: [5],
                  framework_errors: 0,
                  user_errors: 0,
                  total_errors: 0,
                  rescheduled_failures: 0,
                  duration: { counts: [1], values: [10000] },
                  duration_values: [10],
                },
                by_type: {
                  alerting: {
                    success: 1,
                    not_timed_out: 1,
                    total: 1,
                    framework_errors: 0,
                    user_errors: 0,
                    total_errors: 0,
                    rescheduled_failures: 0,
                    duration: { counts: [1], values: [10000] },
                    duration_values: [10],
                  },
                  'alerting:example': {
                    success: 1,
                    not_timed_out: 1,
                    total: 1,
                    framework_errors: 0,
                    user_errors: 0,
                    total_errors: 0,
                    rescheduled_failures: 0,
                    duration: { counts: [1], values: [10000] },
                    duration_values: [10],
                  },
                  report: {
                    success: 0,
                    not_timed_out: 0,
                    total: 0,
                    framework_errors: 0,
                    user_errors: 0,
                    total_errors: 0,
                    rescheduled_failures: 0,
                    duration: { counts: [], values: [] },
                    duration_values: [],
                  },
                  telemetry: {
                    success: 0,
                    not_timed_out: 0,
                    total: 0,
                    framework_errors: 0,
                    user_errors: 0,
                    total_errors: 0,
                    rescheduled_failures: 0,
                    duration: { counts: [], values: [] },
                    duration_values: [],
                  },
                },
              },
            });
            expect(metrics[12]).toEqual({
              key: 'task_run',
              value: {
                overall: {
                  success: 1,
                  not_timed_out: 1,
                  total: 1,
                  delay: { counts: [1, 1], values: [10, 20] },
                  delay_values: [5, 12],
                  framework_errors: 0,
                  user_errors: 0,
                  total_errors: 0,
                  rescheduled_failures: 0,
                  duration: { counts: [1], values: [10000] },
                  duration_values: [10],
                },
                by_type: {
                  alerting: {
                    success: 1,
                    not_timed_out: 1,
                    total: 1,
                    framework_errors: 0,
                    user_errors: 0,
                    total_errors: 0,
                    rescheduled_failures: 0,
                    duration: { counts: [1], values: [10000] },
                    duration_values: [10],
                  },
                  'alerting:example': {
                    success: 1,
                    not_timed_out: 1,
                    total: 1,
                    framework_errors: 0,
                    user_errors: 0,
                    total_errors: 0,
                    rescheduled_failures: 0,
                    duration: { counts: [1], values: [10000] },
                    duration_values: [10],
                  },
                  report: {
                    success: 0,
                    not_timed_out: 0,
                    total: 0,
                    framework_errors: 0,
                    user_errors: 0,
                    total_errors: 0,
                    rescheduled_failures: 0,
                    duration: { counts: [], values: [] },
                    duration_values: [],
                  },
                  telemetry: {
                    success: 0,
                    not_timed_out: 0,
                    total: 0,
                    framework_errors: 0,
                    user_errors: 0,
                    total_errors: 0,
                    rescheduled_failures: 0,
                    duration: { counts: [], values: [] },
                    duration_values: [],
                  },
                },
              },
            });
            expect(metrics[13]).toEqual({
              key: 'task_run',
              value: {
                overall: {
                  success: 2,
                  not_timed_out: 2,
                  total: 2,
                  delay: { counts: [1, 1], values: [10, 20] },
                  delay_values: [5, 12],
                  framework_errors: 0,
                  user_errors: 0,
                  total_errors: 0,
                  rescheduled_failures: 0,
                  duration: { counts: [2], values: [10000] },
                  duration_values: [10, 10],
                },
                by_type: {
                  alerting: {
                    success: 2,
                    not_timed_out: 2,
                    total: 2,
                    framework_errors: 0,
                    user_errors: 0,
                    total_errors: 0,
                    rescheduled_failures: 0,
                    duration: { counts: [2], values: [10000] },
                    duration_values: [10, 10],
                  },
                  'alerting:example': {
                    success: 2,
                    not_timed_out: 2,
                    total: 2,
                    framework_errors: 0,
                    user_errors: 0,
                    total_errors: 0,
                    rescheduled_failures: 0,
                    duration: { counts: [2], values: [10000] },
                    duration_values: [10, 10],
                  },
                  report: {
                    success: 0,
                    not_timed_out: 0,
                    total: 0,
                    framework_errors: 0,
                    user_errors: 0,
                    total_errors: 0,
                    rescheduled_failures: 0,
                    duration: { counts: [], values: [] },
                    duration_values: [],
                  },
                  telemetry: {
                    success: 0,
                    not_timed_out: 0,
                    total: 0,
                    framework_errors: 0,
                    user_errors: 0,
                    total_errors: 0,
                    rescheduled_failures: 0,
                    duration: { counts: [], values: [] },
                    duration_values: [],
                  },
                },
              },
            });
            expect(metrics[14]).toEqual({
              key: 'task_run',
              value: {
                overall: {
                  success: 2,
                  not_timed_out: 2,
                  total: 2,
                  delay: { counts: [2, 1], values: [10, 20] },
                  delay_values: [5, 12, 4],
                  framework_errors: 0,
                  user_errors: 0,
                  total_errors: 0,
                  rescheduled_failures: 0,
                  duration: { counts: [2], values: [10000] },
                  duration_values: [10, 10],
                },
                by_type: {
                  alerting: {
                    success: 2,
                    not_timed_out: 2,
                    total: 2,
                    framework_errors: 0,
                    user_errors: 0,
                    total_errors: 0,
                    rescheduled_failures: 0,
                    duration: { counts: [2], values: [10000] },
                    duration_values: [10, 10],
                  },
                  'alerting:example': {
                    success: 2,
                    not_timed_out: 2,
                    total: 2,
                    framework_errors: 0,
                    user_errors: 0,
                    total_errors: 0,
                    rescheduled_failures: 0,
                    duration: { counts: [2], values: [10000] },
                    duration_values: [10, 10],
                  },
                  report: {
                    success: 0,
                    not_timed_out: 0,
                    total: 0,
                    framework_errors: 0,
                    user_errors: 0,
                    total_errors: 0,
                    rescheduled_failures: 0,
                    duration: { counts: [], values: [] },
                    duration_values: [],
                  },
                  telemetry: {
                    success: 0,
                    not_timed_out: 0,
                    total: 0,
                    framework_errors: 0,
                    user_errors: 0,
                    total_errors: 0,
                    rescheduled_failures: 0,
                    duration: { counts: [], values: [] },
                    duration_values: [],
                  },
                },
              },
            });
            expect(metrics[15]).toEqual({
              key: 'task_run',
              value: {
                overall: {
                  success: 2,
                  not_timed_out: 3,
                  total: 3,
                  delay: { counts: [2, 1], values: [10, 20] },
                  delay_values: [5, 12, 4],
                  framework_errors: 1,
                  user_errors: 0,
                  total_errors: 1,
                  rescheduled_failures: 0,
                  duration: { counts: [2], values: [10000] },
                  duration_values: [10, 10],
                },
                by_type: {
                  alerting: {
                    success: 2,
                    not_timed_out: 3,
                    total: 3,
                    framework_errors: 1,
                    user_errors: 0,
                    total_errors: 1,
                    rescheduled_failures: 0,
                    duration: { counts: [2], values: [10000] },
                    duration_values: [10, 10],
                  },
                  'alerting:example': {
                    success: 2,
                    not_timed_out: 3,
                    total: 3,
                    framework_errors: 1,
                    user_errors: 0,
                    total_errors: 1,
                    rescheduled_failures: 0,
                    duration: { counts: [2], values: [10000] },
                    duration_values: [10, 10],
                  },
                  report: {
                    success: 0,
                    not_timed_out: 0,
                    total: 0,
                    framework_errors: 0,
                    user_errors: 0,
                    total_errors: 0,
                    rescheduled_failures: 0,
                    duration: { counts: [], values: [] },
                    duration_values: [],
                  },
                  telemetry: {
                    success: 0,
                    not_timed_out: 0,
                    total: 0,
                    framework_errors: 0,
                    user_errors: 0,
                    total_errors: 0,
                    rescheduled_failures: 0,
                    duration: { counts: [], values: [] },
                    duration_values: [],
                  },
                },
              },
            });
            expect(metrics[16]).toEqual({
              key: 'task_run',
              value: {
                overall: {
                  success: 2,
                  not_timed_out: 3,
                  total: 3,
                  delay: { counts: [3, 1], values: [10, 20] },
                  delay_values: [5, 12, 4, 4],
                  framework_errors: 1,
                  user_errors: 0,
                  total_errors: 1,
                  rescheduled_failures: 0,
                  duration: { counts: [2], values: [10000] },
                  duration_values: [10, 10],
                },
                by_type: {
                  alerting: {
                    success: 2,
                    not_timed_out: 3,
                    total: 3,
                    framework_errors: 1,
                    user_errors: 0,
                    total_errors: 1,
                    rescheduled_failures: 0,
                    duration: { counts: [2], values: [10000] },
                    duration_values: [10, 10],
                  },
                  'alerting:example': {
                    success: 2,
                    not_timed_out: 3,
                    total: 3,
                    framework_errors: 1,
                    user_errors: 0,
                    total_errors: 1,
                    rescheduled_failures: 0,
                    duration: { counts: [2], values: [10000] },
                    duration_values: [10, 10],
                  },
                  report: {
                    success: 0,
                    not_timed_out: 0,
                    total: 0,
                    framework_errors: 0,
                    user_errors: 0,
                    total_errors: 0,
                    rescheduled_failures: 0,
                    duration: { counts: [], values: [] },
                    duration_values: [],
                  },
                  telemetry: {
                    success: 0,
                    not_timed_out: 0,
                    total: 0,
                    framework_errors: 0,
                    user_errors: 0,
                    total_errors: 0,
                    rescheduled_failures: 0,
                    duration: { counts: [], values: [] },
                    duration_values: [],
                  },
                },
              },
            });
            expect(metrics[17]).toEqual({
              key: 'task_run',
              value: {
                overall: {
                  success: 3,
                  not_timed_out: 4,
                  total: 4,
                  delay: { counts: [3, 1], values: [10, 20] },
                  delay_values: [5, 12, 4, 4],
                  framework_errors: 1,
                  user_errors: 0,
                  total_errors: 1,
                  rescheduled_failures: 0,
                  duration: { counts: [3], values: [10000] },
                  duration_values: [10, 10, 10],
                },
                by_type: {
                  alerting: {
                    success: 3,
                    not_timed_out: 4,
                    total: 4,
                    framework_errors: 1,
                    user_errors: 0,
                    total_errors: 1,
                    rescheduled_failures: 0,
                    duration: { counts: [3], values: [10000] },
                    duration_values: [10, 10, 10],
                  },
                  'alerting:example': {
                    success: 3,
                    not_timed_out: 4,
                    total: 4,
                    framework_errors: 1,
                    user_errors: 0,
                    total_errors: 1,
                    rescheduled_failures: 0,
                    duration: { counts: [3], values: [10000] },
                    duration_values: [10, 10, 10],
                  },
                  report: {
                    success: 0,
                    not_timed_out: 0,
                    total: 0,
                    framework_errors: 0,
                    user_errors: 0,
                    total_errors: 0,
                    rescheduled_failures: 0,
                    duration: { counts: [], values: [] },
                    duration_values: [],
                  },
                  telemetry: {
                    success: 0,
                    not_timed_out: 0,
                    total: 0,
                    framework_errors: 0,
                    user_errors: 0,
                    total_errors: 0,
                    rescheduled_failures: 0,
                    duration: { counts: [], values: [] },
                    duration_values: [],
                  },
                },
              },
            });
            expect(metrics[18]).toEqual({
              key: 'task_run',
              value: {
                overall: {
                  success: 3,
                  not_timed_out: 4,
                  total: 4,
                  delay: { counts: [4, 1], values: [10, 20] },
                  delay_values: [5, 12, 4, 4, 3],
                  framework_errors: 1,
                  user_errors: 0,
                  total_errors: 1,
                  rescheduled_failures: 0,
                  duration: { counts: [3], values: [10000] },
                  duration_values: [10, 10, 10],
                },
                by_type: {
                  alerting: {
                    success: 3,
                    not_timed_out: 4,
                    total: 4,
                    framework_errors: 1,
                    user_errors: 0,
                    total_errors: 1,
                    rescheduled_failures: 0,
                    duration: { counts: [3], values: [10000] },
                    duration_values: [10, 10, 10],
                  },
                  'alerting:example': {
                    success: 3,
                    not_timed_out: 4,
                    total: 4,
                    framework_errors: 1,
                    user_errors: 0,
                    total_errors: 1,
                    rescheduled_failures: 0,
                    duration: { counts: [3], values: [10000] },
                    duration_values: [10, 10, 10],
                  },
                  report: {
                    success: 0,
                    not_timed_out: 0,
                    total: 0,
                    framework_errors: 0,
                    user_errors: 0,
                    total_errors: 0,
                    rescheduled_failures: 0,
                    duration: { counts: [], values: [] },
                    duration_values: [],
                  },
                  telemetry: {
                    success: 0,
                    not_timed_out: 0,
                    total: 0,
                    framework_errors: 0,
                    user_errors: 0,
                    total_errors: 0,
                    rescheduled_failures: 0,
                    duration: { counts: [], values: [] },
                    duration_values: [],
                  },
                },
              },
            });
            expect(metrics[19]).toEqual({
              key: 'task_run',
              value: {
                overall: {
                  success: 3,
                  not_timed_out: 5,
                  total: 5,
                  delay: { counts: [4, 1], values: [10, 20] },
                  delay_values: [5, 12, 4, 4, 3],
                  framework_errors: 2,
                  user_errors: 0,
                  total_errors: 2,
                  rescheduled_failures: 0,
                  duration: { counts: [3], values: [10000] },
                  duration_values: [10, 10, 10],
                },
                by_type: {
                  actions: {
                    success: 0,
                    not_timed_out: 1,
                    total: 1,
                    framework_errors: 1,
                    user_errors: 0,
                    total_errors: 1,
                    rescheduled_failures: 0,
                    duration: { counts: [], values: [] },
                    duration_values: [],
                  },
                  alerting: {
                    success: 3,
                    not_timed_out: 4,
                    total: 4,
                    framework_errors: 1,
                    user_errors: 0,
                    total_errors: 1,
                    rescheduled_failures: 0,
                    duration: { counts: [3], values: [10000] },
                    duration_values: [10, 10, 10],
                  },
                  'actions:webhook': {
                    success: 0,
                    not_timed_out: 1,
                    total: 1,
                    framework_errors: 1,
                    user_errors: 0,
                    total_errors: 1,
                    rescheduled_failures: 0,
                    duration: { counts: [], values: [] },
                    duration_values: [],
                  },
                  'alerting:example': {
                    success: 3,
                    not_timed_out: 4,
                    total: 4,
                    framework_errors: 1,
                    user_errors: 0,
                    total_errors: 1,
                    rescheduled_failures: 0,
                    duration: { counts: [3], values: [10000] },
                    duration_values: [10, 10, 10],
                  },
                  report: {
                    success: 0,
                    not_timed_out: 0,
                    total: 0,
                    framework_errors: 0,
                    user_errors: 0,
                    total_errors: 0,
                    rescheduled_failures: 0,
                    duration: { counts: [], values: [] },
                    duration_values: [],
                  },
                  telemetry: {
                    success: 0,
                    not_timed_out: 0,
                    total: 0,
                    framework_errors: 0,
                    user_errors: 0,
                    total_errors: 0,
                    rescheduled_failures: 0,
                    duration: { counts: [], values: [] },
                    duration_values: [],
                  },
                },
              },
            });
            resolve();
          });

        for (const event of taskRunEvents1) {
          events$.next(event);
        }
        reset$.next(true);
        for (const event of taskRunEvents2) {
          events$.next(event);
        }
      });
    });

    test('resets count when configured metrics reset interval expires', async () => {
      const clock = sinon.useFakeTimers();
      clock.tick(0);
      const taskRunEvents1 = [
        getTaskManagerStatEvent(3.234),
        getTaskRunSuccessEvent('alerting:example'),
        getTaskManagerStatEvent(10.45),
        getTaskRunSuccessEvent('telemetry'),
        getTaskManagerStatEvent(3.454),
        getTaskRunSuccessEvent('alerting:example'),
        getTaskManagerStatEvent(35.45),
        getTaskRunSuccessEvent('report'),
        getTaskManagerStatEvent(8.85673),
        getTaskRunFailedEvent('alerting:example'),
      ];

      const taskRunEvents2 = [
        getTaskManagerStatEvent(4.5745),
        getTaskRunSuccessEvent('alerting:example'),
        getTaskManagerStatEvent(11.564),
        getTaskRunSuccessEvent('alerting:example'),
        getTaskManagerStatEvent(3.78),
        getTaskRunFailedEvent('alerting:example'),
        getTaskManagerStatEvent(3.7863),
        getTaskRunSuccessEvent('alerting:example'),
        getTaskManagerStatEvent(3.245),
        getTaskRunFailedEvent('actions:webhook'),
      ];
      const events$ = new Subject<TaskLifecycleEvent>();

      const taskRunAggregator = createAggregator({
        key: 'task_run',
        events$,
        config: {
          ...config,
          metrics_reset_interval: 10,
        },
        reset$: new Subject<boolean>(),
        eventFilter: (event: TaskLifecycleEvent) =>
          isTaskRunEvent(event) || isTaskManagerStatEvent(event),
        metricsAggregator: new TaskRunMetricsAggregator(logger),
      });

      return new Promise<void>((resolve) => {
        taskRunAggregator
          .pipe(
            // skip initial metric which is just initialized data which
            // ensures we don't stall on combineLatest
            skip(1),
            take(taskRunEvents1.length + taskRunEvents2.length),
            bufferCount(taskRunEvents1.length + taskRunEvents2.length)
          )
          .subscribe((metrics: Array<AggregatedStat<TaskRunMetric>>) => {
            expect(metrics[0]).toEqual({
              key: 'task_run',
              value: {
                overall: {
                  success: 0,
                  not_timed_out: 0,
                  total: 0,
                  delay: { counts: [1], values: [10] },
                  delay_values: [3],
                  framework_errors: 0,
                  user_errors: 0,
                  total_errors: 0,
                  rescheduled_failures: 0,
                  duration: { counts: [], values: [] },
                  duration_values: [],
                },
              },
            });
            expect(metrics[1]).toEqual({
              key: 'task_run',
              value: {
                overall: {
                  success: 1,
                  not_timed_out: 1,
                  total: 1,
                  delay: { counts: [1], values: [10] },
                  delay_values: [3],
                  framework_errors: 0,
                  user_errors: 0,
                  total_errors: 0,
                  rescheduled_failures: 0,
                  duration: { counts: [1], values: [10000] },
                  duration_values: [10],
                },
                by_type: {
                  alerting: {
                    success: 1,
                    not_timed_out: 1,
                    total: 1,
                    framework_errors: 0,
                    user_errors: 0,
                    total_errors: 0,
                    rescheduled_failures: 0,
                    duration: { counts: [1], values: [10000] },
                    duration_values: [10],
                  },
                  'alerting:example': {
                    success: 1,
                    not_timed_out: 1,
                    total: 1,
                    framework_errors: 0,
                    user_errors: 0,
                    total_errors: 0,
                    rescheduled_failures: 0,
                    duration: { counts: [1], values: [10000] },
                    duration_values: [10],
                  },
                },
              },
            });
            expect(metrics[2]).toEqual({
              key: 'task_run',
              value: {
                overall: {
                  success: 1,
                  not_timed_out: 1,
                  total: 1,
                  delay: { counts: [1, 1], values: [10, 20] },
                  delay_values: [3, 10],
                  framework_errors: 0,
                  user_errors: 0,
                  total_errors: 0,
                  rescheduled_failures: 0,
                  duration: { counts: [1], values: [10000] },
                  duration_values: [10],
                },
                by_type: {
                  alerting: {
                    success: 1,
                    not_timed_out: 1,
                    total: 1,
                    framework_errors: 0,
                    user_errors: 0,
                    total_errors: 0,
                    rescheduled_failures: 0,
                    duration: { counts: [1], values: [10000] },
                    duration_values: [10],
                  },
                  'alerting:example': {
                    success: 1,
                    not_timed_out: 1,
                    total: 1,
                    framework_errors: 0,
                    user_errors: 0,
                    total_errors: 0,
                    rescheduled_failures: 0,
                    duration: { counts: [1], values: [10000] },
                    duration_values: [10],
                  },
                },
              },
            });
            expect(metrics[3]).toEqual({
              key: 'task_run',
              value: {
                overall: {
                  success: 2,
                  not_timed_out: 2,
                  total: 2,
                  delay: { counts: [1, 1], values: [10, 20] },
                  delay_values: [3, 10],
                  framework_errors: 0,
                  user_errors: 0,
                  total_errors: 0,
                  rescheduled_failures: 0,
                  duration: { counts: [2], values: [10000] },
                  duration_values: [10, 10],
                },
                by_type: {
                  alerting: {
                    success: 1,
                    not_timed_out: 1,
                    total: 1,
                    framework_errors: 0,
                    user_errors: 0,
                    total_errors: 0,
                    rescheduled_failures: 0,
                    duration: { counts: [1], values: [10000] },
                    duration_values: [10],
                  },
                  'alerting:example': {
                    success: 1,
                    not_timed_out: 1,
                    total: 1,
                    framework_errors: 0,
                    user_errors: 0,
                    total_errors: 0,
                    rescheduled_failures: 0,
                    duration: { counts: [1], values: [10000] },
                    duration_values: [10],
                  },
                  telemetry: {
                    success: 1,
                    not_timed_out: 1,
                    total: 1,
                    framework_errors: 0,
                    user_errors: 0,
                    total_errors: 0,
                    rescheduled_failures: 0,
                    duration: { counts: [1], values: [10000] },
                    duration_values: [10],
                  },
                },
              },
            });
            expect(metrics[4]).toEqual({
              key: 'task_run',
              value: {
                overall: {
                  success: 2,
                  not_timed_out: 2,
                  total: 2,
                  delay: { counts: [2, 1], values: [10, 20] },
                  delay_values: [3, 10, 3],
                  framework_errors: 0,
                  user_errors: 0,
                  total_errors: 0,
                  rescheduled_failures: 0,
                  duration: { counts: [2], values: [10000] },
                  duration_values: [10, 10],
                },
                by_type: {
                  alerting: {
                    success: 1,
                    not_timed_out: 1,
                    total: 1,
                    framework_errors: 0,
                    user_errors: 0,
                    total_errors: 0,
                    rescheduled_failures: 0,
                    duration: { counts: [1], values: [10000] },
                    duration_values: [10],
                  },
                  'alerting:example': {
                    success: 1,
                    not_timed_out: 1,
                    total: 1,
                    framework_errors: 0,
                    user_errors: 0,
                    total_errors: 0,
                    rescheduled_failures: 0,
                    duration: { counts: [1], values: [10000] },
                    duration_values: [10],
                  },
                  telemetry: {
                    success: 1,
                    not_timed_out: 1,
                    total: 1,
                    framework_errors: 0,
                    user_errors: 0,
                    total_errors: 0,
                    rescheduled_failures: 0,
                    duration: { counts: [1], values: [10000] },
                    duration_values: [10],
                  },
                },
              },
            });
            expect(metrics[5]).toEqual({
              key: 'task_run',
              value: {
                overall: {
                  success: 3,
                  not_timed_out: 3,
                  total: 3,
                  delay: { counts: [2, 1], values: [10, 20] },
                  delay_values: [3, 10, 3],
                  framework_errors: 0,
                  user_errors: 0,
                  total_errors: 0,
                  rescheduled_failures: 0,
                  duration: { counts: [3], values: [10000] },
                  duration_values: [10, 10, 10],
                },
                by_type: {
                  alerting: {
                    success: 2,
                    not_timed_out: 2,
                    total: 2,
                    framework_errors: 0,
                    user_errors: 0,
                    total_errors: 0,
                    rescheduled_failures: 0,
                    duration: { counts: [2], values: [10000] },
                    duration_values: [10, 10],
                  },
                  'alerting:example': {
                    success: 2,
                    not_timed_out: 2,
                    total: 2,
                    framework_errors: 0,
                    user_errors: 0,
                    total_errors: 0,
                    rescheduled_failures: 0,
                    duration: { counts: [2], values: [10000] },
                    duration_values: [10, 10],
                  },
                  telemetry: {
                    success: 1,
                    not_timed_out: 1,
                    total: 1,
                    framework_errors: 0,
                    user_errors: 0,
                    total_errors: 0,
                    rescheduled_failures: 0,
                    duration: { counts: [1], values: [10000] },
                    duration_values: [10],
                  },
                },
              },
            });
            expect(metrics[6]).toEqual({
              key: 'task_run',
              value: {
                overall: {
                  success: 3,
                  not_timed_out: 3,
                  total: 3,
                  delay: { counts: [2, 1, 0, 1], values: [10, 20, 30, 40] },
                  delay_values: [3, 10, 3, 35],
                  framework_errors: 0,
                  user_errors: 0,
                  total_errors: 0,
                  rescheduled_failures: 0,
                  duration: { counts: [3], values: [10000] },
                  duration_values: [10, 10, 10],
                },
                by_type: {
                  alerting: {
                    success: 2,
                    not_timed_out: 2,
                    total: 2,
                    framework_errors: 0,
                    user_errors: 0,
                    total_errors: 0,
                    rescheduled_failures: 0,
                    duration: { counts: [2], values: [10000] },
                    duration_values: [10, 10],
                  },
                  'alerting:example': {
                    success: 2,
                    not_timed_out: 2,
                    total: 2,
                    framework_errors: 0,
                    user_errors: 0,
                    total_errors: 0,
                    rescheduled_failures: 0,
                    duration: { counts: [2], values: [10000] },
                    duration_values: [10, 10],
                  },
                  telemetry: {
                    success: 1,
                    not_timed_out: 1,
                    total: 1,
                    framework_errors: 0,
                    user_errors: 0,
                    total_errors: 0,
                    rescheduled_failures: 0,
                    duration: { counts: [1], values: [10000] },
                    duration_values: [10],
                  },
                },
              },
            });
            expect(metrics[7]).toEqual({
              key: 'task_run',
              value: {
                overall: {
                  success: 4,
                  not_timed_out: 4,
                  total: 4,
                  delay: { counts: [2, 1, 0, 1], values: [10, 20, 30, 40] },
                  delay_values: [3, 10, 3, 35],
                  framework_errors: 0,
                  user_errors: 0,
                  total_errors: 0,
                  rescheduled_failures: 0,
                  duration: { counts: [4], values: [10000] },
                  duration_values: [10, 10, 10, 10],
                },
                by_type: {
                  alerting: {
                    success: 2,
                    not_timed_out: 2,
                    total: 2,
                    framework_errors: 0,
                    user_errors: 0,
                    total_errors: 0,
                    rescheduled_failures: 0,
                    duration: { counts: [2], values: [10000] },
                    duration_values: [10, 10],
                  },
                  'alerting:example': {
                    success: 2,
                    not_timed_out: 2,
                    total: 2,
                    framework_errors: 0,
                    user_errors: 0,
                    total_errors: 0,
                    rescheduled_failures: 0,
                    duration: { counts: [2], values: [10000] },
                    duration_values: [10, 10],
                  },
                  report: {
                    success: 1,
                    not_timed_out: 1,
                    total: 1,
                    framework_errors: 0,
                    user_errors: 0,
                    total_errors: 0,
                    rescheduled_failures: 0,
                    duration: { counts: [1], values: [10000] },
                    duration_values: [10],
                  },
                  telemetry: {
                    success: 1,
                    not_timed_out: 1,
                    total: 1,
                    framework_errors: 0,
                    user_errors: 0,
                    total_errors: 0,
                    rescheduled_failures: 0,
                    duration: { counts: [1], values: [10000] },
                    duration_values: [10],
                  },
                },
              },
            });
            expect(metrics[8]).toEqual({
              key: 'task_run',
              value: {
                overall: {
                  success: 4,
                  not_timed_out: 4,
                  total: 4,
                  delay: { counts: [3, 1, 0, 1], values: [10, 20, 30, 40] },
                  delay_values: [3, 10, 3, 35, 9],
                  framework_errors: 0,
                  user_errors: 0,
                  total_errors: 0,
                  rescheduled_failures: 0,
                  duration: { counts: [4], values: [10000] },
                  duration_values: [10, 10, 10, 10],
                },
                by_type: {
                  alerting: {
                    success: 2,
                    not_timed_out: 2,
                    total: 2,
                    framework_errors: 0,
                    user_errors: 0,
                    total_errors: 0,
                    rescheduled_failures: 0,
                    duration: { counts: [2], values: [10000] },
                    duration_values: [10, 10],
                  },
                  'alerting:example': {
                    success: 2,
                    not_timed_out: 2,
                    total: 2,
                    framework_errors: 0,
                    user_errors: 0,
                    total_errors: 0,
                    rescheduled_failures: 0,
                    duration: { counts: [2], values: [10000] },
                    duration_values: [10, 10],
                  },
                  report: {
                    success: 1,
                    not_timed_out: 1,
                    total: 1,
                    framework_errors: 0,
                    user_errors: 0,
                    total_errors: 0,
                    rescheduled_failures: 0,
                    duration: { counts: [1], values: [10000] },
                    duration_values: [10],
                  },
                  telemetry: {
                    success: 1,
                    not_timed_out: 1,
                    total: 1,
                    framework_errors: 0,
                    user_errors: 0,
                    total_errors: 0,
                    rescheduled_failures: 0,
                    duration: { counts: [1], values: [10000] },
                    duration_values: [10],
                  },
                },
              },
            });
            expect(metrics[9]).toEqual({
              key: 'task_run',
              value: {
                overall: {
                  success: 4,
                  not_timed_out: 5,
                  total: 5,
                  delay: { counts: [3, 1, 0, 1], values: [10, 20, 30, 40] },
                  delay_values: [3, 10, 3, 35, 9],
                  framework_errors: 1,
                  user_errors: 0,
                  total_errors: 1,
                  rescheduled_failures: 0,
                  duration: { counts: [4], values: [10000] },
                  duration_values: [10, 10, 10, 10],
                },
                by_type: {
                  alerting: {
                    success: 2,
                    not_timed_out: 3,
                    total: 3,
                    framework_errors: 1,
                    user_errors: 0,
                    total_errors: 1,
                    rescheduled_failures: 0,
                    duration: { counts: [2], values: [10000] },
                    duration_values: [10, 10],
                  },
                  'alerting:example': {
                    success: 2,
                    not_timed_out: 3,
                    total: 3,
                    framework_errors: 1,
                    user_errors: 0,
                    total_errors: 1,
                    rescheduled_failures: 0,
                    duration: { counts: [2], values: [10000] },
                    duration_values: [10, 10],
                  },
                  report: {
                    success: 1,
                    not_timed_out: 1,
                    total: 1,
                    framework_errors: 0,
                    user_errors: 0,
                    total_errors: 0,
                    rescheduled_failures: 0,
                    duration: { counts: [1], values: [10000] },
                    duration_values: [10],
                  },
                  telemetry: {
                    success: 1,
                    not_timed_out: 1,
                    total: 1,
                    framework_errors: 0,
                    user_errors: 0,
                    total_errors: 0,
                    rescheduled_failures: 0,
                    duration: { counts: [1], values: [10000] },
                    duration_values: [10],
                  },
                },
              },
            });
            // reset event should have been received here
            expect(metrics[10]).toEqual({
              key: 'task_run',
              value: {
                overall: {
                  success: 0,
                  not_timed_out: 0,
                  total: 0,
                  delay: { counts: [1], values: [10] },
                  delay_values: [5],
                  framework_errors: 0,
                  user_errors: 0,
                  total_errors: 0,
                  rescheduled_failures: 0,
                  duration: { counts: [], values: [] },
                  duration_values: [],
                },
                by_type: {
                  alerting: {
                    success: 0,
                    not_timed_out: 0,
                    total: 0,
                    framework_errors: 0,
                    user_errors: 0,
                    total_errors: 0,
                    rescheduled_failures: 0,
                    duration: { counts: [], values: [] },
                    duration_values: [],
                  },
                  'alerting:example': {
                    success: 0,
                    not_timed_out: 0,
                    total: 0,
                    framework_errors: 0,
                    user_errors: 0,
                    total_errors: 0,
                    rescheduled_failures: 0,
                    duration: { counts: [], values: [] },
                    duration_values: [],
                  },
                  report: {
                    success: 0,
                    not_timed_out: 0,
                    total: 0,
                    framework_errors: 0,
                    user_errors: 0,
                    total_errors: 0,
                    rescheduled_failures: 0,
                    duration: { counts: [], values: [] },
                    duration_values: [],
                  },
                  telemetry: {
                    success: 0,
                    not_timed_out: 0,
                    total: 0,
                    framework_errors: 0,
                    user_errors: 0,
                    total_errors: 0,
                    rescheduled_failures: 0,
                    duration: { counts: [], values: [] },
                    duration_values: [],
                  },
                },
              },
            });
            expect(metrics[11]).toEqual({
              key: 'task_run',
              value: {
                overall: {
                  success: 1,
                  not_timed_out: 1,
                  total: 1,
                  delay: { counts: [1], values: [10] },
                  delay_values: [5],
                  framework_errors: 0,
                  user_errors: 0,
                  total_errors: 0,
                  rescheduled_failures: 0,
                  duration: { counts: [1], values: [10000] },
                  duration_values: [10],
                },
                by_type: {
                  alerting: {
                    success: 1,
                    not_timed_out: 1,
                    total: 1,
                    framework_errors: 0,
                    user_errors: 0,
                    total_errors: 0,
                    rescheduled_failures: 0,
                    duration: { counts: [1], values: [10000] },
                    duration_values: [10],
                  },
                  'alerting:example': {
                    success: 1,
                    not_timed_out: 1,
                    total: 1,
                    framework_errors: 0,
                    user_errors: 0,
                    total_errors: 0,
                    rescheduled_failures: 0,
                    duration: { counts: [1], values: [10000] },
                    duration_values: [10],
                  },
                  report: {
                    success: 0,
                    not_timed_out: 0,
                    total: 0,
                    framework_errors: 0,
                    user_errors: 0,
                    total_errors: 0,
                    rescheduled_failures: 0,
                    duration: { counts: [], values: [] },
                    duration_values: [],
                  },
                  telemetry: {
                    success: 0,
                    not_timed_out: 0,
                    total: 0,
                    framework_errors: 0,
                    user_errors: 0,
                    total_errors: 0,
                    rescheduled_failures: 0,
                    duration: { counts: [], values: [] },
                    duration_values: [],
                  },
                },
              },
            });
            expect(metrics[12]).toEqual({
              key: 'task_run',
              value: {
                overall: {
                  success: 1,
                  not_timed_out: 1,
                  total: 1,
                  delay: { counts: [1, 1], values: [10, 20] },
                  delay_values: [5, 12],
                  framework_errors: 0,
                  user_errors: 0,
                  total_errors: 0,
                  rescheduled_failures: 0,
                  duration: { counts: [1], values: [10000] },
                  duration_values: [10],
                },
                by_type: {
                  alerting: {
                    success: 1,
                    not_timed_out: 1,
                    total: 1,
                    framework_errors: 0,
                    user_errors: 0,
                    total_errors: 0,
                    rescheduled_failures: 0,
                    duration: { counts: [1], values: [10000] },
                    duration_values: [10],
                  },
                  'alerting:example': {
                    success: 1,
                    not_timed_out: 1,
                    total: 1,
                    framework_errors: 0,
                    user_errors: 0,
                    total_errors: 0,
                    rescheduled_failures: 0,
                    duration: { counts: [1], values: [10000] },
                    duration_values: [10],
                  },
                  report: {
                    success: 0,
                    not_timed_out: 0,
                    total: 0,
                    framework_errors: 0,
                    user_errors: 0,
                    total_errors: 0,
                    rescheduled_failures: 0,
                    duration: { counts: [], values: [] },
                    duration_values: [],
                  },
                  telemetry: {
                    success: 0,
                    not_timed_out: 0,
                    total: 0,
                    framework_errors: 0,
                    user_errors: 0,
                    total_errors: 0,
                    rescheduled_failures: 0,
                    duration: { counts: [], values: [] },
                    duration_values: [],
                  },
                },
              },
            });
            expect(metrics[13]).toEqual({
              key: 'task_run',
              value: {
                overall: {
                  success: 2,
                  not_timed_out: 2,
                  total: 2,
                  delay: { counts: [1, 1], values: [10, 20] },
                  delay_values: [5, 12],
                  framework_errors: 0,
                  user_errors: 0,
                  total_errors: 0,
                  rescheduled_failures: 0,
                  duration: { counts: [2], values: [10000] },
                  duration_values: [10, 10],
                },
                by_type: {
                  alerting: {
                    success: 2,
                    not_timed_out: 2,
                    total: 2,
                    framework_errors: 0,
                    user_errors: 0,
                    total_errors: 0,
                    rescheduled_failures: 0,
                    duration: { counts: [2], values: [10000] },
                    duration_values: [10, 10],
                  },
                  'alerting:example': {
                    success: 2,
                    not_timed_out: 2,
                    total: 2,
                    framework_errors: 0,
                    user_errors: 0,
                    total_errors: 0,
                    rescheduled_failures: 0,
                    duration: { counts: [2], values: [10000] },
                    duration_values: [10, 10],
                  },
                  report: {
                    success: 0,
                    not_timed_out: 0,
                    total: 0,
                    framework_errors: 0,
                    user_errors: 0,
                    total_errors: 0,
                    rescheduled_failures: 0,
                    duration: { counts: [], values: [] },
                    duration_values: [],
                  },
                  telemetry: {
                    success: 0,
                    not_timed_out: 0,
                    total: 0,
                    framework_errors: 0,
                    user_errors: 0,
                    total_errors: 0,
                    rescheduled_failures: 0,
                    duration: { counts: [], values: [] },
                    duration_values: [],
                  },
                },
              },
            });
            expect(metrics[14]).toEqual({
              key: 'task_run',
              value: {
                overall: {
                  success: 2,
                  not_timed_out: 2,
                  total: 2,
                  delay: { counts: [2, 1], values: [10, 20] },
                  delay_values: [5, 12, 4],
                  framework_errors: 0,
                  user_errors: 0,
                  total_errors: 0,
                  rescheduled_failures: 0,
                  duration: { counts: [2], values: [10000] },
                  duration_values: [10, 10],
                },
                by_type: {
                  alerting: {
                    success: 2,
                    not_timed_out: 2,
                    total: 2,
                    framework_errors: 0,
                    user_errors: 0,
                    total_errors: 0,
                    rescheduled_failures: 0,
                    duration: { counts: [2], values: [10000] },
                    duration_values: [10, 10],
                  },
                  'alerting:example': {
                    success: 2,
                    not_timed_out: 2,
                    total: 2,
                    framework_errors: 0,
                    user_errors: 0,
                    total_errors: 0,
                    rescheduled_failures: 0,
                    duration: { counts: [2], values: [10000] },
                    duration_values: [10, 10],
                  },
                  report: {
                    success: 0,
                    not_timed_out: 0,
                    total: 0,
                    framework_errors: 0,
                    user_errors: 0,
                    total_errors: 0,
                    rescheduled_failures: 0,
                    duration: { counts: [], values: [] },
                    duration_values: [],
                  },
                  telemetry: {
                    success: 0,
                    not_timed_out: 0,
                    total: 0,
                    framework_errors: 0,
                    user_errors: 0,
                    total_errors: 0,
                    rescheduled_failures: 0,
                    duration: { counts: [], values: [] },
                    duration_values: [],
                  },
                },
              },
            });
            expect(metrics[15]).toEqual({
              key: 'task_run',
              value: {
                overall: {
                  success: 2,
                  not_timed_out: 3,
                  total: 3,
                  delay: { counts: [2, 1], values: [10, 20] },
                  delay_values: [5, 12, 4],
                  framework_errors: 1,
                  user_errors: 0,
                  total_errors: 1,
                  rescheduled_failures: 0,
                  duration: { counts: [2], values: [10000] },
                  duration_values: [10, 10],
                },
                by_type: {
                  alerting: {
                    success: 2,
                    not_timed_out: 3,
                    total: 3,
                    framework_errors: 1,
                    user_errors: 0,
                    total_errors: 1,
                    rescheduled_failures: 0,
                    duration: { counts: [2], values: [10000] },
                    duration_values: [10, 10],
                  },
                  'alerting:example': {
                    success: 2,
                    not_timed_out: 3,
                    total: 3,
                    framework_errors: 1,
                    user_errors: 0,
                    total_errors: 1,
                    rescheduled_failures: 0,
                    duration: { counts: [2], values: [10000] },
                    duration_values: [10, 10],
                  },
                  report: {
                    success: 0,
                    not_timed_out: 0,
                    total: 0,
                    framework_errors: 0,
                    user_errors: 0,
                    total_errors: 0,
                    rescheduled_failures: 0,
                    duration: { counts: [], values: [] },
                    duration_values: [],
                  },
                  telemetry: {
                    success: 0,
                    not_timed_out: 0,
                    total: 0,
                    framework_errors: 0,
                    user_errors: 0,
                    total_errors: 0,
                    rescheduled_failures: 0,
                    duration: { counts: [], values: [] },
                    duration_values: [],
                  },
                },
              },
            });
            expect(metrics[16]).toEqual({
              key: 'task_run',
              value: {
                overall: {
                  success: 2,
                  not_timed_out: 3,
                  total: 3,
                  delay: { counts: [3, 1], values: [10, 20] },
                  delay_values: [5, 12, 4, 4],
                  framework_errors: 1,
                  user_errors: 0,
                  total_errors: 1,
                  rescheduled_failures: 0,
                  duration: { counts: [2], values: [10000] },
                  duration_values: [10, 10],
                },
                by_type: {
                  alerting: {
                    success: 2,
                    not_timed_out: 3,
                    total: 3,
                    framework_errors: 1,
                    user_errors: 0,
                    total_errors: 1,
                    rescheduled_failures: 0,
                    duration: { counts: [2], values: [10000] },
                    duration_values: [10, 10],
                  },
                  'alerting:example': {
                    success: 2,
                    not_timed_out: 3,
                    total: 3,
                    framework_errors: 1,
                    user_errors: 0,
                    total_errors: 1,
                    rescheduled_failures: 0,
                    duration: { counts: [2], values: [10000] },
                    duration_values: [10, 10],
                  },
                  report: {
                    success: 0,
                    not_timed_out: 0,
                    total: 0,
                    framework_errors: 0,
                    user_errors: 0,
                    total_errors: 0,
                    rescheduled_failures: 0,
                    duration: { counts: [], values: [] },
                    duration_values: [],
                  },
                  telemetry: {
                    success: 0,
                    not_timed_out: 0,
                    total: 0,
                    framework_errors: 0,
                    user_errors: 0,
                    total_errors: 0,
                    rescheduled_failures: 0,
                    duration: { counts: [], values: [] },
                    duration_values: [],
                  },
                },
              },
            });
            expect(metrics[17]).toEqual({
              key: 'task_run',
              value: {
                overall: {
                  success: 3,
                  not_timed_out: 4,
                  total: 4,
                  delay: { counts: [3, 1], values: [10, 20] },
                  delay_values: [5, 12, 4, 4],
                  framework_errors: 1,
                  user_errors: 0,
                  total_errors: 1,
                  rescheduled_failures: 0,
                  duration: { counts: [3], values: [10000] },
                  duration_values: [10, 10, 10],
                },
                by_type: {
                  alerting: {
                    success: 3,
                    not_timed_out: 4,
                    total: 4,
                    framework_errors: 1,
                    user_errors: 0,
                    total_errors: 1,
                    rescheduled_failures: 0,
                    duration: { counts: [3], values: [10000] },
                    duration_values: [10, 10, 10],
                  },
                  'alerting:example': {
                    success: 3,
                    not_timed_out: 4,
                    total: 4,
                    framework_errors: 1,
                    user_errors: 0,
                    total_errors: 1,
                    rescheduled_failures: 0,
                    duration: { counts: [3], values: [10000] },
                    duration_values: [10, 10, 10],
                  },
                  report: {
                    success: 0,
                    not_timed_out: 0,
                    total: 0,
                    framework_errors: 0,
                    user_errors: 0,
                    total_errors: 0,
                    rescheduled_failures: 0,
                    duration: { counts: [], values: [] },
                    duration_values: [],
                  },
                  telemetry: {
                    success: 0,
                    not_timed_out: 0,
                    total: 0,
                    framework_errors: 0,
                    user_errors: 0,
                    total_errors: 0,
                    rescheduled_failures: 0,
                    duration: { counts: [], values: [] },
                    duration_values: [],
                  },
                },
              },
            });
            expect(metrics[18]).toEqual({
              key: 'task_run',
              value: {
                overall: {
                  success: 3,
                  not_timed_out: 4,
                  total: 4,
                  delay: { counts: [4, 1], values: [10, 20] },
                  delay_values: [5, 12, 4, 4, 3],
                  framework_errors: 1,
                  user_errors: 0,
                  total_errors: 1,
                  rescheduled_failures: 0,
                  duration: { counts: [3], values: [10000] },
                  duration_values: [10, 10, 10],
                },
                by_type: {
                  alerting: {
                    success: 3,
                    not_timed_out: 4,
                    total: 4,
                    framework_errors: 1,
                    user_errors: 0,
                    total_errors: 1,
                    rescheduled_failures: 0,
                    duration: { counts: [3], values: [10000] },
                    duration_values: [10, 10, 10],
                  },
                  'alerting:example': {
                    success: 3,
                    not_timed_out: 4,
                    total: 4,
                    framework_errors: 1,
                    user_errors: 0,
                    total_errors: 1,
                    rescheduled_failures: 0,
                    duration: { counts: [3], values: [10000] },
                    duration_values: [10, 10, 10],
                  },
                  report: {
                    success: 0,
                    not_timed_out: 0,
                    total: 0,
                    framework_errors: 0,
                    user_errors: 0,
                    total_errors: 0,
                    rescheduled_failures: 0,
                    duration: { counts: [], values: [] },
                    duration_values: [],
                  },
                  telemetry: {
                    success: 0,
                    not_timed_out: 0,
                    total: 0,
                    framework_errors: 0,
                    user_errors: 0,
                    total_errors: 0,
                    rescheduled_failures: 0,
                    duration: { counts: [], values: [] },
                    duration_values: [],
                  },
                },
              },
            });
            expect(metrics[19]).toEqual({
              key: 'task_run',
              value: {
                overall: {
                  success: 3,
                  not_timed_out: 5,
                  total: 5,
                  delay: { counts: [4, 1], values: [10, 20] },
                  delay_values: [5, 12, 4, 4, 3],
                  framework_errors: 2,
                  user_errors: 0,
                  total_errors: 2,
                  rescheduled_failures: 0,
                  duration: { counts: [3], values: [10000] },
                  duration_values: [10, 10, 10],
                },
                by_type: {
                  actions: {
                    success: 0,
                    not_timed_out: 1,
                    total: 1,
                    framework_errors: 1,
                    user_errors: 0,
                    total_errors: 1,
                    rescheduled_failures: 0,
                    duration: { counts: [], values: [] },
                    duration_values: [],
                  },
                  alerting: {
                    success: 3,
                    not_timed_out: 4,
                    total: 4,
                    framework_errors: 1,
                    user_errors: 0,
                    total_errors: 1,
                    rescheduled_failures: 0,
                    duration: { counts: [3], values: [10000] },
                    duration_values: [10, 10, 10],
                  },
                  'actions:webhook': {
                    success: 0,
                    not_timed_out: 1,
                    total: 1,
                    framework_errors: 1,
                    user_errors: 0,
                    total_errors: 1,
                    rescheduled_failures: 0,
                    duration: { counts: [], values: [] },
                    duration_values: [],
                  },
                  'alerting:example': {
                    success: 3,
                    not_timed_out: 4,
                    total: 4,
                    framework_errors: 1,
                    user_errors: 0,
                    total_errors: 1,
                    rescheduled_failures: 0,
                    duration: { counts: [3], values: [10000] },
                    duration_values: [10, 10, 10],
                  },
                  report: {
                    success: 0,
                    not_timed_out: 0,
                    total: 0,
                    framework_errors: 0,
                    user_errors: 0,
                    total_errors: 0,
                    rescheduled_failures: 0,
                    duration: { counts: [], values: [] },
                    duration_values: [],
                  },
                  telemetry: {
                    success: 0,
                    not_timed_out: 0,
                    total: 0,
                    framework_errors: 0,
                    user_errors: 0,
                    total_errors: 0,
                    rescheduled_failures: 0,
                    duration: { counts: [], values: [] },
                    duration_values: [],
                  },
                },
              },
            });
            resolve();
          });

        for (const event of taskRunEvents1) {
          events$.next(event);
        }
        clock.tick(20);
        for (const event of taskRunEvents2) {
          events$.next(event);
        }

        clock.restore();
      });
    });
  });

  describe('with TaskOverdueMetricsAggregator', () => {
    test('returns latest values for task overdue by time', async () => {
      const events = [
        getTaskManagerMetricEvent({
          numOverdueTasks: {
            'alerting:example': [{ key: 40, doc_count: 1 }],
            'alerting:.index-threshold': [
              { key: 20, doc_count: 2 },
              { key: 120, doc_count: 1 },
            ],
            'actions:webhook': [{ key: 0, doc_count: 2 }],
            'actions:.email': [{ key: 0, doc_count: 1 }],
            total: [
              { key: 0, doc_count: 3 },
              { key: 20, doc_count: 2 },
              { key: 40, doc_count: 1 },
              { key: 120, doc_count: 1 },
            ],
          },
        }),
        getTaskManagerMetricEvent({
          numOverdueTasks: {
            total: [],
          },
        }),
        getTaskManagerMetricEvent({
          numOverdueTasks: {
            telemetry: [
              { key: 0, doc_count: 1 },
              { key: 20, doc_count: 1 },
            ],
            reporting: [{ key: 0, doc_count: 1 }],
            'actions:webhook': [
              { key: 0, doc_count: 3 },
              { key: 30, doc_count: 2 },
              { key: 50, doc_count: 1 },
            ],
            'actions:.email': [{ key: 0, doc_count: 11 }],
            total: [
              { key: 0, doc_count: 16 },
              { key: 20, doc_count: 1 },
              { key: 30, doc_count: 2 },
              { key: 50, doc_count: 1 },
            ],
          },
        }),
      ];
      const events$ = new Subject<TaskLifecycleEvent>();

      const taskOverdueAggregator = createAggregator({
        key: 'task_overdue',
        events$,
        config,
        reset$: new Subject<boolean>(),
        eventFilter: (event: TaskLifecycleEvent) => isTaskManagerMetricEvent(event),
        metricsAggregator: new TaskOverdueMetricsAggregator(),
      });

      return new Promise<void>((resolve) => {
        taskOverdueAggregator
          .pipe(
            // skip initial metric which is just initialized data which
            // ensures we don't stall on combineLatest
            skip(1),
            take(events.length),
            bufferCount(events.length)
          )
          .subscribe((metrics: Array<AggregatedStat<TaskOverdueMetric>>) => {
            expect(metrics[0]).toEqual({
              key: 'task_overdue',
              value: {
                overall: {
                  overdue_by: {
                    counts: [3, 0, 2, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1],
                    values: [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 130],
                  },
                  overdue_by_values: [0, 0, 0, 20, 20, 40, 120],
                },
                by_type: {
                  'alerting:example': {
                    overdue_by: {
                      counts: [0, 0, 0, 0, 1],
                      values: [10, 20, 30, 40, 50],
                    },
                    overdue_by_values: [40],
                  },
                  'alerting:__index-threshold': {
                    overdue_by: {
                      counts: [0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
                      values: [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 130],
                    },
                    overdue_by_values: [20, 20, 120],
                  },
                  alerting: {
                    overdue_by: {
                      counts: [0, 0, 2, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1],
                      values: [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 130],
                    },
                    overdue_by_values: [40, 20, 20, 120],
                  },
                  'actions:webhook': {
                    overdue_by: {
                      counts: [2],
                      values: [10],
                    },
                    overdue_by_values: [0, 0],
                  },
                  'actions:__email': {
                    overdue_by: {
                      counts: [1],
                      values: [10],
                    },
                    overdue_by_values: [0],
                  },
                  actions: {
                    overdue_by: {
                      counts: [3],
                      values: [10],
                    },
                    overdue_by_values: [0, 0, 0],
                  },
                },
              },
            });
            expect(metrics[1]).toEqual({
              key: 'task_overdue',
              value: {
                overall: {
                  overdue_by: { counts: [], values: [] },
                  overdue_by_values: [],
                },
                by_type: {},
              },
            });
            expect(metrics[2]).toEqual({
              key: 'task_overdue',
              value: {
                overall: {
                  overdue_by: {
                    counts: [16, 0, 1, 2, 0, 1],
                    values: [10, 20, 30, 40, 50, 60],
                  },
                  overdue_by_values: [
                    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 20, 30, 30, 50,
                  ],
                },
                by_type: {
                  telemetry: {
                    overdue_by: {
                      counts: [1, 0, 1],
                      values: [10, 20, 30],
                    },
                    overdue_by_values: [0, 20],
                  },
                  reporting: {
                    overdue_by: {
                      counts: [1],
                      values: [10],
                    },
                    overdue_by_values: [0],
                  },
                  'actions:webhook': {
                    overdue_by: {
                      counts: [3, 0, 0, 2, 0, 1],
                      values: [10, 20, 30, 40, 50, 60],
                    },
                    overdue_by_values: [0, 0, 0, 30, 30, 50],
                  },
                  'actions:__email': {
                    overdue_by: {
                      counts: [11],
                      values: [10],
                    },
                    overdue_by_values: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
                  },
                  actions: {
                    overdue_by: {
                      counts: [14, 0, 0, 2, 0, 1],
                      values: [10, 20, 30, 40, 50, 60],
                    },
                    overdue_by_values: [0, 0, 0, 30, 30, 50, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
                  },
                },
              },
            });
            resolve();
          });

        for (const event of events) {
          events$.next(event);
        }
      });
    });
  });

  test('should filter task lifecycle events using specified eventFilter', () => {
    const events = [
      taskClaimSuccessEvent,
      taskClaimSuccessEvent,
      taskClaimSuccessEvent,
      taskClaimSuccessEvent,
      taskClaimFailureEvent,
      taskClaimSuccessEvent,
      taskClaimSuccessEvent,
      taskClaimSuccessEvent,
      taskClaimSuccessEvent,
      taskClaimFailureEvent,
      taskClaimSuccessEvent,
    ];
    const eventFilter = jest.fn().mockReturnValue(true);
    const events$ = new Subject<TaskLifecycleEvent>();

    const aggregator = createAggregator({
      key: 'test',
      events$,
      config,
      reset$: new Subject<boolean>(),
      eventFilter,
      metricsAggregator: new TaskClaimMetricsAggregator(),
    });

    return new Promise<void>((resolve) => {
      aggregator
        .pipe(
          // skip initial metric which is just initialized data which
          // ensures we don't stall on combineLatest
          skip(1),
          take(events.length),
          bufferCount(events.length)
        )
        .subscribe(() => {
          resolve();
        });

      for (const event of events) {
        events$.next(event);
      }

      expect(eventFilter).toHaveBeenCalledTimes(events.length);
    });
  });

  test('should call metricAggregator to process events', () => {
    const spy = jest
      .spyOn(TaskClaimMetricsAggregatorModule, 'TaskClaimMetricsAggregator')
      .mockImplementation(() => mockMetricsAggregator);

    const events = [
      taskClaimSuccessEvent,
      taskClaimSuccessEvent,
      taskClaimSuccessEvent,
      taskClaimSuccessEvent,
      taskClaimFailureEvent,
      taskClaimSuccessEvent,
      taskClaimSuccessEvent,
      taskClaimSuccessEvent,
      taskClaimSuccessEvent,
      taskClaimFailureEvent,
      taskClaimSuccessEvent,
    ];
    const eventFilter = jest.fn().mockReturnValue(true);
    const events$ = new Subject<TaskLifecycleEvent>();

    const aggregator = createAggregator({
      key: 'test',
      events$,
      config,
      reset$: new Subject<boolean>(),
      eventFilter,
      metricsAggregator: new TaskClaimMetricsAggregator(),
    });

    return new Promise<void>((resolve) => {
      aggregator
        .pipe(
          // skip initial metric which is just initialized data which
          // ensures we don't stall on combineLatest
          skip(1),
          take(events.length),
          bufferCount(events.length)
        )
        .subscribe(() => {
          resolve();
        });

      for (const event of events) {
        events$.next(event);
      }

      expect(mockMetricsAggregator.initialMetric).toHaveBeenCalledTimes(1);
      expect(mockMetricsAggregator.processEvent).toHaveBeenCalledTimes(events.length);
      expect(mockMetricsAggregator.collect).toHaveBeenCalledTimes(events.length);
      expect(mockMetricsAggregator.reset).not.toHaveBeenCalled();
      spy.mockRestore();
    });
  });

  test('should call metricAggregator reset when resetMetric$ event is received', () => {
    const spy = jest
      .spyOn(TaskClaimMetricsAggregatorModule, 'TaskClaimMetricsAggregator')
      .mockImplementation(() => mockMetricsAggregator);

    const reset$ = new Subject<boolean>();
    const events = [
      taskClaimSuccessEvent,
      taskClaimSuccessEvent,
      taskClaimSuccessEvent,
      taskClaimSuccessEvent,
      taskClaimFailureEvent,
      taskClaimSuccessEvent,
      taskClaimSuccessEvent,
      taskClaimSuccessEvent,
      taskClaimSuccessEvent,
      taskClaimFailureEvent,
      taskClaimSuccessEvent,
    ];
    const eventFilter = jest.fn().mockReturnValue(true);
    const events$ = new Subject<TaskLifecycleEvent>();

    const aggregator = createAggregator({
      key: 'test',
      events$,
      config,
      reset$,
      eventFilter,
      metricsAggregator: mockMetricsAggregator,
    });

    return new Promise<void>((resolve) => {
      aggregator
        .pipe(
          // skip initial metric which is just initialized data which
          // ensures we don't stall on combineLatest
          skip(1),
          take(events.length),
          bufferCount(events.length)
        )
        .subscribe(() => {
          resolve();
        });

      for (const event of events) {
        events$.next(event);
      }

      for (let i = 0; i < 5; i++) {
        events$.next(events[i]);
      }
      reset$.next(true);
      for (let i = 0; i < events.length; i++) {
        events$.next(events[i]);
      }

      expect(mockMetricsAggregator.initialMetric).toHaveBeenCalledTimes(1);
      expect(mockMetricsAggregator.processEvent).toHaveBeenCalledTimes(events.length);
      expect(mockMetricsAggregator.collect).toHaveBeenCalledTimes(events.length);
      expect(mockMetricsAggregator.reset).toHaveBeenCalledTimes(1);
      spy.mockRestore();
    });
  });
});
