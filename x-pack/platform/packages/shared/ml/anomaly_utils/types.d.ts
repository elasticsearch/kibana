import type { TypeOf } from '@kbn/config-schema';
import type { ML_PARTITION_FIELDS, ML_ANOMALY_RESULT_TYPE } from './constants';
import type { MlKibanaUrlConfig } from './custom_urls';
import type { criteriaFieldSchema, influencerSchema } from './schemas';
/**
 * Influencers are the entities that have contributed to, or are to blame for, the anomalies.
 * Influencer results are available only if an influencer_field_name is specified in the job configuration.
 */
export interface MlInfluencer {
    /**
     * The field name of the influencer.
     */
    influencer_field_name: string;
    /**
     * The entities that influenced, contributed to, or were to blame for the anomaly.
     */
    influencer_field_values: string[];
}
/**
 * Alias of MlAnomalyRecordDoc
 */
export type MLAnomalyDoc = MlAnomalyRecordDoc;
/**
 * MlRecordForInfluencer, an alias based on MlAnomalyRecordDoc.
 */
export type MlRecordForInfluencer = MlAnomalyRecordDoc;
/**
 * Anomaly record document. Records contain the detailed analytical results.
 * They describe the anomalous activity that has been identified in the input data based on the detector configuration.
 */
export interface MlAnomalyRecordDoc {
    /**
     * Index signature to cover dynamic attributes added to the record depending on the fields being analyzed.
     * For example, if the job is analyzing hostname as a by field, then a field hostname is added to the result document.
     */
    [key: string]: any;
    /**
     * The identifier for the anomaly detection job.
     */
    job_id: string;
    /**
     * The type of the result document, which is 'record' for record level results.
     */
    result_type: string;
    /**
     * The probability of the individual anomaly occurring, in the range 0 to 1.
     * This value can be held to a high precision of over 300 decimal places,
     * so the record_score is provided as a human-readable and friendly interpretation of this.
     */
    probability: number;
    /**
     * A normalized score between 0-100, which is based on the probability of the anomalousness of this record.
     * Unlike initial_record_score, this value will be updated by a re-normalization process as new data is analyzed.
     */
    record_score: number;
    /**
     * A normalized score between 0-100, which is based on the probability of the anomalousness of this record.
     * This is the initial value that was calculated at the time the bucket was processed.
     */
    initial_record_score: number;
    /**
     * The length of the bucket in seconds. This value matches the bucket_span that is specified in the job.
     */
    bucket_span: number;
    /**
     * A unique identifier for the detector. This identifier is based on the order of the detectors
     * in the analysis configuration, starting at zero.
     */
    detector_index: number;
    /**
     * If true, this is an interim result. In other words, the results are calculated based on partial input data.
     */
    is_interim: boolean;
    /**
     * The start time of the bucket for which these results were calculated.
     */
    timestamp: number;
    /**
     * The field used to segment the analysis.
     * When you use this property, you have completely independent baselines for each value of this field.
     */
    partition_field_name?: string;
    /**
     * The value of the partition field.
     */
    partition_field_value?: string | number;
    /**
     * The function in which the anomaly occurs, as specified in the detector configuration. For example, max.
     */
    function: string;
    /**
     * The description of the function in which the anomaly occurs, as specified in the detector configuration.
     */
    function_description: string;
    /**
     * Certain functions require a field to operate on, for example, sum().
     * For those functions, this value is the name of the field to be analyzed.
     */
    field_name?: string;
    /**
     * The typical value for the bucket, according to analytical modeling.
     */
    typical?: number[];
    /**
     * The actual value for the bucket.
     */
    actual?: number[];
    /**
     * If influencers was specified in the detector configuration, this array contains influencers
     * that contributed to or were to blame for an anomaly.
     */
    influencers?: MlInfluencer[];
    /**
     * The field used to split the data. In particular, this property is used for analyzing the splits
     * with respect to their own history. It is used for finding unusual values in the context of the split.
     */
    by_field_name?: string;
    /**
     * The value of the by field.
     */
    by_field_value?: string;
    /**
     * The field used to split the data. In particular, this property is used for analyzing
     * the splits with respect to the history of all splits.
     * It is used for finding unusual values in the population of all splits.
     */
    over_field_name?: string;
    /**
     * The value of the over field.
     */
    over_field_value?: string;
    /**
     * For population analysis, this property contains an array of anomaly records that are the causes
     * for the anomaly that has been identified for the over field. If no over fields exist, this field is not present.
     * This sub-resource contains the most anomalous records for the over_field_name.
     * The causes resource contains similar elements to the record resource.
     * Probability and scores are not applicable to causes.
     */
    causes?: Array<{
        function: string;
        function_description: string;
        probability: number;
        actual: number[];
        typical: number[];
        field_name?: string;
        over_field_name?: string;
        over_field_value?: string;
        by_field_name?: string;
        by_field_value?: string;
        partition_field_name?: string;
        partition_field_value?: string | number;
    }>;
    /**
     * An indication of how strongly an anomaly is multi bucket or single bucket.
     * The value is on a scale of -5.0 to +5.0 where -5.0 means the anomaly is
     * purely single bucket and +5.0 means the anomaly is purely multi bucket.
     */
    multi_bucket_impact?: number;
    /**
     * An explanation for the anomaly score
     */
    anomaly_score_explanation?: {
        /**
         * Type of the detected anomaly: spike or dip.
         */
        anomaly_type?: 'dip' | 'spike';
        /**
         * Length of the detected anomaly in the number of buckets.
         */
        anomaly_length?: number;
        /**
         * Impact of the deviation between actual and typical in the current bucket.
         */
        single_bucket_impact?: number;
        /**
         * Impact of the deviation between actual and typical in the past 12 buckets.
         */
        multi_bucket_impact?: number;
        /**
         * Impact of the statistical properties of the detected anomalous interval.
         */
        anomaly_characteristics_impact?: number;
        /**
         * Lower bound of the 95% confidence interval.
         */
        lower_confidence_bound?: number;
        /**
         * Typical (expected) value for this bucket.
         */
        typical_value?: number;
        /**
         * Upper bound of the 95% confidence interval.
         */
        upper_confidence_bound?: number;
        /**
         * Indicates a reduction of anomaly score for the bucket with large confidence intervals.
         */
        high_variance_penalty?: boolean;
        /**
         * Indicates a reduction of anomaly score if the bucket contains fewer samples than historically expected.
         */
        incomplete_bucket_penalty?: boolean;
        /**
         * Indicates whether the prior distribution of the observed time series is multi-modal or has a single mode.
         */
        multimodal_distribution?: boolean;
    };
}
/**
 * Anomaly table record, representing the fields shown in the ML UI anomalies table.
 */
