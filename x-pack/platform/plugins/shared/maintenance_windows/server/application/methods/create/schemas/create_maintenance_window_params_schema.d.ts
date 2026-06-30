export declare const createMaintenanceWindowParamsSchema: import("@kbn/config-schema").ObjectType<{
    data: import("@kbn/config-schema").ObjectType<{
        title: import("@kbn/config-schema").Type<string>;
        duration: import("@kbn/config-schema").Type<number>;
        rRule: import("@kbn/config-schema").ObjectType<{
            dtstart: import("@kbn/config-schema").Type<string>;
            tzid: import("@kbn/config-schema").Type<string>;
            freq: import("@kbn/config-schema").Type<0 | 2 | 4 | 1 | 3 | undefined>;
            interval: import("@kbn/config-schema").Type<number | undefined>;
            until: import("@kbn/config-schema").Type<string | undefined>;
            count: import("@kbn/config-schema").Type<number | undefined>;
            byweekday: import("@kbn/config-schema").Type<string[] | undefined>;
            bymonthday: import("@kbn/config-schema").Type<number[] | undefined>;
            bymonth: import("@kbn/config-schema").Type<number[] | undefined>;
        }>;
        categoryIds: import("@kbn/config-schema").Type<("observability" | "securitySolution" | "management")[] | null | undefined>;
        scopedQuery: import("@kbn/config-schema").Type<Readonly<{
            dsl?: string | undefined;
        } & {
            kql: string;
            filters: Readonly<{
                query?: Record<string, any> | undefined;
                $state?: Readonly<{} & {
                    store: import("@kbn/es-query-constants").FilterStateStore;
                }> | undefined;
            } & {
                meta: Record<string, any>;
            }>[];
        }> | null | undefined>;
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
            alerting: Readonly<{
                dsl?: string | undefined;
            } & {
                kql: string;
                filters: Readonly<{
                    query?: Record<string, any> | undefined;
                    $state?: Readonly<{} & {
                        store: import("@kbn/es-query-constants").FilterStateStore;
                    }> | undefined;
                } & {
                    meta: Record<string, any>;
                }>[];
            }> | null;
        }> | undefined>;
    }>;
}>;
