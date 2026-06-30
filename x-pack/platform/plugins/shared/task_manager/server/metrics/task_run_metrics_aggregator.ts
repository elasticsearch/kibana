/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { JsonObject } from '@kbn/utility-types';
import { merge } from 'lodash';
import type { Logger } from '@kbn/core/server';
import { TaskRunResult, isUserError } from '../task_running';
import type { Ok } from '../lib/result_type';
import { isOk, unwrap } from '../lib/result_type';
import type { TaskLifecycleEvent } from '../polling_lifecycle';
import type { ErroredTask, RanTask, TaskManagerStat, TaskRun } from '../task_events';
import { isTaskManagerStatEvent, isTaskRunEvent } from '../task_events';
import type { SerializedHistogram } from './lib';
import { getTaskTypeGroup, MetricCounterService, SimpleHistogram } from './lib';
import type { ITaskMetricsAggregator } from './types';

const HDR_HISTOGRAM_MAX = 5400; // 90 minutes
const HDR_HISTOGRAM_BUCKET_SIZE = 10; // 10 seconds

// Task run durations are recorded in milliseconds (matching the task claim duration metric).
const DURATION_HDR_HISTOGRAM_MAX = 5_400_000; // 90 minutes (in milliseconds)
const DURATION_HDR_HISTOGRAM_BUCKET_SIZE = 10_000; // 10 seconds (in milliseconds)

enum TaskRunKeys {
  SUCCESS = 'success',
  NOT_TIMED_OUT = 'not_timed_out',
  TOTAL = 'total',
  TOTAL_ERRORS = 'total_errors',
  RESCHEDULED_FAILURES = 'rescheduled_failures',
  USER_ERRORS = 'user_errors',
  FRAMEWORK_ERRORS = 'framework_errors',
}

enum TaskRunMetricKeys {
  OVERALL = 'overall',
  BY_TYPE = 'by_type',
}

interface TaskRunCounts extends JsonObject {
  [TaskRunKeys.SUCCESS]: number;
  [TaskRunKeys.NOT_TIMED_OUT]: number;
  [TaskRunKeys.TOTAL]: number;
  [TaskRunKeys.USER_ERRORS]: number;
  [TaskRunKeys.FRAMEWORK_ERRORS]: number;
  [TaskRunKeys.RESCHEDULED_FAILURES]: number;
}

export interface TaskRunMetrics extends JsonObject {
  [TaskRunMetricKeys.OVERALL]: TaskRunCounts;
  [TaskRunMetricKeys.BY_TYPE]: {
    [key: string]: TaskRunCounts;
  };
}

export interface TaskRunMetric extends JsonObject {
  overall: TaskRunMetrics['overall'] & {
    delay: SerializedHistogram;
    delay_values: number[];
    // Duration (in milliseconds) of task runs, i.e. how long tasks take to execute.
    duration: SerializedHistogram;
    duration_values: number[];
  };
  by_type: {
    [key: string]: TaskRunCounts & {
      duration: SerializedHistogram;
      duration_values: number[];
    };
  };
}

export class TaskRunMetricsAggregator implements ITaskMetricsAggregator<TaskRunMetric> {
  private logger: Logger;
  private counter: MetricCounterService<TaskRunMetric> = new MetricCounterService(
    Object.values(TaskRunKeys),
    TaskRunMetricKeys.OVERALL
  );
  private delayHistogram = new SimpleHistogram(HDR_HISTOGRAM_MAX, HDR_HISTOGRAM_BUCKET_SIZE);
  private durationHistogram = new SimpleHistogram(
    DURATION_HDR_HISTOGRAM_MAX,
    DURATION_HDR_HISTOGRAM_BUCKET_SIZE
  );
  private typeHistograms = new Map<string, SimpleHistogram>();

  constructor(logger: Logger) {
    this.logger = logger;
  }

  public initialMetric(): TaskRunMetric {
    return merge(this.counter.initialMetrics(), {
      by_type: {},
      overall: {
        delay: { counts: [], values: [] },
        delay_values: [],
        duration: { counts: [], values: [] },
        duration_values: [],
      },
    });
  }

