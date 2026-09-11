/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { Subject, firstValueFrom } from 'rxjs';
import { take, bufferCount } from 'rxjs';
import { createConfigurationAggregator } from './configuration_statistics';
import { ApiKeyType, type TaskManagerConfig } from '../config';
import { taskPollingLifecycleMock } from '../polling_lifecycle.mock';
import { taskExecutionControlServiceMock } from '../execution_control/task_execution_control_service.mock';

describe('Configuration Statistics Aggregator', () => {
  let mockTaskPollingLifecycle = taskPollingLifecycleMock.create({});
  const capacityConfiguration$ = new Subject<number>();
  const pollIntervalConfiguration$ = new Subject<number>();

  beforeEach(() => {
    mockTaskPollingLifecycle = taskPollingLifecycleMock.create({
      capacityConfiguration$,
      pollIntervalConfiguration$,
    });
  });

  const configuration: TaskManagerConfig = {
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
    max_attempts: 9,
    poll_interval: 6000000,
    allow_reading_invalid_state: false,
    version_conflict_threshold: 80,
    monitored_stats_required_freshness: 6000000,
    request_capacity: 1000,
    monitored_aggregated_stats_refresh_rate: 5000,
    monitored_stats_health_verbose_log: {
      enabled: false,
      level: 'debug' as const,
      warn_delayed_task_start_in_seconds: 60,
    },
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
  };

  test('merges the static config with the merged configs', async () => {
    return new Promise<void>(async (resolve, reject) => {
      try {
        createConfigurationAggregator(
          configuration,
          10,
          mockTaskPollingLifecycle,
          taskExecutionControlServiceMock.create()
        )
          .pipe(take(2), bufferCount(2))
          .subscribe(([initial, updatedWorkers]) => {
            expect(initial.value).toEqual({
              capacity: {
                config: 10,
                as_workers: 10,
                as_cost: 20,
              },
              claim_strategy: 'mget',
              poll_interval: 6000000,
              request_capacity: 1000,
              monitored_aggregated_stats_refresh_rate: 5000,
              monitored_stats_running_average_window: 50,
              monitored_task_execution_thresholds: {
                default: {
                  error_threshold: 90,
                  warn_threshold: 80,
                },
                custom: {},
              },
              execution_control: {
                paused: false,
                paused_task_types: [],
              },
            });
            expect(updatedWorkers.value).toEqual({
              capacity: {
                config: 8,
                as_workers: 8,
                as_cost: 16,
              },
              claim_strategy: 'mget',
              poll_interval: 6000000,
              request_capacity: 1000,
              monitored_aggregated_stats_refresh_rate: 5000,
              monitored_stats_running_average_window: 50,
              monitored_task_execution_thresholds: {
                default: {
                  error_threshold: 90,
                  warn_threshold: 80,
                },
                custom: {},
              },
              execution_control: {
                paused: false,
                paused_task_types: [],
              },
            });
            resolve();
          }, reject);
        capacityConfiguration$.next(8);
      } catch (error) {
        reject(error);
      }
    });
  });

  test('reports the execution control state on a node without a polling lifecycle (UI-only node)', async () => {
    const executionControlService = taskExecutionControlServiceMock.create({
      paused: true,
      pausedTaskTypes: ['alerting:foo'],
    });

    const { value } = await firstValueFrom(
      // No taskPollingLifecycle (UI-only node), but the execution control
      // service still knows the real pause state.
      createConfigurationAggregator(configuration, 10, undefined, executionControlService)
    );

    expect(value.execution_control).toEqual({
      paused: true,
      paused_task_types: ['alerting:foo'],
    });
  });
});
