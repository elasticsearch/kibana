import type { EcsEvent } from '@kbn/core/server';
import type { AuditEvent } from '@kbn/security-plugin/server';
export declare enum RuleAuditAction {
    CREATE = "rule_create",
    GET = "rule_get",
    BULK_GET = "rule_bulk_get",
    RESOLVE = "rule_resolve",
    UPDATE = "rule_update",
    UPDATE_API_KEY = "rule_update_api_key",
    ENABLE = "rule_enable",
    DISABLE = "rule_disable",
    DELETE = "rule_delete",
    FIND = "rule_find",
    MUTE = "rule_mute",
    UNMUTE = "rule_unmute",
    BULK_MUTE_ALERTS = "rule_alert_bulk_mute",
    BULK_UNMUTE_ALERTS = "rule_alert_bulk_unmute",
    MUTE_ALERT = "rule_alert_mute",
    UNMUTE_ALERT = "rule_alert_unmute",
    AGGREGATE = "rule_aggregate",
    BULK_EDIT = "rule_bulk_edit",
    BULK_EDIT_PARAMS = "rule_bulk_edit_params",
    GET_EXECUTION_LOG = "rule_get_execution_log",
    GET_GLOBAL_EXECUTION_LOG = "rule_get_global_execution_log",
    GET_GLOBAL_EXECUTION_KPI = "rule_get_global_execution_kpi",
    GET_GLOBAL_EXECUTION_SUMMARY = "rule_get_global_execution_summary",
    GET_ACTION_ERROR_LOG = "rule_get_action_error_log",
    GET_HISTORY = "rule_get_history",
    GET_RULE_EXECUTION_KPI = "rule_get_execution_kpi",
    SNOOZE = "rule_snooze",
    UNSNOOZE = "rule_unsnooze",
    RUN_SOON = "rule_run_soon",
    ACKNOWLEDGE_ALERT = "rule_alert_acknowledge",
    UNACKNOWLEDGE_ALERT = "rule_alert_unacknowledge",
    UNTRACK_ALERT = "rule_alert_untrack",
    SCHEDULE_BACKFILL = "rule_schedule_backfill",
    FIND_GAPS = "rule_find_gaps",
    FILL_GAPS = "rule_fill_gaps",
    GET_RULES_WITH_GAPS = "rule_get_rules_with_gaps",
    GET_GAPS_SUMMARY_BY_RULE_IDS = "rule_get_gaps_summary_by_rule_ids",
    BULK_CREATE = "rule_bulk_create"
}
export declare enum AdHocRunAuditAction {
    CREATE = "ad_hoc_run_create",
    GET = "ad_hoc_run_get",
    FIND = "ad_hoc_run_find",
    DELETE = "ad_hoc_run_delete"
}
export declare enum GapAutoFillSchedulerAuditAction {
    CREATE = "gap_auto_fill_scheduler_create",
    GET = "gap_auto_fill_scheduler_get",
    UPDATE = "gap_auto_fill_scheduler_update",
    DELETE = "gap_auto_fill_scheduler_delete",
    GET_LOGS = "gap_auto_fill_scheduler_get_logs"
}
export interface GapAutoFillSchedulerAuditEventParams {
    action: GapAutoFillSchedulerAuditAction;
    outcome?: EcsEvent['outcome'];
    savedObject?: NonNullable<AuditEvent['kibana']>['saved_object'];
    error?: Error;
}
export interface RuleAuditEventParams {
    action: RuleAuditAction;
    outcome?: EcsEvent['outcome'];
    savedObject?: NonNullable<AuditEvent['kibana']>['saved_object'];
    error?: Error;
}
export interface AdHocRunAuditEventParams {
    action: AdHocRunAuditAction;
    outcome?: EcsEvent['outcome'];
    savedObject?: NonNullable<AuditEvent['kibana']>['saved_object'];
    error?: Error;
}
export declare function ruleAuditEvent({ action, savedObject, outcome, error, }: RuleAuditEventParams): AuditEvent;
export declare function adHocRunAuditEvent({ action, savedObject, outcome, error, }: AdHocRunAuditEventParams): AuditEvent;
export declare enum RuleTemplateAuditAction {
    GET = "rule_template_get",
    FIND = "rule_template_find"
}
export interface RuleTemplateAuditEventParams {
    action: RuleTemplateAuditAction;
    outcome?: EcsEvent['outcome'];
    savedObject?: NonNullable<AuditEvent['kibana']>['saved_object'];
    error?: Error;
}
export declare function ruleTemplateAuditEvent({ action, savedObject, outcome, error, }: RuleTemplateAuditEventParams): AuditEvent;
export declare function gapAutoFillSchedulerAuditEvent({ action, savedObject, outcome, error, }: GapAutoFillSchedulerAuditEventParams): AuditEvent;
