import type { RRule } from '../../../application/types';
import type { ScheduleRequest } from '../../../routes/schemas/schedule/types/v1';
export declare const transformRRuleToCustomSchedule: (snoozeSchedule: {
    duration: number;
    rRule: RRule;
}) => ScheduleRequest;
