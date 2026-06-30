export declare const updateMaintenanceWindowRequestBodySchema: import("@kbn/config-schema").ObjectType<{
    title: import("@kbn/config-schema").Type<string | undefined>;
    enabled: import("@kbn/config-schema").Type<boolean | undefined>;
    schedule: import("@kbn/config-schema").Type<Readonly<{} & {
        custom: Readonly<{
            timezone?: string | undefined;
            recurring?: Readonly<{
                end?: string | undefined;
                every?: string | undefined;
                onWeekDay?: string[] | undefined;
                onMonthDay?: number[] | undefined;
                onMonth?: number[] | undefined;
                occurrences?: number | undefined;
            } & {}> | undefined;
        } & {
            start: string;
            duration: string;
        }>;
    }> | undefined>;
    scope: import("@kbn/config-schema").Type<Readonly<{} & {
        alerting: Readonly<{} & {
            query: Readonly<{} & {
                kql: string;
            }>;
        }>;
    }> | undefined>;
}>;
export declare const updateMaintenanceWindowRequestParamsSchema: import("@kbn/config-schema").ObjectType<{
    id: import("@kbn/config-schema").Type<string>;
}>;
