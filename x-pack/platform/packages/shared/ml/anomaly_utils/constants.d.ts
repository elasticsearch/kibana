/**
 * Custom enum for anomaly result type
 */
export declare const ML_ANOMALY_RESULT_TYPE: {
    readonly BUCKET: "bucket";
    readonly RECORD: "record";
    readonly INFLUENCER: "influencer";
};
/**
 * Array of partition fields.
 */
export declare const ML_PARTITION_FIELDS: readonly ["partition_field", "over_field", "by_field"];
/**
 * Machine learning job id attribute name.
 */
export declare const ML_JOB_ID = "job_id";
/**
 * Machine learning partition field value attribute name.
 */
export declare const ML_PARTITION_FIELD_VALUE = "partition_field_value";
