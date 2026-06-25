/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import pMap from 'p-map';
import { chunk, flatten, omit } from 'lodash';
import agent from 'elastic-apm-node';
import type { Logger } from '@kbn/core/server';
import { isEqual } from 'lodash';
import type { Middleware } from './lib/middleware';
import { parseIntervalAsMillisecond } from './lib/intervals';
import {
  TaskStatus,
  type ApiKeyOptions,
  type ConcreteTaskInstance,
  type IntervalSchedule,
  type RruleSchedule,
  type ScheduleOptions,
  type TaskInstanceWithDeprecatedFields,
  type TaskInstanceWithId,
} from './task';
import type { TaskStore } from './task_store';
import { ensureDeprecatedFieldsAreCorrected } from './lib/correct_deprecated_fields';
import { retryableBulkUpdate } from './lib/retryable_bulk_update';
import type { ErrorOutput } from './lib/bulk_operation_buffer';
import { calculateNextRunAtFromSchedule } from './lib/get_next_run_at';
import { TaskAlreadyRunningError } from './lib/errors';
import type { TaskPollingLifecycle } from './polling_lifecycle';
import { getExecutionId } from './lib/get_execution_id';

const scheduleOptionsToStoreApiKeyOptions = (
  options?: ScheduleOptions
): ApiKeyOptions | undefined => {
  if (!options) {
    return undefined;
  }
  const storeOpts: ApiKeyOptions = {};
  if (options.request) {
    storeOpts.request = options.request;
  }
  if (options.onEsKey === true) {
    storeOpts.onEsKey = true;
  }
  if (options.regenerateApiKey !== undefined) {
    storeOpts.regenerateApiKey = options.regenerateApiKey;
  }
  return Object.keys(storeOpts).length ? storeOpts : undefined;
};

const VERSION_CONFLICT_STATUS = 409;
const NOT_FOUND_STATUS = 404;
const BULK_ACTION_SIZE = 100;
export interface TaskSchedulingOpts {
  logger: Logger;
  taskStore: TaskStore;
  middleware: Middleware;
  taskManagerId: string;
  taskPollingLifecycle?: TaskPollingLifecycle; // subscribe to task lifecycle events
}

/**
 * return type of TaskScheduling.bulkUpdateSchedules method
 */
export interface BulkUpdateTaskResult {
  /**
   * list of successfully updated tasks
   */
  tasks: ConcreteTaskInstance[];

  /**
   * list of failed tasks and errors caused failure
   */
  errors: ErrorOutput[];
}
export interface RunSoonResult {
  id: ConcreteTaskInstance['id'];
  forced: boolean;
  /**
   * `true` when the task store update raced with another concurrent update
   * and was rejected with a 409 version conflict. The conflict is otherwise
   * swallowed (the task is not rescheduled), so callers that need to know
   * whether the task was actually rescheduled should inspect this flag and
   * retry as appropriate. Omitted when there was no conflict.
   * See https://github.com/elastic/kibana/issues/259686.
   */
  conflict?: boolean;
}

export interface RunNowResult {
  id: ConcreteTaskInstance['id'];
  state?: ConcreteTaskInstance['state'];
}

export class TaskScheduling {
  private store: TaskStore;
  private logger: Logger;
  private middleware: Middleware;
  private readonly taskPolling: TaskPollingLifecycle | undefined;

  /**
   * Initializes the task manager, preventing any further addition of middleware,
   * enabling the task manipulation methods, and beginning the background polling
   * mechanism.
   */
  constructor(opts: TaskSchedulingOpts) {
    this.logger = opts.logger;
    this.middleware = opts.middleware;
    this.store = opts.taskStore;
    this.taskPolling = opts.taskPollingLifecycle;
  }

  /**
   * Schedules a task.
   *
   * @param task - The task being scheduled.
   * @returns {Promise<ConcreteTaskInstance>}
   */
  public async schedule(
    taskInstance: TaskInstanceWithDeprecatedFields,
    options?: ScheduleOptions
  ): Promise<ConcreteTaskInstance> {
    const { taskInstance: modifiedTask } = await this.middleware.beforeSave({
      ...omit(options, 'apiKey', 'request'),
      taskInstance: ensureDeprecatedFieldsAreCorrected(taskInstance, this.logger),
    });

    const traceparent =
      agent.currentTransaction && agent.currentTransaction.type !== 'request'
        ? agent.currentTraceparent
        : '';

    return await this.store.schedule(
      {
        ...modifiedTask,
        traceparent: traceparent || '',
        enabled: modifiedTask.enabled ?? true,
      },
      scheduleOptionsToStoreApiKeyOptions(options)
    );
  }

