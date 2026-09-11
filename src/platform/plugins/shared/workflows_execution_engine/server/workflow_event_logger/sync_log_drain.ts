/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { metrics, ValueType } from '@opentelemetry/api';
import { performance } from 'perf_hooks';
import type { Logger } from '@kbn/core/server';
import type { LogsRepository, WorkflowLogEvent } from '../repositories/logs_repository';

const meter = metrics.getMeter('kibana.workflows.sync_log_drain');

/**
 * Number of workflow log events dropped from the sync log drain buffer because
 * the buffer reached `maxQueue` capacity. A non-zero value means the drain
 * cannot write to Elasticsearch fast enough for the current load — increase
 * `workflowsExecutionEngine.syncLogDrain.maxBatch` or `maxQueue`, or investigate
 * Elasticsearch write latency.
 */
const eventsDroppedCounter = meter.createCounter('kibana.workflows.sync_log_drain.events.dropped', {
  description:
    'Number of workflow log events dropped from the sync log drain buffer due to backpressure',
  unit: '{event}',
  valueType: ValueType.INT,
});

/**
 * Duration (ms) of each out-of-band batch write from the sync log drain to
 * Elasticsearch. High values indicate ES write latency; combined with the drop
 * counter they identify when the drain cannot keep up.
 */
const batchDurationHistogram = meter.createHistogram(
  'kibana.workflows.sync_log_drain.batch.duration',
  {
    description: 'Duration of out-of-band sync log drain batch writes to Elasticsearch',
    unit: 'ms',
    valueType: ValueType.DOUBLE,
  }
);

export interface SyncLogDrainOptions {
  /** How often (ms) the background timer flushes buffered events to Elasticsearch. */
  intervalMs: number;
  /** Maximum events in the buffer before drop-oldest kicks in. */
  maxQueue: number;
  /** Maximum events to write to Elasticsearch in one drain tick. */
  maxBatch: number;
}

/**
 * Long-lived, plugin-owned component that decouples workflow event-log writes
 * from the synchronous execution hot path.
 *
 * Callers (sync-mode `WorkflowEventLogger` instances) enqueue events via
 * `enqueue()` — a synchronous, in-memory push with O(1) cost. A background
 * timer drains the buffer to Elasticsearch in batches without blocking the
 * calling request. A `shutdown()` call stops the timer and flushes any
 * remaining events before the plugin stops.
 *
 * Error contract:
 *  - On ES write failure: re-queue the failed batch (bounded; drops oldest
 *    events if re-queue would exceed `maxQueue`) and log the error.
 *  - On buffer overflow: drop oldest events and increment the
 *    `kibana.workflows.sync_log_drain.events.dropped` counter.
 *  - Never throws — errors are swallowed and logged here.
 *
 * This contract is intentionally different from `WorkflowEventLogger.flushEvents`
 * (which re-queues unboundedly). The two implementations are kept separate so
 * the async execution path's error semantics remain unchanged.
 */
export class SyncLogDrain {
  private readonly buffer: WorkflowLogEvent[] = [];
  /** Lazy: undefined until the first enqueue(), so the timer only runs when
   *  the feature that produces sync-mode events is actually active. */
  private timer: ReturnType<typeof setInterval> | undefined;
  /** Set to true before clearInterval in shutdown() to guard any tick that
   *  was already queued on the event loop before clearInterval ran. */
  private stopped = false;
  /** Tracks the in-flight drain promise so `shutdown()` can await it. */
  private drainingPromise: Promise<void> | undefined;

  constructor(
    private readonly logsRepository: LogsRepository,
    private readonly logger: Logger,
    private readonly options: SyncLogDrainOptions
  ) {}

  /**
   * Synchronously enqueue `events` into the in-memory buffer.
   * If the buffer is already at `maxQueue` capacity, the oldest event is
   * dropped for each incoming event (oldest-first eviction). Drop-oldest
   * keeps latency-sensitive sync callers unblocked at all times.
   *
   * The background drain timer is started here on the first call so it only
   * runs when sync-mode events are actually being produced — the drain
   * consumes no resources (no timer, no polling) when the feature is inactive.
   */
  public enqueue(events: WorkflowLogEvent[]): void {
    if (this.timer === undefined && !this.stopped) {
      this.timer = setInterval(() => {
        void this.tick();
      }, this.options.intervalMs);
      // Do not hold the Node.js event loop open purely for the drain timer.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (this.timer as any).unref?.();
    }
    const { maxQueue } = this.options;
    for (const event of events) {
      if (this.buffer.length >= maxQueue) {
        this.buffer.shift();
        eventsDroppedCounter.add(1);
      }
      this.buffer.push(event);
    }
  }

  /**
   * Stop the background timer and flush all remaining buffered events to
   * Elasticsearch. Called from the plugin's `stop()` lifecycle method.
   *
   * `stopped` is set before `clearInterval` so any tick callback already queued
   * on the event loop sees the flag and exits without starting a second drain.
   * Any in-flight drain tick is awaited, then the buffer is drained in a loop
   * (multiple batches if buffer > maxBatch) until empty.
   *
   * Events that cannot be written due to an ES failure are dropped on shutdown
   * (not re-queued). Re-queuing during shutdown would loop forever if ES is
   * persistently unavailable — an infinite loop is worse than data loss on stop.
   */
  public async shutdown(): Promise<void> {
    this.stopped = true;
    if (this.timer !== undefined) {
      clearInterval(this.timer);
    }
    if (this.drainingPromise !== undefined) {
      await this.drainingPromise;
    }
    while (this.buffer.length > 0) {
      const batch = this.buffer.splice(0, this.options.maxBatch);
      const startMs = performance.now();
      try {
        await this.logsRepository.createLogs(batch);
        batchDurationHistogram.record(performance.now() - startMs);
      } catch (error: unknown) {
        batchDurationHistogram.record(performance.now() - startMs);
        this.logger.error(
          `Sync log drain: shutdown flush failed for ${batch.length} events — dropping: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
        eventsDroppedCounter.add(batch.length);
        // Do NOT re-queue: that would loop forever if ES is persistently down.
      }
    }
  }

  private tick(): Promise<void> {
    if (this.stopped || this.drainingPromise !== undefined) {
      // Stopped (shutdown in progress) or a drain is already in-flight — skip.
      return Promise.resolve();
    }
    this.drainingPromise = this.doDrain().finally(() => {
      this.drainingPromise = undefined;
    });
    return this.drainingPromise;
  }

  private async doDrain(): Promise<void> {
    if (this.buffer.length === 0) return;

    const { maxBatch, maxQueue } = this.options;
    const batch = this.buffer.splice(0, maxBatch);
    const startMs = performance.now();

    try {
      await this.logsRepository.createLogs(batch);
      batchDurationHistogram.record(performance.now() - startMs);
      this.logger.debug(`Sync log drain: flushed ${batch.length} events`);
    } catch (error: unknown) {
      batchDurationHistogram.record(performance.now() - startMs);
      this.logger.error(
        `Sync log drain: failed to write ${batch.length} events to Elasticsearch: ${
          error instanceof Error ? error.message : String(error)
        }`
      );

      // Re-queue oldest-first, bounded — if re-queuing the whole batch would
      // exceed maxQueue, drop the oldest events from the batch first so
      // newer events (which arrived after the batch was taken) are preserved.
      const overflow = this.buffer.length + batch.length - maxQueue;
      if (overflow > 0) {
        batch.splice(0, overflow);
        eventsDroppedCounter.add(overflow);
      }
      this.buffer.unshift(...batch);
    }
  }
}
