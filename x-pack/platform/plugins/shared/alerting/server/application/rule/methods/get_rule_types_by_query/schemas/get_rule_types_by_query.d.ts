export declare const getRuleTypesByQueryParamsSchema: import("@kbn/config-schema").ObjectType<{
    ids: import("@kbn/config-schema").Type<string[] | undefined>;
    filter: import("@kbn/config-schema").Type<string | undefined>;
}>;
export declare const getRuleTypesByQueryResponseSchema: import("@kbn/config-schema").ObjectType<{
    ruleTypes: import("@kbn/config-schema").Type<string[]>;
}>;
