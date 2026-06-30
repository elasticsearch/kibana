export declare const getGlobalExecutionSummarySchema: import("@kbn/config-schema").ObjectType<{
    date_start: import("@kbn/config-schema").Type<string>;
    date_end: import("@kbn/config-schema").Type<string>;
}>;
export declare const getGlobalExecutionSummaryResponseBodySchema: import("@kbn/config-schema").ObjectType<{
    executions: import("@kbn/config-schema").ObjectType<{
        total: import("@kbn/config-schema").Type<number>;
        success: import("@kbn/config-schema").Type<number>;
    }>;
    latestExecutionSummary: import("@kbn/config-schema").ObjectType<{
        success: import("@kbn/config-schema").Type<number>;
        failure: import("@kbn/config-schema").Type<number>;
        warning: import("@kbn/config-schema").Type<number>;
    }>;
}>;
