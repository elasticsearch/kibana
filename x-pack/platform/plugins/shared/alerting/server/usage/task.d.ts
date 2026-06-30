import type { Logger, CoreSetup } from '@kbn/core/server';
import type { RunContext, TaskManagerSetupContract, TaskManagerStartContract, IntervalSchedule } from '@kbn/task-manager-plugin/server';
export declare const TELEMETRY_TASK_TYPE = "alerting_telemetry";
export declare const TASK_ID = "Alerting-alerting_telemetry";
export declare const SCHEDULE: IntervalSchedule;
export declare function initializeAlertingTelemetry(logger: Logger, core: CoreSetup, taskManager: TaskManagerSetupContract, eventLogIndex: string): void;
export declare function scheduleAlertingTelemetry(logger: Logger, taskManager?: TaskManagerStartContract): void;
export declare function telemetryTaskRunner(logger: Logger, core: CoreSetup, eventLogIndex: string, taskManagerIndex: string): ({ taskInstance }: RunContext) => {
    run(): Promise<{
        state: Readonly<{
            error_messages?: any[] | undefined;
        } & {
            count_by_type: Record<string, number>;
            has_errors: boolean;
            count_total: number;
            count_active_total: number;
            count_disabled_total: number;
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
            count_rules_by_execution_status: Readonly<{} & {
                success: number;
                warning: number;
                error: number;
            }>;
            count_rules_with_tags: number;
            count_rules_with_elasticagent_tag: number;
            count_rules_with_elasticagent_tag_by_type: Record<string, number>;
            count_rules_by_notify_when: Readonly<{} & {
                on_action_group_change: number;
                on_active_alert: number;
                on_throttle_interval: number;
            }>;
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
            percentile_num_generated_actions_per_day: Record<string, number>;
            percentile_num_generated_actions_by_type_per_day: Record<string, Record<string, number>>;
            percentile_num_alerts_per_day: Record<string, number>;
            percentile_num_alerts_by_type_per_day: Record<string, Record<string, number>>;
            avg_execution_time_per_day: number;
            avg_execution_time_by_type_per_day: Record<string, number>;
            avg_es_search_duration_per_day: number;
            avg_es_search_duration_by_type_per_day: Record<string, number>;
            avg_total_search_duration_per_day: number;
            avg_total_search_duration_by_type_per_day: Record<string, number>;
            throttle_time: Readonly<{} & {
                max: string;
                min: string;
                avg: string;
            }>;
            schedule_time: Readonly<{} & {
                max: string;
                min: string;
                avg: string;
            }>;
            throttle_time_number_s: Readonly<{} & {
                max: number;
                min: number;
                avg: number;
            }>;
            schedule_time_number_s: Readonly<{} & {
                max: number;
                min: number;
                avg: number;
            }>;
            connectors_per_alert: Readonly<{} & {
                max: number;
                min: number;
                avg: number;
            }>;
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
            gap_auto_fill_scheduler_duration_ms_per_day: Readonly<{} & {
                max: number;
                min: number;
                avg: number;
                sum: number;
            }>;
            gap_auto_fill_scheduler_unique_rule_count_per_day: number;
            gap_auto_fill_scheduler_processed_gaps_total_per_day: number;
            gap_auto_fill_scheduler_results_by_status_per_day: Record<string, number>;
            runs: number;
        }>;
        schedule: IntervalSchedule;
    } | {
        state: Readonly<{
            error_messages?: any[] | undefined;
        } & {
            count_by_type: Record<string, number>;
            has_errors: boolean;
            count_total: number;
            count_active_total: number;
            count_disabled_total: number;
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
            count_rules_by_execution_status: Readonly<{} & {
                success: number;
                warning: number;
                error: number;
            }>;
            count_rules_with_tags: number;
            count_rules_with_elasticagent_tag: number;
            count_rules_with_elasticagent_tag_by_type: Record<string, number>;
            count_rules_by_notify_when: Readonly<{} & {
                on_action_group_change: number;
                on_active_alert: number;
                on_throttle_interval: number;
            }>;
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
            percentile_num_generated_actions_per_day: Record<string, number>;
            percentile_num_generated_actions_by_type_per_day: Record<string, Record<string, number>>;
            percentile_num_alerts_per_day: Record<string, number>;
            percentile_num_alerts_by_type_per_day: Record<string, Record<string, number>>;
            avg_execution_time_per_day: number;
            avg_execution_time_by_type_per_day: Record<string, number>;
            avg_es_search_duration_per_day: number;
            avg_es_search_duration_by_type_per_day: Record<string, number>;
            avg_total_search_duration_per_day: number;
            avg_total_search_duration_by_type_per_day: Record<string, number>;
            throttle_time: Readonly<{} & {
                max: string;
                min: string;
                avg: string;
            }>;
            schedule_time: Readonly<{} & {
                max: string;
                min: string;
                avg: string;
            }>;
            throttle_time_number_s: Readonly<{} & {
                max: number;
                min: number;
                avg: number;
            }>;
            schedule_time_number_s: Readonly<{} & {
                max: number;
                min: number;
                avg: number;
            }>;
            connectors_per_alert: Readonly<{} & {
                max: number;
                min: number;
                avg: number;
            }>;
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
            gap_auto_fill_scheduler_duration_ms_per_day: Readonly<{} & {
                max: number;
                min: number;
                avg: number;
                sum: number;
            }>;
            gap_auto_fill_scheduler_unique_rule_count_per_day: number;
            gap_auto_fill_scheduler_processed_gaps_total_per_day: number;
            gap_auto_fill_scheduler_results_by_status_per_day: Record<string, number>;
            runs: number;
        }>;
        schedule: IntervalSchedule;
    }>;
};
