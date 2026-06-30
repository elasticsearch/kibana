export declare const queryDelaySettingsResponseBodySchema: import("@kbn/config-schema").ObjectType<{
    delay: import("@kbn/config-schema").Type<number>;
    created_by: import("@kbn/config-schema").Type<string | null>;
    updated_by: import("@kbn/config-schema").Type<string | null>;
    created_at: import("@kbn/config-schema").Type<string>;
    updated_at: import("@kbn/config-schema").Type<string>;
}>;
export declare const queryDelaySettingsResponseSchema: import("@kbn/config-schema").ObjectType<{
    body: import("@kbn/config-schema").ObjectType<{
        delay: import("@kbn/config-schema").Type<number>;
        created_by: import("@kbn/config-schema").Type<string | null>;
        updated_by: import("@kbn/config-schema").Type<string | null>;
        created_at: import("@kbn/config-schema").Type<string>;
        updated_at: import("@kbn/config-schema").Type<string>;
    }>;
}>;
