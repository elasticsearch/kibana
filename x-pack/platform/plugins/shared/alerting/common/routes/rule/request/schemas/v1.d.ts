export declare const MAX_ARTIFACTS_DASHBOARDS_LENGTH = 10;
export declare const dashboardsSchema: import("@kbn/config-schema").Type<Readonly<{} & {
    id: string;
}>[]>;
export declare const investigationGuideSchema: import("@kbn/config-schema").ObjectType<{
    blob: import("@kbn/config-schema").Type<string>;
}>;
export declare const artifactsSchema: import("@kbn/config-schema").ObjectType<{
    dashboards: import("@kbn/config-schema").Type<Readonly<{} & {
        id: string;
    }>[] | undefined>;
    investigation_guide: import("@kbn/config-schema").Type<Readonly<{} & {
        blob: string;
    }> | undefined>;
}>;
export declare const ruleSnoozeScheduleSchema: import("@kbn/config-schema").ObjectType<{
    id: import("@kbn/config-schema").Type<string | undefined>;
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
}>;
