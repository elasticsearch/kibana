export declare const findBackfillExamples: () => string;
export declare const findQuerySchema: import("@kbn/config-schema").ObjectType<{
    end: import("@kbn/config-schema").Type<string | undefined>;
    page: import("@kbn/config-schema").Type<number>;
    per_page: import("@kbn/config-schema").Type<number>;
    rule_ids: import("@kbn/config-schema").Type<string | undefined>;
    initiator: import("@kbn/config-schema").Type<"user" | "system" | undefined>;
    start: import("@kbn/config-schema").Type<string | undefined>;
    sort_field: import("@kbn/config-schema").Type<"start" | "createdAt" | undefined>;
    sort_order: import("@kbn/config-schema").Type<"desc" | "asc" | undefined>;
}>;
export declare const findResponseSchema: import("@kbn/config-schema").ObjectType<{
    page: import("@kbn/config-schema").Type<number>;
    per_page: import("@kbn/config-schema").Type<number>;
    total: import("@kbn/config-schema").Type<number>;
    data: import("@kbn/config-schema").Type<Readonly<{
        end?: string | undefined;
        initiator_id?: string | undefined;
    } & {
        id: string;
        start: string;
        status: "error" | "pending" | "running" | "complete" | "timeout";
        duration: string;
        schedule: Readonly<{} & {
            status: "error" | "pending" | "running" | "complete" | "timeout";
            interval: string;
            run_at: string;
        }>[];
        enabled: boolean;
        rule: Readonly<{
            api_key_created_by_user?: boolean | null | undefined;
        } & {
            id: string;
            name: string;
            schedule: Readonly<{} & {
                interval: string;
            }>;
            params: Record<string, any>;
            enabled: boolean;
            tags: string[];
            consumer: string;
            created_at: string;
            updated_at: string;
            created_by: string | null;
            updated_by: string | null;
            revision: number;
            api_key_owner: string | null;
            rule_type_id: string;
        }>;
        space_id: string;
        created_at: string;
        initiator: "user" | "system";
    }>[]>;
}>;
