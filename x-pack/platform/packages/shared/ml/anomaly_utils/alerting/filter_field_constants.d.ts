/**
 * Base record fields that are always available for filtering anomaly records,
 * regardless of job configuration.
 */
export declare const BASE_RECORD_FILTER_FIELDS: readonly ["initial_record_score", "function", "field_name"];
/**
 * Influencer fields for anomaly records when jobs have influencers configured.
 */
export declare const RECORD_INFLUENCER_FIELDS: readonly ["influencers.influencer_field_name", "influencers.influencer_field_values"];
/**
 * Influencer fields available for filtering anomaly influencers.
 */
export declare const INFLUENCER_FILTER_FIELDS: readonly ["influencer_field_name", "influencer_field_value"];
/**
 * Detector field names used in anomaly records.
 */
export declare const DETECTOR_FILTER_FIELDS: {
    readonly PARTITION_FIELD_NAME: "partition_field_name";
    readonly PARTITION_FIELD_VALUE: "partition_field_value";
    readonly BY_FIELD_NAME: "by_field_name";
    readonly BY_FIELD_VALUE: "by_field_value";
    readonly OVER_FIELD_NAME: "over_field_name";
    readonly OVER_FIELD_VALUE: "over_field_value";
};
/**
 * Actual/typical value fields for non-population jobs.
 */
export declare const TOP_LEVEL_ACTUAL_TYPICAL_FIELDS: readonly ["actual", "typical"];
/**
 * Nested field for population jobs (actual/typical are nested under causes).
 */
export declare const NESTED_ACTUAL_TYPICAL_FIELDS: readonly ["causes.actual", "causes.typical"];
export declare const DISALLOWED_FILTER_FIELDS: readonly ["job_id", "is_interim", "record_score", "influencer_score"];
