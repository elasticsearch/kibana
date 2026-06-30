import type { TypeOf } from '@kbn/config-schema';
export declare const stateSchemaByVersion: {
    1: {
        up: (state: Record<string, unknown>) => {
            has_errors: {};
            error_messages: {} | undefined;
            runs: {};
            count_total: {};
            count_by_type: {};
            throttle_time: {};
            schedule_time: {};
            throttle_time_number_s: {};
            schedule_time_number_s: {};
            connectors_per_alert: {};
            count_active_by_type: {};
            count_active_total: {};
            count_disabled_total: {};
            count_rules_by_execution_status: {};
            count_rules_with_tags: {};
            count_rules_by_notify_when: {};
            count_rules_snoozed: {};
            count_rules_muted: {};
            count_rules_with_muted_alerts: {};
            count_connector_types_by_consumers: {};
            count_rules_namespaces: {};
            count_rules_executions_per_day: {};
            count_rules_executions_by_type_per_day: {};
            count_rules_executions_failured_per_day: {};
            count_rules_executions_failured_by_reason_per_day: {};
            count_rules_executions_failured_by_reason_by_type_per_day: {};
            count_rules_by_execution_status_per_day: {};
            count_rules_executions_timeouts_per_day: {};
            count_rules_executions_timeouts_by_type_per_day: {};
            count_failed_and_unrecognized_rule_tasks_per_day: {};
            count_failed_and_unrecognized_rule_tasks_by_status_per_day: {};
            count_failed_and_unrecognized_rule_tasks_by_status_by_type_per_day: {};
            avg_execution_time_per_day: {};
            avg_execution_time_by_type_per_day: {};
            avg_es_search_duration_per_day: {};
            avg_es_search_duration_by_type_per_day: {};
            avg_total_search_duration_per_day: {};
            avg_total_search_duration_by_type_per_day: {};
            percentile_num_generated_actions_per_day: {};
            percentile_num_generated_actions_by_type_per_day: {};
            percentile_num_alerts_per_day: {};
            percentile_num_alerts_by_type_per_day: {};
        };
        schema: import("@kbn/config-schema").ObjectType<{
            has_errors: import("@kbn/config-schema").Type<boolean>;
            error_messages: import("@kbn/config-schema").Type<any[] | undefined>;
            runs: import("@kbn/config-schema").Type<number>;
            count_total: import("@kbn/config-schema").Type<number>;
            count_by_type: import("@kbn/config-schema").Type<Record<string, number>>;
            throttle_time: import("@kbn/config-schema").ObjectType<{
                min: import("@kbn/config-schema").Type<string>;
                avg: import("@kbn/config-schema").Type<string>;
                max: import("@kbn/config-schema").Type<string>;
            }>;
            schedule_time: import("@kbn/config-schema").ObjectType<{
                min: import("@kbn/config-schema").Type<string>;
                avg: import("@kbn/config-schema").Type<string>;
                max: import("@kbn/config-schema").Type<string>;
            }>;
            throttle_time_number_s: import("@kbn/config-schema").ObjectType<{
                min: import("@kbn/config-schema").Type<number>;
                avg: import("@kbn/config-schema").Type<number>;
                max: import("@kbn/config-schema").Type<number>;
            }>;
            schedule_time_number_s: import("@kbn/config-schema").ObjectType<{
                min: import("@kbn/config-schema").Type<number>;
                avg: import("@kbn/config-schema").Type<number>;
                max: import("@kbn/config-schema").Type<number>;
            }>;
            connectors_per_alert: import("@kbn/config-schema").ObjectType<{
                min: import("@kbn/config-schema").Type<number>;
                avg: import("@kbn/config-schema").Type<number>;
                max: import("@kbn/config-schema").Type<number>;
            }>;
            count_active_by_type: import("@kbn/config-schema").Type<Record<string, number>>;
            count_active_total: import("@kbn/config-schema").Type<number>;
            count_disabled_total: import("@kbn/config-schema").Type<number>;
            count_rules_by_execution_status: import("@kbn/config-schema").ObjectType<{
                success: import("@kbn/config-schema").Type<number>;
                error: import("@kbn/config-schema").Type<number>;
                warning: import("@kbn/config-schema").Type<number>;
            }>;
            count_rules_with_tags: import("@kbn/config-schema").Type<number>;
            count_rules_by_notify_when: import("@kbn/config-schema").ObjectType<{
                on_action_group_change: import("@kbn/config-schema").Type<number>;
                on_active_alert: import("@kbn/config-schema").Type<number>;
                on_throttle_interval: import("@kbn/config-schema").Type<number>;
            }>;
            count_rules_snoozed: import("@kbn/config-schema").Type<number>;
            count_rules_muted: import("@kbn/config-schema").Type<number>;
            count_rules_with_muted_alerts: import("@kbn/config-schema").Type<number>;
            count_connector_types_by_consumers: import("@kbn/config-schema").Type<Record<string, Record<string, number>>>;
            count_rules_namespaces: import("@kbn/config-schema").Type<number>;
            count_rules_executions_per_day: import("@kbn/config-schema").Type<number>;
            count_rules_executions_by_type_per_day: import("@kbn/config-schema").Type<Record<string, number>>;
            count_rules_executions_failured_per_day: import("@kbn/config-schema").Type<number>;
            count_rules_executions_failured_by_reason_per_day: import("@kbn/config-schema").Type<Record<string, number>>;
            count_rules_executions_failured_by_reason_by_type_per_day: import("@kbn/config-schema").Type<Record<string, Record<string, number>>>;
            count_rules_by_execution_status_per_day: import("@kbn/config-schema").Type<Record<string, number>>;
            count_rules_executions_timeouts_per_day: import("@kbn/config-schema").Type<number>;
            count_rules_executions_timeouts_by_type_per_day: import("@kbn/config-schema").Type<Record<string, number>>;
            count_failed_and_unrecognized_rule_tasks_per_day: import("@kbn/config-schema").Type<number>;
            count_failed_and_unrecognized_rule_tasks_by_status_per_day: import("@kbn/config-schema").Type<Record<string, number>>;
            count_failed_and_unrecognized_rule_tasks_by_status_by_type_per_day: import("@kbn/config-schema").Type<Record<string, Record<string, number>>>;
            avg_execution_time_per_day: import("@kbn/config-schema").Type<number>;
            avg_execution_time_by_type_per_day: import("@kbn/config-schema").Type<Record<string, number>>;
            avg_es_search_duration_per_day: import("@kbn/config-schema").Type<number>;
            avg_es_search_duration_by_type_per_day: import("@kbn/config-schema").Type<Record<string, number>>;
            avg_total_search_duration_per_day: import("@kbn/config-schema").Type<number>;
            avg_total_search_duration_by_type_per_day: import("@kbn/config-schema").Type<Record<string, number>>;
            percentile_num_generated_actions_per_day: import("@kbn/config-schema").Type<Record<string, number>>;
            percentile_num_generated_actions_by_type_per_day: import("@kbn/config-schema").Type<Record<string, Record<string, number>>>;
            percentile_num_alerts_per_day: import("@kbn/config-schema").Type<Record<string, number>>;
            percentile_num_alerts_by_type_per_day: import("@kbn/config-schema").Type<Record<string, Record<string, number>>>;
        }>;
    };
    2: {
        up: (state: Record<string, unknown>) => {
            count_mw_total: {};
            count_mw_with_repeat_toggle_on: {};
            count_mw_with_filter_alert_toggle_on: {};
            count_alerts_total: {};
            count_alerts_by_rule_type: {};
            has_errors: {};
            error_messages: {} | undefined;
            runs: {};
            count_total: {};
            count_by_type: {};
            throttle_time: {};
            schedule_time: {};
            throttle_time_number_s: {};
            schedule_time_number_s: {};
            connectors_per_alert: {};
            count_active_by_type: {};
            count_active_total: {};
            count_disabled_total: {};
            count_rules_by_execution_status: {};
            count_rules_with_tags: {};
            count_rules_by_notify_when: {};
            count_rules_snoozed: {};
            count_rules_muted: {};
            count_rules_with_muted_alerts: {};
            count_connector_types_by_consumers: {};
            count_rules_namespaces: {};
            count_rules_executions_per_day: {};
            count_rules_executions_by_type_per_day: {};
            count_rules_executions_failured_per_day: {};
            count_rules_executions_failured_by_reason_per_day: {};
            count_rules_executions_failured_by_reason_by_type_per_day: {};
            count_rules_by_execution_status_per_day: {};
            count_rules_executions_timeouts_per_day: {};
            count_rules_executions_timeouts_by_type_per_day: {};
            count_failed_and_unrecognized_rule_tasks_per_day: {};
            count_failed_and_unrecognized_rule_tasks_by_status_per_day: {};
            count_failed_and_unrecognized_rule_tasks_by_status_by_type_per_day: {};
            avg_execution_time_per_day: {};
            avg_execution_time_by_type_per_day: {};
            avg_es_search_duration_per_day: {};
            avg_es_search_duration_by_type_per_day: {};
            avg_total_search_duration_per_day: {};
            avg_total_search_duration_by_type_per_day: {};
            percentile_num_generated_actions_per_day: {};
            percentile_num_generated_actions_by_type_per_day: {};
            percentile_num_alerts_per_day: {};
            percentile_num_alerts_by_type_per_day: {};
        };
        schema: import("@kbn/config-schema").ObjectType<Omit<{
            has_errors: import("@kbn/config-schema").Type<boolean>;
            error_messages: import("@kbn/config-schema").Type<any[] | undefined>;
            runs: import("@kbn/config-schema").Type<number>;
            count_total: import("@kbn/config-schema").Type<number>;
            count_by_type: import("@kbn/config-schema").Type<Record<string, number>>;
            throttle_time: import("@kbn/config-schema").ObjectType<{
                min: import("@kbn/config-schema").Type<string>;
                avg: import("@kbn/config-schema").Type<string>;
                max: import("@kbn/config-schema").Type<string>;
            }>;
            schedule_time: import("@kbn/config-schema").ObjectType<{
                min: import("@kbn/config-schema").Type<string>;
                avg: import("@kbn/config-schema").Type<string>;
                max: import("@kbn/config-schema").Type<string>;
            }>;
            throttle_time_number_s: import("@kbn/config-schema").ObjectType<{
                min: import("@kbn/config-schema").Type<number>;
                avg: import("@kbn/config-schema").Type<number>;
                max: import("@kbn/config-schema").Type<number>;
            }>;
            schedule_time_number_s: import("@kbn/config-schema").ObjectType<{
                min: import("@kbn/config-schema").Type<number>;
                avg: import("@kbn/config-schema").Type<number>;
                max: import("@kbn/config-schema").Type<number>;
            }>;
            connectors_per_alert: import("@kbn/config-schema").ObjectType<{
                min: import("@kbn/config-schema").Type<number>;
                avg: import("@kbn/config-schema").Type<number>;
                max: import("@kbn/config-schema").Type<number>;
            }>;
            count_active_by_type: import("@kbn/config-schema").Type<Record<string, number>>;
            count_active_total: import("@kbn/config-schema").Type<number>;
            count_disabled_total: import("@kbn/config-schema").Type<number>;
            count_rules_by_execution_status: import("@kbn/config-schema").ObjectType<{
                success: import("@kbn/config-schema").Type<number>;
                error: import("@kbn/config-schema").Type<number>;
                warning: import("@kbn/config-schema").Type<number>;
            }>;
            count_rules_with_tags: import("@kbn/config-schema").Type<number>;
            count_rules_by_notify_when: import("@kbn/config-schema").ObjectType<{
                on_action_group_change: import("@kbn/config-schema").Type<number>;
                on_active_alert: import("@kbn/config-schema").Type<number>;
                on_throttle_interval: import("@kbn/config-schema").Type<number>;
            }>;
            count_rules_snoozed: import("@kbn/config-schema").Type<number>;
            count_rules_muted: import("@kbn/config-schema").Type<number>;
            count_rules_with_muted_alerts: import("@kbn/config-schema").Type<number>;
            count_connector_types_by_consumers: import("@kbn/config-schema").Type<Record<string, Record<string, number>>>;
            count_rules_namespaces: import("@kbn/config-schema").Type<number>;
            count_rules_executions_per_day: import("@kbn/config-schema").Type<number>;
            count_rules_executions_by_type_per_day: import("@kbn/config-schema").Type<Record<string, number>>;
            count_rules_executions_failured_per_day: import("@kbn/config-schema").Type<number>;
            count_rules_executions_failured_by_reason_per_day: import("@kbn/config-schema").Type<Record<string, number>>;
            count_rules_executions_failured_by_reason_by_type_per_day: import("@kbn/config-schema").Type<Record<string, Record<string, number>>>;
            count_rules_by_execution_status_per_day: import("@kbn/config-schema").Type<Record<string, number>>;
            count_rules_executions_timeouts_per_day: import("@kbn/config-schema").Type<number>;
            count_rules_executions_timeouts_by_type_per_day: import("@kbn/config-schema").Type<Record<string, number>>;
            count_failed_and_unrecognized_rule_tasks_per_day: import("@kbn/config-schema").Type<number>;
            count_failed_and_unrecognized_rule_tasks_by_status_per_day: import("@kbn/config-schema").Type<Record<string, number>>;
            count_failed_and_unrecognized_rule_tasks_by_status_by_type_per_day: import("@kbn/config-schema").Type<Record<string, Record<string, number>>>;
            avg_execution_time_per_day: import("@kbn/config-schema").Type<number>;
            avg_execution_time_by_type_per_day: import("@kbn/config-schema").Type<Record<string, number>>;
            avg_es_search_duration_per_day: import("@kbn/config-schema").Type<number>;
            avg_es_search_duration_by_type_per_day: import("@kbn/config-schema").Type<Record<string, number>>;
            avg_total_search_duration_per_day: import("@kbn/config-schema").Type<number>;
            avg_total_search_duration_by_type_per_day: import("@kbn/config-schema").Type<Record<string, number>>;
            percentile_num_generated_actions_per_day: import("@kbn/config-schema").Type<Record<string, number>>;
            percentile_num_generated_actions_by_type_per_day: import("@kbn/config-schema").Type<Record<string, Record<string, number>>>;
            percentile_num_alerts_per_day: import("@kbn/config-schema").Type<Record<string, number>>;
            percentile_num_alerts_by_type_per_day: import("@kbn/config-schema").Type<Record<string, Record<string, number>>>;
        }, "count_mw_total" | "count_mw_with_repeat_toggle_on" | "count_mw_with_filter_alert_toggle_on" | "count_alerts_total" | "count_alerts_by_rule_type"> & {
            count_mw_total: import("@kbn/config-schema").Type<number>;
            count_mw_with_repeat_toggle_on: import("@kbn/config-schema").Type<number>;
            count_mw_with_filter_alert_toggle_on: import("@kbn/config-schema").Type<number>;
            count_alerts_total: import("@kbn/config-schema").Type<number>;
            count_alerts_by_rule_type: import("@kbn/config-schema").Type<Record<string, number>>;
        }>;
    };
    3: {
        up: (state: Record<string, unknown>) => {
            count_rules_with_linked_dashboards: {};
            count_rules_with_investigation_guide: {};
            count_mw_total: {};
            count_mw_with_repeat_toggle_on: {};
            count_mw_with_filter_alert_toggle_on: {};
            count_alerts_total: {};
            count_alerts_by_rule_type: {};
            has_errors: {};
            error_messages: {} | undefined;
            runs: {};
            count_total: {};
            count_by_type: {};
            throttle_time: {};
            schedule_time: {};
            throttle_time_number_s: {};
            schedule_time_number_s: {};
            connectors_per_alert: {};
            count_active_by_type: {};
            count_active_total: {};
            count_disabled_total: {};
            count_rules_by_execution_status: {};
            count_rules_with_tags: {};
            count_rules_by_notify_when: {};
            count_rules_snoozed: {};
            count_rules_muted: {};
            count_rules_with_muted_alerts: {};
            count_connector_types_by_consumers: {};
            count_rules_namespaces: {};
            count_rules_executions_per_day: {};
            count_rules_executions_by_type_per_day: {};
            count_rules_executions_failured_per_day: {};
            count_rules_executions_failured_by_reason_per_day: {};
            count_rules_executions_failured_by_reason_by_type_per_day: {};
            count_rules_by_execution_status_per_day: {};
            count_rules_executions_timeouts_per_day: {};
            count_rules_executions_timeouts_by_type_per_day: {};
            count_failed_and_unrecognized_rule_tasks_per_day: {};
            count_failed_and_unrecognized_rule_tasks_by_status_per_day: {};
            count_failed_and_unrecognized_rule_tasks_by_status_by_type_per_day: {};
            avg_execution_time_per_day: {};
            avg_execution_time_by_type_per_day: {};
            avg_es_search_duration_per_day: {};
            avg_es_search_duration_by_type_per_day: {};
            avg_total_search_duration_per_day: {};
            avg_total_search_duration_by_type_per_day: {};
            percentile_num_generated_actions_per_day: {};
            percentile_num_generated_actions_by_type_per_day: {};
            percentile_num_alerts_per_day: {};
            percentile_num_alerts_by_type_per_day: {};
        };
        schema: import("@kbn/config-schema").ObjectType<Omit<Omit<{
            has_errors: import("@kbn/config-schema").Type<boolean>;
            error_messages: import("@kbn/config-schema").Type<any[] | undefined>;
            runs: import("@kbn/config-schema").Type<number>;
            count_total: import("@kbn/config-schema").Type<number>;
            count_by_type: import("@kbn/config-schema").Type<Record<string, number>>;
            throttle_time: import("@kbn/config-schema").ObjectType<{
                min: import("@kbn/config-schema").Type<string>;
                avg: import("@kbn/config-schema").Type<string>;
                max: import("@kbn/config-schema").Type<string>;
            }>;
            schedule_time: import("@kbn/config-schema").ObjectType<{
                min: import("@kbn/config-schema").Type<string>;
                avg: import("@kbn/config-schema").Type<string>;
                max: import("@kbn/config-schema").Type<string>;
            }>;
            throttle_time_number_s: import("@kbn/config-schema").ObjectType<{
                min: import("@kbn/config-schema").Type<number>;
                avg: import("@kbn/config-schema").Type<number>;
                max: import("@kbn/config-schema").Type<number>;
            }>;
            schedule_time_number_s: import("@kbn/config-schema").ObjectType<{
                min: import("@kbn/config-schema").Type<number>;
                avg: import("@kbn/config-schema").Type<number>;
                max: import("@kbn/config-schema").Type<number>;
            }>;
            connectors_per_alert: import("@kbn/config-schema").ObjectType<{
                min: import("@kbn/config-schema").Type<number>;
                avg: import("@kbn/config-schema").Type<number>;
                max: import("@kbn/config-schema").Type<number>;
            }>;
            count_active_by_type: import("@kbn/config-schema").Type<Record<string, number>>;
            count_active_total: import("@kbn/config-schema").Type<number>;
            count_disabled_total: import("@kbn/config-schema").Type<number>;
            count_rules_by_execution_status: import("@kbn/config-schema").ObjectType<{
                success: import("@kbn/config-schema").Type<number>;
                error: import("@kbn/config-schema").Type<number>;
                warning: import("@kbn/config-schema").Type<number>;
            }>;
            count_rules_with_tags: import("@kbn/config-schema").Type<number>;
            count_rules_by_notify_when: import("@kbn/config-schema").ObjectType<{
                on_action_group_change: import("@kbn/config-schema").Type<number>;
                on_active_alert: import("@kbn/config-schema").Type<number>;
                on_throttle_interval: import("@kbn/config-schema").Type<number>;
            }>;
            count_rules_snoozed: import("@kbn/config-schema").Type<number>;
            count_rules_muted: import("@kbn/config-schema").Type<number>;
            count_rules_with_muted_alerts: import("@kbn/config-schema").Type<number>;
            count_connector_types_by_consumers: import("@kbn/config-schema").Type<Record<string, Record<string, number>>>;
            count_rules_namespaces: import("@kbn/config-schema").Type<number>;
            count_rules_executions_per_day: import("@kbn/config-schema").Type<number>;
            count_rules_executions_by_type_per_day: import("@kbn/config-schema").Type<Record<string, number>>;
            count_rules_executions_failured_per_day: import("@kbn/config-schema").Type<number>;
            count_rules_executions_failured_by_reason_per_day: import("@kbn/config-schema").Type<Record<string, number>>;
            count_rules_executions_failured_by_reason_by_type_per_day: import("@kbn/config-schema").Type<Record<string, Record<string, number>>>;
            count_rules_by_execution_status_per_day: import("@kbn/config-schema").Type<Record<string, number>>;
            count_rules_executions_timeouts_per_day: import("@kbn/config-schema").Type<number>;
            count_rules_executions_timeouts_by_type_per_day: import("@kbn/config-schema").Type<Record<string, number>>;
            count_failed_and_unrecognized_rule_tasks_per_day: import("@kbn/config-schema").Type<number>;
            count_failed_and_unrecognized_rule_tasks_by_status_per_day: import("@kbn/config-schema").Type<Record<string, number>>;
            count_failed_and_unrecognized_rule_tasks_by_status_by_type_per_day: import("@kbn/config-schema").Type<Record<string, Record<string, number>>>;
            avg_execution_time_per_day: import("@kbn/config-schema").Type<number>;
            avg_execution_time_by_type_per_day: import("@kbn/config-schema").Type<Record<string, number>>;
            avg_es_search_duration_per_day: import("@kbn/config-schema").Type<number>;
            avg_es_search_duration_by_type_per_day: import("@kbn/config-schema").Type<Record<string, number>>;
            avg_total_search_duration_per_day: import("@kbn/config-schema").Type<number>;
            avg_total_search_duration_by_type_per_day: import("@kbn/config-schema").Type<Record<string, number>>;
            percentile_num_generated_actions_per_day: import("@kbn/config-schema").Type<Record<string, number>>;
            percentile_num_generated_actions_by_type_per_day: import("@kbn/config-schema").Type<Record<string, Record<string, number>>>;
            percentile_num_alerts_per_day: import("@kbn/config-schema").Type<Record<string, number>>;
            percentile_num_alerts_by_type_per_day: import("@kbn/config-schema").Type<Record<string, Record<string, number>>>;
        }, "count_mw_total" | "count_mw_with_repeat_toggle_on" | "count_mw_with_filter_alert_toggle_on" | "count_alerts_total" | "count_alerts_by_rule_type"> & {
            count_mw_total: import("@kbn/config-schema").Type<number>;
            count_mw_with_repeat_toggle_on: import("@kbn/config-schema").Type<number>;
            count_mw_with_filter_alert_toggle_on: import("@kbn/config-schema").Type<number>;
            count_alerts_total: import("@kbn/config-schema").Type<number>;
            count_alerts_by_rule_type: import("@kbn/config-schema").Type<Record<string, number>>;
        }, "count_rules_with_linked_dashboards" | "count_rules_with_investigation_guide"> & {
            count_rules_with_linked_dashboards: import("@kbn/config-schema").Type<number>;
            count_rules_with_investigation_guide: import("@kbn/config-schema").Type<number>;
        }>;
    };
    4: {
        up: (state: Record<string, unknown>) => {
            count_rules_snoozed_by_type: {};
            count_rules_muted_by_type: {};
            count_rules_with_linked_dashboards: {};
            count_rules_with_investigation_guide: {};
            count_mw_total: {};
            count_mw_with_repeat_toggle_on: {};
            count_mw_with_filter_alert_toggle_on: {};
            count_alerts_total: {};
            count_alerts_by_rule_type: {};
            has_errors: {};
            error_messages: {} | undefined;
            runs: {};
            count_total: {};
            count_by_type: {};
            throttle_time: {};
            schedule_time: {};
            throttle_time_number_s: {};
            schedule_time_number_s: {};
            connectors_per_alert: {};
            count_active_by_type: {};
            count_active_total: {};
            count_disabled_total: {};
            count_rules_by_execution_status: {};
            count_rules_with_tags: {};
            count_rules_by_notify_when: {};
            count_rules_snoozed: {};
            count_rules_muted: {};
            count_rules_with_muted_alerts: {};
            count_connector_types_by_consumers: {};
            count_rules_namespaces: {};
            count_rules_executions_per_day: {};
            count_rules_executions_by_type_per_day: {};
            count_rules_executions_failured_per_day: {};
            count_rules_executions_failured_by_reason_per_day: {};
            count_rules_executions_failured_by_reason_by_type_per_day: {};
            count_rules_by_execution_status_per_day: {};
            count_rules_executions_timeouts_per_day: {};
            count_rules_executions_timeouts_by_type_per_day: {};
            count_failed_and_unrecognized_rule_tasks_per_day: {};
            count_failed_and_unrecognized_rule_tasks_by_status_per_day: {};
            count_failed_and_unrecognized_rule_tasks_by_status_by_type_per_day: {};
            avg_execution_time_per_day: {};
            avg_execution_time_by_type_per_day: {};
            avg_es_search_duration_per_day: {};
            avg_es_search_duration_by_type_per_day: {};
            avg_total_search_duration_per_day: {};
            avg_total_search_duration_by_type_per_day: {};
            percentile_num_generated_actions_per_day: {};
            percentile_num_generated_actions_by_type_per_day: {};
            percentile_num_alerts_per_day: {};
            percentile_num_alerts_by_type_per_day: {};
        };
        schema: import("@kbn/config-schema").ObjectType<Omit<Omit<Omit<{
            has_errors: import("@kbn/config-schema").Type<boolean>;
            error_messages: import("@kbn/config-schema").Type<any[] | undefined>;
            runs: import("@kbn/config-schema").Type<number>;
            count_total: import("@kbn/config-schema").Type<number>;
            count_by_type: import("@kbn/config-schema").Type<Record<string, number>>;
            throttle_time: import("@kbn/config-schema").ObjectType<{
                min: import("@kbn/config-schema").Type<string>;
                avg: import("@kbn/config-schema").Type<string>;
                max: import("@kbn/config-schema").Type<string>;
            }>;
            schedule_time: import("@kbn/config-schema").ObjectType<{
                min: import("@kbn/config-schema").Type<string>;
                avg: import("@kbn/config-schema").Type<string>;
                max: import("@kbn/config-schema").Type<string>;
            }>;
            throttle_time_number_s: import("@kbn/config-schema").ObjectType<{
                min: import("@kbn/config-schema").Type<number>;
                avg: import("@kbn/config-schema").Type<number>;
                max: import("@kbn/config-schema").Type<number>;
            }>;
            schedule_time_number_s: import("@kbn/config-schema").ObjectType<{
                min: import("@kbn/config-schema").Type<number>;
                avg: import("@kbn/config-schema").Type<number>;
                max: import("@kbn/config-schema").Type<number>;
            }>;
            connectors_per_alert: import("@kbn/config-schema").ObjectType<{
                min: import("@kbn/config-schema").Type<number>;
                avg: import("@kbn/config-schema").Type<number>;
                max: import("@kbn/config-schema").Type<number>;
            }>;
            count_active_by_type: import("@kbn/config-schema").Type<Record<string, number>>;
            count_active_total: import("@kbn/config-schema").Type<number>;
            count_disabled_total: import("@kbn/config-schema").Type<number>;
            count_rules_by_execution_status: import("@kbn/config-schema").ObjectType<{
                success: import("@kbn/config-schema").Type<number>;
                error: import("@kbn/config-schema").Type<number>;
                warning: import("@kbn/config-schema").Type<number>;
            }>;
            count_rules_with_tags: import("@kbn/config-schema").Type<number>;
            count_rules_by_notify_when: import("@kbn/config-schema").ObjectType<{
                on_action_group_change: import("@kbn/config-schema").Type<number>;
                on_active_alert: import("@kbn/config-schema").Type<number>;
                on_throttle_interval: import("@kbn/config-schema").Type<number>;
            }>;
            count_rules_snoozed: import("@kbn/config-schema").Type<number>;
            count_rules_muted: import("@kbn/config-schema").Type<number>;
            count_rules_with_muted_alerts: import("@kbn/config-schema").Type<number>;
            count_connector_types_by_consumers: import("@kbn/config-schema").Type<Record<string, Record<string, number>>>;
            count_rules_namespaces: import("@kbn/config-schema").Type<number>;
            count_rules_executions_per_day: import("@kbn/config-schema").Type<number>;
            count_rules_executions_by_type_per_day: import("@kbn/config-schema").Type<Record<string, number>>;
            count_rules_executions_failured_per_day: import("@kbn/config-schema").Type<number>;
            count_rules_executions_failured_by_reason_per_day: import("@kbn/config-schema").Type<Record<string, number>>;
            count_rules_executions_failured_by_reason_by_type_per_day: import("@kbn/config-schema").Type<Record<string, Record<string, number>>>;
            count_rules_by_execution_status_per_day: import("@kbn/config-schema").Type<Record<string, number>>;
            count_rules_executions_timeouts_per_day: import("@kbn/config-schema").Type<number>;
            count_rules_executions_timeouts_by_type_per_day: import("@kbn/config-schema").Type<Record<string, number>>;
            count_failed_and_unrecognized_rule_tasks_per_day: import("@kbn/config-schema").Type<number>;
            count_failed_and_unrecognized_rule_tasks_by_status_per_day: import("@kbn/config-schema").Type<Record<string, number>>;
            count_failed_and_unrecognized_rule_tasks_by_status_by_type_per_day: import("@kbn/config-schema").Type<Record<string, Record<string, number>>>;
            avg_execution_time_per_day: import("@kbn/config-schema").Type<number>;
            avg_execution_time_by_type_per_day: import("@kbn/config-schema").Type<Record<string, number>>;
            avg_es_search_duration_per_day: import("@kbn/config-schema").Type<number>;
            avg_es_search_duration_by_type_per_day: import("@kbn/config-schema").Type<Record<string, number>>;
            avg_total_search_duration_per_day: import("@kbn/config-schema").Type<number>;
            avg_total_search_duration_by_type_per_day: import("@kbn/config-schema").Type<Record<string, number>>;
            percentile_num_generated_actions_per_day: import("@kbn/config-schema").Type<Record<string, number>>;
            percentile_num_generated_actions_by_type_per_day: import("@kbn/config-schema").Type<Record<string, Record<string, number>>>;
            percentile_num_alerts_per_day: import("@kbn/config-schema").Type<Record<string, number>>;
            percentile_num_alerts_by_type_per_day: import("@kbn/config-schema").Type<Record<string, Record<string, number>>>;
        }, "count_mw_total" | "count_mw_with_repeat_toggle_on" | "count_mw_with_filter_alert_toggle_on" | "count_alerts_total" | "count_alerts_by_rule_type"> & {
            count_mw_total: import("@kbn/config-schema").Type<number>;
            count_mw_with_repeat_toggle_on: import("@kbn/config-schema").Type<number>;
            count_mw_with_filter_alert_toggle_on: import("@kbn/config-schema").Type<number>;
            count_alerts_total: import("@kbn/config-schema").Type<number>;
            count_alerts_by_rule_type: import("@kbn/config-schema").Type<Record<string, number>>;
        }, "count_rules_with_linked_dashboards" | "count_rules_with_investigation_guide"> & {
            count_rules_with_linked_dashboards: import("@kbn/config-schema").Type<number>;
            count_rules_with_investigation_guide: import("@kbn/config-schema").Type<number>;
        }, "count_rules_snoozed_by_type" | "count_rules_muted_by_type"> & {
            count_rules_snoozed_by_type: import("@kbn/config-schema").Type<Record<string, number>>;
            count_rules_muted_by_type: import("@kbn/config-schema").Type<Record<string, number>>;
        }>;
    };
    5: {
        up: (state: Record<string, unknown>) => {
            count_ignored_fields_by_rule_type: {};
            count_rules_snoozed_by_type: {};
            count_rules_muted_by_type: {};
            count_rules_with_linked_dashboards: {};
            count_rules_with_investigation_guide: {};
            count_mw_total: {};
            count_mw_with_repeat_toggle_on: {};
            count_mw_with_filter_alert_toggle_on: {};
            count_alerts_total: {};
            count_alerts_by_rule_type: {};
            has_errors: {};
            error_messages: {} | undefined;
            runs: {};
            count_total: {};
            count_by_type: {};
            throttle_time: {};
            schedule_time: {};
            throttle_time_number_s: {};
            schedule_time_number_s: {};
            connectors_per_alert: {};
            count_active_by_type: {};
            count_active_total: {};
            count_disabled_total: {};
            count_rules_by_execution_status: {};
            count_rules_with_tags: {};
            count_rules_by_notify_when: {};
            count_rules_snoozed: {};
            count_rules_muted: {};
            count_rules_with_muted_alerts: {};
            count_connector_types_by_consumers: {};
            count_rules_namespaces: {};
            count_rules_executions_per_day: {};
            count_rules_executions_by_type_per_day: {};
            count_rules_executions_failured_per_day: {};
            count_rules_executions_failured_by_reason_per_day: {};
            count_rules_executions_failured_by_reason_by_type_per_day: {};
            count_rules_by_execution_status_per_day: {};
            count_rules_executions_timeouts_per_day: {};
            count_rules_executions_timeouts_by_type_per_day: {};
            count_failed_and_unrecognized_rule_tasks_per_day: {};
            count_failed_and_unrecognized_rule_tasks_by_status_per_day: {};
            count_failed_and_unrecognized_rule_tasks_by_status_by_type_per_day: {};
            avg_execution_time_per_day: {};
            avg_execution_time_by_type_per_day: {};
            avg_es_search_duration_per_day: {};
            avg_es_search_duration_by_type_per_day: {};
            avg_total_search_duration_per_day: {};
            avg_total_search_duration_by_type_per_day: {};
            percentile_num_generated_actions_per_day: {};
            percentile_num_generated_actions_by_type_per_day: {};
            percentile_num_alerts_per_day: {};
            percentile_num_alerts_by_type_per_day: {};
        };
        schema: import("@kbn/config-schema").ObjectType<Omit<Omit<Omit<Omit<{
            has_errors: import("@kbn/config-schema").Type<boolean>;
            error_messages: import("@kbn/config-schema").Type<any[] | undefined>;
            runs: import("@kbn/config-schema").Type<number>;
            count_total: import("@kbn/config-schema").Type<number>;
            count_by_type: import("@kbn/config-schema").Type<Record<string, number>>;
            throttle_time: import("@kbn/config-schema").ObjectType<{
                min: import("@kbn/config-schema").Type<string>;
                avg: import("@kbn/config-schema").Type<string>;
                max: import("@kbn/config-schema").Type<string>;
            }>;
            schedule_time: import("@kbn/config-schema").ObjectType<{
                min: import("@kbn/config-schema").Type<string>;
                avg: import("@kbn/config-schema").Type<string>;
                max: import("@kbn/config-schema").Type<string>;
            }>;
            throttle_time_number_s: import("@kbn/config-schema").ObjectType<{
                min: import("@kbn/config-schema").Type<number>;
                avg: import("@kbn/config-schema").Type<number>;
                max: import("@kbn/config-schema").Type<number>;
            }>;
            schedule_time_number_s: import("@kbn/config-schema").ObjectType<{
                min: import("@kbn/config-schema").Type<number>;
                avg: import("@kbn/config-schema").Type<number>;
                max: import("@kbn/config-schema").Type<number>;
            }>;
            connectors_per_alert: import("@kbn/config-schema").ObjectType<{
                min: import("@kbn/config-schema").Type<number>;
                avg: import("@kbn/config-schema").Type<number>;
                max: import("@kbn/config-schema").Type<number>;
            }>;
            count_active_by_type: import("@kbn/config-schema").Type<Record<string, number>>;
            count_active_total: import("@kbn/config-schema").Type<number>;
            count_disabled_total: import("@kbn/config-schema").Type<number>;
            count_rules_by_execution_status: import("@kbn/config-schema").ObjectType<{
                success: import("@kbn/config-schema").Type<number>;
                error: import("@kbn/config-schema").Type<number>;
                warning: import("@kbn/config-schema").Type<number>;
            }>;
            count_rules_with_tags: import("@kbn/config-schema").Type<number>;
            count_rules_by_notify_when: import("@kbn/config-schema").ObjectType<{
                on_action_group_change: import("@kbn/config-schema").Type<number>;
                on_active_alert: import("@kbn/config-schema").Type<number>;
                on_throttle_interval: import("@kbn/config-schema").Type<number>;
            }>;
            count_rules_snoozed: import("@kbn/config-schema").Type<number>;
            count_rules_muted: import("@kbn/config-schema").Type<number>;
            count_rules_with_muted_alerts: import("@kbn/config-schema").Type<number>;
            count_connector_types_by_consumers: import("@kbn/config-schema").Type<Record<string, Record<string, number>>>;
            count_rules_namespaces: import("@kbn/config-schema").Type<number>;
            count_rules_executions_per_day: import("@kbn/config-schema").Type<number>;
            count_rules_executions_by_type_per_day: import("@kbn/config-schema").Type<Record<string, number>>;
            count_rules_executions_failured_per_day: import("@kbn/config-schema").Type<number>;
            count_rules_executions_failured_by_reason_per_day: import("@kbn/config-schema").Type<Record<string, number>>;
            count_rules_executions_failured_by_reason_by_type_per_day: import("@kbn/config-schema").Type<Record<string, Record<string, number>>>;
            count_rules_by_execution_status_per_day: import("@kbn/config-schema").Type<Record<string, number>>;
            count_rules_executions_timeouts_per_day: import("@kbn/config-schema").Type<number>;
            count_rules_executions_timeouts_by_type_per_day: import("@kbn/config-schema").Type<Record<string, number>>;
            count_failed_and_unrecognized_rule_tasks_per_day: import("@kbn/config-schema").Type<number>;
            count_failed_and_unrecognized_rule_tasks_by_status_per_day: import("@kbn/config-schema").Type<Record<string, number>>;
            count_failed_and_unrecognized_rule_tasks_by_status_by_type_per_day: import("@kbn/config-schema").Type<Record<string, Record<string, number>>>;
            avg_execution_time_per_day: import("@kbn/config-schema").Type<number>;
            avg_execution_time_by_type_per_day: import("@kbn/config-schema").Type<Record<string, number>>;
            avg_es_search_duration_per_day: import("@kbn/config-schema").Type<number>;
            avg_es_search_duration_by_type_per_day: import("@kbn/config-schema").Type<Record<string, number>>;
            avg_total_search_duration_per_day: import("@kbn/config-schema").Type<number>;
            avg_total_search_duration_by_type_per_day: import("@kbn/config-schema").Type<Record<string, number>>;
            percentile_num_generated_actions_per_day: import("@kbn/config-schema").Type<Record<string, number>>;
            percentile_num_generated_actions_by_type_per_day: import("@kbn/config-schema").Type<Record<string, Record<string, number>>>;
            percentile_num_alerts_per_day: import("@kbn/config-schema").Type<Record<string, number>>;
            percentile_num_alerts_by_type_per_day: import("@kbn/config-schema").Type<Record<string, Record<string, number>>>;
        }, "count_mw_total" | "count_mw_with_repeat_toggle_on" | "count_mw_with_filter_alert_toggle_on" | "count_alerts_total" | "count_alerts_by_rule_type"> & {
            count_mw_total: import("@kbn/config-schema").Type<number>;
            count_mw_with_repeat_toggle_on: import("@kbn/config-schema").Type<number>;
            count_mw_with_filter_alert_toggle_on: import("@kbn/config-schema").Type<number>;
            count_alerts_total: import("@kbn/config-schema").Type<number>;
            count_alerts_by_rule_type: import("@kbn/config-schema").Type<Record<string, number>>;
        }, "count_rules_with_linked_dashboards" | "count_rules_with_investigation_guide"> & {
            count_rules_with_linked_dashboards: import("@kbn/config-schema").Type<number>;
            count_rules_with_investigation_guide: import("@kbn/config-schema").Type<number>;
        }, "count_rules_snoozed_by_type" | "count_rules_muted_by_type"> & {
            count_rules_snoozed_by_type: import("@kbn/config-schema").Type<Record<string, number>>;
            count_rules_muted_by_type: import("@kbn/config-schema").Type<Record<string, number>>;
        }, "count_ignored_fields_by_rule_type"> & {
            count_ignored_fields_by_rule_type: import("@kbn/config-schema").Type<Record<string, number>>;
        }>;
    };
    6: {
        up: (state: Record<string, unknown>) => {
            count_backfill_executions: {};
            count_backfills_by_execution_status_per_day: {};
            count_gaps: {};
            total_unfilled_gap_duration_ms: {};
            total_filled_gap_duration_ms: {};
            count_ignored_fields_by_rule_type: {};
            count_rules_snoozed_by_type: {};
            count_rules_muted_by_type: {};
            count_rules_with_linked_dashboards: {};
            count_rules_with_investigation_guide: {};
            count_mw_total: {};
            count_mw_with_repeat_toggle_on: {};
            count_mw_with_filter_alert_toggle_on: {};
            count_alerts_total: {};
            count_alerts_by_rule_type: {};
            has_errors: {};
            error_messages: {} | undefined;
            runs: {};
            count_total: {};
            count_by_type: {};
            throttle_time: {};
            schedule_time: {};
            throttle_time_number_s: {};
            schedule_time_number_s: {};
            connectors_per_alert: {};
            count_active_by_type: {};
            count_active_total: {};
            count_disabled_total: {};
            count_rules_by_execution_status: {};
            count_rules_with_tags: {};
            count_rules_by_notify_when: {};
            count_rules_snoozed: {};
            count_rules_muted: {};
            count_rules_with_muted_alerts: {};
            count_connector_types_by_consumers: {};
            count_rules_namespaces: {};
            count_rules_executions_per_day: {};
            count_rules_executions_by_type_per_day: {};
            count_rules_executions_failured_per_day: {};
            count_rules_executions_failured_by_reason_per_day: {};
            count_rules_executions_failured_by_reason_by_type_per_day: {};
            count_rules_by_execution_status_per_day: {};
            count_rules_executions_timeouts_per_day: {};
            count_rules_executions_timeouts_by_type_per_day: {};
            count_failed_and_unrecognized_rule_tasks_per_day: {};
            count_failed_and_unrecognized_rule_tasks_by_status_per_day: {};
            count_failed_and_unrecognized_rule_tasks_by_status_by_type_per_day: {};
            avg_execution_time_per_day: {};
            avg_execution_time_by_type_per_day: {};
            avg_es_search_duration_per_day: {};
            avg_es_search_duration_by_type_per_day: {};
            avg_total_search_duration_per_day: {};
            avg_total_search_duration_by_type_per_day: {};
            percentile_num_generated_actions_per_day: {};
            percentile_num_generated_actions_by_type_per_day: {};
            percentile_num_alerts_per_day: {};
            percentile_num_alerts_by_type_per_day: {};
        };
        schema: import("@kbn/config-schema").ObjectType<Omit<Omit<Omit<Omit<Omit<{
            has_errors: import("@kbn/config-schema").Type<boolean>;
            error_messages: import("@kbn/config-schema").Type<any[] | undefined>;
            runs: import("@kbn/config-schema").Type<number>;
            count_total: import("@kbn/config-schema").Type<number>;
            count_by_type: import("@kbn/config-schema").Type<Record<string, number>>;
            throttle_time: import("@kbn/config-schema").ObjectType<{
                min: import("@kbn/config-schema").Type<string>;
                avg: import("@kbn/config-schema").Type<string>;
                max: import("@kbn/config-schema").Type<string>;
            }>;
            schedule_time: import("@kbn/config-schema").ObjectType<{
                min: import("@kbn/config-schema").Type<string>;
                avg: import("@kbn/config-schema").Type<string>;
                max: import("@kbn/config-schema").Type<string>;
            }>;
            throttle_time_number_s: import("@kbn/config-schema").ObjectType<{
                min: import("@kbn/config-schema").Type<number>;
                avg: import("@kbn/config-schema").Type<number>;
                max: import("@kbn/config-schema").Type<number>;
            }>;
            schedule_time_number_s: import("@kbn/config-schema").ObjectType<{
                min: import("@kbn/config-schema").Type<number>;
                avg: import("@kbn/config-schema").Type<number>;
                max: import("@kbn/config-schema").Type<number>;
            }>;
            connectors_per_alert: import("@kbn/config-schema").ObjectType<{
                min: import("@kbn/config-schema").Type<number>;
                avg: import("@kbn/config-schema").Type<number>;
                max: import("@kbn/config-schema").Type<number>;
            }>;
            count_active_by_type: import("@kbn/config-schema").Type<Record<string, number>>;
            count_active_total: import("@kbn/config-schema").Type<number>;
            count_disabled_total: import("@kbn/config-schema").Type<number>;
            count_rules_by_execution_status: import("@kbn/config-schema").ObjectType<{
                success: import("@kbn/config-schema").Type<number>;
                error: import("@kbn/config-schema").Type<number>;
                warning: import("@kbn/config-schema").Type<number>;
            }>;
            count_rules_with_tags: import("@kbn/config-schema").Type<number>;
            count_rules_by_notify_when: import("@kbn/config-schema").ObjectType<{
                on_action_group_change: import("@kbn/config-schema").Type<number>;
                on_active_alert: import("@kbn/config-schema").Type<number>;
                on_throttle_interval: import("@kbn/config-schema").Type<number>;
            }>;
            count_rules_snoozed: import("@kbn/config-schema").Type<number>;
            count_rules_muted: import("@kbn/config-schema").Type<number>;
            count_rules_with_muted_alerts: import("@kbn/config-schema").Type<number>;
            count_connector_types_by_consumers: import("@kbn/config-schema").Type<Record<string, Record<string, number>>>;
            count_rules_namespaces: import("@kbn/config-schema").Type<number>;
            count_rules_executions_per_day: import("@kbn/config-schema").Type<number>;
            count_rules_executions_by_type_per_day: import("@kbn/config-schema").Type<Record<string, number>>;
            count_rules_executions_failured_per_day: import("@kbn/config-schema").Type<number>;
            count_rules_executions_failured_by_reason_per_day: import("@kbn/config-schema").Type<Record<string, number>>;
            count_rules_executions_failured_by_reason_by_type_per_day: import("@kbn/config-schema").Type<Record<string, Record<string, number>>>;
            count_rules_by_execution_status_per_day: import("@kbn/config-schema").Type<Record<string, number>>;
            count_rules_executions_timeouts_per_day: import("@kbn/config-schema").Type<number>;
            count_rules_executions_timeouts_by_type_per_day: import("@kbn/config-schema").Type<Record<string, number>>;
            count_failed_and_unrecognized_rule_tasks_per_day: import("@kbn/config-schema").Type<number>;
            count_failed_and_unrecognized_rule_tasks_by_status_per_day: import("@kbn/config-schema").Type<Record<string, number>>;
            count_failed_and_unrecognized_rule_tasks_by_status_by_type_per_day: import("@kbn/config-schema").Type<Record<string, Record<string, number>>>;
            avg_execution_time_per_day: import("@kbn/config-schema").Type<number>;
            avg_execution_time_by_type_per_day: import("@kbn/config-schema").Type<Record<string, number>>;
            avg_es_search_duration_per_day: import("@kbn/config-schema").Type<number>;
            avg_es_search_duration_by_type_per_day: import("@kbn/config-schema").Type<Record<string, number>>;
            avg_total_search_duration_per_day: import("@kbn/config-schema").Type<number>;
            avg_total_search_duration_by_type_per_day: import("@kbn/config-schema").Type<Record<string, number>>;
            percentile_num_generated_actions_per_day: import("@kbn/config-schema").Type<Record<string, number>>;
            percentile_num_generated_actions_by_type_per_day: import("@kbn/config-schema").Type<Record<string, Record<string, number>>>;
            percentile_num_alerts_per_day: import("@kbn/config-schema").Type<Record<string, number>>;
            percentile_num_alerts_by_type_per_day: import("@kbn/config-schema").Type<Record<string, Record<string, number>>>;
        }, "count_mw_total" | "count_mw_with_repeat_toggle_on" | "count_mw_with_filter_alert_toggle_on" | "count_alerts_total" | "count_alerts_by_rule_type"> & {
            count_mw_total: import("@kbn/config-schema").Type<number>;
            count_mw_with_repeat_toggle_on: import("@kbn/config-schema").Type<number>;
            count_mw_with_filter_alert_toggle_on: import("@kbn/config-schema").Type<number>;
            count_alerts_total: import("@kbn/config-schema").Type<number>;
            count_alerts_by_rule_type: import("@kbn/config-schema").Type<Record<string, number>>;
        }, "count_rules_with_linked_dashboards" | "count_rules_with_investigation_guide"> & {
            count_rules_with_linked_dashboards: import("@kbn/config-schema").Type<number>;
            count_rules_with_investigation_guide: import("@kbn/config-schema").Type<number>;
        }, "count_rules_snoozed_by_type" | "count_rules_muted_by_type"> & {
            count_rules_snoozed_by_type: import("@kbn/config-schema").Type<Record<string, number>>;
            count_rules_muted_by_type: import("@kbn/config-schema").Type<Record<string, number>>;
        }, "count_ignored_fields_by_rule_type"> & {
            count_ignored_fields_by_rule_type: import("@kbn/config-schema").Type<Record<string, number>>;
        }, "count_backfill_executions" | "count_backfills_by_execution_status_per_day" | "count_gaps" | "total_unfilled_gap_duration_ms" | "total_filled_gap_duration_ms"> & {
            count_backfill_executions: import("@kbn/config-schema").Type<number>;
            count_backfills_by_execution_status_per_day: import("@kbn/config-schema").Type<Record<string, number>>;
            count_gaps: import("@kbn/config-schema").Type<number>;
            total_unfilled_gap_duration_ms: import("@kbn/config-schema").Type<number>;
            total_filled_gap_duration_ms: import("@kbn/config-schema").Type<number>;
        }>;
    };
    7: {
        up: (state: Record<string, unknown>) => {
            count_rules_with_api_key_created_by_user: {};
            count_backfill_executions: {};
            count_backfills_by_execution_status_per_day: {};
            count_gaps: {};
            total_unfilled_gap_duration_ms: {};
            total_filled_gap_duration_ms: {};
            count_ignored_fields_by_rule_type: {};
            count_rules_snoozed_by_type: {};
            count_rules_muted_by_type: {};
            count_rules_with_linked_dashboards: {};
            count_rules_with_investigation_guide: {};
            count_mw_total: {};
            count_mw_with_repeat_toggle_on: {};
            count_mw_with_filter_alert_toggle_on: {};
            count_alerts_total: {};
            count_alerts_by_rule_type: {};
            has_errors: {};
            error_messages: {} | undefined;
            runs: {};
            count_total: {};
            count_by_type: {};
            throttle_time: {};
            schedule_time: {};
            throttle_time_number_s: {};
            schedule_time_number_s: {};
            connectors_per_alert: {};
            count_active_by_type: {};
            count_active_total: {};
            count_disabled_total: {};
            count_rules_by_execution_status: {};
            count_rules_with_tags: {};
            count_rules_by_notify_when: {};
            count_rules_snoozed: {};
            count_rules_muted: {};
            count_rules_with_muted_alerts: {};
            count_connector_types_by_consumers: {};
            count_rules_namespaces: {};
            count_rules_executions_per_day: {};
            count_rules_executions_by_type_per_day: {};
            count_rules_executions_failured_per_day: {};
            count_rules_executions_failured_by_reason_per_day: {};
            count_rules_executions_failured_by_reason_by_type_per_day: {};
            count_rules_by_execution_status_per_day: {};
            count_rules_executions_timeouts_per_day: {};
            count_rules_executions_timeouts_by_type_per_day: {};
            count_failed_and_unrecognized_rule_tasks_per_day: {};
            count_failed_and_unrecognized_rule_tasks_by_status_per_day: {};
            count_failed_and_unrecognized_rule_tasks_by_status_by_type_per_day: {};
            avg_execution_time_per_day: {};
            avg_execution_time_by_type_per_day: {};
            avg_es_search_duration_per_day: {};
            avg_es_search_duration_by_type_per_day: {};
            avg_total_search_duration_per_day: {};
            avg_total_search_duration_by_type_per_day: {};
            percentile_num_generated_actions_per_day: {};
            percentile_num_generated_actions_by_type_per_day: {};
            percentile_num_alerts_per_day: {};
            percentile_num_alerts_by_type_per_day: {};
        };
        schema: import("@kbn/config-schema").ObjectType<Omit<Omit<Omit<Omit<Omit<Omit<{
            has_errors: import("@kbn/config-schema").Type<boolean>;
            error_messages: import("@kbn/config-schema").Type<any[] | undefined>;
            runs: import("@kbn/config-schema").Type<number>;
            count_total: import("@kbn/config-schema").Type<number>;
            count_by_type: import("@kbn/config-schema").Type<Record<string, number>>;
            throttle_time: import("@kbn/config-schema").ObjectType<{
                min: import("@kbn/config-schema").Type<string>;
                avg: import("@kbn/config-schema").Type<string>;
                max: import("@kbn/config-schema").Type<string>;
            }>;
            schedule_time: import("@kbn/config-schema").ObjectType<{
                min: import("@kbn/config-schema").Type<string>;
                avg: import("@kbn/config-schema").Type<string>;
                max: import("@kbn/config-schema").Type<string>;
            }>;
            throttle_time_number_s: import("@kbn/config-schema").ObjectType<{
                min: import("@kbn/config-schema").Type<number>;
                avg: import("@kbn/config-schema").Type<number>;
                max: import("@kbn/config-schema").Type<number>;
            }>;
            schedule_time_number_s: import("@kbn/config-schema").ObjectType<{
                min: import("@kbn/config-schema").Type<number>;
                avg: import("@kbn/config-schema").Type<number>;
                max: import("@kbn/config-schema").Type<number>;
            }>;
            connectors_per_alert: import("@kbn/config-schema").ObjectType<{
                min: import("@kbn/config-schema").Type<number>;
                avg: import("@kbn/config-schema").Type<number>;
                max: import("@kbn/config-schema").Type<number>;
            }>;
            count_active_by_type: import("@kbn/config-schema").Type<Record<string, number>>;
            count_active_total: import("@kbn/config-schema").Type<number>;
            count_disabled_total: import("@kbn/config-schema").Type<number>;
            count_rules_by_execution_status: import("@kbn/config-schema").ObjectType<{
                success: import("@kbn/config-schema").Type<number>;
                error: import("@kbn/config-schema").Type<number>;
                warning: import("@kbn/config-schema").Type<number>;
            }>;
            count_rules_with_tags: import("@kbn/config-schema").Type<number>;
            count_rules_by_notify_when: import("@kbn/config-schema").ObjectType<{
                on_action_group_change: import("@kbn/config-schema").Type<number>;
                on_active_alert: import("@kbn/config-schema").Type<number>;
                on_throttle_interval: import("@kbn/config-schema").Type<number>;
            }>;
            count_rules_snoozed: import("@kbn/config-schema").Type<number>;
            count_rules_muted: import("@kbn/config-schema").Type<number>;
            count_rules_with_muted_alerts: import("@kbn/config-schema").Type<number>;
            count_connector_types_by_consumers: import("@kbn/config-schema").Type<Record<string, Record<string, number>>>;
            count_rules_namespaces: import("@kbn/config-schema").Type<number>;
            count_rules_executions_per_day: import("@kbn/config-schema").Type<number>;
            count_rules_executions_by_type_per_day: import("@kbn/config-schema").Type<Record<string, number>>;
            count_rules_executions_failured_per_day: import("@kbn/config-schema").Type<number>;
            count_rules_executions_failured_by_reason_per_day: import("@kbn/config-schema").Type<Record<string, number>>;
            count_rules_executions_failured_by_reason_by_type_per_day: import("@kbn/config-schema").Type<Record<string, Record<string, number>>>;
            count_rules_by_execution_status_per_day: import("@kbn/config-schema").Type<Record<string, number>>;
            count_rules_executions_timeouts_per_day: import("@kbn/config-schema").Type<number>;
            count_rules_executions_timeouts_by_type_per_day: import("@kbn/config-schema").Type<Record<string, number>>;
            count_failed_and_unrecognized_rule_tasks_per_day: import("@kbn/config-schema").Type<number>;
            count_failed_and_unrecognized_rule_tasks_by_status_per_day: import("@kbn/config-schema").Type<Record<string, number>>;
            count_failed_and_unrecognized_rule_tasks_by_status_by_type_per_day: import("@kbn/config-schema").Type<Record<string, Record<string, number>>>;
            avg_execution_time_per_day: import("@kbn/config-schema").Type<number>;
            avg_execution_time_by_type_per_day: import("@kbn/config-schema").Type<Record<string, number>>;
            avg_es_search_duration_per_day: import("@kbn/config-schema").Type<number>;
            avg_es_search_duration_by_type_per_day: import("@kbn/config-schema").Type<Record<string, number>>;
            avg_total_search_duration_per_day: import("@kbn/config-schema").Type<number>;
            avg_total_search_duration_by_type_per_day: import("@kbn/config-schema").Type<Record<string, number>>;
            percentile_num_generated_actions_per_day: import("@kbn/config-schema").Type<Record<string, number>>;
            percentile_num_generated_actions_by_type_per_day: import("@kbn/config-schema").Type<Record<string, Record<string, number>>>;
            percentile_num_alerts_per_day: import("@kbn/config-schema").Type<Record<string, number>>;
            percentile_num_alerts_by_type_per_day: import("@kbn/config-schema").Type<Record<string, Record<string, number>>>;
        }, "count_mw_total" | "count_mw_with_repeat_toggle_on" | "count_mw_with_filter_alert_toggle_on" | "count_alerts_total" | "count_alerts_by_rule_type"> & {
            count_mw_total: import("@kbn/config-schema").Type<number>;
            count_mw_with_repeat_toggle_on: import("@kbn/config-schema").Type<number>;
            count_mw_with_filter_alert_toggle_on: import("@kbn/config-schema").Type<number>;
            count_alerts_total: import("@kbn/config-schema").Type<number>;
            count_alerts_by_rule_type: import("@kbn/config-schema").Type<Record<string, number>>;
        }, "count_rules_with_linked_dashboards" | "count_rules_with_investigation_guide"> & {
            count_rules_with_linked_dashboards: import("@kbn/config-schema").Type<number>;
            count_rules_with_investigation_guide: import("@kbn/config-schema").Type<number>;
        }, "count_rules_snoozed_by_type" | "count_rules_muted_by_type"> & {
            count_rules_snoozed_by_type: import("@kbn/config-schema").Type<Record<string, number>>;
            count_rules_muted_by_type: import("@kbn/config-schema").Type<Record<string, number>>;
        }, "count_ignored_fields_by_rule_type"> & {
            count_ignored_fields_by_rule_type: import("@kbn/config-schema").Type<Record<string, number>>;
        }, "count_backfill_executions" | "count_backfills_by_execution_status_per_day" | "count_gaps" | "total_unfilled_gap_duration_ms" | "total_filled_gap_duration_ms"> & {
            count_backfill_executions: import("@kbn/config-schema").Type<number>;
            count_backfills_by_execution_status_per_day: import("@kbn/config-schema").Type<Record<string, number>>;
            count_gaps: import("@kbn/config-schema").Type<number>;
            total_unfilled_gap_duration_ms: import("@kbn/config-schema").Type<number>;
            total_filled_gap_duration_ms: import("@kbn/config-schema").Type<number>;
        }, "count_rules_with_api_key_created_by_user"> & {
            count_rules_with_api_key_created_by_user: import("@kbn/config-schema").Type<number>;
        }>;
    };
    8: {
        up: (state: Record<string, unknown>) => {
            count_rules_with_elasticagent_tag: {};
            count_rules_with_elasticagent_tag_by_type: {};
            count_rules_with_api_key_created_by_user: {};
            count_backfill_executions: {};
            count_backfills_by_execution_status_per_day: {};
            count_gaps: {};
            total_unfilled_gap_duration_ms: {};
            total_filled_gap_duration_ms: {};
            count_ignored_fields_by_rule_type: {};
            count_rules_snoozed_by_type: {};
            count_rules_muted_by_type: {};
            count_rules_with_linked_dashboards: {};
            count_rules_with_investigation_guide: {};
            count_mw_total: {};
            count_mw_with_repeat_toggle_on: {};
            count_mw_with_filter_alert_toggle_on: {};
            count_alerts_total: {};
            count_alerts_by_rule_type: {};
            has_errors: {};
            error_messages: {} | undefined;
            runs: {};
            count_total: {};
            count_by_type: {};
            throttle_time: {};
            schedule_time: {};
            throttle_time_number_s: {};
            schedule_time_number_s: {};
            connectors_per_alert: {};
            count_active_by_type: {};
            count_active_total: {};
            count_disabled_total: {};
            count_rules_by_execution_status: {};
            count_rules_with_tags: {};
            count_rules_by_notify_when: {};
            count_rules_snoozed: {};
            count_rules_muted: {};
            count_rules_with_muted_alerts: {};
            count_connector_types_by_consumers: {};
            count_rules_namespaces: {};
            count_rules_executions_per_day: {};
            count_rules_executions_by_type_per_day: {};
            count_rules_executions_failured_per_day: {};
            count_rules_executions_failured_by_reason_per_day: {};
            count_rules_executions_failured_by_reason_by_type_per_day: {};
            count_rules_by_execution_status_per_day: {};
            count_rules_executions_timeouts_per_day: {};
            count_rules_executions_timeouts_by_type_per_day: {};
            count_failed_and_unrecognized_rule_tasks_per_day: {};
            count_failed_and_unrecognized_rule_tasks_by_status_per_day: {};
            count_failed_and_unrecognized_rule_tasks_by_status_by_type_per_day: {};
            avg_execution_time_per_day: {};
            avg_execution_time_by_type_per_day: {};
            avg_es_search_duration_per_day: {};
            avg_es_search_duration_by_type_per_day: {};
            avg_total_search_duration_per_day: {};
            avg_total_search_duration_by_type_per_day: {};
            percentile_num_generated_actions_per_day: {};
            percentile_num_generated_actions_by_type_per_day: {};
            percentile_num_alerts_per_day: {};
            percentile_num_alerts_by_type_per_day: {};
        };
        schema: import("@kbn/config-schema").ObjectType<Omit<Omit<Omit<Omit<Omit<Omit<Omit<{
            has_errors: import("@kbn/config-schema").Type<boolean>;
            error_messages: import("@kbn/config-schema").Type<any[] | undefined>;
            runs: import("@kbn/config-schema").Type<number>;
            count_total: import("@kbn/config-schema").Type<number>;
            count_by_type: import("@kbn/config-schema").Type<Record<string, number>>;
            throttle_time: import("@kbn/config-schema").ObjectType<{
                min: import("@kbn/config-schema").Type<string>;
                avg: import("@kbn/config-schema").Type<string>;
                max: import("@kbn/config-schema").Type<string>;
            }>;
            schedule_time: import("@kbn/config-schema").ObjectType<{
                min: import("@kbn/config-schema").Type<string>;
                avg: import("@kbn/config-schema").Type<string>;
                max: import("@kbn/config-schema").Type<string>;
            }>;
            throttle_time_number_s: import("@kbn/config-schema").ObjectType<{
                min: import("@kbn/config-schema").Type<number>;
                avg: import("@kbn/config-schema").Type<number>;
                max: import("@kbn/config-schema").Type<number>;
            }>;
            schedule_time_number_s: import("@kbn/config-schema").ObjectType<{
                min: import("@kbn/config-schema").Type<number>;
                avg: import("@kbn/config-schema").Type<number>;
                max: import("@kbn/config-schema").Type<number>;
            }>;
            connectors_per_alert: import("@kbn/config-schema").ObjectType<{
                min: import("@kbn/config-schema").Type<number>;
                avg: import("@kbn/config-schema").Type<number>;
                max: import("@kbn/config-schema").Type<number>;
            }>;
            count_active_by_type: import("@kbn/config-schema").Type<Record<string, number>>;
            count_active_total: import("@kbn/config-schema").Type<number>;
            count_disabled_total: import("@kbn/config-schema").Type<number>;
            count_rules_by_execution_status: import("@kbn/config-schema").ObjectType<{
                success: import("@kbn/config-schema").Type<number>;
                error: import("@kbn/config-schema").Type<number>;
                warning: import("@kbn/config-schema").Type<number>;
            }>;
            count_rules_with_tags: import("@kbn/config-schema").Type<number>;
            count_rules_by_notify_when: import("@kbn/config-schema").ObjectType<{
                on_action_group_change: import("@kbn/config-schema").Type<number>;
                on_active_alert: import("@kbn/config-schema").Type<number>;
                on_throttle_interval: import("@kbn/config-schema").Type<number>;
            }>;
            count_rules_snoozed: import("@kbn/config-schema").Type<number>;
            count_rules_muted: import("@kbn/config-schema").Type<number>;
            count_rules_with_muted_alerts: import("@kbn/config-schema").Type<number>;
            count_connector_types_by_consumers: import("@kbn/config-schema").Type<Record<string, Record<string, number>>>;
            count_rules_namespaces: import("@kbn/config-schema").Type<number>;
            count_rules_executions_per_day: import("@kbn/config-schema").Type<number>;
            count_rules_executions_by_type_per_day: import("@kbn/config-schema").Type<Record<string, number>>;
            count_rules_executions_failured_per_day: import("@kbn/config-schema").Type<number>;
            count_rules_executions_failured_by_reason_per_day: import("@kbn/config-schema").Type<Record<string, number>>;
            count_rules_executions_failured_by_reason_by_type_per_day: import("@kbn/config-schema").Type<Record<string, Record<string, number>>>;
            count_rules_by_execution_status_per_day: import("@kbn/config-schema").Type<Record<string, number>>;
            count_rules_executions_timeouts_per_day: import("@kbn/config-schema").Type<number>;
            count_rules_executions_timeouts_by_type_per_day: import("@kbn/config-schema").Type<Record<string, number>>;
            count_failed_and_unrecognized_rule_tasks_per_day: import("@kbn/config-schema").Type<number>;
            count_failed_and_unrecognized_rule_tasks_by_status_per_day: import("@kbn/config-schema").Type<Record<string, number>>;
            count_failed_and_unrecognized_rule_tasks_by_status_by_type_per_day: import("@kbn/config-schema").Type<Record<string, Record<string, number>>>;
            avg_execution_time_per_day: import("@kbn/config-schema").Type<number>;
            avg_execution_time_by_type_per_day: import("@kbn/config-schema").Type<Record<string, number>>;
            avg_es_search_duration_per_day: import("@kbn/config-schema").Type<number>;
            avg_es_search_duration_by_type_per_day: import("@kbn/config-schema").Type<Record<string, number>>;
            avg_total_search_duration_per_day: import("@kbn/config-schema").Type<number>;
            avg_total_search_duration_by_type_per_day: import("@kbn/config-schema").Type<Record<string, number>>;
            percentile_num_generated_actions_per_day: import("@kbn/config-schema").Type<Record<string, number>>;
            percentile_num_generated_actions_by_type_per_day: import("@kbn/config-schema").Type<Record<string, Record<string, number>>>;
            percentile_num_alerts_per_day: import("@kbn/config-schema").Type<Record<string, number>>;
            percentile_num_alerts_by_type_per_day: import("@kbn/config-schema").Type<Record<string, Record<string, number>>>;
        }, "count_mw_total" | "count_mw_with_repeat_toggle_on" | "count_mw_with_filter_alert_toggle_on" | "count_alerts_total" | "count_alerts_by_rule_type"> & {
            count_mw_total: import("@kbn/config-schema").Type<number>;
            count_mw_with_repeat_toggle_on: import("@kbn/config-schema").Type<number>;
            count_mw_with_filter_alert_toggle_on: import("@kbn/config-schema").Type<number>;
            count_alerts_total: import("@kbn/config-schema").Type<number>;
            count_alerts_by_rule_type: import("@kbn/config-schema").Type<Record<string, number>>;
        }, "count_rules_with_linked_dashboards" | "count_rules_with_investigation_guide"> & {
            count_rules_with_linked_dashboards: import("@kbn/config-schema").Type<number>;
            count_rules_with_investigation_guide: import("@kbn/config-schema").Type<number>;
        }, "count_rules_snoozed_by_type" | "count_rules_muted_by_type"> & {
            count_rules_snoozed_by_type: import("@kbn/config-schema").Type<Record<string, number>>;
            count_rules_muted_by_type: import("@kbn/config-schema").Type<Record<string, number>>;
        }, "count_ignored_fields_by_rule_type"> & {
            count_ignored_fields_by_rule_type: import("@kbn/config-schema").Type<Record<string, number>>;
        }, "count_backfill_executions" | "count_backfills_by_execution_status_per_day" | "count_gaps" | "total_unfilled_gap_duration_ms" | "total_filled_gap_duration_ms"> & {
            count_backfill_executions: import("@kbn/config-schema").Type<number>;
            count_backfills_by_execution_status_per_day: import("@kbn/config-schema").Type<Record<string, number>>;
            count_gaps: import("@kbn/config-schema").Type<number>;
            total_unfilled_gap_duration_ms: import("@kbn/config-schema").Type<number>;
            total_filled_gap_duration_ms: import("@kbn/config-schema").Type<number>;
        }, "count_rules_with_api_key_created_by_user"> & {
            count_rules_with_api_key_created_by_user: import("@kbn/config-schema").Type<number>;
        }, "count_rules_with_elasticagent_tag" | "count_rules_with_elasticagent_tag_by_type"> & {
            count_rules_with_elasticagent_tag: import("@kbn/config-schema").Type<number>;
            count_rules_with_elasticagent_tag_by_type: import("@kbn/config-schema").Type<Record<string, number>>;
        }>;
    };
    9: {
        up: (state: Record<string, unknown>) => {
            gap_auto_fill_scheduler_runs_per_day: {};
            gap_auto_fill_scheduler_runs_by_status_per_day: {};
            gap_auto_fill_scheduler_duration_ms_per_day: {};
            gap_auto_fill_scheduler_unique_rule_count_per_day: {};
            gap_auto_fill_scheduler_processed_gaps_total_per_day: {};
            gap_auto_fill_scheduler_results_by_status_per_day: {};
            count_rules_with_elasticagent_tag: {};
            count_rules_with_elasticagent_tag_by_type: {};
            count_rules_with_api_key_created_by_user: {};
            count_backfill_executions: {};
            count_backfills_by_execution_status_per_day: {};
            count_gaps: {};
            total_unfilled_gap_duration_ms: {};
            total_filled_gap_duration_ms: {};
            count_ignored_fields_by_rule_type: {};
            count_rules_snoozed_by_type: {};
            count_rules_muted_by_type: {};
            count_rules_with_linked_dashboards: {};
            count_rules_with_investigation_guide: {};
            count_mw_total: {};
            count_mw_with_repeat_toggle_on: {};
            count_mw_with_filter_alert_toggle_on: {};
            count_alerts_total: {};
            count_alerts_by_rule_type: {};
            has_errors: {};
            error_messages: {} | undefined;
            runs: {};
            count_total: {};
            count_by_type: {};
            throttle_time: {};
            schedule_time: {};
            throttle_time_number_s: {};
            schedule_time_number_s: {};
            connectors_per_alert: {};
            count_active_by_type: {};
            count_active_total: {};
            count_disabled_total: {};
            count_rules_by_execution_status: {};
            count_rules_with_tags: {};
            count_rules_by_notify_when: {};
            count_rules_snoozed: {};
            count_rules_muted: {};
            count_rules_with_muted_alerts: {};
            count_connector_types_by_consumers: {};
            count_rules_namespaces: {};
            count_rules_executions_per_day: {};
            count_rules_executions_by_type_per_day: {};
            count_rules_executions_failured_per_day: {};
            count_rules_executions_failured_by_reason_per_day: {};
            count_rules_executions_failured_by_reason_by_type_per_day: {};
            count_rules_by_execution_status_per_day: {};
            count_rules_executions_timeouts_per_day: {};
            count_rules_executions_timeouts_by_type_per_day: {};
            count_failed_and_unrecognized_rule_tasks_per_day: {};
            count_failed_and_unrecognized_rule_tasks_by_status_per_day: {};
            count_failed_and_unrecognized_rule_tasks_by_status_by_type_per_day: {};
            avg_execution_time_per_day: {};
            avg_execution_time_by_type_per_day: {};
            avg_es_search_duration_per_day: {};
            avg_es_search_duration_by_type_per_day: {};
            avg_total_search_duration_per_day: {};
            avg_total_search_duration_by_type_per_day: {};
            percentile_num_generated_actions_per_day: {};
            percentile_num_generated_actions_by_type_per_day: {};
            percentile_num_alerts_per_day: {};
            percentile_num_alerts_by_type_per_day: {};
        };
        schema: import("@kbn/config-schema").ObjectType<Omit<Omit<Omit<Omit<Omit<Omit<Omit<Omit<{
            has_errors: import("@kbn/config-schema").Type<boolean>;
            error_messages: import("@kbn/config-schema").Type<any[] | undefined>;
            runs: import("@kbn/config-schema").Type<number>;
            count_total: import("@kbn/config-schema").Type<number>;
            count_by_type: import("@kbn/config-schema").Type<Record<string, number>>;
            throttle_time: import("@kbn/config-schema").ObjectType<{
                min: import("@kbn/config-schema").Type<string>;
                avg: import("@kbn/config-schema").Type<string>;
                max: import("@kbn/config-schema").Type<string>;
            }>;
            schedule_time: import("@kbn/config-schema").ObjectType<{
                min: import("@kbn/config-schema").Type<string>;
                avg: import("@kbn/config-schema").Type<string>;
                max: import("@kbn/config-schema").Type<string>;
            }>;
            throttle_time_number_s: import("@kbn/config-schema").ObjectType<{
                min: import("@kbn/config-schema").Type<number>;
                avg: import("@kbn/config-schema").Type<number>;
                max: import("@kbn/config-schema").Type<number>;
            }>;
            schedule_time_number_s: import("@kbn/config-schema").ObjectType<{
                min: import("@kbn/config-schema").Type<number>;
                avg: import("@kbn/config-schema").Type<number>;
                max: import("@kbn/config-schema").Type<number>;
            }>;
            connectors_per_alert: import("@kbn/config-schema").ObjectType<{
                min: import("@kbn/config-schema").Type<number>;
                avg: import("@kbn/config-schema").Type<number>;
                max: import("@kbn/config-schema").Type<number>;
            }>;
            count_active_by_type: import("@kbn/config-schema").Type<Record<string, number>>;
            count_active_total: import("@kbn/config-schema").Type<number>;
            count_disabled_total: import("@kbn/config-schema").Type<number>;
            count_rules_by_execution_status: import("@kbn/config-schema").ObjectType<{
                success: import("@kbn/config-schema").Type<number>;
                error: import("@kbn/config-schema").Type<number>;
                warning: import("@kbn/config-schema").Type<number>;
            }>;
            count_rules_with_tags: import("@kbn/config-schema").Type<number>;
            count_rules_by_notify_when: import("@kbn/config-schema").ObjectType<{
                on_action_group_change: import("@kbn/config-schema").Type<number>;
                on_active_alert: import("@kbn/config-schema").Type<number>;
                on_throttle_interval: import("@kbn/config-schema").Type<number>;
            }>;
            count_rules_snoozed: import("@kbn/config-schema").Type<number>;
            count_rules_muted: import("@kbn/config-schema").Type<number>;
            count_rules_with_muted_alerts: import("@kbn/config-schema").Type<number>;
            count_connector_types_by_consumers: import("@kbn/config-schema").Type<Record<string, Record<string, number>>>;
            count_rules_namespaces: import("@kbn/config-schema").Type<number>;
            count_rules_executions_per_day: import("@kbn/config-schema").Type<number>;
            count_rules_executions_by_type_per_day: import("@kbn/config-schema").Type<Record<string, number>>;
            count_rules_executions_failured_per_day: import("@kbn/config-schema").Type<number>;
            count_rules_executions_failured_by_reason_per_day: import("@kbn/config-schema").Type<Record<string, number>>;
            count_rules_executions_failured_by_reason_by_type_per_day: import("@kbn/config-schema").Type<Record<string, Record<string, number>>>;
            count_rules_by_execution_status_per_day: import("@kbn/config-schema").Type<Record<string, number>>;
            count_rules_executions_timeouts_per_day: import("@kbn/config-schema").Type<number>;
            count_rules_executions_timeouts_by_type_per_day: import("@kbn/config-schema").Type<Record<string, number>>;
            count_failed_and_unrecognized_rule_tasks_per_day: import("@kbn/config-schema").Type<number>;
            count_failed_and_unrecognized_rule_tasks_by_status_per_day: import("@kbn/config-schema").Type<Record<string, number>>;
            count_failed_and_unrecognized_rule_tasks_by_status_by_type_per_day: import("@kbn/config-schema").Type<Record<string, Record<string, number>>>;
            avg_execution_time_per_day: import("@kbn/config-schema").Type<number>;
            avg_execution_time_by_type_per_day: import("@kbn/config-schema").Type<Record<string, number>>;
            avg_es_search_duration_per_day: import("@kbn/config-schema").Type<number>;
            avg_es_search_duration_by_type_per_day: import("@kbn/config-schema").Type<Record<string, number>>;
            avg_total_search_duration_per_day: import("@kbn/config-schema").Type<number>;
            avg_total_search_duration_by_type_per_day: import("@kbn/config-schema").Type<Record<string, number>>;
            percentile_num_generated_actions_per_day: import("@kbn/config-schema").Type<Record<string, number>>;
            percentile_num_generated_actions_by_type_per_day: import("@kbn/config-schema").Type<Record<string, Record<string, number>>>;
            percentile_num_alerts_per_day: import("@kbn/config-schema").Type<Record<string, number>>;
            percentile_num_alerts_by_type_per_day: import("@kbn/config-schema").Type<Record<string, Record<string, number>>>;
        }, "count_mw_total" | "count_mw_with_repeat_toggle_on" | "count_mw_with_filter_alert_toggle_on" | "count_alerts_total" | "count_alerts_by_rule_type"> & {
            count_mw_total: import("@kbn/config-schema").Type<number>;
            count_mw_with_repeat_toggle_on: import("@kbn/config-schema").Type<number>;
            count_mw_with_filter_alert_toggle_on: import("@kbn/config-schema").Type<number>;
            count_alerts_total: import("@kbn/config-schema").Type<number>;
            count_alerts_by_rule_type: import("@kbn/config-schema").Type<Record<string, number>>;
        }, "count_rules_with_linked_dashboards" | "count_rules_with_investigation_guide"> & {
            count_rules_with_linked_dashboards: import("@kbn/config-schema").Type<number>;
            count_rules_with_investigation_guide: import("@kbn/config-schema").Type<number>;
        }, "count_rules_snoozed_by_type" | "count_rules_muted_by_type"> & {
            count_rules_snoozed_by_type: import("@kbn/config-schema").Type<Record<string, number>>;
            count_rules_muted_by_type: import("@kbn/config-schema").Type<Record<string, number>>;
        }, "count_ignored_fields_by_rule_type"> & {
            count_ignored_fields_by_rule_type: import("@kbn/config-schema").Type<Record<string, number>>;
        }, "count_backfill_executions" | "count_backfills_by_execution_status_per_day" | "count_gaps" | "total_unfilled_gap_duration_ms" | "total_filled_gap_duration_ms"> & {
            count_backfill_executions: import("@kbn/config-schema").Type<number>;
            count_backfills_by_execution_status_per_day: import("@kbn/config-schema").Type<Record<string, number>>;
            count_gaps: import("@kbn/config-schema").Type<number>;
            total_unfilled_gap_duration_ms: import("@kbn/config-schema").Type<number>;
            total_filled_gap_duration_ms: import("@kbn/config-schema").Type<number>;
        }, "count_rules_with_api_key_created_by_user"> & {
            count_rules_with_api_key_created_by_user: import("@kbn/config-schema").Type<number>;
        }, "count_rules_with_elasticagent_tag" | "count_rules_with_elasticagent_tag_by_type"> & {
            count_rules_with_elasticagent_tag: import("@kbn/config-schema").Type<number>;
            count_rules_with_elasticagent_tag_by_type: import("@kbn/config-schema").Type<Record<string, number>>;
        }, "gap_auto_fill_scheduler_runs_per_day" | "gap_auto_fill_scheduler_runs_by_status_per_day" | "gap_auto_fill_scheduler_duration_ms_per_day" | "gap_auto_fill_scheduler_unique_rule_count_per_day" | "gap_auto_fill_scheduler_processed_gaps_total_per_day" | "gap_auto_fill_scheduler_results_by_status_per_day"> & {
            gap_auto_fill_scheduler_runs_per_day: import("@kbn/config-schema").Type<number>;
            gap_auto_fill_scheduler_runs_by_status_per_day: import("@kbn/config-schema").Type<Record<string, number>>;
            gap_auto_fill_scheduler_duration_ms_per_day: import("@kbn/config-schema").ObjectType<{
                min: import("@kbn/config-schema").Type<number>;
                max: import("@kbn/config-schema").Type<number>;
                avg: import("@kbn/config-schema").Type<number>;
                sum: import("@kbn/config-schema").Type<number>;
            }>;
            gap_auto_fill_scheduler_unique_rule_count_per_day: import("@kbn/config-schema").Type<number>;
            gap_auto_fill_scheduler_processed_gaps_total_per_day: import("@kbn/config-schema").Type<number>;
            gap_auto_fill_scheduler_results_by_status_per_day: import("@kbn/config-schema").Type<Record<string, number>>;
        }>;
    };
};
declare const latestTaskStateSchema: import("@kbn/config-schema").ObjectType<Omit<Omit<Omit<Omit<Omit<Omit<Omit<Omit<{
    has_errors: import("@kbn/config-schema").Type<boolean>;
    error_messages: import("@kbn/config-schema").Type<any[] | undefined>;
    runs: import("@kbn/config-schema").Type<number>;
    count_total: import("@kbn/config-schema").Type<number>;
    count_by_type: import("@kbn/config-schema").Type<Record<string, number>>;
    throttle_time: import("@kbn/config-schema").ObjectType<{
        min: import("@kbn/config-schema").Type<string>;
        avg: import("@kbn/config-schema").Type<string>;
        max: import("@kbn/config-schema").Type<string>;
    }>;
    schedule_time: import("@kbn/config-schema").ObjectType<{
        min: import("@kbn/config-schema").Type<string>;
        avg: import("@kbn/config-schema").Type<string>;
        max: import("@kbn/config-schema").Type<string>;
    }>;
    throttle_time_number_s: import("@kbn/config-schema").ObjectType<{
        min: import("@kbn/config-schema").Type<number>;
        avg: import("@kbn/config-schema").Type<number>;
        max: import("@kbn/config-schema").Type<number>;
    }>;
    schedule_time_number_s: import("@kbn/config-schema").ObjectType<{
        min: import("@kbn/config-schema").Type<number>;
        avg: import("@kbn/config-schema").Type<number>;
        max: import("@kbn/config-schema").Type<number>;
    }>;
    connectors_per_alert: import("@kbn/config-schema").ObjectType<{
        min: import("@kbn/config-schema").Type<number>;
        avg: import("@kbn/config-schema").Type<number>;
        max: import("@kbn/config-schema").Type<number>;
    }>;
    count_active_by_type: import("@kbn/config-schema").Type<Record<string, number>>;
    count_active_total: import("@kbn/config-schema").Type<number>;
    count_disabled_total: import("@kbn/config-schema").Type<number>;
    count_rules_by_execution_status: import("@kbn/config-schema").ObjectType<{
        success: import("@kbn/config-schema").Type<number>;
        error: import("@kbn/config-schema").Type<number>;
        warning: import("@kbn/config-schema").Type<number>;
    }>;
    count_rules_with_tags: import("@kbn/config-schema").Type<number>;
    count_rules_by_notify_when: import("@kbn/config-schema").ObjectType<{
        on_action_group_change: import("@kbn/config-schema").Type<number>;
        on_active_alert: import("@kbn/config-schema").Type<number>;
        on_throttle_interval: import("@kbn/config-schema").Type<number>;
    }>;
    count_rules_snoozed: import("@kbn/config-schema").Type<number>;
    count_rules_muted: import("@kbn/config-schema").Type<number>;
    count_rules_with_muted_alerts: import("@kbn/config-schema").Type<number>;
    count_connector_types_by_consumers: import("@kbn/config-schema").Type<Record<string, Record<string, number>>>;
    count_rules_namespaces: import("@kbn/config-schema").Type<number>;
    count_rules_executions_per_day: import("@kbn/config-schema").Type<number>;
    count_rules_executions_by_type_per_day: import("@kbn/config-schema").Type<Record<string, number>>;
    count_rules_executions_failured_per_day: import("@kbn/config-schema").Type<number>;
    count_rules_executions_failured_by_reason_per_day: import("@kbn/config-schema").Type<Record<string, number>>;
    count_rules_executions_failured_by_reason_by_type_per_day: import("@kbn/config-schema").Type<Record<string, Record<string, number>>>;
    count_rules_by_execution_status_per_day: import("@kbn/config-schema").Type<Record<string, number>>;
    count_rules_executions_timeouts_per_day: import("@kbn/config-schema").Type<number>;
    count_rules_executions_timeouts_by_type_per_day: import("@kbn/config-schema").Type<Record<string, number>>;
    count_failed_and_unrecognized_rule_tasks_per_day: import("@kbn/config-schema").Type<number>;
    count_failed_and_unrecognized_rule_tasks_by_status_per_day: import("@kbn/config-schema").Type<Record<string, number>>;
    count_failed_and_unrecognized_rule_tasks_by_status_by_type_per_day: import("@kbn/config-schema").Type<Record<string, Record<string, number>>>;
    avg_execution_time_per_day: import("@kbn/config-schema").Type<number>;
    avg_execution_time_by_type_per_day: import("@kbn/config-schema").Type<Record<string, number>>;
    avg_es_search_duration_per_day: import("@kbn/config-schema").Type<number>;
    avg_es_search_duration_by_type_per_day: import("@kbn/config-schema").Type<Record<string, number>>;
    avg_total_search_duration_per_day: import("@kbn/config-schema").Type<number>;
    avg_total_search_duration_by_type_per_day: import("@kbn/config-schema").Type<Record<string, number>>;
    percentile_num_generated_actions_per_day: import("@kbn/config-schema").Type<Record<string, number>>;
    percentile_num_generated_actions_by_type_per_day: import("@kbn/config-schema").Type<Record<string, Record<string, number>>>;
    percentile_num_alerts_per_day: import("@kbn/config-schema").Type<Record<string, number>>;
    percentile_num_alerts_by_type_per_day: import("@kbn/config-schema").Type<Record<string, Record<string, number>>>;
}, "count_mw_total" | "count_mw_with_repeat_toggle_on" | "count_mw_with_filter_alert_toggle_on" | "count_alerts_total" | "count_alerts_by_rule_type"> & {
    count_mw_total: import("@kbn/config-schema").Type<number>;
    count_mw_with_repeat_toggle_on: import("@kbn/config-schema").Type<number>;
    count_mw_with_filter_alert_toggle_on: import("@kbn/config-schema").Type<number>;
    count_alerts_total: import("@kbn/config-schema").Type<number>;
    count_alerts_by_rule_type: import("@kbn/config-schema").Type<Record<string, number>>;
}, "count_rules_with_linked_dashboards" | "count_rules_with_investigation_guide"> & {
    count_rules_with_linked_dashboards: import("@kbn/config-schema").Type<number>;
    count_rules_with_investigation_guide: import("@kbn/config-schema").Type<number>;
}, "count_rules_snoozed_by_type" | "count_rules_muted_by_type"> & {
    count_rules_snoozed_by_type: import("@kbn/config-schema").Type<Record<string, number>>;
    count_rules_muted_by_type: import("@kbn/config-schema").Type<Record<string, number>>;
}, "count_ignored_fields_by_rule_type"> & {
    count_ignored_fields_by_rule_type: import("@kbn/config-schema").Type<Record<string, number>>;
}, "count_backfill_executions" | "count_backfills_by_execution_status_per_day" | "count_gaps" | "total_unfilled_gap_duration_ms" | "total_filled_gap_duration_ms"> & {
    count_backfill_executions: import("@kbn/config-schema").Type<number>;
    count_backfills_by_execution_status_per_day: import("@kbn/config-schema").Type<Record<string, number>>;
    count_gaps: import("@kbn/config-schema").Type<number>;
    total_unfilled_gap_duration_ms: import("@kbn/config-schema").Type<number>;
    total_filled_gap_duration_ms: import("@kbn/config-schema").Type<number>;
}, "count_rules_with_api_key_created_by_user"> & {
    count_rules_with_api_key_created_by_user: import("@kbn/config-schema").Type<number>;
}, "count_rules_with_elasticagent_tag" | "count_rules_with_elasticagent_tag_by_type"> & {
    count_rules_with_elasticagent_tag: import("@kbn/config-schema").Type<number>;
    count_rules_with_elasticagent_tag_by_type: import("@kbn/config-schema").Type<Record<string, number>>;
}, "gap_auto_fill_scheduler_runs_per_day" | "gap_auto_fill_scheduler_runs_by_status_per_day" | "gap_auto_fill_scheduler_duration_ms_per_day" | "gap_auto_fill_scheduler_unique_rule_count_per_day" | "gap_auto_fill_scheduler_processed_gaps_total_per_day" | "gap_auto_fill_scheduler_results_by_status_per_day"> & {
    gap_auto_fill_scheduler_runs_per_day: import("@kbn/config-schema").Type<number>;
    gap_auto_fill_scheduler_runs_by_status_per_day: import("@kbn/config-schema").Type<Record<string, number>>;
    gap_auto_fill_scheduler_duration_ms_per_day: import("@kbn/config-schema").ObjectType<{
        min: import("@kbn/config-schema").Type<number>;
        max: import("@kbn/config-schema").Type<number>;
        avg: import("@kbn/config-schema").Type<number>;
        sum: import("@kbn/config-schema").Type<number>;
    }>;
    gap_auto_fill_scheduler_unique_rule_count_per_day: import("@kbn/config-schema").Type<number>;
    gap_auto_fill_scheduler_processed_gaps_total_per_day: import("@kbn/config-schema").Type<number>;
    gap_auto_fill_scheduler_results_by_status_per_day: import("@kbn/config-schema").Type<Record<string, number>>;
}>;
export type LatestTaskStateSchema = TypeOf<typeof latestTaskStateSchema>;
export declare const emptyState: LatestTaskStateSchema;
export {};
