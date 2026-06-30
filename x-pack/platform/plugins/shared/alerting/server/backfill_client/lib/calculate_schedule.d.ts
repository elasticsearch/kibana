import type { AdHocRunSchedule } from '../../data/ad_hoc_run/types';
export declare const MAX_SCHEDULE_ENTRIES = 10000;
export declare const SCHEDULE_TRUNCATED_WARNING = "Backfill schedule was truncated to the maximum allowed entries of 10000.";
export interface CalculateScheduleResult {
    schedule: AdHocRunSchedule[];
    truncated: boolean;
}
export declare function calculateSchedule(interval: string, ranges: Array<{
    start: string;
    end: string;
}>): CalculateScheduleResult;
