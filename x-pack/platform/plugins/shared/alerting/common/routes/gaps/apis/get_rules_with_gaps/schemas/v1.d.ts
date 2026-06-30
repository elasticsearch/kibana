export declare const getRuleIdsWithGapBodySchema: import("@kbn/config-schema").ObjectType<{
    end: import("@kbn/config-schema").Type<string>;
    start: import("@kbn/config-schema").Type<string>;
    statuses: import("@kbn/config-schema").Type<("filled" | "unfilled" | "partially_filled")[] | undefined>;
    highest_priority_gap_fill_statuses: import("@kbn/config-schema").Type<("error" | "filled" | "unfilled" | "in_progress")[] | undefined>;
    has_unfilled_intervals: import("@kbn/config-schema").Type<boolean | undefined>;
    has_in_progress_intervals: import("@kbn/config-schema").Type<boolean | undefined>;
    has_filled_intervals: import("@kbn/config-schema").Type<boolean | undefined>;
    sort_order: import("@kbn/config-schema").Type<"desc" | "asc" | undefined>;
    excluded_reasons: import("@kbn/config-schema").Type<("rule_disabled" | "rule_did_not_run")[] | undefined>;
    gap_auto_fill_scheduler_id: import("@kbn/config-schema").Type<string | undefined>;
}>;
export declare const gapsSummarySchema: import("@kbn/config-schema").ObjectType<{
    total_unfilled_duration_ms: import("@kbn/config-schema").Type<number>;
    total_in_progress_duration_ms: import("@kbn/config-schema").Type<number>;
    total_filled_duration_ms: import("@kbn/config-schema").Type<number>;
    total_error_duration_ms: import("@kbn/config-schema").Type<number>;
    total_duration_ms: import("@kbn/config-schema").Type<number>;
    rules_by_gap_fill_status: import("@kbn/config-schema").ObjectType<{
        unfilled: import("@kbn/config-schema").Type<number>;
        in_progress: import("@kbn/config-schema").Type<number>;
        filled: import("@kbn/config-schema").Type<number>;
        error: import("@kbn/config-schema").Type<number>;
    }>;
}>;
export declare const getRuleIdsWithGapResponseSchema: import("@kbn/config-schema").ObjectType<{
    total: import("@kbn/config-schema").Type<number>;
    rule_ids: import("@kbn/config-schema").Type<string[]>;
    latest_gap_timestamp: import("@kbn/config-schema").Type<number | undefined>;
    summary: import("@kbn/config-schema").ObjectType<{
        total_unfilled_duration_ms: import("@kbn/config-schema").Type<number>;
        total_in_progress_duration_ms: import("@kbn/config-schema").Type<number>;
        total_filled_duration_ms: import("@kbn/config-schema").Type<number>;
        total_error_duration_ms: import("@kbn/config-schema").Type<number>;
        total_duration_ms: import("@kbn/config-schema").Type<number>;
        rules_by_gap_fill_status: import("@kbn/config-schema").ObjectType<{
            unfilled: import("@kbn/config-schema").Type<number>;
            in_progress: import("@kbn/config-schema").Type<number>;
            filled: import("@kbn/config-schema").Type<number>;
            error: import("@kbn/config-schema").Type<number>;
        }>;
    }>;
}>;
