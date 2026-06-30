export declare const mlAnomalyDetectionAlertParamsSchema: import("@kbn/config-schema").ObjectType<{
    jobSelection: import("@kbn/config-schema").ObjectType<{
        jobIds: import("@kbn/config-schema").Type<string[]>;
        groupIds: import("@kbn/config-schema").Type<string[]>;
    }>;
    /** Anomaly score threshold  */
    severity: import("@kbn/config-schema").Type<number>;
    /** Result type to alert upon  */
    resultType: import("@kbn/config-schema").Type<"record" | "bucket" | "influencer">;
    /** If true, include interim results from the anomaly detection job */
    includeInterim: import("@kbn/config-schema").Type<boolean>;
    /** User's override for the lookback interval */
    lookbackInterval: import("@kbn/config-schema").Type<string | null>;
    /** User's override for the top N buckets  */
    topNBuckets: import("@kbn/config-schema").Type<number | null>;
    /** Optional KQL filter */
    kqlQueryString: import("@kbn/config-schema").Type<string | null>;
}>;
