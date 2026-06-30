export declare const maintenanceWindowEventSchema: import("@kbn/config-schema").ObjectType<{
    gte: import("@kbn/config-schema").Type<string>;
    lte: import("@kbn/config-schema").Type<string>;
}>;
export declare const maintenanceWindowResponseSchema: import("@kbn/config-schema").ObjectType<{
    id: import("@kbn/config-schema").Type<string>;
    title: import("@kbn/config-schema").Type<string>;
    enabled: import("@kbn/config-schema").Type<boolean>;
    duration: import("@kbn/config-schema").Type<number>;
    expiration_date: import("@kbn/config-schema").Type<string>;
    events: import("@kbn/config-schema").Type<Readonly<{} & {
        gte: string;
        lte: string;
    }>[]>;
    r_rule: import("@kbn/config-schema").ObjectType<{
        dtstart: import("@kbn/config-schema").Type<string>;
        tzid: import("@kbn/config-schema").Type<string>;
        freq: import("@kbn/config-schema").Type<0 | 2 | 4 | 1 | 6 | 5 | 3 | undefined>;
        until: import("@kbn/config-schema").Type<string | undefined>;
        count: import("@kbn/config-schema").Type<number | undefined>;
        interval: import("@kbn/config-schema").Type<number | undefined>;
        wkst: import("@kbn/config-schema").Type<"MO" | "TU" | "WE" | "TH" | "FR" | "SA" | "SU" | undefined>;
        byweekday: import("@kbn/config-schema").Type<(string | number)[] | null | undefined>;
        bymonth: import("@kbn/config-schema").Type<number[] | null | undefined>;
        bysetpos: import("@kbn/config-schema").Type<number[] | null | undefined>;
        bymonthday: import("@kbn/config-schema").Type<number[] | null | undefined>;
        byyearday: import("@kbn/config-schema").Type<number[] | null | undefined>;
        byweekno: import("@kbn/config-schema").Type<number[] | null | undefined>;
        byhour: import("@kbn/config-schema").Type<number[] | null | undefined>;
        byminute: import("@kbn/config-schema").Type<number[] | null | undefined>;
        bysecond: import("@kbn/config-schema").Type<number[] | null | undefined>;
    }>;
    created_by: import("@kbn/config-schema").Type<string | null>;
    updated_by: import("@kbn/config-schema").Type<string | null>;
    created_at: import("@kbn/config-schema").Type<string>;
    updated_at: import("@kbn/config-schema").Type<string>;
    event_start_time: import("@kbn/config-schema").Type<string | null>;
    event_end_time: import("@kbn/config-schema").Type<string | null>;
    status: import("@kbn/config-schema").Type<"disabled" | "running" | "upcoming" | "finished" | "archived">;
    category_ids: import("@kbn/config-schema").Type<("observability" | "securitySolution" | "management")[] | null | undefined>;
    scoped_query: import("@kbn/config-schema").Type<Readonly<{
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
}>;
