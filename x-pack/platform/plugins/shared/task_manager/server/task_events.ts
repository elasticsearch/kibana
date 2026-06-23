/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { monitorEventLoopDelay } from 'perf_hooks';

import type { ConcreteTaskInstance } from './task';

import type { Result, Err } from './lib/result_type';
import type { ClaimAndFillPoolResult } from './lib/fill_pool';
import type { PollingError } from './polling';
import type { DecoratedError, TaskRunResult } from './task_running';
import type { EventLoopDelayConfig } from './config';
import type { TaskManagerMetrics } from './metrics/task_metrics_collector';

export enum TaskPersistence {
  Recurring = 'recurring',
  NonRecurring = 'non_recurring',
}

export enum TaskEventType {
  TASK_CLAIM = 'TASK_CLAIM',
  TASK_MARK_RUNNING = 'TASK_MARK_RUNNING',
  TASK_RUN = 'TASK_RUN',
  TASK_RUN_REQUEST = 'TASK_RUN_REQUEST',
  TASK_POLLING_CYCLE = 'TASK_POLLING_CYCLE',
  TASK_MANAGER_METRIC = 'TASK_MANAGER_METRIC',
  TASK_MANAGER_STAT = 'TASK_MANAGER_STAT',
}

export interface TaskTiming {
  start: number;
  stop: number;
  eventLoopBlockMs?: number;
}
export type WithTaskTiming<T> = T & { timing: TaskTiming };

export function startTaskTimer(): () => TaskTiming {
  const start = Date.now();
  return () => ({ start, stop: Date.now() });
}

/**
 * Starts event-loop delay (ELD) monitoring and returns a stop function.
 * The stop function disables the histogram and returns the max block time in ms.
 * It must be called exactly once — calling it disables the histogram as a side effect.
 */
export function startEventLoopMonitoring(eventLoopDelayConfig: EventLoopDelayConfig): () => number {
  const eldHistogram = eventLoopDelayConfig.monitor ? monitorEventLoopDelay() : null;
  eldHistogram?.enable();
  return () => {
    eldHistogram?.disable();
    const eldMaxNs = eldHistogram?.max ?? 0;
    return Math.round(eldMaxNs / 1_000_000);
  };
}

export interface TaskEvent<OkResult, ErrorResult, ID = string> {
  id?: ID;
  timing?: TaskTiming;
  type: TaskEventType;
  event: Result<OkResult, ErrorResult>;
}
export interface RanTask {
  task: ConcreteTaskInstance;
  persistence: TaskPersistence;
  result: TaskRunResult;
  isExpired: boolean;
}
export type ErroredTask = RanTask & {
  error: DecoratedError;
};

export type TaskMarkRunning = TaskEvent<ConcreteTaskInstance, Error>;
export type TaskRun = TaskEvent<RanTask, ErroredTask>;
export type TaskClaim = TaskEvent<ConcreteTaskInstance, Error>;
export type TaskRunRequest = TaskEvent<ConcreteTaskInstance, Error>;
export type TaskPollingCycle<T = string> = TaskEvent<ClaimAndFillPoolResult, PollingError<T>>;
export type TaskManagerMetric = TaskEvent<TaskManagerMetrics, Error>;

export type TaskManagerStats =
  | 'load'
  | 'pollingDelay'
  | 'claimDuration'
  | 'workerUtilization'
  | 'runDelay';
export type TaskManagerStat = TaskEvent<number, never, TaskManagerStats>;

export type OkResultOf<EventType> = EventType extends TaskEvent<infer OkResult, infer ErrorResult>
  ? OkResult
  : never;
export type ErrResultOf<EventType> = EventType extends TaskEvent<infer OkResult, infer ErrorResult>
  ? ErrorResult
  : never;

export function asTaskMarkRunningEvent(
  id: string,
  event: Result<ConcreteTaskInstance, Error>,
  timing?: TaskTiming
): TaskMarkRunning {
  return {
    id,
    type: TaskEventType.TASK_MARK_RUNNING,
    event,
    timing,
  };
}

export function asTaskRunEvent(
  id: string,
  event: Result<RanTask, ErroredTask>,
  timing?: TaskTiming
): TaskRun {
  return {
    id,
    type: TaskEventType.TASK_RUN,
    event,
    timing,
  };
}

export function asTaskClaimEvent(
  id: string,
  event: Result<ConcreteTaskInstance, Error>,
  timing?: TaskTiming
): TaskClaim {
  return {
    id,
    type: TaskEventType.TASK_CLAIM,
    event,
    timing,
  };
}

export function asTaskRunRequestEvent(
  id: string,
  // we only emit a TaskRunRequest event when it fails
  event: Err<Error>,
  timing?: TaskTiming
): TaskRunRequest {
  return {
    id,
    type: TaskEventType.TASK_RUN_REQUEST,
    event,
    timing,
  };
}

export function asTaskPollingCycleEvent<T = string>(
  event: Result<ClaimAndFillPoolResult, PollingError<T>>,
  timing?: TaskTiming
): TaskPollingCycle<T> {
  return {
    type: TaskEventType.TASK_POLLING_CYCLE,
    event,
    timing,
  };
}

export function asTaskManagerStatEvent(
  id: TaskManagerStats,
  event: Result<number, never>
): TaskManagerStat {
  return {
    id,
    type: TaskEventType.TASK_MANAGER_STAT,
    event,
  };
}

export function asTaskManagerMetricEvent(
  event: Result<TaskManagerMetrics, never>
): TaskManagerMetric {
  return {
    type: TaskEventType.TASK_MANAGER_METRIC,
    event,
  };
}

export function isTaskMarkRunningEvent(
  taskEvent: TaskEvent<unknown, unknown>
): taskEvent is TaskMarkRunning {
  return taskEvent.type === TaskEventType.TASK_MARK_RUNNING;
}
export function isTaskRunEvent(taskEvent: TaskEvent<unknown, unknown>): taskEvent is TaskRun {
  return taskEvent.type === TaskEventType.TASK_RUN;
}
export function isTaskClaimEvent(taskEvent: TaskEvent<unknown, unknown>): taskEvent is TaskClaim {
  return taskEvent.type === TaskEventType.TASK_CLAIM;
}
export function isTaskRunRequestEvent(
  taskEvent: TaskEvent<unknown, unknown>
): taskEvent is TaskRunRequest {
  return taskEvent.type === TaskEventType.TASK_RUN_REQUEST;
}
export function isTaskPollingCycleEvent<T = string>(
  taskEvent: TaskEvent<unknown, unknown>
): taskEvent is TaskPollingCycle<T> {
  return taskEvent.type === TaskEventType.TASK_POLLING_CYCLE;
}
export function isTaskManagerStatEvent(
  taskEvent: TaskEvent<unknown, unknown>
): taskEvent is TaskManagerStat {
  return taskEvent.type === TaskEventType.TASK_MANAGER_STAT;
}
export function isTaskManagerWorkerUtilizationStatEvent(
  taskEvent: TaskEvent<unknown, unknown>
): taskEvent is TaskManagerStat {
  return taskEvent.type === TaskEventType.TASK_MANAGER_STAT && taskEvent.id === 'workerUtilization';
}
export function isTaskManagerMetricEvent(
  taskEvent: TaskEvent<unknown, unknown>
): taskEvent is TaskManagerStat {
  return taskEvent.type === TaskEventType.TASK_MANAGER_METRIC;
}
