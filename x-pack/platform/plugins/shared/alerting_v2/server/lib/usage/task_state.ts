/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { TypeOf } from '@kbn/config-schema';
import { schema } from '@kbn/config-schema';

/**
 * WARNING: Do not modify the existing versioned schema(s) below; add a new version instead.
 * Required for zero-downtime upgrades and rollbacks. See https://github.com/elastic/kibana/issues/155764.
 *
 * When adding fields, introduce `stateSchemaV2` (etc.), extend `stateSchemaByVersion`, and point
 * `latestTaskStateSchema` at the newest version.
 */

const nameValuePairSchema = schema.object({ name: schema.string(), value: schema.number() });

const stateSchemaV1 = schema.object({
  has_errors: schema.boolean(),
  error_messages: schema.maybe(schema.arrayOf(schema.string(), { maxSize: 100 })),
  runs: schema.number(),

  // rule stats
  count_total: schema.maybe(schema.number()),
  count_enabled: schema.maybe(schema.number()),
  count_by_kind: schema.maybe(
    schema.object({
      alert: schema.maybe(schema.number()),
      signal: schema.maybe(schema.number()),
    })
  ),
  count_by_schedule: schema.maybe(schema.arrayOf(nameValuePairSchema)),
  count_by_lookback: schema.maybe(schema.arrayOf(nameValuePairSchema)),
  avg_pending_count: schema.maybe(schema.nullable(schema.number())),
  avg_recovering_count: schema.maybe(schema.nullable(schema.number())),
  count_by_pending_timeframe: schema.maybe(schema.arrayOf(nameValuePairSchema)),
  count_by_recovering_timeframe: schema.maybe(schema.arrayOf(nameValuePairSchema)),
  count_with_grouping: schema.maybe(schema.number()),
  avg_grouping_fields_count: schema.maybe(schema.nullable(schema.number())),
  min_created_at: schema.maybe(schema.nullable(schema.string())),

  // execution stats
  executions_count_24hr: schema.maybe(schema.number()),
  executions_count_by_status_24hr: schema.maybe(
    schema.object({
      success: schema.maybe(schema.number()),
      failure: schema.maybe(schema.number()),
      unknown: schema.maybe(schema.number()),
    })
  ),
  executions_delay_p50_ms: schema.maybe(schema.nullable(schema.number())),
  executions_delay_p75_ms: schema.maybe(schema.nullable(schema.number())),
  executions_delay_p95_ms: schema.maybe(schema.nullable(schema.number())),
  executions_delay_p99_ms: schema.maybe(schema.nullable(schema.number())),
  dispatcher_executions_count_24hr: schema.maybe(schema.number()),

  // action policy stats
  action_policies_count: schema.maybe(schema.number()),
  action_policies_unique_workflow_count: schema.maybe(schema.number()),
  action_policies_count_with_matcher: schema.maybe(schema.number()),
  action_policies_count_with_group_by: schema.maybe(schema.number()),
  action_policies_avg_group_by_fields_count: schema.maybe(schema.nullable(schema.number())),
  action_policies_count_by_throttle_interval: schema.maybe(
    schema.arrayOf(nameValuePairSchema, { maxSize: 100 })
  ),

  // alert event stats
  alerts_count: schema.maybe(schema.number()),
  alerts_count_by_kind: schema.maybe(
    schema.object({
      breached: schema.maybe(schema.number()),
      recovered: schema.maybe(schema.number()),
      no_data: schema.maybe(schema.number()),
    })
  ),
  alerts_count_by_source: schema.maybe(schema.arrayOf(nameValuePairSchema)),
  alerts_count_by_type: schema.maybe(
    schema.object({
      signal: schema.maybe(schema.number()),
      alert: schema.maybe(schema.number()),
    })
  ),
  alerts_episode_count: schema.maybe(schema.number()),
  alerts_min_timestamp: schema.maybe(schema.nullable(schema.string())),
  alerts_index_size_bytes: schema.maybe(schema.nullable(schema.number())),
});

const stateSchemaV2 = stateSchemaV1.extends({
  count_agent_builder_assisted: schema.maybe(schema.number()),
  action_policies_count_agent_builder_assisted: schema.maybe(schema.number()),
});

export const stateSchemaByVersion = {
  1: {
    up: (state: Record<string, unknown>) => ({
      has_errors: state.has_errors ?? false,
      error_messages: state.error_messages ?? undefined,
      runs: state.runs ?? 0,
      count_total: state.count_total ?? undefined,
      count_enabled: state.count_enabled ?? undefined,
      count_by_kind: state.count_by_kind ?? undefined,
      count_by_schedule: state.count_by_schedule ?? undefined,
      count_by_lookback: state.count_by_lookback ?? undefined,
      avg_pending_count: state.avg_pending_count ?? undefined,
      avg_recovering_count: state.avg_recovering_count ?? undefined,
      count_by_pending_timeframe: state.count_by_pending_timeframe ?? undefined,
      count_by_recovering_timeframe: state.count_by_recovering_timeframe ?? undefined,
      count_with_grouping: state.count_with_grouping ?? undefined,
      avg_grouping_fields_count: state.avg_grouping_fields_count ?? undefined,
      min_created_at: state.min_created_at ?? undefined,
      executions_count_24hr: state.executions_count_24hr ?? undefined,
      executions_count_by_status_24hr: state.executions_count_by_status_24hr ?? undefined,
      executions_delay_p50_ms: state.executions_delay_p50_ms ?? undefined,
      executions_delay_p75_ms: state.executions_delay_p75_ms ?? undefined,
      executions_delay_p95_ms: state.executions_delay_p95_ms ?? undefined,
      executions_delay_p99_ms: state.executions_delay_p99_ms ?? undefined,
      dispatcher_executions_count_24hr: state.dispatcher_executions_count_24hr ?? undefined,
      action_policies_count: state.action_policies_count ?? undefined,
      action_policies_unique_workflow_count:
        state.action_policies_unique_workflow_count ?? undefined,
      action_policies_count_with_matcher: state.action_policies_count_with_matcher ?? undefined,
      action_policies_count_with_group_by: state.action_policies_count_with_group_by ?? undefined,
      action_policies_avg_group_by_fields_count:
        state.action_policies_avg_group_by_fields_count ?? undefined,
      action_policies_count_by_throttle_interval:
        state.action_policies_count_by_throttle_interval ?? undefined,
      alerts_count: state.alerts_count ?? undefined,
      alerts_count_by_kind: state.alerts_count_by_kind ?? undefined,
      alerts_count_by_source: state.alerts_count_by_source ?? undefined,
      alerts_count_by_type: state.alerts_count_by_type ?? undefined,
      alerts_episode_count: state.alerts_episode_count ?? undefined,
      alerts_min_timestamp: state.alerts_min_timestamp ?? undefined,
      alerts_index_size_bytes: state.alerts_index_size_bytes ?? undefined,
    }),
    schema: stateSchemaV1,
  },
  2: {
    up: (state: Record<string, unknown>) => ({
      ...state,
      count_agent_builder_assisted: state.count_agent_builder_assisted ?? undefined,
      action_policies_count_agent_builder_assisted:
        state.action_policies_count_agent_builder_assisted ?? undefined,
    }),
    schema: stateSchemaV2,
  },
};

const latestTaskStateSchema = stateSchemaByVersion[2].schema;
export type LatestTaskStateSchema = TypeOf<typeof latestTaskStateSchema>;

export const emptyState: LatestTaskStateSchema = {
  has_errors: false,
  error_messages: undefined,
  runs: 0,
};
