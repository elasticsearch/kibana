/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/*
 * This module contains the core logic for running an individual task.
 * It handles the full lifecycle of a task run, including error handling,
 * rescheduling, middleware application, etc.
 */

import apm from 'elastic-apm-node';
import { withActiveSpan } from '@kbn/tracing-utils';
import { v4 as uuidv4 } from 'uuid';
import { addSpanLabels, withSpan } from '@kbn/apm-utils';
import { flow, identity, omit } from 'lodash';
import type { ExecutionContextStart, Logger } from '@kbn/core/server';
import { SavedObjectsErrorHelpers } from '@kbn/core/server';
import type { FakeRequestEnricher } from '@kbn/core-security-server';
import type { UsageCounter } from '@kbn/usage-collection-plugin/server';
import { buildChildRequestEnricher, buildTaskFakeRequest } from './fake_request_factory';
import type { Middleware } from '../lib/middleware';
import type { Result } from '../lib/result_type';
import {
  asErr,
  asOk,
  eitherAsync,
  isOk,
  mapErr,
  mapOk,
  promiseResult,
  unwrap,
} from '../lib/result_type';
import { getExecutionContextRunner } from '../lib/execution_context';
import type { TaskMarkRunning, TaskRun, TaskTiming, TaskManagerStat } from '../task_events';
import {
  asTaskMarkRunningEvent,
  asTaskRunEvent,
  asTaskManagerStatEvent,
  startEventLoopMonitoring,
  TaskPersistence,
} from '../task_events';
import { intervalFromDate, parseIntervalAsMillisecond } from '../lib/intervals';
import { createWrappedLogger } from '../lib/wrapped_logger';
import type {
  CancelFunction,
  CancellableTask,
  ConcreteTaskInstance,
  FailedRunResult,
  FailedTaskResult,
  IntervalSchedule,
  PartialConcreteTaskInstance,
  RruleSchedule,
  SuccessfulRunResult,
  TaskDefinition,
  TaskEventLogger,
} from '../task';
import { isFailedRunResult, TaskStatus, TaskCost, getTaskCostFromInstance } from '../task';
import type { TaskTypeDictionary } from '../task_type_dictionary';
import { isUnrecoverableError, isUserError, type DecoratedError } from './errors';
import { CLAIM_STRATEGY_MGET, type TaskManagerConfig } from '../config';
import type { ApiKeyStrategy } from '../api_key_strategy';
import { TaskValidator } from '../task_validator';
import { getRetryAt, getRetryDate, getTimeout } from '../lib/get_retry_at';
import { getNextRunAt } from '../lib/get_next_run_at';
import { TaskErrorSource } from '../../common/constants';
import { getExecutionId } from '../lib/get_execution_id';
import { EVENT_LOG_ACTIONS, EventLogOutcomes } from '../constants';
import { millisToNanos } from '../lib/millis_to_nanos';

export const EMPTY_RUN_RESULT: SuccessfulRunResult = { state: {} };

export const TASK_MANAGER_RUN_TRANSACTION_TYPE = 'task-run';
export const TASK_MANAGER_TRANSACTION_TYPE = 'task-manager';
export const TASK_MANAGER_TRANSACTION_TYPE_MARK_AS_RUNNING = 'mark-task-as-running';

const UPDATE_RETRY_AT_INTERVAL = 60000; // 1m

export interface TaskRunner {
  isExpired: boolean;
  expiration: Date;
  startedAt: Date | null;
  definition: TaskDefinition | undefined;
  /** Effective cost for this task (instance override, then definition, then Normal). */
  cost: number;
  cancel: CancelFunction;
  markTaskAsRunning: () => Promise<boolean>;
  run: () => Promise<Result<SuccessfulRunResult, FailedRunResult>>;
  id: string;
  taskExecutionId: string;
  stage: string;
  toString: () => string;
  isSameTask: (executionId: string) => boolean;
  isAdHocTaskAndOutOfAttempts: boolean;
  removeTask: () => Promise<void>;
}

export enum TaskRunningStage {
  PENDING = 'PENDING',
  READY_TO_RUN = 'READY_TO_RUN',
  RAN = 'RAN',
}
export interface TaskRunning<Stage extends TaskRunningStage, Instance> {
  timestamp: Date;
  stage: Stage;
  task: Instance;
}

export interface Updatable {
  update(doc: ConcreteTaskInstance, options: { validate: boolean }): Promise<ConcreteTaskInstance>;
  partialUpdate(
    partialDoc: PartialConcreteTaskInstance,
    options: { validate: boolean; doc: ConcreteTaskInstance }
  ): Promise<ConcreteTaskInstance>;
  remove(id: string): Promise<void>;
}

type Opts = {
  logger: Logger;
  definitions: TaskTypeDictionary;
  instance: ConcreteTaskInstance;
  store: Updatable;
  onTaskEvent?: (event: TaskRun | TaskMarkRunning | TaskManagerStat) => void;
  defaultMaxAttempts: number;
  executionContext: ExecutionContextStart;
  usageCounter?: UsageCounter;
  config: TaskManagerConfig;
  allowReadingInvalidState: boolean;
  strategy: string;
  getPollInterval: () => number;
  apiKeyStrategy: ApiKeyStrategy;
  eventLogger: TaskEventLogger;
  enrichFakeRequest?: FakeRequestEnricher;
} & Pick<Middleware, 'beforeRun' | 'beforeMarkRunning'>;

