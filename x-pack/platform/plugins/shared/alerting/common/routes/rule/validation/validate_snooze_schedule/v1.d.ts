import type { TypeOf } from '@kbn/config-schema';
import type { rRuleRequestSchema } from '../../../r_rule';
export declare const validateSnoozeSchedule: (schedule: {
    rRule: TypeOf<typeof rRuleRequestSchema>;
    duration: number;
}) => "Recurrence interval must be longer than the snooze duration" | undefined;
