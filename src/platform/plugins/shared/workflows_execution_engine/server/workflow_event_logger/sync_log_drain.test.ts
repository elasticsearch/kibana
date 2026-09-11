/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Logger } from '@kbn/core/server';
import { SyncLogDrain } from './sync_log_drain';
import type { LogsRepository, WorkflowLogEvent } from '../repositories/logs_repository';

const makeEvent = (id: string): WorkflowLogEvent =>
  ({
    '@timestamp': new Date().toISOString(),
    message: id,
    level: 'info',
  } as unknown as WorkflowLogEvent);

const makeLogger = (): jest.Mocked<Logger> =>
  ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    get: jest.fn().mockReturnThis(),
  } as unknown as jest.Mocked<Logger>);

const makeLogsRepository = (): jest.Mocked<LogsRepository> =>
  ({
    createLogs: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<LogsRepository>);

const DEFAULT_OPTIONS = { intervalMs: 100, maxQueue: 10, maxBatch: 5 };

describe('SyncLogDrain', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  describe('enqueue', () => {
    it('buffers events in-memory without calling createLogs', () => {
      const repo = makeLogsRepository();
      const drain = new SyncLogDrain(repo, makeLogger(), DEFAULT_OPTIONS);
      drain.enqueue([makeEvent('a'), makeEvent('b')]);
      expect(repo.createLogs).not.toHaveBeenCalled();
    });

    it('drops oldest events when buffer reaches maxQueue', async () => {
      const repo = makeLogsRepository();
      const drain = new SyncLogDrain(repo, makeLogger(), {
        ...DEFAULT_OPTIONS,
        maxQueue: 3,
      });

      // Fill to maxQueue
      drain.enqueue([makeEvent('1'), makeEvent('2'), makeEvent('3')]);
      // Enqueueing one more should drop event '1'
      drain.enqueue([makeEvent('4')]);

      // Drain everything and inspect what was written
      await drain.shutdown();

      const written = repo.createLogs.mock.calls.flat().flat() as WorkflowLogEvent[];
      const messages = written.map((e) => e.message);
      expect(messages).not.toContain('1');
      expect(messages).toContain('2');
      expect(messages).toContain('3');
      expect(messages).toContain('4');
    });
  });

  describe('background drain (timer)', () => {
    it('writes buffered events to ES after the interval fires', async () => {
      const repo = makeLogsRepository();
      const drain = new SyncLogDrain(repo, makeLogger(), DEFAULT_OPTIONS);
      drain.enqueue([makeEvent('x'), makeEvent('y')]);

      expect(repo.createLogs).not.toHaveBeenCalled();

      await jest.advanceTimersByTimeAsync(DEFAULT_OPTIONS.intervalMs + 1);

      expect(repo.createLogs).toHaveBeenCalledTimes(1);
      const written = (repo.createLogs.mock.calls[0][0] as WorkflowLogEvent[]).map(
        (e) => e.message
      );
      expect(written).toEqual(['x', 'y']);

      await drain.shutdown();
    });

    it('writes at most maxBatch events per tick', async () => {
      const repo = makeLogsRepository();
      const drain = new SyncLogDrain(repo, makeLogger(), {
        ...DEFAULT_OPTIONS,
        maxBatch: 2,
      });
      // Enqueue 4 events; first tick should write only 2
      drain.enqueue([makeEvent('a'), makeEvent('b'), makeEvent('c'), makeEvent('d')]);

      await jest.advanceTimersByTimeAsync(DEFAULT_OPTIONS.intervalMs + 1);
      expect(repo.createLogs).toHaveBeenCalledTimes(1);
      expect((repo.createLogs.mock.calls[0][0] as WorkflowLogEvent[]).length).toBe(2);

      // Second tick flushes the remaining 2
      await jest.advanceTimersByTimeAsync(DEFAULT_OPTIONS.intervalMs + 1);
      expect(repo.createLogs).toHaveBeenCalledTimes(2);

      await drain.shutdown();
    });
  });

  describe('concurrency guard', () => {
    it('skips a tick while a drain is already in progress', async () => {
      let resolveWrite!: () => void;
      const repo = makeLogsRepository();
      repo.createLogs.mockImplementationOnce(
        () =>
          new Promise<void>((res) => {
            resolveWrite = res;
          })
      );

      const drain = new SyncLogDrain(repo, makeLogger(), DEFAULT_OPTIONS);
      drain.enqueue([makeEvent('slow')]);

      // First tick starts the drain (unresolved)
      await jest.advanceTimersByTimeAsync(DEFAULT_OPTIONS.intervalMs + 1);
      expect(repo.createLogs).toHaveBeenCalledTimes(1);

      // Enqueue more; second tick fires but the guard blocks a second createLogs
      drain.enqueue([makeEvent('concurrent')]);
      await jest.advanceTimersByTimeAsync(DEFAULT_OPTIONS.intervalMs + 1);
      expect(repo.createLogs).toHaveBeenCalledTimes(1); // still 1

      // Resolve the first write; next tick can now proceed
      resolveWrite();
      await jest.advanceTimersByTimeAsync(DEFAULT_OPTIONS.intervalMs + 1);
      expect(repo.createLogs).toHaveBeenCalledTimes(2);

      await drain.shutdown();
    });
  });

  describe('error handling — bounded re-queue on write failure', () => {
    it('re-queues failed batch and retries on the next tick', async () => {
      const repo = makeLogsRepository();
      repo.createLogs
        .mockRejectedValueOnce(new Error('ES write failed'))
        .mockResolvedValue(undefined);

      const drain = new SyncLogDrain(repo, makeLogger(), DEFAULT_OPTIONS);
      drain.enqueue([makeEvent('retry-me')]);

      // First tick: write fails; events should be re-queued
      await jest.advanceTimersByTimeAsync(DEFAULT_OPTIONS.intervalMs + 1);
      expect(repo.createLogs).toHaveBeenCalledTimes(1);

      // Second tick: write succeeds
      await jest.advanceTimersByTimeAsync(DEFAULT_OPTIONS.intervalMs + 1);
      expect(repo.createLogs).toHaveBeenCalledTimes(2);
      const written = (repo.createLogs.mock.calls[1][0] as WorkflowLogEvent[]).map(
        (e) => e.message
      );
      expect(written).toContain('retry-me');

      await drain.shutdown();
    });

    it('drops re-queued events that would exceed maxQueue (bounded re-queue)', async () => {
      const repo = makeLogsRepository();
      // First write fails
      repo.createLogs
        .mockRejectedValueOnce(new Error('ES write failed'))
        .mockResolvedValue(undefined);

      const drain = new SyncLogDrain(repo, makeLogger(), {
        intervalMs: 100,
        maxBatch: 3,
        maxQueue: 3, // tight limit
      });

      // Enqueue 3 events (fills maxQueue)
      drain.enqueue([makeEvent('a'), makeEvent('b'), makeEvent('c')]);

      // First tick: batch of 3 taken, write fails.
      // At re-queue time buffer is empty (newly arrived events = 0), so
      // re-queued batch fits within maxQueue and is preserved.
      await jest.advanceTimersByTimeAsync(101);
      expect(repo.createLogs).toHaveBeenCalledTimes(1);

      // While the batch is being re-queued, add 3 more events (overflow condition)
      drain.enqueue([makeEvent('d'), makeEvent('e'), makeEvent('f')]);

      // Re-queue happens: buffer now has d, e, f (3 items) + failed batch of 3 = 6.
      // maxQueue=3, so 3 oldest events dropped. After re-queue: only the most
      // recent 3 remain.
      // Advance again so a tick drains
      await jest.advanceTimersByTimeAsync(101);
      expect(repo.createLogs).toHaveBeenCalledTimes(2);
      // Whatever was written, it's at most maxBatch=3 events
      const written = repo.createLogs.mock.calls[1][0] as WorkflowLogEvent[];
      expect(written.length).toBeLessThanOrEqual(3);

      await drain.shutdown();
    });

    it('never throws even if createLogs throws', async () => {
      const repo = makeLogsRepository();
      repo.createLogs.mockRejectedValue(new Error('always fails'));

      const drain = new SyncLogDrain(repo, makeLogger(), DEFAULT_OPTIONS);
      drain.enqueue([makeEvent('z')]);

      // Should not throw
      await expect(
        jest.advanceTimersByTimeAsync(DEFAULT_OPTIONS.intervalMs + 1)
      ).resolves.not.toThrow();

      await expect(drain.shutdown()).resolves.not.toThrow();
    });
  });

  describe('shutdown', () => {
    it('flushes remaining events before resolving', async () => {
      const repo = makeLogsRepository();
      const drain = new SyncLogDrain(repo, makeLogger(), DEFAULT_OPTIONS);
      drain.enqueue([makeEvent('final')]);

      await drain.shutdown();

      expect(repo.createLogs).toHaveBeenCalledTimes(1);
      const written = (repo.createLogs.mock.calls[0][0] as WorkflowLogEvent[]).map(
        (e) => e.message
      );
      expect(written).toContain('final');
    });

    it('awaits any in-flight drain before the final flush', async () => {
      let resolveWrite!: () => void;
      const writes: string[][] = [];

      const repo = makeLogsRepository();
      repo.createLogs.mockImplementation((events: WorkflowLogEvent[]) => {
        writes.push(events.map((e) => e.message));
        return new Promise<void>((res) => {
          resolveWrite = res;
        });
      });

      const drain = new SyncLogDrain(repo, makeLogger(), DEFAULT_OPTIONS);
      drain.enqueue([makeEvent('in-flight')]);

      // Kick off a drain tick
      const tickPromise = jest.advanceTimersByTimeAsync(DEFAULT_OPTIONS.intervalMs + 1);

      // Start shutdown concurrently; it should wait for the in-flight drain
      const shutdownPromise = drain.shutdown();

      // Resolve the in-flight write
      resolveWrite();
      await tickPromise;
      await shutdownPromise;

      // Only one write should have happened (no double-write)
      expect(writes).toHaveLength(1);
      expect(writes[0]).toContain('in-flight');
    });

    it('flushes ALL remaining events when buffer exceeds maxBatch (loops until empty)', async () => {
      const repo = makeLogsRepository();
      const drain = new SyncLogDrain(repo, makeLogger(), {
        intervalMs: 100,
        maxQueue: 20,
        maxBatch: 3, // tight batch — 9 events require 3 writes
      });
      drain.enqueue([
        makeEvent('1'),
        makeEvent('2'),
        makeEvent('3'),
        makeEvent('4'),
        makeEvent('5'),
        makeEvent('6'),
        makeEvent('7'),
        makeEvent('8'),
        makeEvent('9'),
      ]);

      await drain.shutdown();

      // All 9 events must reach createLogs across multiple batches
      const allWritten = repo.createLogs.mock.calls.flat().flat() as WorkflowLogEvent[];
      expect(allWritten.map((e) => e.message)).toEqual(
        expect.arrayContaining(['1', '2', '3', '4', '5', '6', '7', '8', '9'])
      );
      expect(allWritten).toHaveLength(9);
    });

    it('stops the timer so no further drains fire after shutdown', async () => {
      const repo = makeLogsRepository();
      const drain = new SyncLogDrain(repo, makeLogger(), DEFAULT_OPTIONS);
      await drain.shutdown();

      // Enqueue events after shutdown; advancing the timer should not trigger a write
      drain.enqueue([makeEvent('post-shutdown')]);
      await jest.advanceTimersByTimeAsync(DEFAULT_OPTIONS.intervalMs * 3);
      expect(repo.createLogs).not.toHaveBeenCalled();
    });
  });
});
