export declare const bulkDisableRulesRequestBodySchema: import("@kbn/config-schema").ObjectType<{
    filter: import("@kbn/config-schema").Type<string | undefined>;
    ids: import("@kbn/config-schema").Type<string[] | undefined>;
    untrack: import("@kbn/config-schema").Type<boolean | undefined>;
}>;
