import type { Moment } from 'moment';
import type { RecurrenceSchedule } from '../../../../../../types';
import { RRuleFrequency } from '../../../../../../types';
export interface CustomFrequencyState {
    freq: RRuleFrequency;
    interval: number;
    byweekday?: string[];
    bymonthday: number[];
    bymonth: number[];
}
export declare const getWeekdayInfo: (date: Moment, dayOfWeekFmt?: string) => {
    dayOfWeek: string;
    nthWeekdayOfMonth: number;
    isLastOfMonth: boolean;
};
export declare const getInitialByweekday: (initialStateByweekday: CustomFrequencyState["byweekday"], date: Moment | null) => Record<string, boolean>;
export declare const generateNthByweekday: (startDate: Moment) => string[];
export declare const recurrenceSummary: ({ freq, interval, until, count, byweekday, bymonthday, bymonth, }: RecurrenceSchedule) => string;
export declare const rRuleWeekdayToWeekdayName: (weekday: string) => string;
export declare const buildCustomRecurrenceSchedulerState: ({ frequency, interval, byweekday, monthlyRecurDay, startDate, }: {
    frequency: RRuleFrequency;
    interval: number;
    byweekday: Record<string, boolean>;
    monthlyRecurDay: string;
    startDate: Moment | null;
}) => {
    freq: RRuleFrequency;
    interval: number;
    byweekday: string[];
    bymonthday: number[];
    bymonth: number[];
};
