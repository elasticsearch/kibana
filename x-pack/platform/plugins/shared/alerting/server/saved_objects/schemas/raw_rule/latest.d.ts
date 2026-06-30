import type { TypeOf } from '@kbn/config-schema';
import type { rawRuleExecutionStatusSchema, rawRuleActionSchema, rawRuleAlertsFilterSchema, rawRuleLastRunSchema } from './v3';
import type { rawRuleMonitoringSchema } from './v11';
import type { rawRuleSchema, rawRuleSnoozedInstanceSchema } from './v12';
type Mutable<T> = {
    -readonly [P in keyof T]: T[P] extends object ? Mutable<T[P]> : T[P];
};
export type RawRuleAction = Mutable<TypeOf<typeof rawRuleActionSchema>>;
export type RawRuleExecutionStatus = Mutable<TypeOf<typeof rawRuleExecutionStatusSchema>>;
export type RawRuleAlertsFilter = Mutable<TypeOf<typeof rawRuleAlertsFilterSchema>>;
export type RawRuleLastRun = Mutable<TypeOf<typeof rawRuleLastRunSchema>>;
export type RawRuleMonitoring = Mutable<TypeOf<typeof rawRuleMonitoringSchema>>;
export type RawRuleSnoozedInstance = Mutable<TypeOf<typeof rawRuleSnoozedInstanceSchema>>;
export type RawRule = Mutable<TypeOf<typeof rawRuleSchema>>;
export {};
