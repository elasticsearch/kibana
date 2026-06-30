export declare const findGapsParamsSchema: import("@kbn/config-schema").ObjectType<Omit<{
    end: import("@kbn/config-schema").Type<string | undefined>;
    perPage: import("@kbn/config-schema").Type<number>;
    start: import("@kbn/config-schema").Type<string | undefined>;
    sortField: import("@kbn/config-schema").Type<"@timestamp" | "kibana.alert.rule.gap.total_gap_duration_ms" | "kibana.alert.rule.gap.status" | undefined>;
    sortOrder: import("@kbn/config-schema").Type<"desc" | "asc" | undefined>;
    statuses: import("@kbn/config-schema").Type<("filled" | "unfilled" | "partially_filled")[] | undefined>;
    hasUnfilledIntervals: import("@kbn/config-schema").Type<boolean | undefined>;
    hasInProgressIntervals: import("@kbn/config-schema").Type<boolean | undefined>;
    hasFilledIntervals: import("@kbn/config-schema").Type<boolean | undefined>;
    excludedReasons: import("@kbn/config-schema").Type<("rule_disabled" | "rule_did_not_run")[] | undefined>;
}, "ruleId" | "page"> & {
    ruleId: import("@kbn/config-schema").Type<string>;
    page: import("@kbn/config-schema").Type<number>;
}>;
export declare const findGapsByIdParamsSchema: import("@kbn/config-schema").ObjectType<{
    gapIds: import("@kbn/config-schema").Type<string[]>;
    ruleId: import("@kbn/config-schema").Type<string>;
    page: import("@kbn/config-schema").Type<number>;
    perPage: import("@kbn/config-schema").Type<number>;
}>;
export declare const findGapsSearchAfterParamsSchema: import("@kbn/config-schema").ObjectType<Omit<{
    end: import("@kbn/config-schema").Type<string | undefined>;
    perPage: import("@kbn/config-schema").Type<number>;
    start: import("@kbn/config-schema").Type<string | undefined>;
    sortField: import("@kbn/config-schema").Type<"@timestamp" | "kibana.alert.rule.gap.total_gap_duration_ms" | "kibana.alert.rule.gap.status" | undefined>;
    sortOrder: import("@kbn/config-schema").Type<"desc" | "asc" | undefined>;
    statuses: import("@kbn/config-schema").Type<("filled" | "unfilled" | "partially_filled")[] | undefined>;
    hasUnfilledIntervals: import("@kbn/config-schema").Type<boolean | undefined>;
    hasInProgressIntervals: import("@kbn/config-schema").Type<boolean | undefined>;
    hasFilledIntervals: import("@kbn/config-schema").Type<boolean | undefined>;
    excludedReasons: import("@kbn/config-schema").Type<("rule_disabled" | "rule_did_not_run")[] | undefined>;
}, "searchAfter" | "ruleIds" | "pitId" | "updatedBefore" | "failedAutoFillAttemptsLessThan"> & {
    searchAfter: import("@kbn/config-schema").Type<any[] | undefined>;
    ruleIds: import("@kbn/config-schema").Type<string[]>;
    pitId: import("@kbn/config-schema").Type<string | undefined>;
    updatedBefore: import("@kbn/config-schema").Type<string | undefined>;
    failedAutoFillAttemptsLessThan: import("@kbn/config-schema").Type<number | undefined>;
}>;
