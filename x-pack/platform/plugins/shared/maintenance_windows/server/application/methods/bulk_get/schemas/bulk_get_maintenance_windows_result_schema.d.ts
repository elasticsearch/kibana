export declare const bulkGetMaintenanceWindowsErrorSchema: import("@kbn/config-schema").ObjectType<{
    id: import("@kbn/config-schema").Type<string>;
    error: import("@kbn/config-schema").Type<string>;
    message: import("@kbn/config-schema").Type<string>;
    statusCode: import("@kbn/config-schema").Type<number>;
}>;
export declare const bulkGetMaintenanceWindowsResultSchema: import("@kbn/config-schema").ObjectType<{
    maintenanceWindows: import("@kbn/config-schema").Type<Readonly<{
        scope?: Readonly<{} & {
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
        }> | undefined;
        categoryIds?: ("observability" | "securitySolution" | "management")[] | null | undefined;
        scopedQuery?: Readonly<{
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
        }> | null | undefined;
    } & {
        title: string;
        id: string;
        status: "disabled" | "running" | "upcoming" | "finished" | "archived";
        duration: number;
        schedule: Readonly<{} & {
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
        }>;
        enabled: boolean;
        createdBy: string | null;
        createdAt: string;
        updatedBy: string | null;
        updatedAt: string;
        expirationDate: string;
        events: Readonly<{} & {
            gte: string;
            lte: string;
        }>[];
        rRule: Readonly<{
            count?: number | undefined;
            interval?: number | undefined;
            freq?: 0 | 2 | 4 | 1 | 6 | 5 | 3 | undefined;
            byhour?: number[] | null | undefined;
            byminute?: number[] | null | undefined;
            byweekday?: (string | number)[] | null | undefined;
            bymonthday?: number[] | null | undefined;
            until?: string | undefined;
            wkst?: "MO" | "TU" | "WE" | "TH" | "FR" | "SA" | "SU" | undefined;
            bymonth?: number[] | null | undefined;
            bysetpos?: number[] | null | undefined;
            byyearday?: number[] | null | undefined;
            byweekno?: number[] | null | undefined;
            bysecond?: number[] | null | undefined;
        } & {
            tzid: string;
            dtstart: string;
        }>;
        eventStartTime: string | null;
        eventEndTime: string | null;
    }>[]>;
    errors: import("@kbn/config-schema").Type<Readonly<{} & {
        id: string;
        error: string;
        message: string;
        statusCode: number;
    }>[]>;
}>;
