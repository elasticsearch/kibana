import type { RuleTypeParams, SanitizedRule, RuleLastRun } from '../../types';
export declare const rewriteRuleLastRun: (lastRun: RuleLastRun) => {
    outcome: import("@kbn/alerting-types/rule_types").RuleLastRunOutcomes;
    warning?: import("@kbn/alerting-types/rule_types").RuleExecutionStatusErrorReasons | import("@kbn/alerting-types/rule_types").RuleExecutionStatusWarningReasons | null;
    alerts_count: {
        active?: number | null;
        new?: number | null;
        recovered?: number | null;
        ignored?: number | null;
    };
    outcome_msg: string[] | null | undefined;
    outcome_order: number | undefined;
};
export declare const rewriteRule: ({ alertTypeId, createdBy, updatedBy, createdAt, updatedAt, apiKeyOwner, apiKeyCreatedByUser, notifyWhen, muteAll, mutedInstanceIds, executionStatus, actions, systemActions, scheduledTaskId, snoozeSchedule, isSnoozedUntil, activeSnoozes, lastRun, nextRun, alertDelay, ...rest }: SanitizedRule<RuleTypeParams> & {
    activeSnoozes?: string[];
}) => {
    alert_delay?: import("@kbn/alerting-types/rule_types").AlertDelay | null | undefined;
    api_key_created_by_user?: boolean | null | undefined;
    next_run?: Date | undefined;
    last_run?: {
        outcome: import("@kbn/alerting-types/rule_types").RuleLastRunOutcomes;
        warning?: import("@kbn/alerting-types/rule_types").RuleExecutionStatusErrorReasons | import("@kbn/alerting-types/rule_types").RuleExecutionStatusWarningReasons | null;
        alerts_count: {
            active?: number | null;
            new?: number | null;
            recovered?: number | null;
            ignored?: number | null;
        };
        outcome_msg: string[] | null | undefined;
        outcome_order: number | undefined;
    } | undefined;
    execution_status: {
        last_execution_date: Date;
        last_duration: number | undefined;
        status: import("@kbn/alerting-types/rule_types").RuleExecutionStatuses;
        warning?: {
            reason: import("@kbn/alerting-types/rule_types").RuleExecutionStatusWarningReasons;
            message: string;
        } | undefined;
        error?: {
            reason: import("@kbn/alerting-types/rule_types").RuleExecutionStatusErrorReasons;
            message: string;
        } | undefined;
    };
    actions: unknown[];
    active_snoozes?: string[] | undefined;
    is_snoozed_until?: Date | undefined;
    rule_type_id: string;
    created_by: string | null;
    updated_by: string | null;
    created_at: Date;
    updated_at: Date;
    api_key_owner: string | null;
    notify_when: "onActionGroupChange" | "onActiveAlert" | "onThrottleInterval" | null | undefined;
    mute_all: boolean;
    muted_alert_ids: string[];
    scheduled_task_id: string | null | undefined;
    snooze_schedule: import("@kbn/alerting-types/rule_types").RuleSnooze | undefined;
    id: string;
    name: string;
    schedule: import("@kbn/alerting-types/rule_types").IntervalSchedule;
    artifacts?: (import("@kbn/alerting-types/rule_types").Artifacts | null) | undefined;
    params: RuleTypeParams;
    enabled: boolean;
    tags: string[];
    throttle?: string | null | undefined;
    running?: boolean | null | undefined;
    consumer: string;
    monitoring?: import("@kbn/alerting-types/rule_types").RuleMonitoring | undefined;
    uiamApiKey?: string | null | undefined;
    mapped_params?: import("@kbn/alerting-types/rule_types").MappedParams | undefined;
    revision: number;
    viewInAppRelativeUrl?: string | undefined;
    lastEnabledAt?: Date | undefined;
    flapping?: (import("@kbn/alerting-types").Flapping | null) | undefined;
};
