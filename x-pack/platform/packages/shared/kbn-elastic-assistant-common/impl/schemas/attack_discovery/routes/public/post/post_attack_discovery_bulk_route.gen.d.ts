import { z } from '@kbn/zod/v4';
export declare const PostAttackDiscoveryBulkRequestBody: z.ZodObject<{
    update: z.ZodObject<{
        ids: z.ZodArray<z.ZodString>;
        kibana_alert_workflow_status: z.ZodOptional<z.ZodEnum<{
            open: "open";
            acknowledged: "acknowledged";
            closed: "closed";
        }>>;
        visibility: z.ZodOptional<z.ZodEnum<{
            shared: "shared";
            not_shared: "not_shared";
        }>>;
        with_replacements: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
        enable_field_rendering: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
    }, z.core.$strip>;
}, z.core.$strip>;
export type PostAttackDiscoveryBulkRequestBody = z.infer<typeof PostAttackDiscoveryBulkRequestBody>;
export type PostAttackDiscoveryBulkRequestBodyInput = z.input<typeof PostAttackDiscoveryBulkRequestBody>;
export declare const PostAttackDiscoveryBulkResponse: z.ZodObject<{
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
}, z.core.$strip>;
export type PostAttackDiscoveryBulkResponse = z.infer<typeof PostAttackDiscoveryBulkResponse>;
