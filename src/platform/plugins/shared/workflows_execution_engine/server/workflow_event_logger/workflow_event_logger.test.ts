/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { loggerMock } from '@kbn/logging-mocks';

import { WorkflowEventLogger } from './workflow_event_logger';
import { createCircuitBreakerError } from '../__fixtures__/circuit_breaker_error';
import type { LogsRepository, WorkflowLogEvent } from '../repositories/logs_repository';
import { WorkflowTaskManagerAbortError } from '../workflow_task_shutdown';

const createLogsRepositoryMock = () =>
  ({
    createLogs: jest.fn(),
  } as unknown as jest.Mocked<LogsRepository>);

describe('WorkflowEventLogger', () => {
  it('logs info events and preserves context fields', async () => {
    const logsRepository = createLogsRepositoryMock();
    const logger = loggerMock.create();
    const workflowLogger = new WorkflowEventLogger(logsRepository, logger, {
      workflowId: 'wf-1',
      executionId: 'exec-1',
      stepId: 'step-1',
      stepExecutionId: 'step-exec-1',
      workflowName: 'workflow',
      stepName: 'step',
      stepType: 'atomic',
      spaceId: 'default',
    });

    workflowLogger.logInfo('hello', { tags: ['tag-1'] });
    await workflowLogger.flushEvents();

    expect(logsRepository.createLogs).toHaveBeenCalledTimes(1);
    const events = (logsRepository.createLogs as jest.Mock).mock.calls[0][0] as WorkflowLogEvent[];
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual(
      expect.objectContaining({
        message: 'hello',
        level: 'info',
        spaceId: 'default',
        tags: ['tag-1'],
        workflow: expect.objectContaining({
          id: 'wf-1',
          execution_id: 'exec-1',
          step_id: 'step-1',
          step_execution_id: 'step-exec-1',
          name: 'workflow',
          step_name: 'step',
          step_type: 'atomic',
        }),
      })
    );
  });

  it('logs execution errors and re-queues events when indexing fails', async () => {
    const logsRepository = createLogsRepositoryMock();
    const logger = loggerMock.create();
    (logsRepository.createLogs as jest.Mock)
      .mockRejectedValueOnce(new Error('index-fail'))
      .mockResolvedValueOnce(undefined);
    const workflowLogger = new WorkflowEventLogger(logsRepository, logger);

    workflowLogger.logError('failure', new Error('boom'));
    await workflowLogger.flushEvents();
    await workflowLogger.flushEvents();

    expect(logsRepository.createLogs).toHaveBeenCalledTimes(2);
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('Failed to index workflow events: index-fail'),
      expect.objectContaining({
        eventsCount: 1,
      })
    );
    const indexedEvent = (logsRepository.createLogs as jest.Mock).mock
      .calls[1][0][0] as WorkflowLogEvent;
    expect(indexedEvent.error).toEqual(
      expect.objectContaining({
        message: 'boom',
      })
    );
  });

  it('suppresses and drops indexing errors during best-effort Task Manager abort flushes', async () => {
    const logsRepository = createLogsRepositoryMock();
    const logger = loggerMock.create();
    logsRepository.createLogs.mockRejectedValueOnce(new Error('task-aborted'));
    const workflowLogger = new WorkflowEventLogger(logsRepository, logger);
    const signal = AbortSignal.abort(new WorkflowTaskManagerAbortError());

    workflowLogger.logInfo('best effort');
    await workflowLogger.flushEvents({ signal });
    await workflowLogger.flushEvents();

    expect(logsRepository.createLogs).toHaveBeenCalledTimes(1);
    expect(logger.error).not.toHaveBeenCalled();
    expect(logger.debug).toHaveBeenCalledWith(
      'Failed to index workflow events during best-effort flush',
      expect.objectContaining({ eventsCount: 1, error: { message: 'task-aborted' } })
    );
  });

  it('does not suppress indexing errors for non-Task Manager abort signals', async () => {
    const logsRepository = createLogsRepositoryMock();
    const logger = loggerMock.create();
    logsRepository.createLogs.mockRejectedValueOnce(new Error('cancelled'));
    const workflowLogger = new WorkflowEventLogger(logsRepository, logger);
    const controller = new AbortController();
    controller.abort(new Error('user cancellation'));

    workflowLogger.logInfo('retryable');
    await workflowLogger.flushEvents({ signal: controller.signal });
    await workflowLogger.flushEvents();

    expect(logsRepository.createLogs).toHaveBeenCalledTimes(2);
    expect(logger.error).toHaveBeenCalledWith(
      'Failed to index workflow events: cancelled',
      expect.objectContaining({ eventsCount: 1 })
    );
  });

  it('writes to console logger when enabled', () => {
    const logsRepository = createLogsRepositoryMock();
    const logger = loggerMock.create();
    const workflowLogger = new WorkflowEventLogger(
      logsRepository,
      logger,
      {},
      { enableConsoleLogging: true }
    );

    workflowLogger.logWarn('watch out');
    workflowLogger.logDebug('debugging');
    workflowLogger.logEvent({ message: 'trace', level: 'trace' });

    expect(logger.warn).toHaveBeenCalled();
    expect(logger.debug).toHaveBeenCalled();
    expect(logger.trace).toHaveBeenCalled();
  });

  it('creates step loggers and tracks timing events', async () => {
    const logsRepository = createLogsRepositoryMock();
    const logger = loggerMock.create();
    const workflowLogger = new WorkflowEventLogger(logsRepository, logger, {
      workflowId: 'wf-1',
      executionId: 'exec-1',
      stepId: 'parent-step',
    });

    const stepLogger = workflowLogger.createStepLogger('step-exec-2', 'step-2', 'My Step', 'wait');
    const timingEvent = { event: { action: 'poll' } } as WorkflowLogEvent;
    stepLogger.startTiming(timingEvent);
    stepLogger.stopTiming(timingEvent);
    await stepLogger.flushEvents();

    const events = (logsRepository.createLogs as jest.Mock).mock.calls[0][0] as WorkflowLogEvent[];
    expect(events).toHaveLength(2);
    expect(events[0].event?.action).toBe('poll-start');
    expect(events[1].event?.action).toBe('poll-complete');
    expect(events[1].event?.duration).toEqual(expect.any(Number));
    expect(events[0].workflow?.step_id).toBe('step-2');
    expect(events[0].workflow?.step_execution_id).toBe('step-exec-2');
  });
});

