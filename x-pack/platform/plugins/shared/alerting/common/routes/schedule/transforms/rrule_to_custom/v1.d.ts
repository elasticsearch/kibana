import type { RRule } from '../../../../../server/application/r_rule/types';
import type { ScheduleRequest } from '../../types/v1';
export declare const transformRRuleToCustomSchedule: (snoozeSchedule: {
    duration: number;
    rRule: RRule;
}) => ScheduleRequest;
