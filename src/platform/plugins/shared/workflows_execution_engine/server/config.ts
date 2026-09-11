/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { TypeOf } from '@kbn/config-schema';
import { schema } from '@kbn/config-schema';
import type { PluginConfigDescriptor } from '@kbn/core/server';
import { DEFAULT_MAX_STEP_SIZE } from './step/errors';

const EventTriggersConfigSchema = schema.object({
  /**
   * When false, event-driven workflow execution is disabled: event-triggered runs
   * (triggeredBy not in manual/scheduled/alert) are skipped at execution time.
   */
  enabled: schema.boolean({ defaultValue: true }),
  /**
   * When false, trigger events are not logged to the trigger-events data stream.
   */
  logEvents: schema.boolean({ defaultValue: true }),
  /**
   * Maximum depth for event-triggered chains (any workflow in the chain).
   * Scheduling is skipped when depth exceeds this value.
   */
  maxChainDepth: schema.number({ defaultValue: 10, min: 1 }),
});

const configSchema = schema.object({
  enabled: schema.boolean({ defaultValue: true }),
  eventDriven: EventTriggersConfigSchema,
  /**
   * Maximum depth of nested workflow execution (workflow calling workflow via workflow.execute step).
   */
  maxWorkflowDepth: schema.number({ defaultValue: 10, min: 1 }),
  logging: schema.object({
    console: schema.boolean({ defaultValue: false }),
  }),
  http: schema.object({
    allowedHosts: schema.arrayOf(
      schema.oneOf([schema.string({ hostname: true }), schema.literal('*')]),
      {
        defaultValue: ['*'],
      }
    ),
  }),
  maxResponseSize: schema.byteSize({ defaultValue: DEFAULT_MAX_STEP_SIZE }),
  eviction: schema.object({
    /**
     * Minimum output payload size for a completed step to be eligible for eviction
     * from in-memory state after it has been flushed to Elasticsearch.
     * Payloads smaller than this threshold stay in memory to avoid ES round-trip latency.
     * Set to "0b" to evict all completed step outputs, or a very large value to disable eviction.
     */
    minPayloadSize: schema.byteSize({ defaultValue: '10kb' }),
  }),
  collectQueueMetrics: schema.boolean({
    defaultValue: false,
    meta: {
      description:
        'When enabled, stores queue delay metrics (scheduledAt, runAt, queueDelayMs, scheduleDelayMs) in workflow executions. ' +
        'Useful for observability but adds to document size. Disabled by default for performance.',
    },
  }),
  /**
   * External HITL resume (API-key public routes + channel notifications).
   * Disable via `workflowsExecutionEngine.hitlExternalResume.enabled` and
   * `workflowsManagement.hitlExternalResume.enabled` in `kibana.yml`.
   */
  hitlExternalResume: schema.object({
    enabled: schema.boolean({ defaultValue: true }),
  }),
  /**
   * Synchronous workflow execution path — used by the inference anonymization pipeline
   * to run workflows inline within an HTTP request without persisting execution state to
   * Elasticsearch. Must be enabled alongside `xpack.inference.anonymization.workflowDriven`.
   */
  syncExecution: schema.object({
    /**
     * Master switch for the synchronous execution path. Must be set to true alongside
     * `xpack.inference.anonymization.workflowDriven: true` to enable workflow-driven
     * PII anonymization. Defaults to false so the path is inert until explicitly activated.
     */
    enabled: schema.boolean({ defaultValue: false }),
    /**
     * Maximum wall-clock time allowed for a single synchronous workflow execution.
     * When the deadline is reached the internal AbortController is aborted, which
     * propagates cancellation through the execution loop and cancels any in-flight
     * I/O (e.g. LLM streaming). Around-hook workflows that wrap LLM calls can take
     * several minutes; the 10-minute default reflects this. The natural upper bound
     * is the HTTP request timeout — if the client disconnects, that signal propagates
     * first. Callers may impose a shorter deadline via ExecuteWorkflowOptions.abortSignal.
     */
    maxDurationMs: schema.number({ defaultValue: 600_000, min: 1_000 }),
  }),
  /**
   * Configuration for the synchronous-execution log drain.
   * The drain buffers workflow event-log writes in memory and flushes them to
   * Elasticsearch out-of-band, keeping the sync execution hot path free of
   * inline ES round-trips.
   *
   * Defaults are sized for ~1000 concurrent sync req/s × 4 step events each
   * (~4000 events/sec inbound). Tune these values to your deployment's actual
   * load if the `kibana.workflows.sync_log_drain.events.dropped` metric is non-zero.
   */
  syncLogDrain: schema.object({
    /**
     * When false, the drain is disabled and sync executions write event-log
     * entries to Elasticsearch inline (same as async executions). Useful for
     * A/B comparisons to measure the drain's overhead vs. direct ES writes.
     */
    enabled: schema.boolean({ defaultValue: false }),
    /**
     * How often (ms) the background timer flushes buffered events to ES.
     * Lower values reduce event latency but increase write frequency.
     */
    intervalMs: schema.number({ defaultValue: 500, min: 100 }),
    /**
     * Maximum number of events held in the in-memory buffer before drop-oldest
     * kicks in. ~5 s of inbound capacity at the default rate.
     */
    maxQueue: schema.number({ defaultValue: 20000, min: 1000 }),
    /**
     * Maximum number of events written to ES in a single drain tick.
     * Should be ≥ intervalMs/1000 × peak inbound rate so one tick clears backlog.
     */
    maxBatch: schema.number({ defaultValue: 4000, min: 100 }),
  }),
});

export type EventTriggersConfig = TypeOf<typeof EventTriggersConfigSchema>;
export type WorkflowsExecutionEngineConfig = TypeOf<typeof configSchema>;

export const config: PluginConfigDescriptor<WorkflowsExecutionEngineConfig> = {
  schema: configSchema,
};
