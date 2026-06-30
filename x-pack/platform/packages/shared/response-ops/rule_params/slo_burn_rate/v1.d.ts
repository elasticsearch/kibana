export declare const sloBurnRateParamsSchema: import("@kbn/config-schema").ObjectType<{
    sloId: import("@kbn/config-schema").Type<string>;
    windows: import("@kbn/config-schema").Type<Readonly<{} & {
        id: string;
        burnRateThreshold: number;
        maxBurnRateThreshold: number | null;
        longWindow: Readonly<{} & {
            value: number;
            unit: string;
        }>;
        shortWindow: Readonly<{} & {
            value: number;
            unit: string;
        }>;
        actionGroup: string;
    }>[]>;
    dependencies: import("@kbn/config-schema").Type<Readonly<{} & {
        ruleId: string;
        actionGroupsToSuppressOn: string[];
    }>[] | undefined>;
}>;
