import type { RuleSnooze } from '@kbn/alerting-plugin/common';
export declare const isRuleSnoozed: (rule: {
    isSnoozedUntil?: Date | null;
    muteAll: boolean;
}) => boolean;
export declare const getNextRuleSnoozeSchedule: (rule: {
    snoozeSchedule?: RuleSnooze;
}) => {
    duration: number;
    rRule: import("@kbn/alerting-types/r_rule_types").RRuleParams;
    id?: string;
    skipRecurrences?: string[];
} | null;
