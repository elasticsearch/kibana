/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/*
 * This module contains the logic for polling the task manager index for new work.
 */

import type { Observable } from 'rxjs';
import { Subject } from 'rxjs';

import type { Option } from 'fp-ts/Option';
import { none } from 'fp-ts/Option';
import type { Logger } from '@kbn/core/server';
import { TaskErrorSource } from '../task_running';
import type { Result } from '../lib/result_type';
import { asOk, asErr } from '../lib/result_type';

type WorkFn<H> = () => Promise<H>;

interface Opts<H> {
  logger: Logger;
  initialPollInterval: number;
  pollInterval$: Observable<number>;
  /**
   * Emits when a Kibana node requests an immediate claim cycle (e.g. via `runSoon`),
   * triggering a cycle right away instead of waiting for the next `pollInterval`.
   */
  claimNudge$?: Observable<void>;
  getCapacity: () => number;
  work: WorkFn<H>;
}

export interface TaskPoller<T, H> {
  start: () => void;
  stop: () => void;
  events$: Observable<Result<H, PollingError<T>>>;
}

/**
 * constructs a new TaskPoller stream, which emits events on demand and on a scheduled interval, waiting for capacity to be available before emitting more events.
 *
 * @param opts
 * @prop {number} pollInterval - How often, in milliseconds, we will an event be emnitted, assuming there's capacity to do so
 * @prop {() => number} getCapacity - A function specifying whether there is capacity to emit new events
 * @prop {() => Promise<H>} work - The worker we wish to execute in order to `poll`
 *
 * @returns {Observable<Set<T>>} - An observable which emits an event whenever a polling event is due to take place, providing access to a singleton Set representing a queue
 *  of unique request argumets of type T.
 */
export function createTaskPoller<T, H>({
  logger,
  initialPollInterval,
  pollInterval$,
  claimNudge$,
  getCapacity,
  work,
}: Opts<H>): TaskPoller<T, H> {
  const hasCapacity = () => getCapacity() > 0;
  let running: boolean = false;
  let isCycleRunning: boolean = false;
  let nudgeRequestedDuringCycle: boolean = false;
  let timeoutId: NodeJS.Timeout | null = null;
  let hasSubscribed: boolean = false;
  let pollInterval = initialPollInterval;
  let pollIntervalDelay = 0;
  const subject = new Subject<Result<H, PollingError<T>>>();

  async function runCycle() {
    timeoutId = null;
    isCycleRunning = true;
    const start = Date.now();
    try {
      if (hasCapacity()) {
        const result = await work();
        subject.next(asOk(result));
      } else {
        logger.debug('Skipping polling cycle because there is no capacity available');
      }
    } catch (e) {
      subject.next(asPollingError<T>(e, PollingErrorType.WorkError));
    } finally {
      isCycleRunning = false;
    }

    if (running) {
      const nextDelay = nudgeRequestedDuringCycle
        ? 0
        : Math.max(pollInterval - (Date.now() - start) + (pollIntervalDelay % pollInterval), 0);
      nudgeRequestedDuringCycle = false;
      // Set the next runCycle call
      timeoutId = setTimeout(
        () =>
          runCycle().catch((e) => {
            subject.next(asPollingError(e, PollingErrorType.PollerError));
          }),
        nextDelay
      );
      // Reset delay, it's designed to shuffle only once
      pollIntervalDelay = 0;
    } else {
      logger.info('Task poller finished running its last cycle');
    }
  }

  function runCycleNow() {
    if (!running) {
      return;
    }

    if (isCycleRunning) {
      // Coalesce bursts of nudges into a single immediate follow-up cycle.
      nudgeRequestedDuringCycle = true;
      return;
    }

    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }

    runCycle().catch((e) => {
      subject.next(asPollingError(e, PollingErrorType.PollerError));
    });
  }

  function subscribe() {
    if (hasSubscribed) {
      return;
    }
    pollInterval$.subscribe((interval) => {
      if (!Number.isSafeInteger(interval) || interval < 0) {
        // TODO: Investigate why we sometimes get null / NaN, causing the setTimeout logic to always schedule
        // the next polling cycle to run immediately. If we don't see occurrences of this message by December 2024,
        // we can remove the TODO and/or check because we now have a cap to how much we increase the poll interval.
        logger.error(
          new Error(
            `Expected the new interval to be a number > 0, received: ${interval} but poller will keep using: ${pollInterval}`
          )
        );
        return;
      }
      pollInterval = interval;
      logger.debug(`Task poller now using interval of ${interval}ms`);
    });
    if (claimNudge$) {
      claimNudge$.subscribe(() => {
        // RxJS reports a throw here through `reportUnhandledError`, which defers it into a
        // macrotask and crashes Kibana. A missed nudge must never cost more than a poll interval.
        try {
          logger.debug('Task poller received a claim nudge, running a claim cycle immediately');
          runCycleNow();
        } catch (err) {
          logger.error(`Failed to run a claim cycle for a claim nudge: ${err}`);
        }
      });
    }
    hasSubscribed = true;
  }

  return {
    events$: subject,
    start: () => {
      if (!running) {
        logger.info('Starting the task poller');
        running = true;
        runCycle().catch((e) => {
          subject.next(asPollingError(e, PollingErrorType.PollerError));
        });
        // We need to subscribe shortly after start. Otherwise, the observables start emiting events
        // too soon for the task run statistics module to capture.
        setTimeout(() => subscribe(), 0);
      }
    },
    stop: () => {
      logger.info('Stopping the task poller');
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      running = false;
      // Otherwise a nudge from the previous run makes the first cycle after `start()` schedule a
      // redundant immediate follow-up.
      nudgeRequestedDuringCycle = false;
    },
  };
}

export enum PollingErrorType {
  WorkError,
  WorkTimeout,
  RequestCapacityReached,
  PollerError,
}

function asPollingError<T>(err: Error, type: PollingErrorType, data: Option<T> = none) {
  return asErr(
    new PollingError<T>(
      `Failed to poll for work: ${err.message || err}`,
      type,
      data,
      err instanceof Error ? err : new Error(`${err}`)
    )
  );
}

export class PollingError<T> extends Error {
  public readonly type: PollingErrorType;
  public readonly data: Option<T>;
  public readonly source: TaskErrorSource;
  constructor(message: string, type: PollingErrorType, data: Option<T>, cause?: Error) {
    super(message, { cause });
    Object.setPrototypeOf(this, new.target.prototype);
    this.type = type;
    this.data = data;
    this.source = TaskErrorSource.FRAMEWORK;
    if (cause) {
      this.stack = `${this.stack}\nCaused by:\n${cause.stack}`;
    }
  }
}
