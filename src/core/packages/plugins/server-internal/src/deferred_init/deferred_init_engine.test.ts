/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { loggingSystemMock } from '@kbn/core-logging-server-mocks';
import { isDeferredInitializationError } from '@kbn/core-deferred-init-common';
import { DeferredInitEngine, type DeferredInitRunner } from './deferred_init_engine';
import {
  DEFERRED_INIT_BACKOFF_MAX_MS,
  DEFERRED_INIT_MAX_BACKGROUND_ATTEMPTS,
  DEFERRED_START_TIMEOUT_MS,
} from './backoff';

const PLUGIN_ID = 'myPlugin';

type RunnerMock = jest.Mocked<DeferredInitRunner>;

/** A runner whose two phases resolve immediately unless overridden per test. */
const createRunner = (): RunnerMock => ({
  lazyInitialize: jest.fn().mockResolvedValue(undefined),
  start: jest.fn().mockResolvedValue(undefined),
});

/** A promise a test can hold open, to keep a run in flight while asserting on the engine. */
const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((res) => {
    resolve = res;
  });
  return { promise, resolve };
};

describe('DeferredInitEngine', () => {
  let engine: DeferredInitEngine;

  beforeEach(() => {
    engine = new DeferredInitEngine(loggingSystemMock.create().get());
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('isRegistered', () => {
    it('is false for an unknown plugin id', () => {
      expect(engine.isRegistered(PLUGIN_ID)).toBe(false);
    });

    it('is true once register() has been called', () => {
      engine.register(PLUGIN_ID);
      expect(engine.isRegistered(PLUGIN_ID)).toBe(true);
    });
  });

  describe('start-cycle guard', () => {
    it('throws (without running either phase) when waitUntilAvailable is called during the start cycle', async () => {
      const runner = createRunner();
      engine.register(PLUGIN_ID);
      engine.setRunner(PLUGIN_ID, runner);

      engine.beginStartCycle();

      await expect(engine.waitUntilAvailable(PLUGIN_ID)).rejects.toThrow(
        /during the plugin start lifecycle/
      );
      // The point of the guard: it must not kick (or block on) the deferred phases at boot.
      expect(runner.lazyInitialize).not.toHaveBeenCalled();
      expect(runner.start).not.toHaveBeenCalled();
      expect(engine.getState(PLUGIN_ID)).toBe('idle');
    });

    it('resolves normally once the start cycle has ended', async () => {
      const runner = createRunner();
      engine.register(PLUGIN_ID);
      engine.setRunner(PLUGIN_ID, runner);

      engine.beginStartCycle();
      engine.endStartCycle();

      await expect(engine.waitUntilAvailable(PLUGIN_ID)).resolves.toBeUndefined();
      expect(runner.lazyInitialize).toHaveBeenCalledTimes(1);
      expect(runner.start).toHaveBeenCalledTimes(1);
      expect(engine.getState(PLUGIN_ID)).toBe('available');
    });
  });

  describe('phase ordering', () => {
    it('runs lazyInitialize() and only then start()', async () => {
      const init = deferred();
      const runner = createRunner();
      runner.lazyInitialize.mockReturnValue(init.promise);
      engine.register(PLUGIN_ID);
      engine.setRunner(PLUGIN_ID, runner);

      const wait = engine.waitUntilAvailable(PLUGIN_ID);
      await Promise.resolve();
      expect(runner.lazyInitialize).toHaveBeenCalledTimes(1);
      expect(runner.start).not.toHaveBeenCalled();
      expect(engine.getState(PLUGIN_ID)).toBe('initializing');

      init.resolve();
      await wait;
      expect(runner.start).toHaveBeenCalledTimes(1);
      expect(engine.getState(PLUGIN_ID)).toBe('available');
    });

    it('does not run start() when lazyInitialize() fails', async () => {
      const runner = createRunner();
      runner.lazyInitialize.mockRejectedValue(new Error('boom'));
      engine.register(PLUGIN_ID);
      engine.setRunner(PLUGIN_ID, runner);

      await engine.waitUntilAvailable(PLUGIN_ID).catch(() => {});

      expect(runner.start).not.toHaveBeenCalled();
      expect(engine.getState(PLUGIN_ID)).toBe('failed');
      expect(engine.getFailureDetails(PLUGIN_ID)).toEqual({
        message: 'boom',
        attempts: 1,
        phase: 'lazyInitialize',
      });
    });

    it('keeps a successful lazyInitialize() and re-runs only start() after start() fails', async () => {
      jest.useFakeTimers();
      const runner = createRunner();
      runner.start.mockRejectedValueOnce(new Error('start boom')).mockResolvedValueOnce(undefined);
      engine.register(PLUGIN_ID);
      engine.setRunner(PLUGIN_ID, runner);

      await engine.waitUntilAvailable(PLUGIN_ID).catch(() => {});
      expect(engine.getState(PLUGIN_ID)).toBe('failed');
      expect(engine.getFailureDetails(PLUGIN_ID)).toEqual({
        message: 'start boom',
        attempts: 1,
        phase: 'start',
      });

      await jest.advanceTimersByTimeAsync(DEFERRED_INIT_BACKOFF_MAX_MS);
      await engine.waitUntilAvailable(PLUGIN_ID);

      // Initialization is idempotent by contract but start() is not expected to be, and re-running
      // init would waste the very work that was deferred; so init runs once, start twice.
      expect(runner.lazyInitialize).toHaveBeenCalledTimes(1);
      expect(runner.start).toHaveBeenCalledTimes(2);
      expect(engine.getState(PLUGIN_ID)).toBe('available');
    });

    it('fails the attempt when start() exceeds its timeout', async () => {
      jest.useFakeTimers();
      const runner = createRunner();
      runner.start.mockReturnValue(new Promise(() => {}));
      engine.register(PLUGIN_ID);
      engine.setRunner(PLUGIN_ID, runner);

      const wait = engine.waitUntilAvailable(PLUGIN_ID).catch((e) => e);
      await jest.advanceTimersByTimeAsync(DEFERRED_START_TIMEOUT_MS);
      const error = await wait;

      expect(isDeferredInitializationError(error)).toBe(true);
      expect(engine.getFailureDetails(PLUGIN_ID)).toEqual({
        message: expect.stringMatching(/wasn't completed in 10sec/),
        attempts: 1,
        phase: 'start',
      });
    });
  });

  describe('waitUntilAvailable', () => {
    it('resolves immediately if already available', async () => {
      const runner = createRunner();
      engine.register(PLUGIN_ID);
      engine.setRunner(PLUGIN_ID, runner);

      await engine.waitUntilAvailable(PLUGIN_ID);
      expect(engine.getState(PLUGIN_ID)).toBe('available');

      await expect(engine.waitUntilAvailable(PLUGIN_ID)).resolves.toBeUndefined();
      expect(runner.lazyInitialize).toHaveBeenCalledTimes(1);
      expect(runner.start).toHaveBeenCalledTimes(1);
    });

    it('throws a non-retriable DeferredInitializationError if no runner is attached', async () => {
      engine.register(PLUGIN_ID);

      const error = await engine.waitUntilAvailable(PLUGIN_ID).catch((e) => e);
      expect(isDeferredInitializationError(error)).toBe(true);
      expect(error.pluginId).toBe(PLUGIN_ID);
      // A misconfiguration, not a transient failure: retrying can't make a runner appear.
      expect(error.retriable).toBe(false);
    });

    it('kicks an idle plugin and resolves once both phases succeed', async () => {
      const runner = createRunner();
      engine.register(PLUGIN_ID);
      engine.setRunner(PLUGIN_ID, runner);

      await expect(engine.waitUntilAvailable(PLUGIN_ID)).resolves.toBeUndefined();
      expect(runner.lazyInitialize).toHaveBeenCalledTimes(1);
      expect(runner.start).toHaveBeenCalledTimes(1);
      expect(engine.getState(PLUGIN_ID)).toBe('available');
    });

    it('rejects with a DeferredInitializationError (cause = last error) on failure', async () => {
      const runError = new Error('boom');
      const runner = createRunner();
      runner.lazyInitialize.mockRejectedValue(runError);
      engine.register(PLUGIN_ID);
      engine.setRunner(PLUGIN_ID, runner);

      const error = await engine.waitUntilAvailable(PLUGIN_ID).catch((e) => e);
      expect(isDeferredInitializationError(error)).toBe(true);
      expect(error.pluginId).toBe(PLUGIN_ID);
      expect(error.cause).toBe(runError);
      // A transient failure of the plugin itself: worth retrying later.
      expect(error.retriable).toBe(true);
      expect(engine.getState(PLUGIN_ID)).toBe('failed');
    });

    it('shares a single in-flight attempt across concurrent callers', async () => {
      const init = deferred();
      const runner = createRunner();
      runner.lazyInitialize.mockReturnValue(init.promise);
      engine.register(PLUGIN_ID);
      engine.setRunner(PLUGIN_ID, runner);

      const first = engine.waitUntilAvailable(PLUGIN_ID);
      const second = engine.waitUntilAvailable(PLUGIN_ID);
      init.resolve();

      await expect(Promise.all([first, second])).resolves.toEqual([undefined, undefined]);
      expect(runner.lazyInitialize).toHaveBeenCalledTimes(1);
      expect(runner.start).toHaveBeenCalledTimes(1);
    });
  });

  describe('per-instance execution', () => {
    it('runs the phases on every engine instance (no shared cluster state)', async () => {
      const runnerA = createRunner();
      const engineA = new DeferredInitEngine(loggingSystemMock.create().get());
      engineA.register(PLUGIN_ID);
      engineA.setRunner(PLUGIN_ID, runnerA);

      const runnerB = createRunner();
      const engineB = new DeferredInitEngine(loggingSystemMock.create().get());
      engineB.register(PLUGIN_ID);
      engineB.setRunner(PLUGIN_ID, runnerB);

      await engineA.waitUntilAvailable(PLUGIN_ID);
      await engineB.waitUntilAvailable(PLUGIN_ID);

      // Each instance must do the work itself: `lazyInitialize` can establish instance-local
      // preconditions that a peer's run cannot satisfy, and `start()` builds an in-process contract.
      expect(runnerA.lazyInitialize).toHaveBeenCalledTimes(1);
      expect(runnerA.start).toHaveBeenCalledTimes(1);
      expect(runnerB.lazyInitialize).toHaveBeenCalledTimes(1);
      expect(runnerB.start).toHaveBeenCalledTimes(1);
      expect(engineA.getState(PLUGIN_ID)).toBe('available');
      expect(engineB.getState(PLUGIN_ID)).toBe('available');
    });

    it('runs the phases once per instance, not once per trigger', async () => {
      const runner = createRunner();
      engine.register(PLUGIN_ID);
      engine.setRunner(PLUGIN_ID, runner);

      await engine.waitUntilAvailable(PLUGIN_ID);
      await engine.waitUntilAvailable(PLUGIN_ID);
      engine.ensureInitialized(PLUGIN_ID);

      expect(runner.lazyInitialize).toHaveBeenCalledTimes(1);
      expect(runner.start).toHaveBeenCalledTimes(1);
    });
  });

  describe('ensureInitialized', () => {
    it('returns idle without side effects for an unregistered plugin', () => {
      expect(engine.ensureInitialized('unknown')).toBe('idle');
    });

    it('kicks an idle plugin into initializing', () => {
      engine.register(PLUGIN_ID);
      engine.setRunner(PLUGIN_ID, createRunner());

      expect(engine.ensureInitialized(PLUGIN_ID)).toBe('initializing');
    });

    it('does not re-kick a failed plugin, so the failure is actually observable', async () => {
      const runner = createRunner();
      runner.lazyInitialize.mockRejectedValue(new Error('boom'));
      engine.register(PLUGIN_ID);
      engine.setRunner(PLUGIN_ID, runner);

      await engine.waitUntilAvailable(PLUGIN_ID).catch(() => {});
      expect(engine.getState(PLUGIN_ID)).toBe('failed');

      // A poll (or a gated route hit) reading the status right after the failure must see
      // `failed`, not silently re-kick and hide it behind `initializing`.
      expect(engine.ensureInitialized(PLUGIN_ID)).toBe('failed');
      expect(runner.lazyInitialize).toHaveBeenCalledTimes(1);
    });

    it('auto-kicks again once a cooldown flips a failed plugin back to idle', async () => {
      jest.useFakeTimers();
      const runner = createRunner();
      runner.lazyInitialize
        .mockRejectedValueOnce(new Error('boom'))
        .mockResolvedValueOnce(undefined);
      engine.register(PLUGIN_ID);
      engine.setRunner(PLUGIN_ID, runner);

      await engine.waitUntilAvailable(PLUGIN_ID).catch(() => {});
      expect(engine.getState(PLUGIN_ID)).toBe('failed');

      await jest.advanceTimersByTimeAsync(DEFERRED_INIT_BACKOFF_MAX_MS);
      expect(engine.getState(PLUGIN_ID)).toBe('idle');

      expect(engine.ensureInitialized(PLUGIN_ID)).toBe('initializing');
      await jest.advanceTimersByTimeAsync(0);
      expect(runner.lazyInitialize).toHaveBeenCalledTimes(2);
      expect(runner.start).toHaveBeenCalledTimes(1);
      expect(engine.getState(PLUGIN_ID)).toBe('available');
    });

    it('does not schedule a cooldown timer after background retries are exhausted', async () => {
      jest.useFakeTimers();
      const runner = createRunner();
      runner.lazyInitialize.mockRejectedValue(new Error('boom'));
      engine.register(PLUGIN_ID);
      engine.setRunner(PLUGIN_ID, runner);

      // Exhaust background retries by triggering MAX_BACKGROUND_ATTEMPTS failures.
      for (let i = 0; i < DEFERRED_INIT_MAX_BACKGROUND_ATTEMPTS; i++) {
        await engine.waitUntilAvailable(PLUGIN_ID).catch(() => {});
        expect(engine.getState(PLUGIN_ID)).toBe('failed');
        // Advance past the max cooldown to allow background timer to fire (if scheduled).
        await jest.advanceTimersByTimeAsync(DEFERRED_INIT_BACKOFF_MAX_MS);
      }

      // After exhaustion, the state must remain `failed` even after a long wait — no timer fires.
      expect(engine.getState(PLUGIN_ID)).toBe('failed');
      await jest.advanceTimersByTimeAsync(DEFERRED_INIT_BACKOFF_MAX_MS * 10);
      expect(engine.getState(PLUGIN_ID)).toBe('failed');
    });

    it('recovers on demand via ensureInitialized once background retries are exhausted', async () => {
      jest.useFakeTimers();
      const runner = createRunner();
      runner.lazyInitialize.mockRejectedValue(new Error('boom'));
      engine.register(PLUGIN_ID);
      engine.setRunner(PLUGIN_ID, runner);

      // Drive through all background attempts (each advances past the cooldown timer).
      for (let i = 0; i < DEFERRED_INIT_MAX_BACKGROUND_ATTEMPTS; i++) {
        await engine.waitUntilAvailable(PLUGIN_ID).catch(() => {});
        await jest.advanceTimersByTimeAsync(DEFERRED_INIT_BACKOFF_MAX_MS);
      }
      expect(engine.getState(PLUGIN_ID)).toBe('failed');

      // Now make the recovery attempt succeed and simulate an incoming gated request.
      runner.lazyInitialize.mockResolvedValueOnce(undefined);
      expect(engine.ensureInitialized(PLUGIN_ID)).toBe('initializing');
      await jest.advanceTimersByTimeAsync(0);
      expect(engine.getState(PLUGIN_ID)).toBe('available');
    });
  });

  describe('state$', () => {
    it('replays the current state and follows transitions without triggering anything', async () => {
      const runner = createRunner();
      engine.register(PLUGIN_ID);
      engine.setRunner(PLUGIN_ID, runner);

      const seen: string[] = [];
      engine.state$(PLUGIN_ID).subscribe((state) => seen.push(state));
      expect(seen).toEqual(['idle']);
      // Observing is not triggering.
      expect(runner.lazyInitialize).not.toHaveBeenCalled();

      await engine.waitUntilAvailable(PLUGIN_ID);
      expect(seen).toEqual(['idle', 'initializing', 'available']);
    });
  });

  describe('getFailureDetails', () => {
    it('is undefined for a plugin that has never failed', () => {
      engine.register(PLUGIN_ID);
      expect(engine.getFailureDetails(PLUGIN_ID)).toBeUndefined();
    });

    it('is undefined once state moves past failed (e.g. back to initializing)', async () => {
      jest.useFakeTimers();
      const runner = createRunner();
      runner.lazyInitialize
        .mockRejectedValueOnce(new Error('boom'))
        .mockResolvedValueOnce(undefined);
      engine.register(PLUGIN_ID);
      engine.setRunner(PLUGIN_ID, runner);

      await engine.waitUntilAvailable(PLUGIN_ID).catch(() => {});
      await jest.advanceTimersByTimeAsync(DEFERRED_INIT_BACKOFF_MAX_MS);
      engine.ensureInitialized(PLUGIN_ID);

      expect(engine.getFailureDetails(PLUGIN_ID)).toBeUndefined();
    });

    it('reports the error message, attempt count and failed phase once failed', async () => {
      const runner = createRunner();
      runner.lazyInitialize.mockRejectedValue(new Error('boom'));
      engine.register(PLUGIN_ID);
      engine.setRunner(PLUGIN_ID, runner);

      await engine.waitUntilAvailable(PLUGIN_ID).catch(() => {});

      expect(engine.getFailureDetails(PLUGIN_ID)).toEqual({
        message: 'boom',
        attempts: 1,
        phase: 'lazyInitialize',
      });
    });

    it('increments across repeated failures and resets to 0 once a later attempt succeeds', async () => {
      jest.useFakeTimers();
      const runner = createRunner();
      runner.lazyInitialize
        .mockRejectedValueOnce(new Error('first'))
        .mockRejectedValueOnce(new Error('second'))
        .mockResolvedValueOnce(undefined);
      engine.register(PLUGIN_ID);
      engine.setRunner(PLUGIN_ID, runner);

      await engine.waitUntilAvailable(PLUGIN_ID).catch(() => {});
      expect(engine.getFailureDetails(PLUGIN_ID)).toEqual({
        message: 'first',
        attempts: 1,
        phase: 'lazyInitialize',
      });

      await jest.advanceTimersByTimeAsync(DEFERRED_INIT_BACKOFF_MAX_MS);
      await engine.waitUntilAvailable(PLUGIN_ID).catch(() => {});
      expect(engine.getFailureDetails(PLUGIN_ID)).toEqual({
        message: 'second',
        attempts: 2,
        phase: 'lazyInitialize',
      });

      await jest.advanceTimersByTimeAsync(DEFERRED_INIT_BACKOFF_MAX_MS);
      await engine.waitUntilAvailable(PLUGIN_ID);

      expect(engine.getState(PLUGIN_ID)).toBe('available');
      expect(engine.getFailureDetails(PLUGIN_ID)).toBeUndefined();
    });
  });
});
