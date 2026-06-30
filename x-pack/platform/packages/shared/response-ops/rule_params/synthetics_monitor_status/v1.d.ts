import type { TypeOf } from '@kbn/config-schema';
declare const TimeWindowSchema: import("@kbn/config-schema").ObjectType<{
    unit: import("@kbn/config-schema").Type<"s" | "d" | "m" | "h">;
    size: import("@kbn/config-schema").Type<number>;
}>;
declare const StatusRuleConditionSchema: import("@kbn/config-schema").ObjectType<{
    groupBy: import("@kbn/config-schema").Type<string | undefined>;
    downThreshold: import("@kbn/config-schema").Type<number | undefined>;
    locationsThreshold: import("@kbn/config-schema").Type<number | undefined>;
    window: import("@kbn/config-schema").Type<Readonly<{} & {
        time: Readonly<{} & {
            size: number;
            unit: "s" | "d" | "m" | "h";
        }>;
    }> | Readonly<{} & {
        numberOfChecks: number;
    }>>;
    includeRetests: import("@kbn/config-schema").Type<boolean | undefined>;
    alertOnNoData: import("@kbn/config-schema").Type<boolean | undefined>;
    recoveryStrategy: import("@kbn/config-schema").Type<"firstUp" | "conditionNotMet" | undefined>;
}>;
export declare const syntheticsMonitorStatusRuleParamsSchema: import("@kbn/config-schema").ObjectType<{
    condition: import("@kbn/config-schema").Type<Readonly<{
        groupBy?: string | undefined;
        alertOnNoData?: boolean | undefined;
        downThreshold?: number | undefined;
        locationsThreshold?: number | undefined;
        includeRetests?: boolean | undefined;
        recoveryStrategy?: "firstUp" | "conditionNotMet" | undefined;
    } & {
        window: Readonly<{} & {
            time: Readonly<{} & {
                size: number;
                unit: "s" | "d" | "m" | "h";
            }>;
        }> | Readonly<{} & {
            numberOfChecks: number;
        }>;
    }> | undefined>;
    monitorIds: import("@kbn/config-schema").Type<string[] | undefined>;
    locations: import("@kbn/config-schema").Type<string[] | undefined>;
    tags: import("@kbn/config-schema").Type<string[] | undefined>;
    monitorTypes: import("@kbn/config-schema").Type<string[] | undefined>;
    projects: import("@kbn/config-schema").Type<string[] | undefined>;
    kqlQuery: import("@kbn/config-schema").Type<string | undefined>;
}>;
export type SyntheticsMonitorStatusRuleParams = TypeOf<typeof syntheticsMonitorStatusRuleParamsSchema>;
export type TimeWindow = TypeOf<typeof TimeWindowSchema>;
export type StatusRuleCondition = TypeOf<typeof StatusRuleConditionSchema>;
export {};
