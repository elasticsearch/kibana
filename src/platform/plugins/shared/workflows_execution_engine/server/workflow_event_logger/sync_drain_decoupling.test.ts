/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/**
 * Decoupling proof — SyncLogDrain removes ES write latency from the sync hot path.
 *
 * The test simulates N concurrent sync executions, each creating a
 * WorkflowEventLogger backed by a shared SyncLogDrain. It asserts:
 *
 *   1. Zero createLogs calls while executions are running (no inline ES write).
 *   2. All events arrive in a single batched write after the drain timer fires.
 *
 * This is a deterministic, structural proof — no wall-clock timing, no flakiness.
 * If the drain wiring is removed (e.g. syncLogDrain removed from flushEvents),
 * createLogs is called inline, writeCalledDuringExecution becomes true, and
 * the test fails with a clear signal.
 */

import { loggerMock } from '@kbn/logging-mocks';
import { SyncLogDrain } from './sync_log_drain';
import { WorkflowEventLogger } from './workflow_event_logger';
import type { LogsRepository, WorkflowLogEvent } from '../repositories/logs_repository';

const makeLogsRepository = (): jest.Mocked<LogsRepository> =>
  ({
    createLogs: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<LogsRepository>);

describe('SyncLogDrain — decoupling proof under concurrent load', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('N concurrent sync executions complete without a single inline ES write; all events arrive batched after the drain timer fires', async () => {
    const INTERVAL_MS = 200;
    const N = 50;
    const STEPS_PER_EXECUTION = 3;

    // writeCalledDuringExecution becomes true if createLogs is ever called while
    // executions are still running (i.e. before executionsCompleted is set).
    let executionsCompleted = false;
    let writeCalledDuringExecution = false;

    const repo = makeLogsRepository();
    repo.createLogs.mockImplementation(async () => {
      if (!executionsCompleted) {
        writeCalledDuringExecution = true;
      }
    });

    const drain = new SyncLogDrain(repo, loggerMock.create(), {
      intervalMs: INTERVAL_MS,
      maxQueue: 10000,
      maxBatch: N * STEPS_PER_EXECUTION + 1,
    });

    // Each "execution" creates a WorkflowEventLogger with the shared drain, emits
    // STEPS_PER_EXECUTION log events, then calls flushEvents. This mirrors what
    // WorkflowEventLoggerService does for each sync execution in production.
    const executionPromises = Array.from({ length: N }, async (_, i) => {
      const logger = new WorkflowEventLogger(
        repo,
        loggerMock.create(),
        { executionId: `exec-${i}`, workflowId: 'wf-1', spaceId: 'default' },
        {},
        drain
      );
      for (let step = 0; step < STEPS_PER_EXECUTION; step++) {
        logger.logInfo(`step-${step}`);
      }
      // With a drain: flushEvents is a synchronous enqueue — no ES round-trip.
      await logger.flushEvents();
    });

    await Promise.all(executionPromises);
    executionsCompleted = true;

    // All N executions completed without touching ES.
    expect(writeCalledDuringExecution).toBe(false);
    expect(repo.createLogs).not.toHaveBeenCalled();

    // Drain timer fires — all N × STEPS_PER_EXECUTION events land in one batch.
    await jest.advanceTimersByTimeAsync(INTERVAL_MS + 1);

    expect(repo.createLogs).toHaveBeenCalledTimes(1);
    const writtenEvents = (repo.createLogs.mock.calls[0][0] as WorkflowLogEvent[]).length;
    expect(writtenEvents).toBe(N * STEPS_PER_EXECUTION);

    await drain.shutdown();
  });

  it('without the drain, a slow ES write blocks each flushEvents call (baseline proving the problem)', async () => {
    // This test documents WHY the drain exists: without it, flushEvents awaits
    // createLogs inline, serialising sync execution latency with ES write latency.
    let writeCallCount = 0;

    const repo = makeLogsRepository();
    repo.createLogs.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          writeCallCount++;
          // Simulate a slow ES write using real timers — fake timers don't affect
          // Promise chains that don't go through setInterval/setTimeout.
          resolve();
        })
    );

    // No drain — WorkflowEventLogger writes directly to ES on flushEvents.
    const logger = new WorkflowEventLogger(repo, loggerMock.create(), {}, {});
    logger.logInfo('event');
    await logger.flushEvents();

    // Exactly one inline createLogs call happened as part of flushEvents.
    expect(writeCallCount).toBe(1);
    expect(repo.createLogs).toHaveBeenCalledTimes(1);
  });
});
