export declare const createMaintenanceWindowRequestBodySchema: import("@kbn/config-schema").ObjectType<{
    title: import("@kbn/config-schema").Type<string>;
    enabled: import("@kbn/config-schema").Type<boolean | undefined>;
    schedule: import("@kbn/config-schema").ObjectType<{
        custom: import("@kbn/config-schema").ObjectType<{
            start: import("@kbn/config-schema").Type<string>;
            duration: import("@kbn/config-schema").Type<string>;
            timezone: import("@kbn/config-schema").Type<string | undefined>;
            recurring: import("@kbn/config-schema").Type<Readonly<{
                end?: string | undefined;
                every?: string | undefined;
                onWeekDay?: string[] | undefined;
                onMonthDay?: number[] | undefined;
                onMonth?: number[] | undefined;
                occurrences?: number | undefined;
            } & {}> | undefined>;
        }>;
    }>;
    scope: import("@kbn/config-schema").Type<Readonly<{} & {
        alerting: Readonly<{} & {
            query: Readonly<{} & {
                kql: string;
            }>;
        }>;
    }> | undefined>;
}>;
