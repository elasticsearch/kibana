import { FilterStateStore } from '@kbn/es-query';
export declare const alertsFilterQuerySchema: import("@kbn/config-schema").ObjectType<{
    kql: import("@kbn/config-schema").Type<string>;
    filters: import("@kbn/config-schema").Type<Readonly<{
        query?: Record<string, any> | undefined;
        $state?: Readonly<{} & {
            store: FilterStateStore;
        }> | undefined;
    } & {
        meta: Record<string, any>;
    }>[]>;
    dsl: import("@kbn/config-schema").Type<string | undefined>;
}>;
export declare const rRuleSchema: import("@kbn/config-schema").ObjectType<{
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
export declare const rawMaintenanceWindowSchema: import("@kbn/config-schema").ObjectType<{
    categoryIds: import("@kbn/config-schema").Type<string[] | null | undefined>;
    createdAt: import("@kbn/config-schema").Type<string>;
    createdBy: import("@kbn/config-schema").Type<string | null>;
    duration: import("@kbn/config-schema").Type<number>;
    enabled: import("@kbn/config-schema").Type<boolean>;
    events: import("@kbn/config-schema").Type<Readonly<{} & {
        gte: string;
        lte: string;
    }>[]>;
    expirationDate: import("@kbn/config-schema").Type<string>;
    rRule: import("@kbn/config-schema").ObjectType<{
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
    scopedQuery: import("@kbn/config-schema").Type<Readonly<{
        dsl?: string | undefined;
    } & {
        kql: string;
        filters: Readonly<{
            query?: Record<string, any> | undefined;
            $state?: Readonly<{} & {
                store: FilterStateStore;
            }> | undefined;
        } & {
            meta: Record<string, any>;
        }>[];
    }> | null | undefined>;
    title: import("@kbn/config-schema").Type<string>;
    updatedAt: import("@kbn/config-schema").Type<string>;
    updatedBy: import("@kbn/config-schema").Type<string | null>;
}>;
