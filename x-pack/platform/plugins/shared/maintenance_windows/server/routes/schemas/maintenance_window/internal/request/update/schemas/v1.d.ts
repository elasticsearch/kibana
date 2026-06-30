export declare const updateParamsSchema: import("@kbn/config-schema").ObjectType<{
    id: import("@kbn/config-schema").Type<string>;
}>;
export declare const updateBodySchema: import("@kbn/config-schema").ObjectType<{
    title: import("@kbn/config-schema").Type<string | undefined>;
    enabled: import("@kbn/config-schema").Type<boolean | undefined>;
    duration: import("@kbn/config-schema").Type<number | undefined>;
    r_rule: import("@kbn/config-schema").Type<Readonly<{
        count?: number | undefined;
        interval?: number | undefined;
        freq?: 0 | 2 | 4 | 1 | 3 | undefined;
        byweekday?: string[] | undefined;
        bymonthday?: number[] | undefined;
        until?: string | undefined;
        bymonth?: number[] | undefined;
    } & {
        tzid: string;
        dtstart: string;
    }> | undefined>;
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
