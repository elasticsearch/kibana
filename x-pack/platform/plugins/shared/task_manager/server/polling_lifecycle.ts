/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Observable } from 'rxjs';
import { Subject, withLatestFrom, BehaviorSubject } from 'rxjs';
import { distinctUntilChanged, startWith } from 'rxjs';
import { pipe } from 'fp-ts/pipeable';
import { map as mapOptional, none } from 'fp-ts/Option';
import { tap } from 'rxjs';
import type { UsageCounter } from '@kbn/usage-collection-plugin/server';
import type { Logger, ExecutionContextStart } from '@kbn/core/server';
import type { FakeRequestEnricher } from '@kbn/core-security-server';

import type { Result } from './lib/result_type';
import { asErr, mapErr, asOk, map, mapOk, isOk } from './lib/result_type';
import type { TaskManagerConfig } from './config';
import {
  CLAIM_STRATEGY_UPDATE_BY_QUERY,
  WORKER_UTILIZATION_RUNNING_AVERAGE_WINDOW_SIZE_MS,
} from './config';

import type {
  TaskMarkRunning,
  TaskRun,
  TaskClaim,
  TaskRunRequest,
  TaskPollingCycle,
  TaskManagerStat,
  TaskManagerMetric,
} from './task_events';
import {
  asTaskRunRequestEvent,
  asTaskPollingCycleEvent,
  asTaskManagerStatEvent,
} from './task_events';
import type { TimedFillPoolResult } from './lib/fill_pool';
import { fillPool, FillPoolResult } from './lib/fill_pool';
import type { Middleware } from './lib/middleware';
import { intervalFromNow } from './lib/intervals';
import type { ConcreteTaskInstance, TaskEventLogger } from './task';
import { createTaskPoller, PollingError, PollingErrorType } from './polling';
import { TaskPool } from './task_pool';
import type { TaskRunner } from './task_running';
import { TaskManagerRunner } from './task_running';
import type { TaskStore } from './task_store';
import type { ApiKeyStrategy } from './api_key_strategy';
import { identifyEsError, isEsCannotExecuteScriptError } from './lib/identify_es_error';
import { BufferedTaskStore } from './buffered_task_store';
import type { TaskTypeDictionary } from './task_type_dictionary';
import { delayOnClaimConflicts } from './polling';
import { TaskClaiming } from './queries/task_claiming';
import type { ClaimOwnershipResult } from './task_claimers';
import type { TaskPartitioner } from './lib/task_partitioner';
import type { TaskPoller } from './polling/task_poller';
import {
  createCapacityScan,
  createPollIntervalScan,
  countErrors,
  ADJUST_THROUGHPUT_INTERVAL,
} from './lib/create_managed_configuration';
import { createRunningAveragedStat } from './monitoring/task_run_calculators';

const MAX_BUFFER_OPERATIONS = 100;

export interface ITaskEventEmitter<T> {
  get events(): Observable<T>;
}

export interface TaskPollingLifecycleOpts {
  logger: Logger;
  definitions: TaskTypeDictionary;
  taskStore: TaskStore;
  config: TaskManagerConfig;
  middleware: Middleware;
  elasticsearchAndSOAvailability$: Observable<boolean>;
  executionContext: ExecutionContextStart;
  usageCounter?: UsageCounter;
  taskPartitioner: TaskPartitioner;
  startingCapacity: number;
  apiKeyStrategy: ApiKeyStrategy;
  eventLogger: TaskEventLogger;
  enrichFakeRequest?: FakeRequestEnricher;
}

export type TaskLifecycleEvent =
  | TaskMarkRunning
  | TaskRun
  | TaskClaim
  | TaskRunRequest
  | TaskPollingCycle
  | TaskManagerStat
  | TaskManagerMetric;

/**
 * The public interface into the task manager system.
 */
export class TaskPollingLifecycle implements ITaskEventEmitter<TaskLifecycleEvent> {
  private definitions: TaskTypeDictionary;

  private store: TaskStore;
  private taskClaiming: TaskClaiming;
  private bufferedStore: BufferedTaskStore;
  private readonly executionContext: ExecutionContextStart;

  private logger: Logger;
  private poller: TaskPoller<string, TimedFillPoolResult>;
  private started = false;

  public pool: TaskPool;

  public capacityConfiguration$: Observable<number>;
  public pollIntervalConfiguration$: Observable<number>;

  // all task related events (task claimed, task marked as running, etc.) are emitted through events$
  private events$ = new Subject<TaskLifecycleEvent>();

  private middleware: Middleware;

  private usageCounter?: UsageCounter;
  private config: TaskManagerConfig;
  private currentPollInterval: number;
  private apiKeyStrategy: ApiKeyStrategy;
  private currentTmUtilization$ = new BehaviorSubject<number>(0);
  private enrichFakeRequest?: FakeRequestEnricher;

  private eventLogger: TaskEventLogger;

