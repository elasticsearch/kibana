import type { WeekdayStr } from '@kbn/rrule';
type RRuleFreq = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export interface RRuleAttributes {
    dtstart: string;
    tzid: string;
    freq?: RRuleFreq;
    until?: string;
    count?: number;
    interval?: number;
    wkst?: WeekdayStr;
    byweekday?: Array<string | number> | null;
    bymonth?: number[] | null;
    bysetpos?: number[] | null;
    bymonthday?: number[] | null;
    byyearday?: number[] | null;
    byweekno?: number[] | null;
    byhour?: number[] | null;
    byminute?: number[] | null;
    bysecond?: number[] | null;
}
export {};
