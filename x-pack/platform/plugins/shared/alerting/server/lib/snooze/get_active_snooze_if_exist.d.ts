import type { RuleSnoozeSchedule } from '../../types';
export declare function getActiveSnoozeIfExist(snooze: RuleSnoozeSchedule): {
    id: string | undefined;
    snoozeEndTime: Date;
    lastOccurrence?: undefined;
} | {
    snoozeEndTime: Date;
    lastOccurrence: Date;
    id: string | undefined;
} | null;
