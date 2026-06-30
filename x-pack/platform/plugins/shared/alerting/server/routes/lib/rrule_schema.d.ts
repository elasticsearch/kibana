export declare const rRuleSchema: import("@kbn/config-schema").ObjectType<{
    dtstart: import("@kbn/config-schema").Type<string>;
    tzid: import("@kbn/config-schema").Type<string>;
    freq: import("@kbn/config-schema").Type<0 | 2 | 1 | 3 | undefined>;
    interval: import("@kbn/config-schema").Type<number | undefined>;
    until: import("@kbn/config-schema").Type<string | undefined>;
    count: import("@kbn/config-schema").Type<number | undefined>;
    byweekday: import("@kbn/config-schema").Type<string[] | undefined>;
    bymonthday: import("@kbn/config-schema").Type<number[] | undefined>;
    bymonth: import("@kbn/config-schema").Type<number[] | undefined>;
}>;
