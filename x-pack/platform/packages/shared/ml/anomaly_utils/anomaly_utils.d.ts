import type { TypeOf } from '@kbn/config-schema';
import type { MlSeverityType } from './anomaly_severity';
import type { MlAnomaliesTableRecord, MlAnomalyRecordDoc } from './types';
import type { mlEntityFieldSchema } from './schemas';
/**
 * Enum of entity field types
 */
export declare enum ML_ENTITY_FIELD_TYPE {
    BY = "by",
    OVER = "over",
    PARTITION = "partition"
}
/**
 * Custom enum of entity field operations
 */
export declare const ML_ENTITY_FIELD_OPERATIONS: {
    readonly ADD: "+";
    readonly REMOVE: "-";
};
/**
 * Union type of entity field operations
 */
export type MlEntityFieldOperation = (typeof ML_ENTITY_FIELD_OPERATIONS)[keyof typeof ML_ENTITY_FIELD_OPERATIONS];
/**
 * Interface of an entity field
 */
export type MlEntityField = TypeOf<typeof mlEntityFieldSchema>;
/**
 * Returns whether the anomaly is in a categorization analysis.
 * @param anomaly Anomaly table record
 */
export declare function isCategorizationAnomaly(anomaly: MlAnomaliesTableRecord): boolean;
/**
 * Returns a severity label (one of critical, major, minor, warning, low or unknown)
 * for the supplied normalized anomaly score (a value between 0 and 100), where scores
 * less than 3 are assigned a severity of 'low'.
 * @param normalizedScore - A normalized score between 0-100, which is based on the probability of the anomalousness of this record
 */
export declare function getSeverityWithLow(normalizedScore: number): MlSeverityType;
/**
 * Returns whether the anomaly record should be indicated in the UI as a multi-bucket anomaly,
 * for example in anomaly charts with a cross-shaped marker.
 * @param anomaly Anomaly table record
 */
export declare function isMultiBucketAnomaly(anomaly: MlAnomalyRecordDoc): boolean;
/**
 * Returns the value on a scale of 1 to 5, from a log based scaled value for an
 * anomaly score explanation impact field, such as anomaly_characteristics_impact,
 * single_bucket_impact or multi_bucket_impact.
 * @param score value from an impact field from the anomaly_score_explanation.
 * @returns numeric value on an integer scale of 1 (low) to 5 (high).
 */
export declare function getAnomalyScoreExplanationImpactValue(score: number): number;
/**
 * Returns the name of the field to use as the entity name from the source record
 * obtained from Elasticsearch. The function looks first for a by_field, then over_field,
 * then partition_field, returning undefined if none of these fields are present.
 * @param record - anomaly record result for which to obtain the entity field name.
 */
export declare function getEntityFieldName(record: MlAnomalyRecordDoc): string | undefined;
/**
 * Returns the value of the field to use as the entity value from the source record
 * obtained from Elasticsearch. The function looks first for a by_field, then over_field,
 * then partition_field, returning undefined if none of these fields are present.
 * @param record - anomaly record result for which to obtain the entity field value.
 */
export declare function getEntityFieldValue(record: MlAnomalyRecordDoc): string | number | undefined;
/**
 * Returns the list of partitioning entity fields for the source record as a list
 * of objects in the form { fieldName: airline, fieldValue: AAL, fieldType: partition }
 * @param record - anomaly record result for which to obtain the entity field list.
 */
export declare function getEntityFieldList(record: MlAnomalyRecordDoc): MlEntityField[];
/**
 * Returns whether actual values should be displayed for a record with the specified function description.
 * Note that the 'function' field in a record contains what the user entered e.g. 'high_count',
 * whereas the 'function_description' field holds a ML-built display hint for function e.g. 'count'.
 * @param functionDescription - function_description value for the anomaly record
 */
export declare function showActualForFunction(functionDescription: string): boolean;
/**
 * Returns whether typical values should be displayed for a record with the specified function description.
 * Note that the 'function' field in a record contains what the user entered e.g. 'high_count',
 * whereas the 'function_description' field holds a ML-built display hint for function e.g. 'count'.
 * @param functionDescription - function_description value for the anomaly record
 */
export declare function showTypicalForFunction(functionDescription: string): boolean;
/**
 * Returns whether a rule can be configured against the specified anomaly.
 * @param record - anomaly record result
 */
export declare function isRuleSupported(record: MlAnomalyRecordDoc): boolean;
/**
 * Two functions for converting aggregation type names.
 * ML and ES use different names for the same function.
 * Possible values for ML aggregation type are (defined in lib/model/CAnomalyDetector.cc):
 *    count
 *    distinct_count
 *    rare
 *    info_content
 *    mean
 *    median
 *    min
 *    max
 *    varp
 *    sum
 *    lat_long
 *    time
 * The input to toES and the output from toML correspond to the value of the
 * function_description field of anomaly records.
 */
export declare const aggregationTypeTransform: {
    /**
     * transform from ML to ES agg type
     * @param {string} oldAggType the aggregation type to be transformed
     * @returns {string}
     */
    toES(oldAggType: string): string;
    /**
     * transform from ES to ML agg type
     * @param {string} oldAggType the aggregation type to be transformed
     * @returns {string}
     */
    toML(oldAggType: string): string;
};