  /**
   * Initializes the task manager, preventing any further addition of middleware,
   * enabling the task manipulation methods, and beginning the background polling
   * mechanism.
   */
  constructor({
    logger,
    middleware,
    config,
    // Elasticsearch and SavedObjects availability status
    elasticsearchAndSOAvailability$,
    taskStore,
    definitions,
    executionContext,
    usageCounter,
    taskPartitioner,
    startingCapacity,
    apiKeyStrategy,
    eventLogger,
    enrichFakeRequest,
  }: TaskPollingLifecycleOpts) {
    this.logger = logger;
    this.middleware = middleware;
    this.definitions = definitions;
    this.store = taskStore;
    this.executionContext = executionContext;
    this.usageCounter = usageCounter;
    this.config = config;
    this.apiKeyStrategy = apiKeyStrategy;
    this.enrichFakeRequest = enrichFakeRequest;
    const { poll_interval: pollInterval, claim_strategy: claimStrategy } = config;
    this.currentPollInterval = pollInterval;
    this.eventLogger = eventLogger;

    const errorCheck$ = countErrors(taskStore.errors$, ADJUST_THROUGHPUT_INTERVAL);
    const window = WORKER_UTILIZATION_RUNNING_AVERAGE_WINDOW_SIZE_MS / this.currentPollInterval;
    const tmUtilizationQueue = createRunningAveragedStat<number>(window);
    this.capacityConfiguration$ = errorCheck$.pipe(
      createCapacityScan(config, logger, startingCapacity),
      startWith(startingCapacity),
      distinctUntilChanged()
    );
    this.pollIntervalConfiguration$ = errorCheck$.pipe(
      withLatestFrom(this.currentTmUtilization$),
      createPollIntervalScan(logger, this.currentPollInterval, claimStrategy, tmUtilizationQueue),
      startWith(this.currentPollInterval),
      distinctUntilChanged()
    );
    this.pollIntervalConfiguration$.subscribe((newPollInterval) => {
      this.currentPollInterval = newPollInterval;
    });

    const emitEvent = (event: TaskLifecycleEvent) => this.events$.next(event);

    this.bufferedStore = new BufferedTaskStore(this.store, {
      bufferMaxOperations: MAX_BUFFER_OPERATIONS,
      logger,
    });

    this.pool = new TaskPool({
      logger,
      strategy: config.claim_strategy,
      capacity$: this.capacityConfiguration$,
      definitions: this.definitions,
    });
    this.pool.load.subscribe(emitEvent);

    this.taskClaiming = new TaskClaiming({
      taskStore,
      strategy: config.claim_strategy,
      maxAttempts: config.max_attempts,
      excludedTaskTypes: config.unsafe.exclude_task_types,
      definitions,
      logger: this.logger,
      getAvailableCapacity: (taskType?: string) => this.pool.availableCapacity(taskType),
      taskPartitioner,
    });
    // pipe taskClaiming events into the lifecycle event stream
    this.taskClaiming.events.subscribe(emitEvent);

    let pollIntervalDelay$: Observable<number> | undefined;
    if (claimStrategy === CLAIM_STRATEGY_UPDATE_BY_QUERY) {
      pollIntervalDelay$ = delayOnClaimConflicts(
        this.capacityConfiguration$,
        this.pollIntervalConfiguration$,
        this.events$,
        config.version_conflict_threshold,
        config.monitored_stats_running_average_window
      ).pipe(tap((delay) => emitEvent(asTaskManagerStatEvent('pollingDelay', asOk(delay)))));
    }

    this.poller = createTaskPoller<string, TimedFillPoolResult>({
      logger,
      initialPollInterval: pollInterval,
      pollInterval$: this.pollIntervalConfiguration$,
      pollIntervalDelay$,
      getCapacity: () => {
        const capacity = this.pool.availableCapacity();
        if (!capacity) {
          const usedCapacityPercentage = this.pool.usedCapacityPercentage;

          // if there isn't capacity, emit a load event so that we can expose how often
          // high load causes the poller to skip work (work isn't called when there is no capacity)
          this.emitEvent(asTaskManagerStatEvent('load', asOk(usedCapacityPercentage)));

          // Emit event indicating task manager utilization
          this.emitEvent(asTaskManagerStatEvent('workerUtilization', asOk(usedCapacityPercentage)));
        }
        return capacity;
      },
      work: this.pollForWork,
    });

    this.subscribeToPoller(this.poller.events$);

    elasticsearchAndSOAvailability$.subscribe((areESAndSOAvailable) => {
      if (areESAndSOAvailable && !this.started) {
        this.poller.start();
        this.started = true;
      }
    });
  }

  public get events(): Observable<TaskLifecycleEvent> {
    return this.events$;
  }

  public stop() {
    this.poller.stop();
  }

  public getCurrentTasksInPool(): string[] {
    return this.pool.getCurrentTasksInPool();
  }

  private emitEvent = (event: TaskLifecycleEvent) => {
    this.events$.next(event);
  };

