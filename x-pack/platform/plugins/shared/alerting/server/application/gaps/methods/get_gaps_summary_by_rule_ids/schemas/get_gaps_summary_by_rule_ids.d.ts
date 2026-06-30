export declare const getGapsSummaryByRuleIdsParamsSchema: import("@kbn/config-schema").ObjectType<{
    start: import("@kbn/config-schema").Type<string>;
    end: import("@kbn/config-schema").Type<string>;
    ruleIds: import("@kbn/config-schema").Type<string[]>;
    excludedReasons: import("@kbn/config-schema").Type<("rule_disabled" | "rule_did_not_run")[] | undefined>;
    schedulerId: import("@kbn/config-schema").Type<string | undefined>;
}>;
export declare const getGapsSummaryByRuleIdsResponseSchema: import("@kbn/config-schema").ObjectType<{
    data: import("@kbn/config-schema").Type<Readonly<{
        gapFillStatus?: string | undefined;
    } & {
        ruleId: string;
        totalUnfilledDurationMs: number;
        totalInProgressDurationMs: number;
        totalFilledDurationMs: number;
    }>[]>;
}>;
