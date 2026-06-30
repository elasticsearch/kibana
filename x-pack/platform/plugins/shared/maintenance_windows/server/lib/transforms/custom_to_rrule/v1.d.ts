import type { RRuleRequestV1 } from '../../../routes/schemas/r_rule';
import type { ScheduleRequest } from '../../../routes/schemas/schedule/types/v1';
export declare const transformCustomScheduleToRRule: (schedule: ScheduleRequest) => {
    rRule: RRuleRequestV1;
};