  public collect(): TaskRunMetric {
    const metrics = merge(this.counter.collect(), {
      overall: {
        delay: this.delayHistogram.serialize(),
        delay_values: this.delayHistogram.getAllValues(),
        duration: this.durationHistogram.serialize(),
        duration_values: this.durationHistogram.getAllValues(),
      },
    }) as TaskRunMetric;

    for (const [key, value] of Object.entries(metrics.by_type ?? {})) {
      const histogram = this.typeHistograms.get(key);
      metrics.by_type[key] = {
        ...value,
        duration: histogram?.serialize() ?? { counts: [], values: [] },
        duration_values: histogram?.getAllValues() ?? [],
      };
    }

    return metrics;
  }

  public reset() {
    this.counter.reset();
    this.delayHistogram.reset();
    this.durationHistogram.reset();
    for (const histogram of this.typeHistograms.values()) {
      histogram.reset();
    }
  }

  public processTaskLifecycleEvent(taskEvent: TaskLifecycleEvent) {
    if (isTaskRunEvent(taskEvent)) {
      this.processTaskRunEvent(taskEvent);
      this.logger.debug(
        () =>
          `Collected metrics after processing lifecycle event - ${JSON.stringify(this.collect())}`
      );
    } else if (isTaskManagerStatEvent(taskEvent)) {
      this.processTaskManagerStatEvent(taskEvent);
    }
  }

  private processTaskRunEvent(taskEvent: TaskRun) {
    const taskRunResult: RanTask | ErroredTask = unwrap(taskEvent.event);
    const { task, isExpired, result } = taskRunResult;
    const success = isOk((taskEvent as TaskRun).event);
    const taskType = task.taskType.replaceAll('.', '__');
    const taskTypeGroup = getTaskTypeGroup(taskType);

    // record how long the task took to execute (regardless of run outcome)
    if (taskEvent.timing) {
      const durationInMs = taskEvent.timing.stop - taskEvent.timing.start;
      this.durationHistogram.record(durationInMs);
      this.recordTypeDuration(taskType, durationInMs);
      if (taskTypeGroup) {
        this.recordTypeDuration(taskTypeGroup, durationInMs);
      }
    }

    // increment the total counters
    this.incrementCounters(TaskRunKeys.TOTAL, taskType, taskTypeGroup);

    // increment success counters
    if (success) {
      this.incrementCounters(TaskRunKeys.SUCCESS, taskType, taskTypeGroup);
    } else {
      this.logger.debug(`Incrementing error counter for task ${task.taskType}`);
      // increment total error counts
      this.incrementCounters(TaskRunKeys.TOTAL_ERRORS, taskType, taskTypeGroup);

      if (isUserError((taskRunResult as ErroredTask).error)) {
        // increment the user error counters
        this.incrementCounters(TaskRunKeys.USER_ERRORS, taskType, taskTypeGroup);
      } else {
        // increment the framework error counters
        this.incrementCounters(TaskRunKeys.FRAMEWORK_ERRORS, taskType, taskTypeGroup);
      }

      if (result === TaskRunResult.RetryScheduled) {
        // increment rescheduled failures
        this.incrementCounters(TaskRunKeys.RESCHEDULED_FAILURES, taskType, taskTypeGroup);
      }
    }

    // increment expired counters
    if (!isExpired) {
      this.incrementCounters(TaskRunKeys.NOT_TIMED_OUT, taskType, taskTypeGroup);
    }
  }

  private processTaskManagerStatEvent(taskEvent: TaskManagerStat) {
    if (taskEvent.id === 'runDelay') {
      const delayInSec = Math.round((taskEvent.event as Ok<number>).value);
      this.delayHistogram.record(delayInSec);
    }
  }

  private recordTypeDuration(key: string, durationInMs: number) {
    let histogram = this.typeHistograms.get(key);
    if (!histogram) {
      histogram = new SimpleHistogram(
        DURATION_HDR_HISTOGRAM_MAX,
        DURATION_HDR_HISTOGRAM_BUCKET_SIZE
      );
      this.typeHistograms.set(key, histogram);
    }
    histogram.record(durationInMs);
  }

  private incrementCounters(key: TaskRunKeys, taskType: string, group?: string) {
    this.counter.increment(key, TaskRunMetricKeys.OVERALL);
    this.counter.increment(key, `${TaskRunMetricKeys.BY_TYPE}.${taskType}`);
    if (group) {
      this.counter.increment(key, `${TaskRunMetricKeys.BY_TYPE}.${group}`);
    }
  }
}