  private createTaskRunnerForTask = (instance: ConcreteTaskInstance) => {
    return new TaskManagerRunner({
      logger: this.logger,
      instance,
      store: this.bufferedStore,
      definitions: this.definitions,
      beforeRun: this.middleware.beforeRun,
      beforeMarkRunning: this.middleware.beforeMarkRunning,
      onTaskEvent: this.emitEvent,
      defaultMaxAttempts: this.taskClaiming.maxAttempts,
      executionContext: this.executionContext,
      usageCounter: this.usageCounter,
      config: this.config,
      allowReadingInvalidState: this.config.allow_reading_invalid_state,
      strategy: this.config.claim_strategy,
      getPollInterval: () => this.currentPollInterval,
      apiKeyStrategy: this.apiKeyStrategy,
      eventLogger: this.eventLogger,
      enrichFakeRequest: this.enrichFakeRequest,
    });
  };

  private pollForWork = async (): Promise<TimedFillPoolResult> => {
    return fillPool(
      // claim available tasks
      async () => {
        const result = await claimAvailableTasks(this.taskClaiming, this.logger);

        if (isOk(result) && result.value.timing) {
          this.emitEvent(
            asTaskManagerStatEvent(
              'claimDuration',
              asOk(result.value.timing.stop - result.value.timing.start)
            )
          );
        }

        return result;
      },
      // wrap each task in a Task Runner
      this.createTaskRunnerForTask,
      // place tasks in the Task Pool
      async (tasks: TaskRunner[]) => {
        const tasksToRun = [];
        const removeTaskPromises = [];
        for (const task of tasks) {
          if (task.isAdHocTaskAndOutOfAttempts) {
            this.logger.debug(`Removing ${task} because the max attempts have been reached.`);
            removeTaskPromises.push(task.removeTask());
          } else {
            tasksToRun.push(task);
          }
        }
        // Wait for all the promises at once to speed up the polling cycle
        const [result] = await Promise.all([this.pool.run(tasksToRun), ...removeTaskPromises]);
        // Emit the load after fetching tasks, giving us a good metric for evaluating how
        // busy Task manager tends to be in this Kibana instance
        this.emitEvent(asTaskManagerStatEvent('load', asOk(this.pool.usedCapacityPercentage)));
        return result;
      }
    );
  };

  private subscribeToPoller(
    poller$: Observable<Result<TimedFillPoolResult, PollingError<string>>>
  ) {
    return poller$
      .pipe(
        tap(
          mapErr((error: PollingError<string>) => {
            if (error.type === PollingErrorType.RequestCapacityReached) {
              pipe(
                error.data,
                mapOptional((id) => this.emitEvent(asTaskRunRequestEvent(id, asErr(error))))
              );
            }
            this.logger.error(error.message, { error: { stack_trace: error.stack } });

            // Emit event indicating task manager utilization % at the end of a polling cycle
            // Because there was a polling error, no tasks were claimed so this represents the number of workers busy
            this.emitEvent(
              asTaskManagerStatEvent('workerUtilization', asOk(this.pool.usedCapacityPercentage))
            );
          })
        )
      )
      .pipe(
        tap(
          mapOk((results: TimedFillPoolResult) => {
            // Emit event indicating task manager utilization % at the end of a polling cycle

            // Get the actual utilization as a percentage
            let tmUtilization = this.pool.usedCapacityPercentage;

            // Check whether there are any tasks left unclaimed
            // If we're not at capacity and there are unclaimed tasks, then
            // there must be high cost tasks that need to be claimed
            // Artificially inflate the utilization to represent the unclaimed load
            if (tmUtilization < 100 && (results.stats?.tasksLeftUnclaimed ?? 0) > 0) {
              tmUtilization = 100;
            }

            this.currentTmUtilization$.next(tmUtilization);
            this.emitEvent(asTaskManagerStatEvent('workerUtilization', asOk(tmUtilization)));
          })
        )
      )
      .subscribe((result: Result<TimedFillPoolResult, PollingError<string>>) => {
        this.emitEvent(
          map(
            result,
            ({ timing, ...event }) => {
              const anyTaskErrors = event.stats?.tasksErrors ?? 0;
              if (anyTaskErrors > 0) {
                return asTaskPollingCycleEvent<string>(
                  asErr(
                    new PollingError<string>(
                      'Partially failed to poll for work: some tasks could not be claimed.',
                      PollingErrorType.WorkError,
                      none
                    )
                  )
                );
              }
              return asTaskPollingCycleEvent<string>(asOk(event), timing);
            },
            (event) => asTaskPollingCycleEvent<string>(asErr(event))
          )
        );
      });
  }
}

export async function claimAvailableTasks(
  taskClaiming: TaskClaiming,
  logger: Logger
): Promise<Result<ClaimOwnershipResult, FillPoolResult>> {
  try {
    return taskClaiming.claimAvailableTasksIfCapacityIsAvailable({
      claimOwnershipUntil: intervalFromNow('30s')!,
    });
  } catch (err) {
    // if we can identify the reason for the error, emit a FillPoolResult error
    if (isEsCannotExecuteScriptError(err)) {
      logger.warn(`Task Manager cannot operate when inline scripts are disabled in Elasticsearch`);
      return asErr(FillPoolResult.Failed);
    } else {
      const esError = identifyEsError(err);
      // as we could't identify the reason - propagate the error
      throw esError.length > 0 ? esError : err;
    }
  }
}