  /**
   * Bulk schedules a task.
   *
   * @param tasks - The tasks being scheduled.
   * @returns {Promise<ConcreteTaskInstance>}
   */
  public async bulkSchedule(
    taskInstances: TaskInstanceWithDeprecatedFields[],
    options?: ScheduleOptions
  ): Promise<ConcreteTaskInstance[]> {
    const traceparent =
      agent.currentTransaction && agent.currentTransaction.type !== 'request'
        ? agent.currentTraceparent
        : '';
    const modifiedTasks = await Promise.all(
      taskInstances.map(async (taskInstance, i, arr) => {
        const { taskInstance: modifiedTask } = await this.middleware.beforeSave({
          ...omit(options, 'apiKey', 'request'),
          taskInstance: ensureDeprecatedFieldsAreCorrected(taskInstance, this.logger),
        });
        const enabled = modifiedTask.enabled ?? true;
        let scheduling: Partial<{ runAt: Date; scheduledAt: Date }> = {};
        if (enabled) {
          // Run now if there is only a single task.
          // Otherwise add jitter to avoid them firing together.
          scheduling =
            arr.length === 1
              ? { runAt: new Date(), scheduledAt: new Date() }
              : addJitter(modifiedTask.schedule?.interval) ?? {};
        }
        return {
          ...modifiedTask,
          traceparent: traceparent || '',
          enabled,
          ...scheduling,
        };
      })
    );

    return await this.store.bulkSchedule(
      modifiedTasks,
      scheduleOptionsToStoreApiKeyOptions(options)
    );
  }

  public async bulkDisable(
    taskIds: string[],
    clearStateIdsOrBoolean?: string[] | boolean,
    options?: ApiKeyOptions
  ) {
    return await retryableBulkUpdate({
      taskIds,
      store: this.store,
      getTasks: async (ids) => await this.bulkGetTasksHelper(ids),
      filter: (task) => !!task.enabled,
      map: (task) => ({
        ...task,
        enabled: false,
        ...((Array.isArray(clearStateIdsOrBoolean) && clearStateIdsOrBoolean.includes(task.id)) ||
        clearStateIdsOrBoolean === true
          ? { state: {} }
          : {}),
      }),
      validate: false,
      options,
    });
  }

  public async bulkEnable(taskIds: string[], runSoon: boolean = true, options?: ApiKeyOptions) {
    return await retryableBulkUpdate({
      taskIds,
      store: this.store,
      getTasks: async (ids) => await this.bulkGetTasksHelper(ids),
      filter: (task) => !task.enabled,
      map: (task, i, arr) => {
        if (runSoon) {
          // Run now if there is only a single task.
          // Otherwise add jitter to avoid them firing together.
          return arr.length === 1
            ? { ...task, enabled: true, runAt: new Date(), scheduledAt: new Date() }
            : { ...task, enabled: true, ...addJitter(task.schedule?.interval ?? '0s') };
        }
        return { ...task, enabled: true };
      },
      validate: false,
      options,
    });
  }

  public async bulkUpdateState(
    taskIds: string[],
    stateMapFn: (s: ConcreteTaskInstance['state'], id: string) => ConcreteTaskInstance['state'],
    options?: ApiKeyOptions
  ) {
    return await retryableBulkUpdate({
      taskIds,
      store: this.store,
      getTasks: async (ids) => await this.bulkGetTasksHelper(ids),
      filter: () => true,
      map: (task) => ({
        ...task,
        state: stateMapFn(task.state, task.id),
      }),
      validate: false,
      options,
    });
  }

  /**
   * Bulk updates schedules for tasks by ids.
   * Only tasks with `idle` status will be updated. Running tasks are skipped even when
   * `regenerateApiKey` is provided, because their `schedule` and `runAt` are recalculated after
   * the task run finishes.
   * @param {string[]} taskIds  - list of task ids
   * @param {IntervalSchedule | RruleSchedule} schedule  - new schedule
   * @returns {Promise<BulkUpdateTaskResult>}
   */
  public async bulkUpdateSchedules(
    taskIds: string[],
    schedule: IntervalSchedule | RruleSchedule,
    options?: ApiKeyOptions
  ): Promise<BulkUpdateTaskResult> {
    const shouldRegenerateApiKey = options?.regenerateApiKey === true;

    return retryableBulkUpdate({
      taskIds,
      store: this.store,
      getTasks: async (ids) => await this.bulkGetTasksHelper(ids),
      filter: (task) =>
        task.status === TaskStatus.Idle &&
        (shouldRegenerateApiKey || !isEqual(task.schedule, schedule)),
      map: (task) => {
        if (isEqual(task.schedule, schedule)) {
          return task;
        }

        const newRunAtInMs = calculateNextRunAtFromSchedule({
          schedule,
          startDate: task.scheduledAt,
        });

        return { ...task, schedule, runAt: new Date(newRunAtInMs) };
      },
      validate: false,
      /**
       * Because the schedule can be converted from Interval to Rrule and vice versa we want to a void a situation
       * where both are defined by passing mergeAttributes: false here.
       */
      mergeAttributes: false,
      options,
    });
  }

