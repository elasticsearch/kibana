/**
 * Enum ML_DETECTOR_RULE_ACTION
 */
export declare enum ML_DETECTOR_RULE_ACTION {
    SKIP_MODEL_UPDATE = "skip_model_update",
    SKIP_RESULT = "skip_result",
    FORCE_TIME_SHIFT = "force_time_shift"
}
/**
 * Enum ML_DETECTOR_RULE_FILTER_TYPE
 */
export declare enum ML_DETECTOR_RULE_FILTER_TYPE {
    EXCLUDE = "exclude",
    INCLUDE = "include"
}
/**
 * Enum ML_DETECTOR_RULE_APPLIES_TO
 */
export declare enum ML_DETECTOR_RULE_APPLIES_TO {
    ACTUAL = "actual",
    DIFF_FROM_TYPICAL = "diff_from_typical",
    TYPICAL = "typical"
}
/**
 * Enum ML_DETECTOR_RULE_OPERATOR
 */
export declare enum ML_DETECTOR_RULE_OPERATOR {
    LESS_THAN = "lt",
    LESS_THAN_OR_EQUAL = "lte",
    GREATER_THAN = "gt",
    GREATER_THAN_OR_EQUAL = "gte"
}
/**
 * Enum ML_DETECTOR_RULE_PARAMS
 */
export declare enum ML_DETECTOR_RULE_PARAMS {
    FORCE_TIME_SHIFT = "force_time_shift"
}
/**
 * Enum ML_DETECTOR_RULE_PARAMS_FORCE_TIME_SHIFT
 */
export declare enum ML_DETECTOR_RULE_PARAMS_FORCE_TIME_SHIFT {
    TIME_SHIFT_AMOUNT = "time_shift_amount"
}
/**
 * List of detector functions which don't support rules with numeric conditions.
 */
export declare const ML_DETECTOR_RULE_CONDITIONS_NOT_SUPPORTED_FUNCTIONS: string[];
