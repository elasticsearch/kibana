export declare const bulkUntrackBodySchema: import("@kbn/config-schema").ObjectType<{
    isUsingQuery: import("@kbn/config-schema").Type<boolean>;
    indices: import("@kbn/config-schema").Type<string[] | undefined>;
    alertUuids: import("@kbn/config-schema").Type<string[] | undefined>;
    query: import("@kbn/config-schema").Type<any[] | undefined>;
    ruleTypeIds: import("@kbn/config-schema").Type<string[] | undefined>;
}>;
