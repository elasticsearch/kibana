export declare const findBackfillQuerySchema: import("@kbn/config-schema").ObjectType<{
    end: import("@kbn/config-schema").Type<string | undefined>;
    page: import("@kbn/config-schema").Type<number>;
    perPage: import("@kbn/config-schema").Type<number>;
    ruleIds: import("@kbn/config-schema").Type<string | undefined>;
    initiator: import("@kbn/config-schema").Type<"user" | "system" | undefined>;
    initiatorId: import("@kbn/config-schema").Type<string | undefined>;
    start: import("@kbn/config-schema").Type<string | undefined>;
    sortField: import("@kbn/config-schema").Type<"start" | "createdAt" | undefined>;
    sortOrder: import("@kbn/config-schema").Type<"desc" | "asc" | undefined>;
}>;
