export declare const rRuleResponseSchema: import("@kbn/config-schema").ObjectType<{
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
