export declare const aggregateOptionsSchema: import("@kbn/config-schema").ObjectType<{
    search: import("@kbn/config-schema").Type<string | undefined>;
    defaultSearchOperator: import("@kbn/config-schema").Type<"AND" | "OR" | undefined>;
    searchFields: import("@kbn/config-schema").Type<string[] | undefined>;
    hasReference: import("@kbn/config-schema").Type<Readonly<{} & {
        type: string;
        id: string;
    }> | undefined>;
    ruleTypeIds: import("@kbn/config-schema").Type<string[] | undefined>;
    consumers: import("@kbn/config-schema").Type<string[] | undefined>;
    filter: import("@kbn/config-schema").Type<string | Record<string, any> | undefined>;
    page: import("@kbn/config-schema").Type<number | undefined>;
    perPage: import("@kbn/config-schema").Type<number | undefined>;
}>;
