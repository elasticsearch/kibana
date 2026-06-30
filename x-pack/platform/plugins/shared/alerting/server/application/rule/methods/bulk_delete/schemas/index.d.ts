export declare const bulkDeleteRulesRequestBodySchema: import("@kbn/config-schema").ObjectType<{
    filter: import("@kbn/config-schema").Type<string | undefined>;
    ids: import("@kbn/config-schema").Type<string[] | undefined>;
    ignoreInternalRuleTypes: import("@kbn/config-schema").Type<boolean | undefined>;
}>;
