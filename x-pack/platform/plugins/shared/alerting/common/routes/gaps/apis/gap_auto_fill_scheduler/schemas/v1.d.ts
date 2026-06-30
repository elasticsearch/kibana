export declare const getGapAutoFillSchedulerParamsSchema: import("@kbn/config-schema").ObjectType<{
    id: import("@kbn/config-schema").Type<string>;
}>;
export declare const gapAutoFillSchedulerBodySchema: import("@kbn/config-schema").ObjectType<{
    id: import("@kbn/config-schema").Type<string | undefined>;
    name: import("@kbn/config-schema").Type<string>;
    enabled: import("@kbn/config-schema").Type<boolean>;
    max_backfills: import("@kbn/config-schema").Type<number>;
    num_retries: import("@kbn/config-schema").Type<number>;
    gap_fill_range: import("@kbn/config-schema").Type<string>;
    schedule: import("@kbn/config-schema").ObjectType<{
        interval: import("@kbn/config-schema").Type<string>;
    }>;
    scope: import("@kbn/config-schema").Type<string[]>;
    rule_types: import("@kbn/config-schema").Type<Readonly<{} & {
        type: string;
        consumer: string;
    }>[]>;
    excluded_reasons: import("@kbn/config-schema").Type<("rule_disabled" | "rule_did_not_run")[] | undefined>;
}>;
export declare const gapAutoFillSchedulerUpdateBodySchema: import("@kbn/config-schema").ObjectType<{
    name: import("@kbn/config-schema").Type<string>;
    enabled: import("@kbn/config-schema").Type<boolean>;
    gap_fill_range: import("@kbn/config-schema").Type<string>;
    max_backfills: import("@kbn/config-schema").Type<number>;
    num_retries: import("@kbn/config-schema").Type<number>;
    schedule: import("@kbn/config-schema").ObjectType<{
        interval: import("@kbn/config-schema").Type<string>;
    }>;
    scope: import("@kbn/config-schema").Type<string[]>;
    rule_types: import("@kbn/config-schema").Type<Readonly<{} & {
        type: string;
        consumer: string;
    }>[]>;
    excluded_reasons: import("@kbn/config-schema").Type<("rule_disabled" | "rule_did_not_run")[] | undefined>;
}>;
export declare const gapAutoFillSchedulerResponseSchema: import("@kbn/config-schema").ObjectType<{
    id: import("@kbn/config-schema").Type<string>;
    name: import("@kbn/config-schema").Type<string>;
    enabled: import("@kbn/config-schema").Type<boolean>;
    schedule: import("@kbn/config-schema").ObjectType<{
        interval: import("@kbn/config-schema").Type<string>;
    }>;
    rule_types: import("@kbn/config-schema").Type<Readonly<{} & {
        type: string;
        consumer: string;
    }>[]>;
    gap_fill_range: import("@kbn/config-schema").Type<string>;
    max_backfills: import("@kbn/config-schema").Type<number>;
    num_retries: import("@kbn/config-schema").Type<number>;
    scope: import("@kbn/config-schema").Type<string[]>;
    excluded_reasons: import("@kbn/config-schema").Type<string[] | undefined>;
    created_by: import("@kbn/config-schema").Type<string | null>;
    updated_by: import("@kbn/config-schema").Type<string | null>;
    created_at: import("@kbn/config-schema").Type<string>;
    updated_at: import("@kbn/config-schema").Type<string>;
}>;
export declare const gapAutoFillSchedulerLogsRequestQuerySchema: import("@kbn/config-schema").ObjectType<{
    start: import("@kbn/config-schema").Type<string>;
    end: import("@kbn/config-schema").Type<string>;
    page: import("@kbn/config-schema").Type<number>;
    per_page: import("@kbn/config-schema").Type<number>;
    sort_field: import("@kbn/config-schema").Type<string>;
    sort_direction: import("@kbn/config-schema").Type<"desc" | "asc">;
    statuses: import("@kbn/config-schema").Type<("success" | "error" | "skipped" | "no_gaps")[] | undefined>;
}>;
export declare const gapAutoFillSchedulerLogEntrySchema: import("@kbn/config-schema").ObjectType<{
    id: import("@kbn/config-schema").Type<string>;
    timestamp: import("@kbn/config-schema").Type<string | undefined>;
    status: import("@kbn/config-schema").Type<string | undefined>;
    message: import("@kbn/config-schema").Type<string | undefined>;
    results: import("@kbn/config-schema").Type<Readonly<{
        status?: string | undefined;
        error?: string | undefined;
        rule_id?: string | undefined;
        processed_gaps?: number | undefined;
    } & {}>[] | undefined>;
}>;
export declare const gapAutoFillSchedulerLogsResponseSchema: import("@kbn/config-schema").ObjectType<{
    data: import("@kbn/config-schema").Type<Readonly<{
        results?: Readonly<{
            status?: string | undefined;
            error?: string | undefined;
            rule_id?: string | undefined;
            processed_gaps?: number | undefined;
        } & {}>[] | undefined;
        status?: string | undefined;
        message?: string | undefined;
        timestamp?: string | undefined;
    } & {
        id: string;
    }>[]>;
    total: import("@kbn/config-schema").Type<number>;
    page: import("@kbn/config-schema").Type<number>;
    per_page: import("@kbn/config-schema").Type<number>;
}>;
export declare const findGapAutoFillSchedulerLogsParamsSchema: import("@kbn/config-schema").ObjectType<{
    id: import("@kbn/config-schema").Type<string>;
}>;
