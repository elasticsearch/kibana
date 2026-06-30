import { type Aggregation } from './fields';
/**
 * Enum for ML job aggregations.
 */
export declare enum ML_JOB_AGGREGATION {
    COUNT = "count",
    HIGH_COUNT = "high_count",
    LOW_COUNT = "low_count",
    NON_ZERO_COUNT = "non_zero_count",
    HIGH_NON_ZERO_COUNT = "high_non_zero_count",
    LOW_NON_ZERO_COUNT = "low_non_zero_count",
    DISTINCT_COUNT = "distinct_count",
    HIGH_DISTINCT_COUNT = "high_distinct_count",
    LOW_DISTINCT_COUNT = "low_distinct_count",
    MIN = "min",
    MAX = "max",
    MEDIAN = "median",
    LOW_MEDIAN = "low_median",
    HIGH_MEAN = "high_mean",
    MEAN = "mean",
    LOW_MEAN = "low_mean",
    HIGH_MEDIAN = "high_median",
    METRIC = "metric",
    VARP = "varp",
    HIGH_VARP = "high_varp",
    LOW_VARP = "low_varp",
    SUM = "sum",
    HIGH_SUM = "high_sum",
    LOW_SUM = "low_sum",
    NON_NULL_SUM = "non_null_sum",
    HIGH_NON_NULL_SUM = "high_non_null_sum",
    LOW_NON_NULL_SUM = "low_non_null_sum",
    RARE = "rare",
    FREQ_RARE = "freq_rare",
    INFO_CONTENT = "info_content",
    HIGH_INFO_CONTENT = "high_info_content",
    LOW_INFO_CONTENT = "low_info_content",
    TIME_OF_DAY = "time_of_day",
    TIME_OF_WEEK = "time_of_week",
    LAT_LONG = "lat_long"
}
/**
 * Custom enum for sparse data aggregations.
 */
export declare const SPARSE_DATA_AGGREGATIONS: readonly [ML_JOB_AGGREGATION.NON_ZERO_COUNT, ML_JOB_AGGREGATION.HIGH_NON_ZERO_COUNT, ML_JOB_AGGREGATION.LOW_NON_ZERO_COUNT, ML_JOB_AGGREGATION.NON_NULL_SUM, ML_JOB_AGGREGATION.HIGH_NON_NULL_SUM, ML_JOB_AGGREGATION.LOW_NON_NULL_SUM];
/**
 * Type definition of SPARSE_DATA_AGGREGATIONS values.
 */
export type SparseDataAggregation = (typeof SPARSE_DATA_AGGREGATIONS)[number];
/**
 * Enum for Kibana aggregations.
 */
export declare enum KIBANA_AGGREGATION {
    COUNT = "count",
    AVG = "avg",
    MAX = "max",
    MIN = "min",
    SUM = "sum",
    MEDIAN = "median",
    CARDINALITY = "cardinality"
}
/**
 * Enum for ES aggregatins.
 */
export declare enum ES_AGGREGATION {
    COUNT = "count",
    AVG = "avg",
    MAX = "max",
    MIN = "min",
    SUM = "sum",
    PERCENTILES = "percentiles",
    CARDINALITY = "cardinality"
}
/**
 * List of aggregations only supported by ML and which don't have an equivalent ES aggregation.
 * Note, not all aggs have a field list. Some aggs cannot be used with a field.
 */
export declare const mlJobAggregationsWithoutEsEquivalent: Aggregation[];
/**
 * ML job aggregation definitions.
 */
export declare const mlJobAggregations: Aggregation[];
