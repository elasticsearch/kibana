import { z } from '@kbn/zod/v4';
export declare const GetAttackDiscoveryGenerationRequestQuery: z.ZodObject<{
    enable_field_rendering: z.ZodDefault<z.ZodOptional<z.ZodUnion<readonly [z.ZodPipe<z.ZodEnum<{
        true: "true";
        false: "false";
    }>, z.ZodTransform<boolean, "true" | "false">>, z.ZodBoolean]> & import("@kbn/zod-helpers/v4/kbn_zod_types/kbn_zod_type").KbnZodType>>;
    with_replacements: z.ZodDefault<z.ZodOptional<z.ZodUnion<readonly [z.ZodPipe<z.ZodEnum<{
        true: "true";
        false: "false";
    }>, z.ZodTransform<boolean, "true" | "false">>, z.ZodBoolean]> & import("@kbn/zod-helpers/v4/kbn_zod_types/kbn_zod_type").KbnZodType>>;
}, z.core.$strip>;
export type GetAttackDiscoveryGenerationRequestQuery = z.infer<typeof GetAttackDiscoveryGenerationRequestQuery>;
export type GetAttackDiscoveryGenerationRequestQueryInput = z.input<typeof GetAttackDiscoveryGenerationRequestQuery>;
export declare const GetAttackDiscoveryGenerationRequestParams: z.ZodObject<{
    execution_uuid: z.ZodString;
}, z.core.$strip>;
export type GetAttackDiscoveryGenerationRequestParams = z.infer<typeof GetAttackDiscoveryGenerationRequestParams>;
export type GetAttackDiscoveryGenerationRequestParamsInput = z.input<typeof GetAttackDiscoveryGenerationRequestParams>;
export declare const GetAttackDiscoveryGenerationResponse: z.ZodObject<{
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
    generation: z.ZodOptional<z.ZodObject<{
        alerts_context_count: z.ZodOptional<z.ZodNumber>;
        connector_id: z.ZodString;
        connector_stats: z.ZodOptional<z.ZodObject<{
            average_successful_duration_nanoseconds: z.ZodOptional<z.ZodNumber>;
            successful_generations: z.ZodOptional<z.ZodNumber>;
        }, z.core.$strip>>;
        discoveries: z.ZodNumber;
        end: z.ZodOptional<z.ZodString>;
        execution_uuid: z.ZodString;
        loading_message: z.ZodString;
        reason: z.ZodOptional<z.ZodString>;
        start: z.ZodString;
        status: z.ZodEnum<{
            failed: "failed";
            succeeded: "succeeded";
            canceled: "canceled";
            dismissed: "dismissed";
            started: "started";
        }>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type GetAttackDiscoveryGenerationResponse = z.infer<typeof GetAttackDiscoveryGenerationResponse>;
