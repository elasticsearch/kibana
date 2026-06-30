export declare const findMaintenanceWindowsRequestQuerySchema: import("@kbn/config-schema").ObjectType<{
    page: import("@kbn/config-schema").Type<number>;
    per_page: import("@kbn/config-schema").Type<number>;
    search: import("@kbn/config-schema").Type<string | undefined>;
    status: import("@kbn/config-schema").Type<"disabled" | "running" | "upcoming" | "finished" | "archived" | ("disabled" | "running" | "upcoming" | "finished" | "archived")[] | undefined>;
}>;
export declare const findMaintenanceWindowsResponseBodySchema: import("@kbn/config-schema").ObjectType<{
    page: import("@kbn/config-schema").Type<number>;
    per_page: import("@kbn/config-schema").Type<number>;
    total: import("@kbn/config-schema").Type<number>;
    data: import("@kbn/config-schema").Type<Readonly<{
        category_ids?: ("observability" | "securitySolution" | "management")[] | null | undefined;
        scoped_query?: Readonly<{
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
        enabled: boolean;
        created_at: string;
        updated_at: string;
        events: Readonly<{} & {
            gte: string;
            lte: string;
        }>[];
        expiration_date: string;
        r_rule: Readonly<{
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
        created_by: string | null;
        updated_by: string | null;
        event_start_time: string | null;
        event_end_time: string | null;
    }>[]>;
}>;
