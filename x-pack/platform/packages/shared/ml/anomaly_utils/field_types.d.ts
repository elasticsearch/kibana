/**
 * Custom enum for ML job field types
 */
export declare const ML_JOB_FIELD_TYPES: {
    readonly BOOLEAN: "boolean";
    readonly DATE: "date";
    readonly GEO_POINT: "geo_point";
    readonly GEO_SHAPE: "geo_shape";
    readonly IP: "ip";
    readonly KEYWORD: "keyword";
    readonly NUMBER: "number";
    readonly TEXT: "text";
    readonly UNKNOWN: "unknown";
};
/**
 * Union type for ML_JOB_FIELD_TYPES
 */
export type MlJobFieldType = (typeof ML_JOB_FIELD_TYPES)[keyof typeof ML_JOB_FIELD_TYPES];
/**
 * MLCATEGORY
 */
export declare const MLCATEGORY = "mlcategory";
/**
 * For use as summary_count_field_name in datafeeds which use aggregations.
 */
export declare const DOC_COUNT = "doc_count";
/**
 * Elasticsearch field showing number of documents aggregated in a single summary field for
 * pre-aggregated data. For use as summary_count_field_name in datafeeds which do not use aggregations.
 */
export declare const _DOC_COUNT = "_doc_count";
/**
 * List of system fields we don't want to display.
 */
export declare const OMIT_FIELDS: string[];
