import type { SanitizedRule, RuleTypeParams } from '../../common/rule';
type RuleSnoozeProps = Pick<SanitizedRule<RuleTypeParams>, 'muteAll' | 'snoozeSchedule'>;
type ActiveSnoozes = Array<{
    snoozeEndTime: Date;
    id: string;
    lastOccurrence?: Date;
}>;
export declare function getActiveSnoozes(rule: RuleSnoozeProps): ActiveSnoozes | null;
export declare function getActiveScheduledSnoozes(rule: RuleSnoozeProps): ActiveSnoozes | null;
export declare function getRuleSnoozeEndTime(rule: RuleSnoozeProps): Date | null;
export declare function isRuleSnoozed(rule: RuleSnoozeProps): boolean;
export {};
