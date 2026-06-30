import type { TypeOf } from '@kbn/config-schema';
import type { ruleSnoozeScheduleSchema as ruleSnoozeScheduleRequestSchema } from '../../../../../../common/routes/rule/request';
export interface SnoozeRuleOptions {
    id: string;
    snoozeSchedule: TypeOf<typeof ruleSnoozeScheduleRequestSchema>;
}
