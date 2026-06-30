/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { LatestTaskStateSchema } from '../task_state';

export interface TermsBucket {
  key: string;
  doc_count: number;
}

export interface AlertStatsAggregations {
  count_by_kind: { buckets: TermsBucket[] };
  count_by_source: { buckets: TermsBucket[] };
  count_by_type: { buckets: TermsBucket[] };
  episode_count: { value: number };
  min_timestamp: { value: number | null; value_as_string?: string };
}
export type AlertStatsResults = Pick<
  LatestTaskStateSchema,
  | 'alerts_count'
  | 'alerts_count_by_kind'
  | 'alerts_count_by_source'
  | 'alerts_count_by_type'
  | 'alerts_episode_count'
  | 'alerts_min_timestamp'
  | 'alerts_index_size_bytes'
>;

export interface ActionPolicyStatsAggregations {
  unique_workflow_count: { value: number };
  count_by_throttle_interval: { buckets: TermsBucket[] };
  count_with_group_by: { doc_count: number };
  avg_group_by_fields_count: { value: number | null };
  count_with_matcher: { doc_count: number };
  count_agent_builder_assisted: { doc_count: number };
}
export type ActionPolicyStatsResults = Pick<
  LatestTaskStateSchema,
  | 'action_policies_count'
  | 'action_policies_unique_workflow_count'
  | 'action_policies_count_with_matcher'
  | 'action_policies_count_agent_builder_assisted'
  | 'action_policies_count_with_group_by'
  | 'action_policies_avg_group_by_fields_count'
  | 'action_policies_count_by_throttle_interval'
>;

export interface ExecutionStatsAggregations {
  count_by_status: { buckets: TermsBucket[] };
  delay_percentiles: { values: Record<string, number | null> };
}
export type ExecutionStatsResults = Pick<
  LatestTaskStateSchema,
  | 'executions_count_24hr'
  | 'executions_count_by_status_24hr'
  | 'executions_delay_p50_ms'
  | 'executions_delay_p75_ms'
  | 'executions_delay_p95_ms'
  | 'executions_delay_p99_ms'
  | 'dispatcher_executions_count_24hr'
>;

export interface RuleStatsAggregations {
  count_enabled: { doc_count: number };
  count_agent_builder_assisted: { doc_count: number };
  count_by_kind: { buckets: TermsBucket[] };
  count_by_schedule: { buckets: TermsBucket[] };
  count_by_lookback: { buckets: TermsBucket[] };
  avg_pending_count: { value: number | null };
  avg_recovering_count: { value: number | null };
  count_by_pending_timeframe: { buckets: TermsBucket[] };
  count_by_recovering_timeframe: { buckets: TermsBucket[] };
  count_with_grouping: { doc_count: number };
  avg_grouping_fields_count: { value: number | null };
  min_created_at: { value: number | null; value_as_string?: string };
}
export type RuleStatsResults = Pick<
  LatestTaskStateSchema,
  | 'count_total'
  | 'count_enabled'
  | 'count_agent_builder_assisted'
  | 'count_by_kind'
  | 'count_by_schedule'
  | 'count_by_lookback'
  | 'avg_pending_count'
  | 'avg_recovering_count'
  | 'count_by_pending_timeframe'
  | 'count_by_recovering_timeframe'
  | 'count_with_grouping'
  | 'avg_grouping_fields_count'
  | 'min_created_at'
>;
