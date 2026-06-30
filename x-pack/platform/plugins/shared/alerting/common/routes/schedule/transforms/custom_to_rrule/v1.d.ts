import type { RRuleRequestV1 } from '../../../r_rule';
import type { ScheduleRequest } from '../../types/v1';
export declare const transformCustomScheduleToRRule: (schedule: ScheduleRequest) => {
    duration: number;
    rRule: RRuleRequestV1;
};
