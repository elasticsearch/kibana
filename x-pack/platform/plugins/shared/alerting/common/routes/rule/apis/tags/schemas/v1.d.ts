export declare const ruleTagsRequestQuerySchema: import("@kbn/config-schema").ObjectType<{
    page: import("@kbn/config-schema").Type<number>;
    per_page: import("@kbn/config-schema").Type<number | undefined>;
    search: import("@kbn/config-schema").Type<string | undefined>;
    rule_type_ids: import("@kbn/config-schema").Type<string | string[] | undefined>;
}>;
export declare const ruleTagsFormattedResponseSchema: import("@kbn/config-schema").ObjectType<{
    total: import("@kbn/config-schema").Type<number>;
    page: import("@kbn/config-schema").Type<number>;
    perPage: import("@kbn/config-schema").Type<number>;
    data: import("@kbn/config-schema").Type<string[]>;
}>;
