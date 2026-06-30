export declare const findGapAutoFillSchedulerLogsParamsSchema: import("@kbn/config-schema").ObjectType<{
    id: import("@kbn/config-schema").Type<string>;
    start: import("@kbn/config-schema").Type<string>;
    end: import("@kbn/config-schema").Type<string>;
    page: import("@kbn/config-schema").Type<number>;
    perPage: import("@kbn/config-schema").Type<number>;
    sortField: import("@kbn/config-schema").Type<string>;
    sortDirection: import("@kbn/config-schema").Type<"desc" | "asc">;
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
        ruleId?: string | undefined;
        processedGaps?: number | undefined;
    } & {}>[] | undefined>;
}>;
export declare const gapAutoFillSchedulerLogsResultSchema: import("@kbn/config-schema").ObjectType<{
    data: import("@kbn/config-schema").Type<Readonly<{
        results?: Readonly<{
            status?: string | undefined;
            error?: string | undefined;
            ruleId?: string | undefined;
            processedGaps?: number | undefined;
        } & {}>[] | undefined;
        status?: string | undefined;
        message?: string | undefined;
        timestamp?: string | undefined;
    } & {
        id: string;
    }>[]>;
    total: import("@kbn/config-schema").Type<number>;
    page: import("@kbn/config-schema").Type<number>;
    perPage: import("@kbn/config-schema").Type<number>;
}>;