export enum TaskRunResult {
  // Task completed successfully
  Success = 'Success',
  // Recurring Task completed successfully
  SuccessRescheduled = 'Success',
  // Task has failed and a retry has been scheduled
  RetryScheduled = 'RetryScheduled',
  // Task has failed
  Failed = 'Failed',
  // Task deleted
  Deleted = 'Deleted',
}

// A ConcreteTaskInstance which we *know* has a `startedAt` Date on it
export type ConcreteTaskInstanceWithStartedAt = ConcreteTaskInstance & { startedAt: Date };

// The three possible stages for a Task Runner - Pending -> ReadyToRun -> Ran
export type PendingTask = TaskRunning<TaskRunningStage.PENDING, ConcreteTaskInstance>;
export type ReadyToRunTask = TaskRunning<
  TaskRunningStage.READY_TO_RUN,
  ConcreteTaskInstanceWithStartedAt
>;
export type RanTask = TaskRunning<TaskRunningStage.RAN, ConcreteTaskInstance>;

export type TaskRunningInstance = PendingTask | ReadyToRunTask | RanTask;

/**
 * Runs a background task, ensures that errors are properly handled,
 * allows for cancellation.
 *
 * @export
 * @class TaskManagerRunner
 * @implements {TaskRunner}
 */
export class TaskManagerRunner implements TaskRunner {
  private task?: CancellableTask;
  private instance: TaskRunningInstance;
  private definitions: TaskTypeDictionary;
  private logger: Logger;
  private bufferedTaskStore: Updatable;
  private beforeRun: Middleware['beforeRun'];
  private beforeMarkRunning: Middleware['beforeMarkRunning'];
  private onTaskEvent: (event: TaskRun | TaskMarkRunning | TaskManagerStat) => void;
  private defaultMaxAttempts: number;
  private uuid: string;

  private readonly executionContext: ExecutionContextStart;
  private usageCounter?: UsageCounter;
  private config: TaskManagerConfig;
  private readonly taskValidator: TaskValidator;
  private readonly claimStrategy: string;
  private getPollInterval: () => number;
  private apiKeyStrategy: ApiKeyStrategy;
  private eventLogger: TaskEventLogger;
  private isCancelled = false;
  private readonly enrichFakeRequest?: FakeRequestEnricher;

  /**
   * Creates an instance of TaskManagerRunner.
   * @param {Opts} opts
   * @prop {Logger} logger - The task manager logger
   * @prop {TaskDefinition} definition - The definition of the task being run
   * @prop {ConcreteTaskInstance} instance - The record describing this particular task instance
   * @prop {Updatable} store - The store used to read / write tasks instance info
   * @prop {BeforeRunFunction} beforeRun - A function that adjusts the run context prior to running the task
   * @memberof TaskManagerRunner
   */
  constructor({
    instance,
    definitions,
    logger,
    store,
    beforeRun,
    beforeMarkRunning,
    defaultMaxAttempts,
    onTaskEvent = identity,
    executionContext,
    usageCounter,
    config,
    allowReadingInvalidState,
    strategy,
    getPollInterval,
    apiKeyStrategy,
    eventLogger,
    enrichFakeRequest,
  }: Opts) {
    this.instance = asPending(sanitizeInstance(instance));
    this.definitions = definitions;
    this.logger = logger;
    this.bufferedTaskStore = store;
    this.beforeRun = beforeRun;
    this.beforeMarkRunning = beforeMarkRunning;
    this.onTaskEvent = onTaskEvent;
    this.defaultMaxAttempts = defaultMaxAttempts;
    this.executionContext = executionContext;
    this.usageCounter = usageCounter;
    this.uuid = uuidv4();
    this.config = config;
    this.taskValidator = new TaskValidator({
      logger: this.logger,
      definitions: this.definitions,
      allowReadingInvalidState,
    });
    this.claimStrategy = strategy;
    this.getPollInterval = getPollInterval;
    this.apiKeyStrategy = apiKeyStrategy;
    this.eventLogger = eventLogger;
    this.enrichFakeRequest = enrichFakeRequest;
  }

  /**
   * Gets the id of this task instance.
   */
  public get id() {
    return this.instance.task.id;
  }

  /**
   * Gets the execution id of this task instance.
   */
  public get taskExecutionId() {
    return `${this.id}::${this.uuid}`;
  }

  /**
   * Test whether given execution ID identifies a different execution of this same task
   * @param id
   */
  public isSameTask(executionId: string) {
    const executionIdCompare = getExecutionId(executionId);
    return executionIdCompare === this.id;
  }

  /**
   * Gets the task type of this task instance.
   */
  public get taskType() {
    return this.instance.task.taskType;
  }

  /**
   * Get the stage this TaskRunner is at
   */
  public get stage() {
    return this.instance.stage;
  }

