import type { Rule, RuleDomain, RuleParams, RuleSnoozeSchedule as RuleDomainSnoozeSchedule } from '../../application/rule/types';
import type { RawRule } from '../../types';
export declare function getSnoozeAttributes(attributes: RawRule, snoozeSchedule: RuleDomainSnoozeSchedule): {
    muteAll: boolean;
    snoozeSchedule: Readonly<{
        id?: string | undefined;
        skipRecurrences?: string[] | undefined;
    } & {
        duration: number;
        rRule: Readonly<{
            count?: number | undefined;
            interval?: number | undefined;
            freq?: 0 | 2 | 4 | 1 | 6 | 5 | 3 | undefined;
            byhour?: number[] | null | undefined;
            byminute?: number[] | null | undefined;
            byweekday?: (string | number)[] | null | undefined;
            bymonthday?: number[] | null | undefined;
            until?: string | undefined;
            wkst?: "MO" | "TU" | "WE" | "TH" | "FR" | "SA" | "SU" | undefined;
            bymonth?: number[] | null | undefined;
            bysetpos?: number[] | null | undefined;
            byyearday?: number[] | null | undefined;
            byweekno?: number[] | null | undefined;
            bysecond?: number[] | null | undefined;
        } & {
            tzid: string;
            dtstart: string;
        }>;
    }>[];
} | {
    snoozeSchedule: Readonly<{
        id?: string | undefined;
        skipRecurrences?: string[] | undefined;
    } & {
        duration: number;
        rRule: Readonly<{
            count?: number | undefined;
            interval?: number | undefined;
            freq?: 0 | 2 | 4 | 1 | 6 | 5 | 3 | undefined;
            byhour?: number[] | null | undefined;
            byminute?: number[] | null | undefined;
            byweekday?: (string | number)[] | null | undefined;
            bymonthday?: number[] | null | undefined;
            until?: string | undefined;
            wkst?: "MO" | "TU" | "WE" | "TH" | "FR" | "SA" | "SU" | undefined;
            bymonth?: number[] | null | undefined;
            bysetpos?: number[] | null | undefined;
            byyearday?: number[] | null | undefined;
            byweekno?: number[] | null | undefined;
            bysecond?: number[] | null | undefined;
        } & {
            tzid: string;
            dtstart: string;
        }>;
    }>[];
    muteAll?: undefined;
};
export declare function getBulkSnooze<Params extends RuleParams>(rule: RuleDomain<Params>, snoozeSchedule: RuleDomainSnoozeSchedule): {
    muteAll: RuleDomain<Params>['muteAll'];
    snoozeSchedule: RuleDomain<Params>['snoozeSchedule'];
};
export declare function getUnsnoozeAttributes(attributes: RawRule, scheduleIds?: string[]): {
    muteAll?: boolean | undefined;
    snoozeSchedule: Readonly<{
        id?: string | undefined;
        skipRecurrences?: string[] | undefined;
    } & {
        duration: number;
        rRule: Readonly<{
            count?: number | undefined;
            interval?: number | undefined;
            freq?: 0 | 2 | 4 | 1 | 6 | 5 | 3 | undefined;
            byhour?: number[] | null | undefined;
            byminute?: number[] | null | undefined;
            byweekday?: (string | number)[] | null | undefined;
            bymonthday?: number[] | null | undefined;
            until?: string | undefined;
            wkst?: "MO" | "TU" | "WE" | "TH" | "FR" | "SA" | "SU" | undefined;
            bymonth?: number[] | null | undefined;
            bysetpos?: number[] | null | undefined;
            byyearday?: number[] | null | undefined;
            byweekno?: number[] | null | undefined;
            bysecond?: number[] | null | undefined;
        } & {
            tzid: string;
            dtstart: string;
        }>;
    }>[];
};
export declare function getBulkUnsnooze<Params extends RuleParams>(rule: RuleDomain<Params>, scheduleIds?: string[]): {
    snoozeSchedule: Readonly<{
        id?: string | undefined;
        skipRecurrences?: string[] | undefined;
    } & {
        duration: number;
        rRule: Readonly<{
            count?: number | undefined;
            interval?: number | undefined;
            freq?: 0 | 2 | 4 | 1 | 6 | 5 | 3 | undefined;
            byhour?: number[] | null | undefined;
            byminute?: number[] | null | undefined;
            byweekday?: (string | number)[] | null | undefined;
            bymonthday?: number[] | null | undefined;
            until?: string | undefined;
            wkst?: "MO" | "TU" | "WE" | "TH" | "FR" | "SA" | "SU" | undefined;
            bymonth?: number[] | null | undefined;
            bysetpos?: number[] | null | undefined;
            byyearday?: number[] | null | undefined;
            byweekno?: number[] | null | undefined;
            bysecond?: number[] | null | undefined;
        } & {
            tzid: string;
            dtstart: string;
        }>;
    }>[];
    muteAll: boolean;
};
export declare function clearUnscheduledSnoozeAttributes(attributes: RawRule): Readonly<{
    id?: string | undefined;
    skipRecurrences?: string[] | undefined;
} & {
    duration: number;
    rRule: Readonly<{
        count?: number | undefined;
        interval?: number | undefined;
        freq?: 0 | 2 | 4 | 1 | 6 | 5 | 3 | undefined;
        byhour?: number[] | null | undefined;
        byminute?: number[] | null | undefined;
        byweekday?: (string | number)[] | null | undefined;
        bymonthday?: number[] | null | undefined;
        until?: string | undefined;
        wkst?: "MO" | "TU" | "WE" | "TH" | "FR" | "SA" | "SU" | undefined;
        bymonth?: number[] | null | undefined;
        bysetpos?: number[] | null | undefined;
        byyearday?: number[] | null | undefined;
        byweekno?: number[] | null | undefined;
        bysecond?: number[] | null | undefined;
    } & {
        tzid: string;
        dtstart: string;
    }>;
}>[];
export declare function clearUnscheduledSnooze<Params extends RuleParams>(rule: RuleDomain<Params>): Readonly<{
    id?: string | undefined;
    skipRecurrences?: string[] | undefined;
} & {
    duration: number;
    rRule: Readonly<{
        count?: number | undefined;
        interval?: number | undefined;
        freq?: 0 | 2 | 4 | 1 | 6 | 5 | 3 | undefined;
        byhour?: number[] | null | undefined;
        byminute?: number[] | null | undefined;
        byweekday?: (string | number)[] | null | undefined;
        bymonthday?: number[] | null | undefined;
        until?: string | undefined;
        wkst?: "MO" | "TU" | "WE" | "TH" | "FR" | "SA" | "SU" | undefined;
        bymonth?: number[] | null | undefined;
        bysetpos?: number[] | null | undefined;
        byyearday?: number[] | null | undefined;
        byweekno?: number[] | null | undefined;
        bysecond?: number[] | null | undefined;
    } & {
        tzid: string;
        dtstart: string;
    }>;
}>[];
export declare function clearScheduledSnoozesAttributesById(attributes: RawRule, ids: string[]): Readonly<{
    id?: string | undefined;
    skipRecurrences?: string[] | undefined;
} & {
    duration: number;
    rRule: Readonly<{
        count?: number | undefined;
        interval?: number | undefined;
        freq?: 0 | 2 | 4 | 1 | 6 | 5 | 3 | undefined;
        byhour?: number[] | null | undefined;
        byminute?: number[] | null | undefined;
        byweekday?: (string | number)[] | null | undefined;
        bymonthday?: number[] | null | undefined;
        until?: string | undefined;
        wkst?: "MO" | "TU" | "WE" | "TH" | "FR" | "SA" | "SU" | undefined;
        bymonth?: number[] | null | undefined;
        bysetpos?: number[] | null | undefined;
        byyearday?: number[] | null | undefined;
        byweekno?: number[] | null | undefined;
        bysecond?: number[] | null | undefined;
    } & {
        tzid: string;
        dtstart: string;
    }>;
}>[];
export declare function clearScheduledSnoozesById<Params extends RuleParams>(rule: RuleDomain<Params>, ids: string[]): Readonly<{
    id?: string | undefined;
    skipRecurrences?: string[] | undefined;
} & {
    duration: number;
    rRule: Readonly<{
        count?: number | undefined;
        interval?: number | undefined;
        freq?: 0 | 2 | 4 | 1 | 6 | 5 | 3 | undefined;
        byhour?: number[] | null | undefined;
        byminute?: number[] | null | undefined;
        byweekday?: (string | number)[] | null | undefined;
        bymonthday?: number[] | null | undefined;
        until?: string | undefined;
        wkst?: "MO" | "TU" | "WE" | "TH" | "FR" | "SA" | "SU" | undefined;
        bymonth?: number[] | null | undefined;
        bysetpos?: number[] | null | undefined;
        byyearday?: number[] | null | undefined;
        byweekno?: number[] | null | undefined;
        bysecond?: number[] | null | undefined;
    } & {
        tzid: string;
        dtstart: string;
    }>;
}>[];
export declare function clearCurrentActiveSnoozeAttributes(attributes: RawRule): Readonly<{
    id?: string | undefined;
    skipRecurrences?: string[] | undefined;
} & {
    duration: number;
    rRule: Readonly<{
        count?: number | undefined;
        interval?: number | undefined;
        freq?: 0 | 2 | 4 | 1 | 6 | 5 | 3 | undefined;
        byhour?: number[] | null | undefined;
        byminute?: number[] | null | undefined;
        byweekday?: (string | number)[] | null | undefined;
        bymonthday?: number[] | null | undefined;
        until?: string | undefined;
        wkst?: "MO" | "TU" | "WE" | "TH" | "FR" | "SA" | "SU" | undefined;
        bymonth?: number[] | null | undefined;
        bysetpos?: number[] | null | undefined;
        byyearday?: number[] | null | undefined;
        byweekno?: number[] | null | undefined;
        bysecond?: number[] | null | undefined;
    } & {
        tzid: string;
        dtstart: string;
    }>;
}>[];
export declare function clearCurrentActiveSnooze<Params extends RuleParams>(rule: RuleDomain<Params>): Readonly<{
    id?: string | undefined;
    skipRecurrences?: string[] | undefined;
} & {
    duration: number;
    rRule: Readonly<{
        count?: number | undefined;
        interval?: number | undefined;
        freq?: 0 | 2 | 4 | 1 | 6 | 5 | 3 | undefined;
        byhour?: number[] | null | undefined;
        byminute?: number[] | null | undefined;
        byweekday?: (string | number)[] | null | undefined;
        bymonthday?: number[] | null | undefined;
        until?: string | undefined;
        wkst?: "MO" | "TU" | "WE" | "TH" | "FR" | "SA" | "SU" | undefined;
        bymonth?: number[] | null | undefined;
        bysetpos?: number[] | null | undefined;
        byyearday?: number[] | null | undefined;
        byweekno?: number[] | null | undefined;
        bysecond?: number[] | null | undefined;
    } & {
        tzid: string;
        dtstart: string;
    }>;
}>[];
export declare function verifySnoozeAttributeScheduleLimit(attributes: Partial<Rule>): void;
export declare function verifySnoozeScheduleLimit<Params extends RuleParams>(snoozeSchedule: RuleDomain<Params>['snoozeSchedule']): void;