export interface MlAnomaliesTableRecord {
    /**
     * The start time of the interval for which the anomaly data in the table is being aggregated.
     * Anomalies in the table are commonly aggregated by day, hour, or at the bucket span of the job.
     */
    time: number;
    /**
     * The source anomaly record document, containing the full source anomaly record fields.
     */
    source: MlAnomalyRecordDoc;
    /**
     * Unique identifier for the table row.
     */
    rowId: string;
    /**
     * Identifier for the anomaly detection job.
     */
    jobId: string;
    /**
     * A unique identifier for the detector.
     * This identifier is based on the order of the detectors in the analysis configuration, starting at zero.
     */
    detectorIndex: number;
    /**
     * Severity of the anomaly displaying the anomaly record_score, a normalized score between 0-100,
     * which is based on the probability of the anomalousness of this record.
     */
    severity: number;
    /**
     * The entity name of the anomaly, looking first for a by_field, then over_field,
     * then partition_field, returning undefined if none of these fields are present.
     */
    entityName?: string;
    /**
     * The value of the entity field.
     */
    entityValue?: any;
    /**
     * If influencers was specified in the detector configuration, this array contains influencers
     * that contributed to or were to blame for an anomaly.
     */
    influencers?: Array<{
        [key: string]: any;
    }>;
    /**
     * The actual value for the anomaly.
     */
    actual?: number[];
    /**
     * Property used by the table to sort anomalies by their actual value,
     * which is a single numeric value rather than the underlying arrays.
     */
    actualSort?: any;
    /**
     * The typical value for the anomaly.
     */
    typical?: number[];
    /**
     * Property used by the table to sort anomalies by their typical value,
     * which is a single numeric value rather than the underlying arrays.
     */
    typicalSort?: any;
    /**
     * Property used by the table to sort anomalies by the description of how the
     * actual value compares to the typical value.
     */
    metricDescriptionSort?: number;
    /**
     * List of custom URL drilldowns from the table row to other pages such as
     * Discover, Dashboard or other web pages.
     */
    customUrls?: MlKibanaUrlConfig[];
    /**
     * Returns true if the anomaly record represented by the table row is for a time series
     * which can be plotted by the ML UI in an anomaly chart.
     */
    isTimeSeriesViewRecord?: boolean;
    /**
     * Returns true if the anomaly record represented by the table row can be shown in the maps plugin
     */
    isGeoRecord?: boolean;
    /**
     * Returns true if the job has the model plot enabled
     */
    modelPlotEnabled?: boolean;
}
/**
 * Customized version of AnomaliesTableRecord which inserts the detector description
 * and rules length.
 * Used by the AnomaliesTable component
 */
