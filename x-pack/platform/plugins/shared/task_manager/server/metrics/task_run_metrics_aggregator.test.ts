/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import * as uuid from 'uuid';
import { loggingSystemMock } from '@kbn/core/server/mocks';
import { asOk, asErr } from '../lib/result_type';
import { TaskStatus } from '../task';
import type { TaskManagerStats } from '../task_events';
import { asTaskManagerStatEvent, asTaskRunEvent, TaskPersistence } from '../task_events';
import { TaskRunResult } from '../task_running';
import { TaskRunMetricsAggregator } from './task_run_metrics_aggregator';

const logger = loggingSystemMock.createLogger();

const EMPTY_DURATION = { duration: { counts: [], values: [] }, duration_values: [] };

export const getTaskRunSuccessEvent = (type: string, isExpired: boolean = false) => {
  const id = uuid.v4();
  return asTaskRunEvent(
    id,
    asOk({
      task: {
        id,
        attempts: 0,
        status: TaskStatus.Running,
        version: '123',
        runAt: new Date(),
        scheduledAt: new Date(),
        startedAt: new Date(),
        retryAt: new Date(Date.now() + 5 * 60 * 1000),
        state: {},
        taskType: type,
        params: {},
        ownerId: null,
      },
      persistence: TaskPersistence.Recurring,
      result: TaskRunResult.Success,
      isExpired,
    }),
    {
      start: 1689698780490,
      stop: 1689698780500,
    }
  );
};

export const getTaskRunFailedEvent = (
  type: string,
  isExpired: boolean = false,
  result: TaskRunResult = TaskRunResult.Failed
) => {
  const id = uuid.v4();
  return asTaskRunEvent(
    id,
    asErr({
      error: new Error('task failed to run'),
      task: {
        id,
        attempts: 0,
        status: TaskStatus.Running,
        version: '123',
        runAt: new Date(),
        scheduledAt: new Date(),
        startedAt: new Date(),
        retryAt: new Date(Date.now() + 5 * 60 * 1000),
        state: {},
        taskType: type,
        params: {},
        ownerId: null,
      },
      persistence: TaskPersistence.Recurring,
      result,
      isExpired,
    })
  );
};

export const getTaskManagerStatEvent = (value: number, id: TaskManagerStats = 'runDelay') => {
  return asTaskManagerStatEvent(id, asOk(value));
};

