export interface AlertingUsage {
    has_errors: boolean;
    error_messages?: string[];
    count_total: number;
    count_active_total: number;
    count_disabled_total: number;
    count_by_type: Record<string, number>;
    count_active_by_type: Record<string, number>;
    count_rules_namespaces: number;
    count_rules_executions_per_day: number;
    count_rules_executions_by_type_per_day: Record<string, number>;
    count_rules_executions_failured_per_day: number;
    count_rules_executions_failured_by_reason_per_day: Record<string, number>;
    count_rules_executions_failured_by_reason_by_type_per_day: Record<string, Record<string, number>>;
    count_rules_executions_timeouts_per_day: number;
    count_rules_executions_timeouts_by_type_per_day: Record<string, number>;
    count_failed_and_unrecognized_rule_tasks_per_day: number;
    count_failed_and_unrecognized_rule_tasks_by_status_per_day: Record<string, number>;
    count_failed_and_unrecognized_rule_tasks_by_status_by_type_per_day: Record<string, Record<string, number>>;
    count_rules_by_execution_status: {
        success: number;
        error: number;
        warning: number;
    };
    count_rules_with_tags: number;
    count_rules_with_elasticagent_tag: number;
    count_rules_with_elasticagent_tag_by_type: Record<string, number>;
    count_rules_by_notify_when: {
        on_action_group_change: number;
        on_active_alert: number;
        on_throttle_interval: number;
    };
    count_connector_types_by_consumers: Record<string, Record<string, number>>;
    count_rules_snoozed: number;
    count_rules_muted: number;
    count_rules_with_linked_dashboards: number;
    count_rules_with_investigation_guide: number;
    count_mw_total: number;
    count_mw_with_repeat_toggle_on: number;
    count_mw_with_filter_alert_toggle_on: number;
    count_rules_with_muted_alerts: number;
    count_rules_with_api_key_created_by_user: number;
    count_rules_by_execution_status_per_day: Record<string, number>;
    percentile_num_generated_actions_per_day: {
        p50: number;
        p90: number;
        p99: number;
    };
    percentile_num_generated_actions_by_type_per_day: {
        p50: Record<string, number>;
        p90: Record<string, number>;
        p99: Record<string, number>;
    };
    percentile_num_alerts_per_day: {
        p50: number;
        p90: number;
        p99: number;
    };
    percentile_num_alerts_by_type_per_day: {
        p50: Record<string, number>;
        p90: Record<string, number>;
        p99: Record<string, number>;
    };
    avg_execution_time_per_day: number;
    avg_execution_time_by_type_per_day: Record<string, number>;
    avg_es_search_duration_per_day: number;
    avg_es_search_duration_by_type_per_day: Record<string, number>;
    avg_total_search_duration_per_day: number;
    avg_total_search_duration_by_type_per_day: Record<string, number>;
    throttle_time: {
        min: string;
        avg: string;
        max: string;
    };
    schedule_time: {
        min: string;
        avg: string;
        max: string;
    };
    throttle_time_number_s: {
        min: number;
        avg: number;
        max: number;
    };
    schedule_time_number_s: {
        min: number;
        avg: number;
        max: number;
    };
    connectors_per_alert: {
        min: number;
        avg: number;
        max: number;
    };
    count_alerts_total: number;
    count_alerts_by_rule_type: Record<string, number>;
    count_rules_snoozed_by_type: Record<string, number>;
    count_rules_muted_by_type: Record<string, number>;
    count_ignored_fields_by_rule_type: Record<string, number>;
    count_backfill_executions: number;
    count_backfills_by_execution_status_per_day: Record<string, number>;
    count_gaps: number;
    total_unfilled_gap_duration_ms: number;
    total_filled_gap_duration_ms: number;
    gap_auto_fill_scheduler_runs_per_day: number;
    gap_auto_fill_scheduler_runs_by_status_per_day: Record<string, number>;
    gap_auto_fill_scheduler_duration_ms_per_day: {
        min: number;
        max: number;
        avg: number;
        sum: number;
    };
    gap_auto_fill_scheduler_unique_rule_count_per_day: number;
    gap_auto_fill_scheduler_processed_gaps_total_per_day: number;
    gap_auto_fill_scheduler_results_by_status_per_day: Record<string, number>;
}
