export declare const validFields: {
    readonly EXCEPTIONS_LIST: "exceptionsList";
    readonly NOTE: "note";
    readonly INVESTIGATION_FIELDS: "investigationFields";
    readonly RULE_SOURCE: "ruleSource";
};
export type ValidReadAuthEditFields = (typeof validFields)[keyof typeof validFields];