describe('TaskRunMetricsAggregator', () => {
  let taskRunMetricsAggregator: TaskRunMetricsAggregator;
  beforeEach(() => {
    taskRunMetricsAggregator = new TaskRunMetricsAggregator(logger);
  });

  test('should correctly initialize', () => {
    expect(taskRunMetricsAggregator.collect()).toEqual({
      overall: {
        success: 0,
        not_timed_out: 0,
        total: 0,
        framework_errors: 0,
        user_errors: 0,
        delay: { counts: [], values: [] },
        duration: { counts: [], values: [] },
        duration_values: [],
        total_errors: 0,
        delay_values: [],
        rescheduled_failures: 0,
      },
    });
  });

  test('should correctly return initialMetrics', () => {
    expect(taskRunMetricsAggregator.initialMetric()).toEqual({
      overall: {
        success: 0,
        not_timed_out: 0,
        total: 0,
        framework_errors: 0,
        user_errors: 0,
        delay: { counts: [], values: [] },
        duration: { counts: [], values: [] },
        duration_values: [],
        total_errors: 0,
        delay_values: [],
        rescheduled_failures: 0,
      },
      by_type: {},
    });
  });

  test('should correctly process task run success event', () => {
    taskRunMetricsAggregator.processTaskLifecycleEvent(getTaskRunSuccessEvent('telemetry'));
    taskRunMetricsAggregator.processTaskLifecycleEvent(getTaskRunSuccessEvent('telemetry'));
    expect(taskRunMetricsAggregator.collect()).toEqual({
      overall: {
        success: 2,
        not_timed_out: 2,
        total: 2,
        framework_errors: 0,
        user_errors: 0,
        delay: { counts: [], values: [] },
        duration: { counts: [2], values: [10000] },
        duration_values: [10, 10],
        total_errors: 0,
        delay_values: [],
        rescheduled_failures: 0,
      },
      by_type: {
        telemetry: {
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
      },
    });
  });

  test('should correctly process task manager runDelay stat', () => {
    taskRunMetricsAggregator.processTaskLifecycleEvent(getTaskManagerStatEvent(3.343));
    expect(taskRunMetricsAggregator.collect()).toEqual({
      overall: {
        success: 0,
        not_timed_out: 0,
        total: 0,
        framework_errors: 0,
        user_errors: 0,
        delay: { counts: [1], values: [10] },
        duration: { counts: [], values: [] },
        duration_values: [],
        total_errors: 0,
        delay_values: [3],
        rescheduled_failures: 0,
      },
    });
  });

  test('should ignore task manager stats that are not runDelays', () => {
    taskRunMetricsAggregator.processTaskLifecycleEvent(
      getTaskManagerStatEvent(3.343, 'pollingDelay')
    );
    expect(taskRunMetricsAggregator.collect()).toEqual({
      overall: {
        success: 0,
        not_timed_out: 0,
        total: 0,
        framework_errors: 0,
        user_errors: 0,
        delay: { counts: [], values: [] },
        duration: { counts: [], values: [] },
        duration_values: [],
        total_errors: 0,
        delay_values: [],
        rescheduled_failures: 0,
      },
    });
  });

  test('should correctly process task run success event where task run has timed out', () => {
    taskRunMetricsAggregator.processTaskLifecycleEvent(getTaskRunSuccessEvent('telemetry', true));
    taskRunMetricsAggregator.processTaskLifecycleEvent(getTaskRunSuccessEvent('telemetry', true));
    expect(taskRunMetricsAggregator.collect()).toEqual({
      overall: {
        success: 2,
        not_timed_out: 0,
        total: 2,
        framework_errors: 0,
        user_errors: 0,
        delay: { counts: [], values: [] },
        duration: { counts: [2], values: [10000] },
        duration_values: [10, 10],
        total_errors: 0,
        delay_values: [],
        rescheduled_failures: 0,
      },
      by_type: {
        telemetry: {
          success: 2,
          not_timed_out: 0,
          total: 2,
          framework_errors: 0,
          user_errors: 0,
          total_errors: 0,
          rescheduled_failures: 0,
          duration: { counts: [2], values: [10000] },
          duration_values: [10, 10],
        },
      },
    });
  });

  test('should correctly process task run failure event', () => {
    taskRunMetricsAggregator.processTaskLifecycleEvent(getTaskRunFailedEvent('telemetry'));
    taskRunMetricsAggregator.processTaskLifecycleEvent(getTaskRunFailedEvent('telemetry'));
    expect(taskRunMetricsAggregator.collect()).toEqual({
      overall: {
        success: 0,
        not_timed_out: 2,
        total: 2,
        framework_errors: 2,
        user_errors: 0,
        delay: { counts: [], values: [] },
        duration: { counts: [], values: [] },
        duration_values: [],
        total_errors: 2,
        delay_values: [],
        rescheduled_failures: 0,
      },
      by_type: {
        telemetry: {
          success: 0,
          not_timed_out: 2,
          total: 2,
          framework_errors: 2,
          user_errors: 0,
          total_errors: 2,
          rescheduled_failures: 0,
          ...EMPTY_DURATION,
        },
      },
    });
  });

  test('should correctly process task run rescheduled failure event', () => {
    taskRunMetricsAggregator.processTaskLifecycleEvent(
      getTaskRunFailedEvent('telemetry', false, TaskRunResult.RetryScheduled)
    );
    taskRunMetricsAggregator.processTaskLifecycleEvent(
      getTaskRunFailedEvent('telemetry', false, TaskRunResult.RetryScheduled)
    );
    expect(taskRunMetricsAggregator.collect()).toEqual({
      overall: {
        success: 0,
        not_timed_out: 2,
        total: 2,
        framework_errors: 2,
        user_errors: 0,
        delay: { counts: [], values: [] },
        duration: { counts: [], values: [] },
        duration_values: [],
        total_errors: 2,
        delay_values: [],
        rescheduled_failures: 2,
      },
      by_type: {
        telemetry: {
          success: 0,
          not_timed_out: 2,
          total: 2,
          framework_errors: 2,
          user_errors: 0,
          total_errors: 2,
          rescheduled_failures: 2,
          ...EMPTY_DURATION,
        },
      },
    });
  });

  test('should correctly process task run failure event where task run has timed out', () => {
    taskRunMetricsAggregator.processTaskLifecycleEvent(getTaskRunFailedEvent('telemetry', true));
    taskRunMetricsAggregator.processTaskLifecycleEvent(getTaskRunFailedEvent('telemetry', true));
    expect(taskRunMetricsAggregator.collect()).toEqual({
      overall: {
        success: 0,
        not_timed_out: 0,
        total: 2,
        framework_errors: 2,
        user_errors: 0,
        delay: { counts: [], values: [] },
        duration: { counts: [], values: [] },
        duration_values: [],
        total_errors: 2,
        delay_values: [],
        rescheduled_failures: 0,
      },
      by_type: {
        telemetry: {
          success: 0,
          not_timed_out: 0,
          total: 2,
          framework_errors: 2,
          user_errors: 0,
          total_errors: 2,
          rescheduled_failures: 0,
          ...EMPTY_DURATION,
        },
      },
    });
  });

  test('should correctly process different task types', () => {
    taskRunMetricsAggregator.processTaskLifecycleEvent(getTaskRunSuccessEvent('telemetry'));
    taskRunMetricsAggregator.processTaskLifecycleEvent(getTaskRunSuccessEvent('report'));
    taskRunMetricsAggregator.processTaskLifecycleEvent(getTaskRunSuccessEvent('report', true));
    taskRunMetricsAggregator.processTaskLifecycleEvent(getTaskRunFailedEvent('telemetry'));
    expect(taskRunMetricsAggregator.collect()).toEqual({
      overall: {
        success: 3,
        not_timed_out: 3,
        total: 4,
        framework_errors: 1,
        user_errors: 0,
        delay: { counts: [], values: [] },
        duration: { counts: [3], values: [10000] },
        duration_values: [10, 10, 10],
        total_errors: 1,
        delay_values: [],
        rescheduled_failures: 0,
      },
      by_type: {
        report: {
          success: 2,
          not_timed_out: 1,
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
          not_timed_out: 2,
          total: 2,
          framework_errors: 1,
          user_errors: 0,
          total_errors: 1,
          rescheduled_failures: 0,
          duration: { counts: [1], values: [10000] },
          duration_values: [10],
        },
      },
    });
  });

  test('should correctly group alerting and action task types', () => {
    taskRunMetricsAggregator.processTaskLifecycleEvent(getTaskRunSuccessEvent('telemetry'));
    taskRunMetricsAggregator.processTaskLifecycleEvent(getTaskRunSuccessEvent('report'));
    taskRunMetricsAggregator.processTaskLifecycleEvent(getTaskRunSuccessEvent('report'));
    taskRunMetricsAggregator.processTaskLifecycleEvent(getTaskRunFailedEvent('telemetry'));
    taskRunMetricsAggregator.processTaskLifecycleEvent(
      getTaskRunSuccessEvent('alerting:example', true)
    );
    taskRunMetricsAggregator.processTaskLifecycleEvent(getTaskRunSuccessEvent('alerting:example'));
    taskRunMetricsAggregator.processTaskLifecycleEvent(
      getTaskRunSuccessEvent('alerting:.index-threshold')
    );
    taskRunMetricsAggregator.processTaskLifecycleEvent(getTaskRunSuccessEvent('actions:webhook'));
    taskRunMetricsAggregator.processTaskLifecycleEvent(getTaskRunFailedEvent('alerting:example'));
    taskRunMetricsAggregator.processTaskLifecycleEvent(getTaskRunSuccessEvent('actions:webhook'));
    taskRunMetricsAggregator.processTaskLifecycleEvent(getTaskRunSuccessEvent('alerting:example'));
    taskRunMetricsAggregator.processTaskLifecycleEvent(getTaskRunFailedEvent('alerting:example'));
    taskRunMetricsAggregator.processTaskLifecycleEvent(getTaskRunSuccessEvent('actions:.email'));
    taskRunMetricsAggregator.processTaskLifecycleEvent(
      getTaskRunSuccessEvent('alerting:.index-threshold', true)
    );
    expect(taskRunMetricsAggregator.collect()).toEqual({
      overall: {
        success: 11,
        not_timed_out: 12,
        total: 14,
        framework_errors: 3,
        user_errors: 0,
        delay: { counts: [], values: [] },
        duration: { counts: [11], values: [10000] },
        duration_values: [10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10],
        total_errors: 3,
        delay_values: [],
        rescheduled_failures: 0,
      },
      by_type: {
        actions: {
          success: 3,
          not_timed_out: 3,
          total: 3,
          framework_errors: 0,
          user_errors: 0,
          total_errors: 0,
          rescheduled_failures: 0,
          duration: { counts: [3], values: [10000] },
          duration_values: [10, 10, 10],
        },
        'actions:__email': {
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
        'actions:webhook': {
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
        alerting: {
          success: 5,
          not_timed_out: 5,
          total: 7,
          framework_errors: 2,
          user_errors: 0,
          total_errors: 2,
          rescheduled_failures: 0,
          duration: { counts: [5], values: [10000] },
          duration_values: [10, 10, 10, 10, 10],
        },
        'alerting:example': {
          success: 3,
          not_timed_out: 4,
          total: 5,
          framework_errors: 2,
          user_errors: 0,
          total_errors: 2,
          rescheduled_failures: 0,
          duration: { counts: [3], values: [10000] },
          duration_values: [10, 10, 10],
        },
        'alerting:__index-threshold': {
          success: 2,
          not_timed_out: 1,
          total: 2,
          framework_errors: 0,
          user_errors: 0,
          total_errors: 0,
          rescheduled_failures: 0,
          duration: { counts: [2], values: [10000] },
          duration_values: [10, 10],
        },
        report: {
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
          not_timed_out: 2,
          total: 2,
          framework_errors: 1,
          user_errors: 0,
          total_errors: 1,
          rescheduled_failures: 0,
          duration: { counts: [1], values: [10000] },
          duration_values: [10],
        },
      },
    });
  });

  test('should correctly track duration by task type', () => {
    taskRunMetricsAggregator.processTaskLifecycleEvent(getTaskRunSuccessEvent('telemetry'));
    taskRunMetricsAggregator.processTaskLifecycleEvent(getTaskRunSuccessEvent('report'));
    taskRunMetricsAggregator.processTaskLifecycleEvent(getTaskRunFailedEvent('telemetry'));
    expect(taskRunMetricsAggregator.collect()).toEqual(
      expect.objectContaining({
        overall: expect.objectContaining({
          duration: { counts: [2], values: [10000] },
          duration_values: [10, 10],
        }),
        by_type: expect.objectContaining({
          telemetry: expect.objectContaining({
            duration: { counts: [1], values: [10000] },
            duration_values: [10],
          }),
          report: expect.objectContaining({
            duration: { counts: [1], values: [10000] },
            duration_values: [10],
          }),
        }),
      })
    );
  });

  test('should correctly reset counter', () => {
    taskRunMetricsAggregator.processTaskLifecycleEvent(getTaskManagerStatEvent(3.343));
    taskRunMetricsAggregator.processTaskLifecycleEvent(getTaskManagerStatEvent(25.45));
    taskRunMetricsAggregator.processTaskLifecycleEvent(getTaskManagerStatEvent(6.4478));
    taskRunMetricsAggregator.processTaskLifecycleEvent(getTaskManagerStatEvent(9.241));

    taskRunMetricsAggregator.processTaskLifecycleEvent(getTaskRunSuccessEvent('telemetry'));
    taskRunMetricsAggregator.processTaskLifecycleEvent(getTaskRunSuccessEvent('report'));
    taskRunMetricsAggregator.processTaskLifecycleEvent(getTaskRunSuccessEvent('report'));
    taskRunMetricsAggregator.processTaskLifecycleEvent(getTaskRunFailedEvent('telemetry'));
    taskRunMetricsAggregator.processTaskLifecycleEvent(
      getTaskRunSuccessEvent('alerting:example', true)
    );
    taskRunMetricsAggregator.processTaskLifecycleEvent(getTaskRunSuccessEvent('alerting:example'));
    taskRunMetricsAggregator.processTaskLifecycleEvent(
      getTaskRunSuccessEvent('alerting:.index-threshold', true)
    );
    taskRunMetricsAggregator.processTaskLifecycleEvent(getTaskRunSuccessEvent('actions:webhook'));
    taskRunMetricsAggregator.processTaskLifecycleEvent(getTaskRunFailedEvent('alerting:example'));
    taskRunMetricsAggregator.processTaskLifecycleEvent(getTaskRunSuccessEvent('actions:webhook'));
    taskRunMetricsAggregator.processTaskLifecycleEvent(getTaskRunSuccessEvent('alerting:example'));
    taskRunMetricsAggregator.processTaskLifecycleEvent(getTaskRunFailedEvent('alerting:example'));
    taskRunMetricsAggregator.processTaskLifecycleEvent(getTaskRunSuccessEvent('actions:.email'));
    taskRunMetricsAggregator.processTaskLifecycleEvent(
      getTaskRunSuccessEvent('alerting:.index-threshold')
    );
    expect(taskRunMetricsAggregator.collect()).toEqual({
      overall: {
        success: 11,
        not_timed_out: 12,
        total: 14,
        delay: { counts: [3, 0, 1], values: [10, 20, 30] },
        duration: { counts: [11], values: [10000] },
        duration_values: [10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10],
        delay_values: [3, 25, 6, 9],
        framework_errors: 3,
        user_errors: 0,
        total_errors: 3,
        rescheduled_failures: 0,
      },
      by_type: {
        actions: {
          success: 3,
          not_timed_out: 3,
          total: 3,
          framework_errors: 0,
          user_errors: 0,
          total_errors: 0,
          rescheduled_failures: 0,
          duration: { counts: [3], values: [10000] },
          duration_values: [10, 10, 10],
        },
        'actions:__email': {
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
        'actions:webhook': {
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
        alerting: {
          success: 5,
          not_timed_out: 5,
          total: 7,
          framework_errors: 2,
          user_errors: 0,
          total_errors: 2,
          rescheduled_failures: 0,
          duration: { counts: [5], values: [10000] },
          duration_values: [10, 10, 10, 10, 10],
        },
        'alerting:example': {
          success: 3,
          not_timed_out: 4,
          total: 5,
          framework_errors: 2,
          user_errors: 0,
          total_errors: 2,
          rescheduled_failures: 0,
          duration: { counts: [3], values: [10000] },
          duration_values: [10, 10, 10],
        },
        'alerting:__index-threshold': {
          success: 2,
          not_timed_out: 1,
          total: 2,
          framework_errors: 0,
          user_errors: 0,
          total_errors: 0,
          rescheduled_failures: 0,
          duration: { counts: [2], values: [10000] },
          duration_values: [10, 10],
        },
        report: {
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
          not_timed_out: 2,
          total: 2,
          framework_errors: 1,
          user_errors: 0,
          total_errors: 1,
          rescheduled_failures: 0,
          duration: { counts: [1], values: [10000] },
          duration_values: [10],
        },
      },
    });

    taskRunMetricsAggregator.reset();
    expect(taskRunMetricsAggregator.collect()).toEqual({
      overall: {
        success: 0,
        not_timed_out: 0,
        total: 0,
        framework_errors: 0,
        user_errors: 0,
        delay: { counts: [], values: [] },
        duration: { counts: [], values: [] },
        duration_values: [],
        total_errors: 0,
        delay_values: [],
        rescheduled_failures: 0,
      },
      by_type: {
        actions: {
          success: 0,
          not_timed_out: 0,
          total: 0,
          framework_errors: 0,
          user_errors: 0,
          total_errors: 0,
          rescheduled_failures: 0,
          ...EMPTY_DURATION,
        },
        'actions:__email': {
          success: 0,
          not_timed_out: 0,
          total: 0,
          framework_errors: 0,
          user_errors: 0,
          total_errors: 0,
          rescheduled_failures: 0,
          ...EMPTY_DURATION,
        },
        'actions:webhook': {
          success: 0,
          not_timed_out: 0,
          total: 0,
          framework_errors: 0,
          user_errors: 0,
          total_errors: 0,
          rescheduled_failures: 0,
          ...EMPTY_DURATION,
        },
        alerting: {
          success: 0,
          not_timed_out: 0,
          total: 0,
          framework_errors: 0,
          user_errors: 0,
          total_errors: 0,
          rescheduled_failures: 0,
          ...EMPTY_DURATION,
        },
        'alerting:example': {
          success: 0,
          not_timed_out: 0,
          total: 0,
          framework_errors: 0,
          user_errors: 0,
          total_errors: 0,
          rescheduled_failures: 0,
          ...EMPTY_DURATION,
        },
        'alerting:__index-threshold': {
          success: 0,
          not_timed_out: 0,
          total: 0,
          framework_errors: 0,
          user_errors: 0,
          total_errors: 0,
          rescheduled_failures: 0,
          ...EMPTY_DURATION,
        },
        report: {
          success: 0,
          not_timed_out: 0,
          total: 0,
          framework_errors: 0,
          user_errors: 0,
          total_errors: 0,
          rescheduled_failures: 0,
          ...EMPTY_DURATION,
        },
        telemetry: {
          success: 0,
          not_timed_out: 0,
          total: 0,
          framework_errors: 0,
          user_errors: 0,
          total_errors: 0,
          rescheduled_failures: 0,
          ...EMPTY_DURATION,
        },
      },
    });
  });
});
