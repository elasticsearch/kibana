/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import sinon from 'sinon';
import { of, BehaviorSubject, Subject } from 'rxjs';
import { none } from 'fp-ts/Option';
import { createTaskPoller, PollingError, PollingErrorType } from './task_poller';
import { loggingSystemMock } from '@kbn/core/server/mocks';
import { asOk, asErr } from '../lib/result_type';

describe('TaskPoller', () => {
  let clock: sinon.SinonFakeTimers;

  beforeEach(() => {
    clock = sinon.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
  });

  afterEach(() => clock.restore());

  test('intializes the poller with the provided interval', async () => {
    const pollInterval = 100;
    const halfInterval = Math.floor(pollInterval / 2);

    const work = jest.fn(async () => true);
    createTaskPoller<void, boolean>({
      initialPollInterval: pollInterval,
      logger: loggingSystemMock.create().get(),
      pollInterval$: of(pollInterval),
      getCapacity: () => 1,
      work,
    }).start();

    expect(work).toHaveBeenCalledTimes(1);

    // `work` is async, we have to force a node `tick`
    await new Promise((resolve) => setImmediate(resolve));
    clock.tick(halfInterval);
    expect(work).toHaveBeenCalledTimes(1);
    clock.tick(halfInterval);

    await new Promise((resolve) => setImmediate(resolve));
    expect(work).toHaveBeenCalledTimes(2);

    await new Promise((resolve) => setImmediate(resolve));
    clock.tick(pollInterval + 10);
    await new Promise((resolve) => setImmediate(resolve));
    expect(work).toHaveBeenCalledTimes(3);
  });

  test('poller adapts to pollInterval changes', async () => {
    const pollInterval = 100;
    const pollInterval$ = new BehaviorSubject(pollInterval);

    const work = jest.fn(async () => true);
    createTaskPoller<void, boolean>({
      initialPollInterval: pollInterval,
      logger: loggingSystemMock.create().get(),
      pollInterval$,
      getCapacity: () => 1,
      work,
    }).start();

    expect(work).toHaveBeenCalledTimes(1);

    // `work` is async, we have to force a node `tick`
    await new Promise((resolve) => setImmediate(resolve));
    clock.tick(pollInterval);
    expect(work).toHaveBeenCalledTimes(2);

    pollInterval$.next(pollInterval * 2);

    // `work` is async, we have to force a node `tick`
    await new Promise((resolve) => setImmediate(resolve));
    clock.tick(pollInterval);
    expect(work).toHaveBeenCalledTimes(2);
    clock.tick(pollInterval);
    expect(work).toHaveBeenCalledTimes(3);

    pollInterval$.next(pollInterval / 2);

    // `work` is async, we have to force a node `tick`
    await new Promise((resolve) => setImmediate(resolve));
    clock.tick(pollInterval / 2);
    expect(work).toHaveBeenCalledTimes(4);
  });

  test('poller ignores null pollInterval values', async () => {
    const pollInterval = 100;
    const pollInterval$ = new BehaviorSubject(pollInterval);

    const work = jest.fn(async () => true);
    const logger = loggingSystemMock.create().get();
    createTaskPoller<void, boolean>({
      initialPollInterval: pollInterval,
      logger,
      pollInterval$,
      getCapacity: () => 1,
      work,
    }).start();

    expect(work).toHaveBeenCalledTimes(1);

    // `work` is async, we have to force a node `tick`
    await new Promise((resolve) => setImmediate(resolve));
    clock.tick(pollInterval);
    expect(work).toHaveBeenCalledTimes(2);

    pollInterval$.next(pollInterval * 2);

    // `work` is async, we have to force a node `tick`
    await new Promise((resolve) => setImmediate(resolve));
    clock.tick(pollInterval);
    expect(work).toHaveBeenCalledTimes(2);
    clock.tick(pollInterval);
    expect(work).toHaveBeenCalledTimes(3);

    // Force null into the events
    pollInterval$.next(null as unknown as number);

    // `work` is async, we have to force a node `tick`
    await new Promise((resolve) => setImmediate(resolve));
    clock.tick(pollInterval);
    expect(work).toHaveBeenCalledTimes(3);

    // `work` is async, we have to force a node `tick`
    await new Promise((resolve) => setImmediate(resolve));
    clock.tick(pollInterval);
    expect(work).toHaveBeenCalledTimes(4);

    expect(logger.error).toHaveBeenCalledWith(
      new Error(
        'Expected the new interval to be a number > 0, received: null but poller will keep using: 200'
      )
    );
  });

  test('filters interval polling on capacity', async () => {
    const pollInterval = 100;

    const work = jest.fn(async () => true);

    let hasCapacity = true;
    createTaskPoller<void, boolean>({
      initialPollInterval: pollInterval,
      logger: loggingSystemMock.create().get(),
      pollInterval$: of(pollInterval),
      work,
      getCapacity: () => (hasCapacity ? 1 : 0),
    }).start();

    expect(work).toHaveBeenCalledTimes(1);

    await new Promise((resolve) => setImmediate(resolve));
    clock.tick(pollInterval);
    expect(work).toHaveBeenCalledTimes(2);

    await new Promise((resolve) => setImmediate(resolve));
    clock.tick(pollInterval);
    expect(work).toHaveBeenCalledTimes(3);

    hasCapacity = false;

    await new Promise((resolve) => setImmediate(resolve));
    clock.tick(pollInterval);

    await new Promise((resolve) => setImmediate(resolve));
    clock.tick(pollInterval);
    expect(work).toHaveBeenCalledTimes(3);

    await new Promise((resolve) => setImmediate(resolve));
    clock.tick(pollInterval);
    expect(work).toHaveBeenCalledTimes(3);

    await new Promise((resolve) => setImmediate(resolve));
    clock.tick(pollInterval);
    expect(work).toHaveBeenCalledTimes(3);

    hasCapacity = true;

    await new Promise((resolve) => setImmediate(resolve));
    clock.tick(pollInterval);
    expect(work).toHaveBeenCalledTimes(4);

    await new Promise((resolve) => setImmediate(resolve));
    clock.tick(pollInterval);
    expect(work).toHaveBeenCalledTimes(5);
  });

  test('waits for work to complete before emitting the next event', async () => {
    const pollInterval = 100;

    const { promise: worker, resolve: resolveWorker } = createResolvablePromise();

    const handler = jest.fn();
    const poller = createTaskPoller<string, string[]>({
      initialPollInterval: pollInterval,
      logger: loggingSystemMock.create().get(),
      pollInterval$: of(pollInterval),
      work: async (...args) => {
        await worker;
        return args;
      },
      getCapacity: () => 5,
    });
    poller.events$.subscribe(handler);
    poller.start();

    clock.tick(pollInterval);

    // work should now be in progress

    clock.tick(pollInterval);
    await new Promise((resolve) => setImmediate(resolve));

    expect(handler).toHaveBeenCalledTimes(0);

    resolveWorker({});

    clock.tick(pollInterval);
    await new Promise((resolve) => setImmediate(resolve));

    expect(handler).toHaveBeenCalledTimes(1);

    clock.tick(pollInterval);

    expect(handler).toHaveBeenCalledTimes(1);
  });

  test('returns an error when polling for work fails', async () => {
    const pollInterval = 100;

    const handler = jest.fn();
    const workError = new Error('failed to work');
    const poller = createTaskPoller<string, string[]>({
      initialPollInterval: pollInterval,
      logger: loggingSystemMock.create().get(),
      pollInterval$: of(pollInterval),
      work: async (...args) => {
        throw workError;
      },
      getCapacity: () => 5,
    });
    poller.events$.subscribe(handler);
    poller.start();

    clock.tick(pollInterval);
    await new Promise((resolve) => setImmediate(resolve));

    const expectedError = new PollingError<string>(
      'Failed to poll for work: failed to work',
      PollingErrorType.WorkError,
      none
    );
    expect(handler).toHaveBeenCalledWith(asErr(expectedError));
    expect(handler.mock.calls[0][0].error.type).toEqual(PollingErrorType.WorkError);
    expect(handler.mock.calls[0][0].error.stack).toContain(workError.stack);
  });

  test('still logs errors when they are thrown as strings', async () => {
    const pollInterval = 100;

    const handler = jest.fn();
    const workError = 'failed to work';
    const poller = createTaskPoller<string, string[]>({
      initialPollInterval: pollInterval,
      logger: loggingSystemMock.create().get(),
      pollInterval$: of(pollInterval),
      work: async (...args) => {
        throw workError;
      },
      getCapacity: () => 5,
    });
    poller.events$.subscribe(handler);
    poller.start();

    clock.tick(pollInterval);
    await new Promise((resolve) => setImmediate(resolve));

    const expectedError = new PollingError<string>(
      'Failed to poll for work: failed to work',
      PollingErrorType.WorkError,
      none
    );
    expect(handler).toHaveBeenCalledWith(asErr(expectedError));
    expect(handler.mock.calls[0][0].error.type).toEqual(PollingErrorType.WorkError);
    expect(handler.mock.calls[0][0].error.stack).toBeDefined();
  });

  test('continues polling after work fails', async () => {
    const pollInterval = 100;

    const handler = jest.fn();
    let callCount = 0;
    const workError = new Error('failed to work');
    const work = jest.fn(async () => {
      callCount++;
      if (callCount === 2) {
        throw workError;
      }
      return callCount;
    });
    const poller = createTaskPoller<string, number>({
      initialPollInterval: pollInterval,
      logger: loggingSystemMock.create().get(),
      pollInterval$: of(pollInterval),
      work,
      getCapacity: () => 5,
    });
    poller.events$.subscribe(handler);
    poller.start();

    clock.tick(pollInterval);
    await new Promise((resolve) => setImmediate(resolve));

    expect(handler).toHaveBeenCalledWith(asOk(1));

    clock.tick(pollInterval);
    await new Promise((resolve) => setImmediate(resolve));

    const expectedError = new PollingError<string>(
      'Failed to poll for work: failed to work',
      PollingErrorType.WorkError,
      none
    );
    expect(handler).toHaveBeenCalledWith(asErr(expectedError));
    expect(handler.mock.calls[1][0].error.type).toEqual(PollingErrorType.WorkError);
    expect(handler.mock.calls[1][0].error.stack).toContain(workError.stack);
    expect(handler).not.toHaveBeenCalledWith(asOk(2));

    clock.tick(pollInterval);
    await new Promise((resolve) => setImmediate(resolve));

    expect(handler).toHaveBeenCalledWith(asOk(3));
  });

  test('continues polling if getCapacity throws error fails', async () => {
    const pollInterval = 100;

    const handler = jest.fn();
    let callCount = 0;
    const work = jest.fn(async () => callCount);
    const poller = createTaskPoller<string, number>({
      initialPollInterval: pollInterval,
      logger: loggingSystemMock.create().get(),
      pollInterval$: of(pollInterval),
      work,
      getCapacity: () => {
        callCount++;
        if (callCount === 2) {
          throw new Error('error getting capacity');
        }
        return 2;
      },
    });
    poller.events$.subscribe(handler);
    poller.start();

    clock.tick(pollInterval);
    await new Promise((resolve) => setImmediate(resolve));

    expect(handler).toHaveBeenCalledWith(asOk(1));

    clock.tick(pollInterval);
    await new Promise((resolve) => setImmediate(resolve));

    const expectedError = new PollingError<string>(
      'Failed to poll for work: error getting capacity',
      PollingErrorType.WorkError,
      none
    );
    expect(handler).toHaveBeenCalledWith(asErr(expectedError));
    expect(handler.mock.calls[1][0].error.type).toEqual(PollingErrorType.WorkError);
    expect(handler).not.toHaveBeenCalledWith(asOk(2));

    clock.tick(pollInterval);
    await new Promise((resolve) => setImmediate(resolve));

    expect(handler).toHaveBeenCalledWith(asOk(3));
  });

  test(`doesn't start polling until start is called`, async () => {
    const pollInterval = 100;

    const work = jest.fn(async () => true);
    const taskPoller = createTaskPoller<void, boolean>({
      initialPollInterval: pollInterval,
      logger: loggingSystemMock.create().get(),
      pollInterval$: of(pollInterval),
      getCapacity: () => 1,
      work,
    });

    expect(work).toHaveBeenCalledTimes(0);

    clock.tick(pollInterval);
    await new Promise((resolve) => setImmediate(resolve));
    expect(work).toHaveBeenCalledTimes(0);

    clock.tick(pollInterval);
    await new Promise((resolve) => setImmediate(resolve));
    expect(work).toHaveBeenCalledTimes(0);

    // Start the poller here
    taskPoller.start();
    await new Promise((resolve) => setImmediate(resolve));
    expect(work).toHaveBeenCalledTimes(1);

    clock.tick(pollInterval);
    await new Promise((resolve) => setImmediate(resolve));
    expect(work).toHaveBeenCalledTimes(2);
  });

  test(`stops polling after stop is called`, async () => {
    const pollInterval = 100;

    const work = jest.fn(async () => true);
    const taskPoller = createTaskPoller<void, boolean>({
      initialPollInterval: pollInterval,
      logger: loggingSystemMock.create().get(),
      pollInterval$: of(pollInterval),
      getCapacity: () => 1,
      work,
    });

    taskPoller.start();
    await new Promise((resolve) => setImmediate(resolve));
    expect(work).toHaveBeenCalledTimes(1);

    clock.tick(pollInterval);
    await new Promise((resolve) => setImmediate(resolve));
    expect(work).toHaveBeenCalledTimes(2);

    clock.tick(pollInterval);
    await new Promise((resolve) => setImmediate(resolve));
    expect(work).toHaveBeenCalledTimes(3);

    // Stop the poller here
    taskPoller.stop();
    await new Promise((resolve) => setImmediate(resolve));
    expect(work).toHaveBeenCalledTimes(3);

    clock.tick(pollInterval);
    await new Promise((resolve) => setImmediate(resolve));
    expect(work).toHaveBeenCalledTimes(3);

    clock.tick(pollInterval);
    await new Promise((resolve) => setImmediate(resolve));
    expect(work).toHaveBeenCalledTimes(3);
  });
  describe('claimNudge$', () => {
    test('triggers an immediate cycle when a claim nudge arrives between polls', async () => {
      const pollInterval = 1000;

      const work = jest.fn(async () => true);
      const claimNudge$ = new Subject<void>();
      createTaskPoller<void, boolean>({
        initialPollInterval: pollInterval,
        logger: loggingSystemMock.create().get(),
        pollInterval$: of(pollInterval),
        claimNudge$,
        getCapacity: () => 1,
        work,
      }).start();

      // initial cycle runs synchronously on start()
      expect(work).toHaveBeenCalledTimes(1);
      await new Promise((resolve) => setImmediate(resolve));

      clock.tick(pollInterval / 4);
      expect(work).toHaveBeenCalledTimes(1);

      claimNudge$.next();
      await new Promise((resolve) => setImmediate(resolve));

      expect(work).toHaveBeenCalledTimes(2);

      // the regular schedule resumes pollInterval ms after the nudged cycle, not the original one
      clock.tick(pollInterval - 10);
      expect(work).toHaveBeenCalledTimes(2);
      clock.tick(20);
      await new Promise((resolve) => setImmediate(resolve));
      expect(work).toHaveBeenCalledTimes(3);
    });

    test('coalesces a claim nudge that arrives while a cycle is already running', async () => {
      const pollInterval = 1000;
      const { promise: worker, resolve: resolveWorker } = createResolvablePromise();

      const work = jest.fn(async () => {
        await worker;
        return true;
      });
      const claimNudge$ = new Subject<void>();
      createTaskPoller<void, boolean>({
        initialPollInterval: pollInterval,
        logger: loggingSystemMock.create().get(),
        pollInterval$: of(pollInterval),
        claimNudge$,
        getCapacity: () => 1,
        work,
      }).start();

      expect(work).toHaveBeenCalledTimes(1);
      await new Promise((resolve) => setImmediate(resolve));
      // fire the zero-delay timer that activates the claimNudge$ subscription
      clock.tick(0);
      await new Promise((resolve) => setImmediate(resolve));

      claimNudge$.next();
      await new Promise((resolve) => setImmediate(resolve));
      expect(work).toHaveBeenCalledTimes(1);

      resolveWorker(true);
      await new Promise((resolve) => setImmediate(resolve));

      // the coalesced nudge schedules the next cycle with 0 delay, not pollInterval
      clock.tick(0);
      await new Promise((resolve) => setImmediate(resolve));

      expect(work).toHaveBeenCalledTimes(2);
    });

    test('is a no-op once the poller has been stopped', async () => {
      const pollInterval = 1000;

      const work = jest.fn(async () => true);
      const claimNudge$ = new Subject<void>();
      const poller = createTaskPoller<void, boolean>({
        initialPollInterval: pollInterval,
        logger: loggingSystemMock.create().get(),
        pollInterval$: of(pollInterval),
        claimNudge$,
        getCapacity: () => 1,
        work,
      });
      poller.start();
      // `start()` defers subscribing with a (faked) `setTimeout`, so without this the nudge below
      // would be emitted to zero subscribers and the assertion would hold for the wrong reason.
      clock.tick(0);
      await new Promise((resolve) => setImmediate(resolve));
      expect(work).toHaveBeenCalledTimes(1);

      poller.stop();

      claimNudge$.next();
      await new Promise((resolve) => setImmediate(resolve));
      clock.tick(pollInterval);
      await new Promise((resolve) => setImmediate(resolve));

      expect(work).toHaveBeenCalledTimes(1);
    });
  });
});

function createResolvablePromise() {
  let resolve: (value: unknown) => void = () => {};
  const promise = new Promise((r) => {
    resolve = r;
  });
  // The "resolve = r;" code path is called before this
  return { promise, resolve };
}
