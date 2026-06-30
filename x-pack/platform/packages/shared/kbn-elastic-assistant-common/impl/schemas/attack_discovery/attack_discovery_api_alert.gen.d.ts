import { z } from '@kbn/zod/v4';
/**
 * An attack discovery that's also an alert (Public API with snake_case)
 */
export declare const AttackDiscoveryApiAlert: z.ZodObject<{
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
}, z.core.$strip>;
export type AttackDiscoveryApiAlert = z.infer<typeof AttackDiscoveryApiAlert>;