/**
 * `flushEvents()` is the swallow boundary for log writes. Whatever ES throws —
 * including a circuit breaker that surfaces lazily on first data-stream init —
 * must NOT propagate to the workflow execution loop, because the loop's
 * `finally` block flushes events and a rejection there would crash the
 * surrounding `try`.
 *
 * Tests pin down two contracts:
 *   1. A circuit breaker rejection from `LogsRepository.createLogs` is logged
 *      and swallowed; the failed events are re-queued for a future flush.
 *   2. The next `flushEvents()` call after a transient CB reattempts the
 *      previously-failed events alongside any new ones.
 */
describe('WorkflowEventLogger.flushEvents — circuit breaker resilience', () => {
  it('swallows a circuit breaker rejection from createLogs and re-queues the events', async () => {
    const logsRepository = createLogsRepositoryMock();
    logsRepository.createLogs.mockRejectedValueOnce(createCircuitBreakerError());
    const logger = loggerMock.create();

    const eventLogger = new WorkflowEventLogger(logsRepository, logger);

    eventLogger.logInfo('first');
    eventLogger.logInfo('second');

    await expect(eventLogger.flushEvents()).resolves.toBeUndefined();

    expect(logsRepository.createLogs).toHaveBeenCalledTimes(1);
    expect(logsRepository.createLogs.mock.calls[0][0]).toHaveLength(2);
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('Failed to index workflow events'),
      expect.objectContaining({ eventsCount: 2 })
    );
  });

  it('reattempts re-queued events on the next flush after a transient circuit breaker', async () => {
    const logsRepository = createLogsRepositoryMock();
    logsRepository.createLogs
      .mockRejectedValueOnce(createCircuitBreakerError())
      .mockResolvedValueOnce(undefined);
    const logger = loggerMock.create();

    const eventLogger = new WorkflowEventLogger(logsRepository, logger);

    eventLogger.logInfo('event-a');
    await eventLogger.flushEvents();

    eventLogger.logInfo('event-b');
    await eventLogger.flushEvents();

    expect(logsRepository.createLogs).toHaveBeenCalledTimes(2);
    const secondFlushBatch = logsRepository.createLogs.mock.calls[1][0];
    const messages = secondFlushBatch.map((event) => event.message);
    expect(messages).toEqual(expect.arrayContaining(['event-a', 'event-b']));
    expect(secondFlushBatch).toHaveLength(2);
  });

  it('does not produce an unhandled rejection when createLogs rejects with a circuit breaker', async () => {
    const logsRepository = createLogsRepositoryMock();
    logsRepository.createLogs.mockRejectedValue(createCircuitBreakerError());
    const logger = loggerMock.create();

    const eventLogger = new WorkflowEventLogger(logsRepository, logger);

    const onUnhandled = jest.fn();
    process.on('unhandledRejection', onUnhandled);

    try {
      eventLogger.logInfo('boom');
      await eventLogger.flushEvents();
      await new Promise((resolve) => setImmediate(resolve));

      expect(onUnhandled).not.toHaveBeenCalled();
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }
  });
});

describe('WorkflowEventLogger — sync log drain integration', () => {
  it('routes flushEvents to the drain instead of calling createLogs when a drain is provided', async () => {
    const logsRepository = createLogsRepositoryMock();
    const drain = { enqueue: jest.fn() };

    const logger = new WorkflowEventLogger(
      logsRepository,
      loggerMock.create(),
      {},
      {},
      drain as any
    );

    logger.logInfo('should go to drain');
    await logger.flushEvents();

    // Drain must receive the event; ES must not be called inline
    expect(drain.enqueue).toHaveBeenCalledTimes(1);
    const enqueuedEvents = drain.enqueue.mock.calls[0][0] as WorkflowLogEvent[];
    expect(enqueuedEvents.length).toBe(1);
    expect(enqueuedEvents[0].message).toBe('should go to drain');
    expect(logsRepository.createLogs).not.toHaveBeenCalled();
  });

  it('propagates the drain to child step loggers created via createStepLogger', async () => {
    const logsRepository = createLogsRepositoryMock();
    const drain = { enqueue: jest.fn() };

    const parent = new WorkflowEventLogger(
      logsRepository,
      loggerMock.create(),
      {},
      {},
      drain as any
    );
    const child = parent.createStepLogger('step-exec-1', 'step-1', 'Step One', 'ai.prompt');

    child.logInfo('child event');
    await child.flushEvents();

    expect(drain.enqueue).toHaveBeenCalledTimes(1);
    expect(logsRepository.createLogs).not.toHaveBeenCalled();
  });
});