  /**
   * Gets the task defintion from the dictionary.
   */
  public get definition(): TaskDefinition | undefined {
    return this.definitions.get(this.taskType);
  }

  /**
   *  Effective cost for this task (instance override, then definition, then Normal).
   */
  public get cost(): number {
    const instanceCost = getTaskCostFromInstance(this.instance.task.cost);
    return instanceCost ?? this.definition?.cost ?? TaskCost.Normal;
  }

  /**
   * Gets the time at which this task will expire.
   */
  public get expiration() {
    return intervalFromDate(
      // if the task is running, use it's started at, otherwise use the timestamp at
      // which it was last updated
      // this allows us to catch tasks that remain in Pending/Finalizing without being
      // cleaned up
      isReadyToRun(this.instance) ? this.instance.task.startedAt : this.instance.timestamp,
      this.timeout
    )!;
  }

  /*
   * Gets the timeout of the current task. Uses the timeout
   * defined by the task type unless this is an ad-hoc task that specifies an override
   */
  public get timeout() {
    return getTimeout(this.instance.task, this.definition);
  }

  /**
   * Gets the duration of the current task run
   */
  public get startedAt() {
    return this.instance.task.startedAt;
  }

  /**
   * Gets whether or not this task has run longer than its expiration setting allows.
   */
  public get isExpired() {
    return this.expiration < new Date();
  }

  /**
   * Returns true whenever the task is ad hoc and has ran out of attempts. When true before
   * running a task, the task should be deleted instead of ran.
   */
  public get isAdHocTaskAndOutOfAttempts() {
    if (this.instance.task.status === 'running') {
      // This function gets called with tasks marked as running when using MGET, so attempts is already incremented
      return !this.instance.task.schedule && this.instance.task.attempts > this.getMaxAttempts();
    }
    return !this.instance.task.schedule && this.instance.task.attempts >= this.getMaxAttempts();
  }

  /**
   * Returns a log-friendly representation of this task.
   */
  public toString() {
    return `${this.taskType} "${this.id}"`;
  }

