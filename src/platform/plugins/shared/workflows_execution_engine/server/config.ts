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

const executionLimit = (defaultValue: number) =>
  schema.number({
    defaultValue,
    min: 1,
    max: defaultValue,
    validate: (value) => (Number.isInteger(value) ? undefined : 'must be an integer'),
  });

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
  parallel: schema.object({
    maxConcurrentOperations: executionLimit(20),
    maxOutstandingBranches: executionLimit(100),
    maxTransitionsPerTick: executionLimit(1000),
  }),
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
});

export type EventTriggersConfig = TypeOf<typeof EventTriggersConfigSchema>;
export type WorkflowsExecutionEngineConfig = TypeOf<typeof configSchema>;

export const config: PluginConfigDescriptor<WorkflowsExecutionEngineConfig> = {
  schema: configSchema,
};