export interface MlAnomaliesTableRecordExtended extends MlAnomaliesTableRecord {
    /**
     * The detector name.
     */
    detector: string;
    /**
     * The length of the rule.
     */
    rulesLength?: number;
}
/**
 * Union type for partitiion field types.
 */
export type MlPartitionFieldsType = (typeof ML_PARTITION_FIELDS)[number];
/**
 * Anomaly record document for categorizer stats.
 */
export interface MlAnomalyCategorizerStatsDoc {
    /**
     * Index signature to cover dynamic attributes added to the record depending on the fields being analyzed.
     * For example, if the job is analyzing hostname as a by field, then a field hostname is added to the result document.
     */
    [key: string]: any;
    /**
     * The identifier for the anomaly detection job.
     */
    job_id: string;
    /**
     * The type of the result document.
     */
    result_type: 'categorizer_stats';
    /**
     * The field used to segment the analysis.
     * When you use this property, you have completely independent baselines for each value of this field.
     */
    partition_field_name?: string;
    /**
     * The value of the partition field.
     */
    partition_field_value?: string;
    /**
     * The number of documents.
     */
    categorized_doc_count: number;
    /**
     * The total number of categories.
     */
    total_category_count: number;
    /**
     * The number of frequent categories.
     */
    frequent_category_count: number;
    /**
     * The number of rare categories.
     */
    rare_category_count: number;
    /**
     * The number of dead categories.
     */
    dead_category_count: number;
    /**
     * The number of failed categories.
     */
    failed_category_count: number;
    /**
     * The categorization status.
     */
    categorization_status: 'ok' | 'warn';
    /**
     * The log time.
     */
    log_time: number;
    /**
     * The start time of the bucket for which these results were calculated.
     */
    timestamp: number;
}
/**
 * Union type for entity field types.
 */
export type MlEntityFieldType = 'partition_field' | 'over_field' | 'by_field';
/**
 * The type of the anomaly result, such as bucket, influencer or record.
 */
export type MlAnomalyResultType = (typeof ML_ANOMALY_RESULT_TYPE)[keyof typeof ML_ANOMALY_RESULT_TYPE];
export type AnomalyDateFunction = 'time_of_day' | 'time_of_week';
export type CriteriaField = TypeOf<typeof criteriaFieldSchema>;
export type Influencer = TypeOf<typeof influencerSchema>;
