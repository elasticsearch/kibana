/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export interface NameValuePair {
  name: string;
  value: number;
}

/**
 * Usage type for telemetry usage collector.
 */
export interface AlertingV2Usage {
  has_errors: boolean;
  error_messages?: string[];

  // rule stats
  count_total?: number;
  count_enabled?: number;
  count_agent_builder_assisted?: number;
  count_by_kind?: { alert?: number; signal?: number };
  count_by_schedule?: NameValuePair[];
  count_by_lookback?: NameValuePair[];
  avg_pending_count?: number | null;
  avg_recovering_count?: number | null;
  count_by_pending_timeframe?: NameValuePair[];
  count_by_recovering_timeframe?: NameValuePair[];
  count_with_grouping?: number;
  avg_grouping_fields_count?: number | null;
  min_created_at?: string | null;

  // execution stats
  executions_count_24hr?: number;
  executions_count_by_status_24hr?: { success?: number; failure?: number; unknown?: number };
  executions_delay_p50_ms?: number | null;
  executions_delay_p75_ms?: number | null;
  executions_delay_p95_ms?: number | null;
  executions_delay_p99_ms?: number | null;
  dispatcher_executions_count_24hr?: number;

  // action policy stats
  action_policies_count?: number;
  action_policies_unique_workflow_count?: number;
  action_policies_count_with_matcher?: number;
  action_policies_count_agent_builder_assisted?: number;
  action_policies_count_with_group_by?: number;
  action_policies_avg_group_by_fields_count?: number | null;
  action_policies_count_by_throttle_interval?: NameValuePair[];

  // alert event stats
  alerts_count?: number;
  alerts_count_by_kind?: { breached?: number; recovered?: number; no_data?: number };
  alerts_count_by_source?: NameValuePair[];
  alerts_count_by_type?: { signal?: number; alert?: number };
  alerts_episode_count?: number;
  alerts_min_timestamp?: string | null;
  alerts_index_size_bytes?: number | null;
}

export type AlertingV2UsageCollectorSchemaType = AlertingV2Usage & {
  available: boolean;
  enabled: boolean;
};
