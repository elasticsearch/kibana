export declare const findGapsBodySchema: import("@kbn/config-schema").ObjectType<{
    end: import("@kbn/config-schema").Type<string>;
    page: import("@kbn/config-schema").Type<number>;
    per_page: import("@kbn/config-schema").Type<number>;
    rule_id: import("@kbn/config-schema").Type<string>;
    start: import("@kbn/config-schema").Type<string>;
    sort_field: import("@kbn/config-schema").Type<"@timestamp" | "kibana.alert.rule.gap.total_gap_duration_ms" | "kibana.alert.rule.gap.status" | undefined>;
    sort_order: import("@kbn/config-schema").Type<"desc" | "asc" | undefined>;
    statuses: import("@kbn/config-schema").Type<("filled" | "unfilled" | "partially_filled")[] | undefined>;
    excluded_reasons: import("@kbn/config-schema").Type<("rule_disabled" | "rule_did_not_run")[] | undefined>;
}>;
export declare const findGapsResponseSchema: import("@kbn/config-schema").ObjectType<{
    page: import("@kbn/config-schema").Type<number>;
    per_page: import("@kbn/config-schema").Type<number>;
    total: import("@kbn/config-schema").Type<number>;
    data: import("@kbn/config-schema").Type<Readonly<{
        reason?: Readonly<{} & {
            type: "rule_disabled" | "rule_did_not_run";
        }> | undefined;
        updated_at?: string | undefined;
        failed_auto_fill_attempts?: number | undefined;
    } & {
        status: "filled" | "unfilled" | "partially_filled";
        '@timestamp': string;
        range: Readonly<{} & {
            gte: string;
            lte: string;
        }>;
        _id: string;
        filled_intervals: Readonly<{} & {
            gte: string;
            lte: string;
        }>[];
        unfilled_intervals: Readonly<{} & {
            gte: string;
            lte: string;
        }>[];
        in_progress_intervals: Readonly<{} & {
            gte: string;
            lte: string;
        }>[];
        total_gap_duration_ms: number;
        filled_duration_ms: number;
        unfilled_duration_ms: number;
        in_progress_duration_ms: number;
    }>[]>;
}>;
