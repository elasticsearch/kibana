import type { MinimumScheduleInterval, RuleTypeWithDescription } from '../common/types';
import type { RuleFormData } from '../types';
export declare const getInitialSchedule: ({ ruleType, minimumScheduleInterval, initialSchedule, }: {
    ruleType: RuleTypeWithDescription;
    minimumScheduleInterval?: MinimumScheduleInterval;
    initialSchedule?: RuleFormData["schedule"];
}) => RuleFormData["schedule"];
