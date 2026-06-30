import { z } from '@kbn/zod/v4';
/**
 * Allowed field names to sort Attack Discovery results by. Clients should only pass one of the listed values.
 */
export declare const AttackDiscoveryFindSortField: z.ZodLiteral<"@timestamp">;
export type AttackDiscoveryFindSortField = z.infer<typeof AttackDiscoveryFindSortField>;
export declare const AttackDiscoveryFindRequestQuery: z.ZodObject<{
    alert_ids: z.ZodOptional<z.ZodPreprocess<z.ZodArray<z.ZodString>>>;
    connector_names: z.ZodOptional<z.ZodPreprocess<z.ZodArray<z.ZodString>>>;
    enable_field_rendering: z.ZodDefault<z.ZodOptional<z.ZodUnion<readonly [z.ZodPipe<z.ZodEnum<{
        true: "true";
        false: "false";
    }>, z.ZodTransform<boolean, "true" | "false">>, z.ZodBoolean]> & import("@kbn/zod-helpers/v4/kbn_zod_types/kbn_zod_type").KbnZodType>>;
    end: z.ZodOptional<z.ZodString>;
    ids: z.ZodOptional<z.ZodPreprocess<z.ZodArray<z.ZodString>>>;
    include_unique_alert_ids: z.ZodOptional<z.ZodUnion<readonly [z.ZodPipe<z.ZodEnum<{
        true: "true";
        false: "false";
    }>, z.ZodTransform<boolean, "true" | "false">>, z.ZodBoolean]> & import("@kbn/zod-helpers/v4/kbn_zod_types/kbn_zod_type").KbnZodType>;
    page: z.ZodDefault<z.ZodOptional<z.ZodCoercedNumber<unknown>>>;
    per_page: z.ZodDefault<z.ZodOptional<z.ZodCoercedNumber<unknown>>>;
    search: z.ZodOptional<z.ZodString>;
    shared: z.ZodOptional<z.ZodUnion<readonly [z.ZodPipe<z.ZodEnum<{
        true: "true";
        false: "false";
    }>, z.ZodTransform<boolean, "true" | "false">>, z.ZodBoolean]> & import("@kbn/zod-helpers/v4/kbn_zod_types/kbn_zod_type").KbnZodType>;
    include_all_authors: z.ZodOptional<z.ZodUnion<readonly [z.ZodPipe<z.ZodEnum<{
        true: "true";
        false: "false";
    }>, z.ZodTransform<boolean, "true" | "false">>, z.ZodBoolean]> & import("@kbn/zod-helpers/v4/kbn_zod_types/kbn_zod_type").KbnZodType>;
    scheduled: z.ZodOptional<z.ZodUnion<readonly [z.ZodPipe<z.ZodEnum<{
        true: "true";
        false: "false";
    }>, z.ZodTransform<boolean, "true" | "false">>, z.ZodBoolean]> & import("@kbn/zod-helpers/v4/kbn_zod_types/kbn_zod_type").KbnZodType>;
    sort_field: z.ZodDefault<z.ZodOptional<z.ZodLiteral<"@timestamp">>>;
    sort_order: z.ZodDefault<z.ZodOptional<z.ZodEnum<{
        desc: "desc";
        asc: "asc";
    }>>>;
    start: z.ZodOptional<z.ZodString>;
    status: z.ZodOptional<z.ZodPreprocess<z.ZodArray<z.ZodEnum<{
        open: "open";
        acknowledged: "acknowledged";
        closed: "closed";
    }>>>>;
    with_replacements: z.ZodDefault<z.ZodOptional<z.ZodUnion<readonly [z.ZodPipe<z.ZodEnum<{
        true: "true";
        false: "false";
    }>, z.ZodTransform<boolean, "true" | "false">>, z.ZodBoolean]> & import("@kbn/zod-helpers/v4/kbn_zod_types/kbn_zod_type").KbnZodType>>;
}, z.core.$strip>;
export type AttackDiscoveryFindRequestQuery = z.infer<typeof AttackDiscoveryFindRequestQuery>;
export type AttackDiscoveryFindRequestQueryInput = z.input<typeof AttackDiscoveryFindRequestQuery>;
export declare const AttackDiscoveryFindResponse: z.ZodObject<{
    connector_names: z.ZodArray<z.ZodString>;
    data: z.ZodArray<z.ZodObject<{
        alert_ids: z.ZodArray<z.ZodString>;
        alert_rule_uuid: z.ZodOptional<z.ZodString>;
        alert_workflow_status: z.ZodOptional<z.ZodString>;
        connector_id: z.ZodString;
        connector_name: z.ZodString;
        alert_start: z.ZodOptional<z.ZodString>;
        alert_updated_at: z.ZodOptional<z.ZodString>;
        alert_updated_by_user_id: z.ZodOptional<z.ZodString>;
        alert_updated_by_user_name: z.ZodOptional<z.ZodString>;
        alert_workflow_status_updated_at: z.ZodOptional<z.ZodString>;
        details_markdown: z.ZodString;
        entity_summary_markdown: z.ZodOptional<z.ZodString>;
        generation_uuid: z.ZodString;
        id: z.ZodString;
        mitre_attack_tactics: z.ZodOptional<z.ZodArray<z.ZodString>>;
        replacements: z.ZodOptional<z.ZodObject<{}, z.core.$catchall<z.ZodString>>>;
        risk_score: z.ZodOptional<z.ZodNumber>;
        summary_markdown: z.ZodString;
        timestamp: z.ZodString;
        title: z.ZodString;
        user_id: z.ZodOptional<z.ZodString>;
        user_name: z.ZodOptional<z.ZodString>;
        users: z.ZodOptional<z.ZodArray<z.ZodObject<{
            id: z.ZodOptional<z.ZodString>;
            name: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>>>;
        assignees: z.ZodOptional<z.ZodArray<z.ZodString>>;
        tags: z.ZodOptional<z.ZodArray<z.ZodString>>;
        index: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
    page: z.ZodNumber;
    per_page: z.ZodNumber;
    total: z.ZodNumber;
    unique_alert_ids: z.ZodOptional<z.ZodArray<z.ZodString>>;
    unique_alert_ids_count: z.ZodNumber;
}, z.core.$strip>;
export type AttackDiscoveryFindResponse = z.infer<typeof AttackDiscoveryFindResponse>;
