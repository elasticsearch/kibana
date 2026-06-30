/**
 * Max length for the custom field description
 */
export declare const MAX_DATA_VIEW_FIELD_DESCRIPTION_LENGTH = 300;
export declare const MAX_SELECTABLE_SOURCE_FIELDS = 5;
export declare const MAX_SELECTABLE_GROUP_BY_TERMS = 4;
export declare const ES_QUERY_MAX_HITS_PER_EXECUTION = 10000;
export declare const MAX_GROUPS = 1000;
export declare enum Comparator {
    GT = ">",
    LT = "<",
    GT_OR_EQ = ">=",
    LT_OR_EQ = "<=",
    BETWEEN = "between",
    NOT_BETWEEN = "notBetween"
}
/**
 * All runtime field types.
 * @public
 */
export declare const RUNTIME_FIELD_TYPES: readonly ["keyword", "long", "double", "date", "ip", "boolean", "geo_point", "composite"];
export declare const RUNTIME_FIELD_TYPES2: readonly ["keyword", "long", "double", "date", "ip", "boolean", "geo_point"];
