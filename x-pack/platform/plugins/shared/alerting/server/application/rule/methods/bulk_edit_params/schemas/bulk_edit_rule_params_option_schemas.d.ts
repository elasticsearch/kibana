export declare const bulkEditParamsOperationSchema: import("@kbn/config-schema").ObjectType<{
    operation: import("@kbn/config-schema").Type<"set">;
    field: import("@kbn/config-schema").Type<"note" | "exceptionsList" | "investigationFields" | "ruleSource">;
    value: import("@kbn/config-schema").Type<any>;
}>;
export declare const bulkEditParamsOperationsSchema: import("@kbn/config-schema").Type<Readonly<{
    value?: any;
} & {
    field: "note" | "exceptionsList" | "investigationFields" | "ruleSource";
    operation: "set";
}>[]>;
export declare const bulkEditRuleParamsOptionsSchema: import("@kbn/config-schema").ObjectType<{
    filter: import("@kbn/config-schema").Type<string | undefined>;
    ids: import("@kbn/config-schema").Type<string[] | undefined>;
    operations: import("@kbn/config-schema").Type<Readonly<{
        value?: any;
    } & {
        field: "note" | "exceptionsList" | "investigationFields" | "ruleSource";
        operation: "set";
    }>[]>;
}>;
export declare const bulkEditRuleParamsOperationSchema: import("@kbn/config-schema").ObjectType<{
    operation: import("@kbn/config-schema").Type<"set">;
    field: import("@kbn/config-schema").Type<"params.exceptionsList" | "params.note" | "params.investigationFields" | "params.ruleSource">;
    value: import("@kbn/config-schema").Type<any>;
}>;
export declare const bulkEditRuleParamsOperationsSchema: import("@kbn/config-schema").Type<Readonly<{
    value?: any;
} & {
    field: "params.exceptionsList" | "params.note" | "params.investigationFields" | "params.ruleSource";
    operation: "set";
}>[]>;
