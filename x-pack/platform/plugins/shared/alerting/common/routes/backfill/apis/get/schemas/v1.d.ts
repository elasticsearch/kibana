export declare const getBackfillExamples: () => string;
export declare const getParamsSchema: import("@kbn/config-schema").ObjectType<{
    id: import("@kbn/config-schema").Type<string>;
}>;
export declare const getResponseSchema: import("@kbn/config-schema").ObjectType<{
    id: import("@kbn/config-schema").Type<string>;
    created_at: import("@kbn/config-schema").Type<string>;
    duration: import("@kbn/config-schema").Type<string>;
    enabled: import("@kbn/config-schema").Type<boolean>;
    rule: import("@kbn/config-schema").ObjectType<{
        id: import("@kbn/config-schema").Type<string>;
        name: import("@kbn/config-schema").Type<string>;
        tags: import("@kbn/config-schema").Type<string[]>;
        rule_type_id: import("@kbn/config-schema").Type<string>;
        params: import("@kbn/config-schema").Type<Record<string, any>>;
        api_key_owner: import("@kbn/config-schema").Type<string | null>;
        api_key_created_by_user: import("@kbn/config-schema").Type<boolean | null | undefined>;
        consumer: import("@kbn/config-schema").Type<string>;
        enabled: import("@kbn/config-schema").Type<boolean>;
        schedule: import("@kbn/config-schema").ObjectType<{
            interval: import("@kbn/config-schema").Type<string>;
        }>;
        created_by: import("@kbn/config-schema").Type<string | null>;
        updated_by: import("@kbn/config-schema").Type<string | null>;
        created_at: import("@kbn/config-schema").Type<string>;
        updated_at: import("@kbn/config-schema").Type<string>;
        revision: import("@kbn/config-schema").Type<number>;
    }>;
    space_id: import("@kbn/config-schema").Type<string>;
    initiator: import("@kbn/config-schema").Type<"user" | "system">;
    initiator_id: import("@kbn/config-schema").Type<string | undefined>;
    start: import("@kbn/config-schema").Type<string>;
    status: import("@kbn/config-schema").Type<"error" | "pending" | "running" | "complete" | "timeout">;
    end: import("@kbn/config-schema").Type<string | undefined>;
    schedule: import("@kbn/config-schema").Type<Readonly<{} & {
        status: "error" | "pending" | "running" | "complete" | "timeout";
        interval: string;
        run_at: string;
    }>[]>;
}>;