  private async bulkGetTasksHelper(taskIds: string[]) {
    const batches = await pMap(
      chunk(taskIds, BULK_ACTION_SIZE),
      async (taskIdsChunk) => this.store.bulkGet(taskIdsChunk),
      { concurrency: 10 }
    );
    return flatten(batches);
  }

  /**
   * Run task.
   *
   * @param taskId - The task being scheduled.
   * @returns {Promise<RunSoonResult>}
   */
  public async runSoon(taskId: string, force: boolean = false): Promise<RunSoonResult> {
    let forced: boolean = false;
    let conflict: boolean = false;
    const task = await this.store.get(taskId);

    if (task.status === TaskStatus.Unrecognized) {
      throw new Error(`Failed to run task "${taskId}" with status ${task.status}`);
    }

    if (task.status === TaskStatus.Claiming) {
      throw new TaskAlreadyRunningError(taskId);
    }

    if (task.status === TaskStatus.Running) {
      if (!force) {
        throw new TaskAlreadyRunningError(taskId);
      }

      // check if task is currently running
      const currentTaskIds = this.taskPolling?.getCurrentTasksInPool() || [];
      const currentExecutionIds = currentTaskIds.map((executionId) => getExecutionId(executionId));

      if (currentExecutionIds.includes(taskId)) {
        throw new TaskAlreadyRunningError(taskId, true);
      } else {
        forced = true;
      }
    }

    try {
      await this.store.update(
        {
          ...task,
          status: TaskStatus.Idle,
          scheduledAt: new Date(),
          runAt: new Date(),
        },
        { validate: false }
      );
    } catch (e) {
      if (e.statusCode === 409) {
        this.logger.debug(
          `Failed to update the task (${taskId}) for runSoon due to conflict (409)`
        );
        conflict = true;
      } else {
        this.logger.error(`Failed to update the task (${taskId}) for runSoon`);
        throw e;
      }
    }
    return conflict ? { id: task.id, forced, conflict: true } : { id: task.id, forced };
  }

  /**
   * Schedules a task with an Id
   *
   * @param task - The task being scheduled.
   * @returns {Promise<TaskInstanceWithId>}
   */
  public async ensureScheduled(
    taskInstance: TaskInstanceWithId,
    options?: ScheduleOptions
  ): Promise<TaskInstanceWithId> {
    try {
      return await this.schedule(taskInstance, options);
    } catch (err) {
      if (err.statusCode === VERSION_CONFLICT_STATUS) {
        // check if task specifies a schedule interval
        // if so,try to update the just the schedule
        // only works for interval schedule
        if (taskInstance.schedule && taskInstance.schedule.interval) {
          const result = await this.bulkUpdateSchedules(
            [taskInstance.id],
            taskInstance.schedule,
            options
          );
          if (
            result.errors.length &&
            result.errors[0].error.statusCode !== VERSION_CONFLICT_STATUS &&
            result.errors[0].error.statusCode !== NOT_FOUND_STATUS
          ) {
            throw new Error(
              `Tried to update schedule for existing task "${taskInstance.id}" but failed with error: ${result.errors[0].error.message}`
            );
          }
        }
        return taskInstance;
      }
      throw err;
    }
  }
}

const addJitter = (interval?: string): { runAt: Date; scheduledAt: Date } | undefined => {
  // Adhoc tasks run immediately.
  if (!interval) return { runAt: new Date(), scheduledAt: new Date() };

  const now = Date.now();
  const maximumOffsetTimestamp = now + 1000 * 60 * 5; // now + 5 minutes
  const taskIntervalInMs = parseIntervalAsMillisecond(interval);
  const maximumRunAt = Math.min(now + taskIntervalInMs, maximumOffsetTimestamp);

  // Offset between 1 and maximumRunAt ms
  const runAt = new Date(now + Math.floor(Math.random() * (maximumRunAt - now) + 1));
  return { runAt, scheduledAt: runAt };
};
