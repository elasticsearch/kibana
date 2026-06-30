export declare const healthFrameworkResponseBodySchema: import("@kbn/config-schema").ObjectType<{
    is_sufficiently_secure: import("@kbn/config-schema").Type<boolean>;
    has_permanent_encryption_key: import("@kbn/config-schema").Type<boolean>;
    alerting_framework_health: import("@kbn/config-schema").ObjectType<{
        decryption_health: import("@kbn/config-schema").ObjectType<{
            status: import("@kbn/config-schema").Type<"error" | "ok" | "warn">;
            timestamp: import("@kbn/config-schema").Type<string>;
        }>;
        execution_health: import("@kbn/config-schema").ObjectType<{
            status: import("@kbn/config-schema").Type<"error" | "ok" | "warn">;
            timestamp: import("@kbn/config-schema").Type<string>;
        }>;
        read_health: import("@kbn/config-schema").ObjectType<{
            status: import("@kbn/config-schema").Type<"error" | "ok" | "warn">;
            timestamp: import("@kbn/config-schema").Type<string>;
        }>;
    }>;
}>;
export declare const healthFrameworkResponseSchema: import("@kbn/config-schema").ObjectType<{
    body: import("@kbn/config-schema").ObjectType<{
        is_sufficiently_secure: import("@kbn/config-schema").Type<boolean>;
        has_permanent_encryption_key: import("@kbn/config-schema").Type<boolean>;
        alerting_framework_health: import("@kbn/config-schema").ObjectType<{
            decryption_health: import("@kbn/config-schema").ObjectType<{
                status: import("@kbn/config-schema").Type<"error" | "ok" | "warn">;
                timestamp: import("@kbn/config-schema").Type<string>;
            }>;
            execution_health: import("@kbn/config-schema").ObjectType<{
                status: import("@kbn/config-schema").Type<"error" | "ok" | "warn">;
                timestamp: import("@kbn/config-schema").Type<string>;
            }>;
            read_health: import("@kbn/config-schema").ObjectType<{
                status: import("@kbn/config-schema").Type<"error" | "ok" | "warn">;
                timestamp: import("@kbn/config-schema").Type<string>;
            }>;
        }>;
    }>;
}>;
