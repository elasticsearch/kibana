import type { TypeOf } from '@kbn/config-schema';
export declare const uptimeDurationAnomalyRuleParamsSchema: import("@kbn/config-schema").ObjectType<{
    stackVersion: import("@kbn/config-schema").Type<string | undefined>;
    monitorId: import("@kbn/config-schema").Type<string>;
    severity: import("@kbn/config-schema").Type<number>;
}>;
export type UptimeDurationAnomalyRuleParams = TypeOf<typeof uptimeDurationAnomalyRuleParamsSchema>;