  /**
   * Runs the task, handling the task result, errors, etc, rescheduling if need
   * be. NOTE: the time of applying the middleware's beforeRun is incorporated
   * into the total timeout time the task in configured with. We may decide to
   * start the timer after beforeRun resolves
   *
   * @returns {Promise<Result<SuccessfulRunResult, FailedRunResult>>}
   */
  public async run(): Promise<Result<SuccessfulRunResult, FailedRunResult>> {
    const definition = this.definition;
    if (!definition) {
      throw new Error(`Running task ${this} failed because it has no definition`);
    }

    if (!isReadyToRun(this.instance)) {
      throw new Error(
        `Running task ${this} failed as it ${
          isPending(this.instance) ? `isn't ready to be ran` : `has already been ran`
        }`
      );
    }
    // Capture startedAt while TypeScript knows this.instance is ReadyToRunTask
    // (ConcreteTaskInstanceWithStartedAt guarantees startedAt: Date, not null).
    // We extract it here because the narrowing is lost inside the async closure below
    // since this.instance is a mutable class property.
    const { startedAt } = this.instance.task;

    this.logger.debug(`Running task ${this}`, { tags: ['task:start', this.id, this.taskType] });

    return withActiveSpan(
      'task-manager-run',
      {
        attributes: {
          'transaction.type': TASK_MANAGER_RUN_TRANSACTION_TYPE,
          'kibana.task.type': this.taskType,
        },
        // Make sure that this is a parent transaction (not a child of any other ongoing transaction)
        root: true,
      },
      async () => {
        const apmTrans = apm.startTransaction(this.taskType, TASK_MANAGER_RUN_TRANSACTION_TYPE, {
          childOf: this.instance.task.traceparent,
        });
        const stopEventLoopMonitoring = startEventLoopMonitoring(this.config.event_loop_delay);
        const makeTaskTiming = (): TaskTiming => ({
          start: startedAt.getTime(),
          stop: Date.now(),
          eventLoopBlockMs: stopEventLoopMonitoring(),
        });
        this.logTaskRunStartEvent(this.instance.task, startedAt);

        // Validate state
        const stateValidationResult = this.validateTaskState(this.instance.task);

        if (stateValidationResult.error) {
          const processedResult = await withSpan(
            { name: 'process result', type: 'task manager' },
            () =>
              this.processResult(
                asErr({
                  error: stateValidationResult.error,
                  state: stateValidationResult.taskInstance.state,
                  shouldValidate: false,
                }),
                makeTaskTiming()
              )
          );
          if (apmTrans) apmTrans.end('failure');
          return processedResult;
        }

        const modifiedContext = await this.beforeRun({
          taskInstance: stateValidationResult.taskInstance,
        });

        this.onTaskEvent(
          asTaskManagerStatEvent(
            'runDelay',
            asOk(getTaskDelayInSeconds(this.instance.task.scheduledAt))
          )
        );

        // For long running tasks, update retryAt on an interval to allow for quicker task recovery
        const stopUpdatingLongRunningTasks = this.updateRetryAtOnIntervalForLongRunningTasks();

        try {
          const sanitizedTaskInstance = omit(modifiedContext.taskInstance, [
            'apiKey',
            'uiamApiKey',
            'userScope',
          ]);
          const apiKeyForRequest = this.apiKeyStrategy.getApiKeyForFakeRequest(
            modifiedContext.taskInstance
          );
          const userProfileId = modifiedContext.taskInstance.userScope?.userProfileId;

          const fakeRequest = buildTaskFakeRequest({
            apiKey: apiKeyForRequest,
            spaceId: modifiedContext.taskInstance.userScope?.spaceId,
            userProfileId,
            enrichFakeRequest: this.enrichFakeRequest,
          });

          const enrichRequest = buildChildRequestEnricher({
            userProfileId,
            enrichFakeRequest: this.enrichFakeRequest,
          });

          const abortController = new AbortController();

          this.task = definition.createTaskRunner({
            taskInstance: sanitizedTaskInstance,
            fakeRequest,
            abortController,
            enrichRequest,
          });

          const originalTaskCancel = this.task.cancel;

          const logCancelEvent = () => {
            this.isCancelled = true;
            this.logTaskCancelEvent(this.instance.task, makeTaskTiming());
          };
          this.task.cancel = async function () {
            abortController.abort();

            // Stop updating retryAt for long running tasks if the task is cancelled
            if (stopUpdatingLongRunningTasks) {
              stopUpdatingLongRunningTasks();
            }

            logCancelEvent();

            if (originalTaskCancel) return originalTaskCancel.call(this);
          };

          const runner = getExecutionContextRunner(this.executionContext, {
            name: `run ${this.instance.task.taskType}`,
            id: this.instance.task.id,
            description: 'run task',
          });

          const result = await runner.run(() =>
            withSpan({ name: 'run', type: 'task manager' }, () => this.task!.run())
          );

          stopUpdatingLongRunningTasks();

          const validatedResult = this.validateResult(result);
          const processedResult = await withSpan(
            { name: 'process result', type: 'task manager' },
            () => this.processResult(validatedResult, makeTaskTiming())
          );
          if (apmTrans) apmTrans.end('success');
          return processedResult;
        } catch (err) {
          stopUpdatingLongRunningTasks();

          const errorSource = isUserError(err) ? TaskErrorSource.USER : TaskErrorSource.FRAMEWORK;
          const errorMessage =
            err instanceof Error
              ? String(err)
              : typeof err === 'object' && err !== null
              ? JSON.stringify(err)
              : String(err);
          this.logger.error(`Task ${this} failed: ${errorMessage}`, {
            tags: [this.taskType, this.instance.task.id, 'task-run-failed', `${errorSource}-error`],
            error: { stack_trace: err instanceof Error ? err.stack : undefined },
          });
          // in error scenario, we can not get the RunResult
          // re-use modifiedContext's state, which is correct as of beforeRun
          const processedResult = await withSpan(
            { name: 'process result', type: 'task manager' },
            () =>
              this.processResult(
                asErr({ error: err, state: modifiedContext.taskInstance.state }),
                makeTaskTiming()
              )
          );
          if (apmTrans) apmTrans.end('failure');
          return processedResult;
        } finally {
          this.logger.debug(`Task ${this} ended`, { tags: ['task:end', this.id, this.taskType] });
        }
      }
    );
  }

  private validateTaskState(taskInstance: ConcreteTaskInstance) {
    const { taskType, id } = taskInstance;
    try {
      const validatedTaskInstance =
        this.taskValidator.getValidatedTaskInstanceFromReading(taskInstance);
      return { taskInstance: validatedTaskInstance, error: null };
    } catch (error) {
      this.logger.warn(`Task (${taskType}/${id}) has a validation error: ${error.message}`);
      return { taskInstance, error };
    }
  }

  public async removeTask(): Promise<void> {
    await this.bufferedTaskStore.remove(this.id);
    if (this.task?.cleanup) {
      try {
        await this.task.cleanup();
      } catch (e) {
        this.logger.error(
          `Error encountered when running onTaskRemoved() hook for ${this}: ${e.message}`
        );
      }
    }
  }

  /**
   * Attempts to claim exclusive rights to run the task. If the attempt fails
   * with a 409 (http conflict), we assume another Kibana instance beat us to the punch.
   *
   * @returns {Promise<boolean>}
   */
  public async markTaskAsRunning(): Promise<boolean> {
    if (!isPending(this.instance)) {
      throw new Error(
        `Marking task ${this} as running has failed as it ${
          isReadyToRun(this.instance) ? `is already running` : `has already been ran`
        }`
      );
    }

    // mget claim strategy sets the task to `running` during the claim cycle
    // so this update to mark the task as running is unnecessary
    if (this.claimStrategy === CLAIM_STRATEGY_MGET) {
      this.instance = asReadyToRun(this.instance.task as ConcreteTaskInstanceWithStartedAt);
      return true;
    }

    return withActiveSpan(
      'mark-task-as-running',
      {
        attributes: { 'transaction.type': TASK_MANAGER_TRANSACTION_TYPE },
        // Make sure that this is a parent transaction (not a child of any other ongoing transaction)
        root: true,
      },
      async () => {
        const apmTrans = apm.startTransaction(
          TASK_MANAGER_TRANSACTION_TYPE_MARK_AS_RUNNING,
          TASK_MANAGER_TRANSACTION_TYPE
        );
        addSpanLabels({ entityId: this.taskType });

        const now = new Date();
        try {
          const { taskInstance } = await this.beforeMarkRunning({
            taskInstance: this.instance.task,
          });

          const attempts = taskInstance.attempts + 1;
          const ownershipClaimedUntil = taskInstance.retryAt;

          const { id } = taskInstance;

          const timeUntilClaimExpires = howManyMsUntilOwnershipClaimExpires(ownershipClaimedUntil);
          if (timeUntilClaimExpires < 0) {
            this.logger.debug(
              `[Task Runner] Task ${id} started after ownership expired (${Math.abs(
                timeUntilClaimExpires
              )}ms after expiry)`
            );
          }

          this.instance = asReadyToRun(
            (await this.bufferedTaskStore.update(
              {
                ...taskWithoutEnabled(taskInstance),
                status: TaskStatus.Running,
                startedAt: now,
                attempts,
                retryAt: getRetryAt(taskInstance, this.definition) ?? null,
                // This is a safe conversion as we're setting the startAt above
              },
              { validate: false }
            )) as ConcreteTaskInstanceWithStartedAt
          );

          const timeUntilClaimExpiresAfterUpdate =
            howManyMsUntilOwnershipClaimExpires(ownershipClaimedUntil);
          if (timeUntilClaimExpiresAfterUpdate < 0) {
            this.logger.debug(
              `[Task Runner] Task ${id} ran after ownership expired (${Math.abs(
                timeUntilClaimExpiresAfterUpdate
              )}ms after expiry)`
            );
          }

          if (apmTrans) apmTrans.end('success');
          this.onTaskEvent(asTaskMarkRunningEvent(this.id, asOk(this.instance.task)));
          return true;
        } catch (error) {
          if (apmTrans) apmTrans.end('failure');
          this.onTaskEvent(asTaskMarkRunningEvent(this.id, asErr(error)));
          if (!SavedObjectsErrorHelpers.isConflictError(error)) {
            if (!SavedObjectsErrorHelpers.isNotFoundError(error)) {
              // try to release claim as an unknown failure prevented us from marking as running
              mapErr((errReleaseClaim: Error) => {
                this.logger.error(
                  `[Task Runner] Task ${this.id} failed to release claim after failure: Error: ${errReleaseClaim.message}`
                );
              }, await this.releaseClaimAndIncrementAttempts());
            }

            throw error;
          }
        }
        return false;
      }
    );
  }

  /**
   * Attempts to cancel the task.
   *
   * @returns {Promise<void>}
   */
  public async cancel() {
    const { task } = this;
    if (task?.cancel) {
      // it will cause the task state of "running" to be cleared
      this.task = undefined;
      return task.cancel();
    }

    this.logger.debug(`The task ${this} is not cancellable.`);
  }

  private validateResult(
    result?: SuccessfulRunResult | FailedRunResult | void
  ): Result<SuccessfulRunResult, FailedRunResult> {
    return isFailedRunResult(result)
      ? asErr({ ...result, error: result.error })
      : asOk({
          ...(result || EMPTY_RUN_RESULT),
        });
  }

  private async releaseClaimAndIncrementAttempts(): Promise<
    Result<PartialConcreteTaskInstance, Error>
  > {
    return promiseResult(
      this.bufferedTaskStore.partialUpdate(
        {
          id: this.instance.task.id,
          version: this.instance.task.version,
          status: TaskStatus.Idle,
          attempts: this.instance.task.attempts + 1,
          startedAt: null,
          retryAt: null,
          ownerId: null,
        },
        { validate: false, doc: this.instance.task }
      )
    );
  }

  private shouldTryToScheduleRetry(): boolean {
    if (this.instance.task.schedule) {
      return true;
    }

    if (this.isExpired) {
      this.logger.warn(`Skipping reschedule for task ${this} due to the task expiring`);
      return false;
    }

    return this.instance.task.attempts < this.getMaxAttempts();
  }

  private shouldUpdateExpiredTask(): boolean {
    if (!this.instance.task.schedule || !this.instance.task.schedule.interval) {
      // if the task does not have a schedule interval, we will not update it on timeout
      return false;
    }

    const timeoutDuration = parseIntervalAsMillisecond(this.timeout);
    const scheduleDuration = parseIntervalAsMillisecond(this.instance.task.schedule.interval);

    return scheduleDuration > timeoutDuration;
  }

  private rescheduleFailedRun = (
    failureResult: FailedRunResult
  ): Result<SuccessfulRunResult, FailedTaskResult> => {
    const { state, error } = failureResult;
    const { schedule, attempts } = this.instance.task;

    if (this.shouldTryToScheduleRetry() && !isUnrecoverableError(error)) {
      // if we're retrying, keep the number of attempts

      let reschedule:
        | { runAt?: Date; schedule?: never }
        | { schedule?: IntervalSchedule | RruleSchedule; runAt?: never } = {};

      if (failureResult.runAt) {
        reschedule = { runAt: failureResult.runAt };
      } else if (failureResult.schedule) {
        reschedule = { schedule: failureResult.schedule };
      } else if (schedule) {
        reschedule = { schedule };
      } else {
        // when result.error is truthy, then we're retrying because it failed
        reschedule = { runAt: getRetryDate({ attempts, error }) };
      }

      if (reschedule.runAt || reschedule.schedule) {
        return asOk({
          state,
          attempts,
          ...reschedule,
        });
      }
    }

    // scheduling a retry isn't possible,mark task as failed
    return asErr({ status: TaskStatus.Failed });
  };

  private async processResultForRecurringTask(
    result: Result<SuccessfulRunResult, FailedRunResult>
  ): Promise<TaskRunResult> {
    const hasTaskRunFailed = isOk(result);
    let shouldTaskBeDisabled = false;
    const fieldUpdates: Partial<ConcreteTaskInstance> & Pick<ConcreteTaskInstance, 'status'> = flow(
      // if running the task has failed ,try to correct by scheduling a retry in the near future
      mapErr(this.rescheduleFailedRun),
      // if retrying is possible (new runAt) or this is an recurring task - reschedule
      mapOk(
        ({
          runAt,
          schedule: reschedule,
          state,
          attempts = 0,
          shouldDeleteTask,
          shouldDisableTask,
        }: SuccessfulRunResult & { attempts: number }) => {
          if (shouldDeleteTask) {
            // set the status to failed so task will get deleted
            return asOk({ status: TaskStatus.ShouldDelete });
          }

          if (shouldDisableTask) {
            shouldTaskBeDisabled = true;
            return asOk({ status: TaskStatus.Idle });
          }

          const updatedTaskSchedule = reschedule ?? this.instance.task.schedule;
          return asOk({
            runAt:
              runAt ||
              getNextRunAt(
                {
                  runAt: this.instance.task.runAt,
                  startedAt: this.instance.task.startedAt,
                  schedule: updatedTaskSchedule,
                },
                this.getPollInterval(),
                this.logger
              ),
            state,
            schedule: updatedTaskSchedule,
            attempts,
            status: TaskStatus.Idle,
          });
        }
      ),
      unwrap
    )(result);

    if (
      fieldUpdates.status === TaskStatus.Failed ||
      fieldUpdates.status === TaskStatus.ShouldDelete
    ) {
      // Delete the SO instead so it doesn't remain in the index forever
      this.instance = asRan(this.instance.task);
      await this.removeTask();
    } else {
      const { shouldValidate = true } = unwrap(result);

      let shouldUpdateTask: boolean = false;
      let partialTask: PartialConcreteTaskInstance = {
        id: this.instance.task.id,
        version: this.instance.task.version,
      };

      if (this.isExpired) {
        this.usageCounter?.incrementCounter({
          counterName: `taskManagerUpdateSkippedDueToTaskExpiration`,
          counterType: 'taskManagerTaskRunner',
          incrementBy: 1,
        });

        if (this.shouldUpdateExpiredTask()) {
          shouldUpdateTask = true;

          partialTask = {
            ...partialTask,
            // excluding updated task state from the update
            // because the execution ended in failure due to timeout, we do not update the state
            status: TaskStatus.Idle,
            runAt: fieldUpdates.runAt,
            // reset fields that track the lifecycle of the concluded `task run`
            startedAt: null,
            retryAt: null,
            ownerId: null,
          };
        }
      } else {
        shouldUpdateTask = true;

        if (shouldTaskBeDisabled) {
          const label = `${this.taskType}:${this.instance.task.id}`;
          this.logger.warn(`Disabling task ${label} as it indicated it should disable itself`, {
            tags: [this.taskType],
          });
        }

        partialTask = {
          ...partialTask,
          ...fieldUpdates,
          // reset fields that track the lifecycle of the concluded `task run`
          startedAt: null,
          retryAt: null,
          ownerId: null,
          ...(shouldTaskBeDisabled ? { enabled: false } : {}),
        };
      }

      if (shouldUpdateTask) {
        this.instance = asRan(
          await this.bufferedTaskStore.partialUpdate(partialTask, {
            validate: shouldValidate,
            doc: this.instance.task,
          })
        );
      }
    }

    return fieldUpdates.status === TaskStatus.Failed
      ? TaskRunResult.Failed
      : fieldUpdates.status === TaskStatus.ShouldDelete
      ? TaskRunResult.Deleted
      : hasTaskRunFailed
      ? TaskRunResult.SuccessRescheduled
      : TaskRunResult.RetryScheduled;
  }

  private async processResultWhenDone(): Promise<TaskRunResult> {
    // not a recurring task: clean up by removing the task instance from store
    try {
      this.instance = asRan(this.instance.task);
      await this.removeTask();
    } catch (err) {
      if (err.statusCode === 404) {
        this.logger.warn(`Task cleanup of ${this} failed in processing. Was remove called twice?`);
      } else {
        throw err;
      }
    }
    return TaskRunResult.Success;
  }

  private async processResult(
    result: Result<SuccessfulRunResult, FailedRunResult>,
    taskTiming: TaskTiming
  ): Promise<Result<SuccessfulRunResult, FailedRunResult>> {
    const { task } = this.instance;

    const debugLogger = createWrappedLogger({ logger: this.logger, tags: [`metrics-debugger`] });

    const taskHasExpired = this.isExpired;

    await eitherAsync(
      result,
      async ({ runAt, schedule, taskRunError }: SuccessfulRunResult) => {
        const taskPersistence =
          schedule || task.schedule ? TaskPersistence.Recurring : TaskPersistence.NonRecurring;
        try {
          const processedResult = {
            task,
            persistence: taskPersistence,
            result: await (runAt || schedule || task.schedule
              ? this.processResultForRecurringTask(result)
              : this.processResultWhenDone()),
          };

          // Alerting task runner returns SuccessfulRunResult with taskRunError
          // when the alerting task fails, so we check for this condition in order
          // to emit the correct task run event for metrics collection
          // taskRunError contains the "source" (TaskErrorSource) data
          if (!!taskRunError) {
            debugLogger.debug(`Emitting task run failed event for task ${this.taskType}`);
            this.onTaskEvent(
              asTaskRunEvent(
                this.id,
                asErr({ ...processedResult, isExpired: taskHasExpired, error: taskRunError }),
                taskTiming
              )
            );
            this.logTaskRunEvent(
              task,
              taskTiming,
              EventLogOutcomes.failure,
              `Task ${this.taskType} "${this.id}" failed with a taskRunError.`,
              taskRunError
            );
          } else {
            this.onTaskEvent(
              asTaskRunEvent(
                this.id,
                asOk({ ...processedResult, isExpired: taskHasExpired }),
                taskTiming
              )
            );
            this.logTaskRunEvent(
              task,
              taskTiming,
              EventLogOutcomes.success,
              `Task ${this.taskType} "${this.id}" completed successfully.`
            );
          }
        } catch (err) {
          this.onTaskEvent(
            asTaskRunEvent(
              this.id,
              asErr({
                task,
                persistence: taskPersistence,
                result: TaskRunResult.Failed,
                isExpired: taskHasExpired,
                error: err,
              }),
              taskTiming
            )
          );
          this.logTaskRunEvent(
            task,
            taskTiming,
            EventLogOutcomes.failure,
            `Task ${this.taskType} "${this.id}" failed.`,
            err as Error
          );
          throw err;
        }
      },
      async ({ error }: FailedRunResult) => {
        debugLogger.debug(`Emitting task run failed event for task ${this.taskType}`);
        this.onTaskEvent(
          asTaskRunEvent(
            this.id,
            asErr({
              task,
              persistence: task.schedule ? TaskPersistence.Recurring : TaskPersistence.NonRecurring,
              result: await this.processResultForRecurringTask(result),
              isExpired: taskHasExpired,
              error,
            }),
            taskTiming
          )
        );
        this.logTaskRunEvent(
          task,
          taskTiming,
          EventLogOutcomes.failure,
          `Task ${this.taskType} "${this.id}" failed.`,
          error
        );
      }
    );

    const { eventLoopBlockMs = 0 } = taskTiming;
    const taskLabel = `${this.taskType} ${this.instance.task.id}`;
    if (eventLoopBlockMs > this.config.event_loop_delay.warn_threshold) {
      this.logger.warn(
        `event loop blocked for at least ${eventLoopBlockMs} ms while running task ${taskLabel}`,
        {
          tags: [this.taskType, taskLabel, 'event-loop-blocked'],
        }
      );
    }
    return result;
  }

  private getMaxAttempts() {
    return this.definition?.maxAttempts ?? this.defaultMaxAttempts;
  }

  private updateRetryAtOnIntervalForLongRunningTasks() {
    let stopped = false;

    const updateRetryAt = async () => {
      if (!stopped) {
        try {
          // Set retryAt to now + 5m
          const updatedRetryAt = new Date(Date.now() + 5 * 60 * 1000);
          this.logger.debug(
            `Attempting to update retryAt to ${updatedRetryAt.toISOString()} for long running task: ${
              this.id
            }.`,
            {
              tags: [this.id, this.taskType],
            }
          );
          const taskInstance = this.instance.task;
          this.instance = asReadyToRun(
            (await this.bufferedTaskStore.partialUpdate(
              {
                id: taskInstance.id,
                retryAt: updatedRetryAt,
              },
              { validate: false, doc: taskInstance }
            )) as ConcreteTaskInstanceWithStartedAt
          );
        } catch (error) {
          // If there is a 409 conflict error, stop the timer and try to cancel the task
          // as this task may have been picked up by another Kibana node.
          if (SavedObjectsErrorHelpers.isConflictError(error)) {
            stop();
            this.logger.warn(
              `Conflict error trying to update retryAt for a long-running task. Cancelling task: ${this.id}`,
              { tags: [this.id, this.taskType] }
            );
            await this.cancel();
          } else {
            this.logger.warn(
              `Unable to update retryAt for long running task: ${this.id} - ${error.message}`,
              { tags: [this.id, this.taskType] }
            );
          }
        }
        timer = setTimeout(updateRetryAt, UPDATE_RETRY_AT_INTERVAL);
      }
    };

    let timer = setTimeout(updateRetryAt, UPDATE_RETRY_AT_INTERVAL);

    const stop = () => {
      stopped = true;
      clearTimeout(timer);
    };
    return stop;
  }

  private logTaskRunStartEvent(task: ConcreteTaskInstance, startedAt: Date): void {
    const scheduleDelayNs = task.scheduledAt
      ? millisToNanos(startedAt.getTime() - task.scheduledAt.getTime())
      : undefined;
    this.eventLogger.logEvent({
      event: {
        action: EVENT_LOG_ACTIONS.taskRunStart,
        start: startedAt.toISOString(),
      },
      kibana: {
        task: {
          id: this.id,
          type: this.taskType,
          scheduled: task.scheduledAt.toISOString(),
          ...(scheduleDelayNs != null ? { schedule_delay: scheduleDelayNs } : {}),
        },
      },
      message: `Task ${this.taskType} "${this.id}" started.`,
    });
  }

  private logTaskRunEvent(
    task: ConcreteTaskInstance,
    taskTiming: TaskTiming,
    outcome: EventLogOutcomes,
    message: string,
    error?: Error | DecoratedError
  ): void {
    const runDurationNs = millisToNanos(taskTiming.stop - taskTiming.start);
    const scheduleDelayNs = millisToNanos(taskTiming.start - task.scheduledAt.getTime());
    const errorDetails = error
      ? {
          message: error.message,
          ...(error.stack ? { stack_trace: error.stack } : {}),
        }
      : {};
    this.eventLogger.logEvent({
      event: {
        action: EVENT_LOG_ACTIONS.taskRun,
        outcome,
        duration: runDurationNs,
        start: new Date(taskTiming.start).toISOString(),
        end: new Date(taskTiming.stop).toISOString(),
        ...(error && this.isCancelled ? { reason: `Task "${this.id}" was cancelled.` } : {}),
      },
      kibana: {
        task: {
          id: this.id,
          type: this.taskType,
          scheduled: task.scheduledAt.toISOString(),
          schedule_delay: scheduleDelayNs,
        },
      },
      message,
      ...(error ? { error: errorDetails } : {}),
    });
  }

  private logTaskCancelEvent(task: ConcreteTaskInstance, taskTiming: TaskTiming): void {
    const runDurationNs = millisToNanos(taskTiming.stop - taskTiming.start);
    this.eventLogger.logEvent({
      event: {
        action: EVENT_LOG_ACTIONS.taskCancel,
        duration: runDurationNs,
        start: new Date(taskTiming.start).toISOString(),
        end: new Date(taskTiming.stop).toISOString(),
      },
      kibana: {
        task: {
          id: this.id,
          type: this.taskType,
          scheduled: task.scheduledAt.toISOString(),
        },
      },
      message: `Task ${this.taskType} "${this.id}" has been cancelled.`,
    });
  }
}

function sanitizeInstance(instance: ConcreteTaskInstance): ConcreteTaskInstance {
  return {
    ...instance,
    params: instance.params || {},
    state: instance.state || {},
  };
}

function howManyMsUntilOwnershipClaimExpires(ownershipClaimedUntil: Date | null): number {
  return ownershipClaimedUntil ? ownershipClaimedUntil.getTime() - Date.now() : 0;
}

// Omits "enabled" field from task updates so we don't overwrite any user
// initiated changes to "enabled" while the task was running
function taskWithoutEnabled(task: ConcreteTaskInstance): ConcreteTaskInstance {
  return omit(task, 'enabled');
}

// A type that extracts the Instance type out of TaskRunningStage
// This helps us to better communicate to the developer what the expected "stage"
// in a specific place in the code might be
type InstanceOf<S extends TaskRunningStage, T> = T extends TaskRunning<S, infer I> ? I : never;

export function isPending(taskRunning: TaskRunningInstance): taskRunning is PendingTask {
  return taskRunning.stage === TaskRunningStage.PENDING;
}
export function asPending(task: InstanceOf<TaskRunningStage.PENDING, PendingTask>): PendingTask {
  return {
    timestamp: new Date(),
    stage: TaskRunningStage.PENDING,
    task,
  };
}
export function isReadyToRun(taskRunning: TaskRunningInstance): taskRunning is ReadyToRunTask {
  return taskRunning.stage === TaskRunningStage.READY_TO_RUN;
}
export function asReadyToRun(
  task: InstanceOf<TaskRunningStage.READY_TO_RUN, ReadyToRunTask>
): ReadyToRunTask {
  return {
    timestamp: new Date(),
    stage: TaskRunningStage.READY_TO_RUN,
    task,
  };
}
export function asRan(task: InstanceOf<TaskRunningStage.RAN, RanTask>): RanTask {
  return {
    timestamp: new Date(),
    stage: TaskRunningStage.RAN,
    task,
  };
}

export function getTaskDelayInSeconds(scheduledAt: Date) {
  const now = new Date();
  return (now.valueOf() - scheduledAt.valueOf()) / 1000;
}
