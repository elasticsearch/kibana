export declare const getRuleIdsWithGapsParamsSchema: import("@kbn/config-schema").ObjectType<{
    start: import("@kbn/config-schema").Type<string | undefined>;
    end: import("@kbn/config-schema").Type<string | undefined>;
    statuses: import("@kbn/config-schema").Type<("filled" | "unfilled" | "partially_filled")[] | undefined>;
    highestPriorityGapFillStatuses: import("@kbn/config-schema").Type<("error" | "filled" | "unfilled" | "in_progress")[] | undefined>;
    hasUnfilledIntervals: import("@kbn/config-schema").Type<boolean | undefined>;
    hasInProgressIntervals: import("@kbn/config-schema").Type<boolean | undefined>;
    hasFilledIntervals: import("@kbn/config-schema").Type<boolean | undefined>;
    ruleTypes: import("@kbn/config-schema").Type<Readonly<{} & {
        type: string;
        consumer: string;
    }>[] | undefined>;
    sortOrder: import("@kbn/config-schema").Type<"desc" | "asc" | undefined>;
    maxRulesToFetch: import("@kbn/config-schema").Type<number | undefined>;
    ruleIds: import("@kbn/config-schema").Type<string[] | undefined>;
    excludedReasons: import("@kbn/config-schema").Type<("rule_disabled" | "rule_did_not_run")[] | undefined>;
    schedulerId: import("@kbn/config-schema").Type<string | undefined>;
}>;
export declare const gapsSummarySchema: import("@kbn/config-schema").ObjectType<{
    totalUnfilledDurationMs: import("@kbn/config-schema").Type<number>;
    totalInProgressDurationMs: import("@kbn/config-schema").Type<number>;
    totalFilledDurationMs: import("@kbn/config-schema").Type<number>;
    totalErrorDurationMs: import("@kbn/config-schema").Type<number>;
    totalDurationMs: import("@kbn/config-schema").Type<number>;
    rulesByGapFillStatus: import("@kbn/config-schema").ObjectType<{
        unfilled: import("@kbn/config-schema").Type<number>;
        inProgress: import("@kbn/config-schema").Type<number>;
        filled: import("@kbn/config-schema").Type<number>;
        error: import("@kbn/config-schema").Type<number>;
    }>;
}>;
export declare const getRuleIdsWithGapsResponseSchema: import("@kbn/config-schema").ObjectType<{
    total: import("@kbn/config-schema").Type<number>;
    ruleIds: import("@kbn/config-schema").Type<string[]>;
    latestGapTimestamp: import("@kbn/config-schema").Type<number | undefined>;
    summary: import("@kbn/config-schema").ObjectType<{
        totalUnfilledDurationMs: import("@kbn/config-schema").Type<number>;
        totalInProgressDurationMs: import("@kbn/config-schema").Type<number>;
        totalFilledDurationMs: import("@kbn/config-schema").Type<number>;
        totalErrorDurationMs: import("@kbn/config-schema").Type<number>;
        totalDurationMs: import("@kbn/config-schema").Type<number>;
        rulesByGapFillStatus: import("@kbn/config-schema").ObjectType<{
            unfilled: import("@kbn/config-schema").Type<number>;
            inProgress: import("@kbn/config-schema").Type<number>;
            filled: import("@kbn/config-schema").Type<number>;
            error: import("@kbn/config-schema").Type<number>;
        }>;
    }>;
}>;
