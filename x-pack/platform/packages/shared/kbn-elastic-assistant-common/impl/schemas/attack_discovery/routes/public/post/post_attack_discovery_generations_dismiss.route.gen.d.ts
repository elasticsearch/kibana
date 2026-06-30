import { z } from '@kbn/zod/v4';
export declare const PostAttackDiscoveryGenerationsDismissRequestParams: z.ZodObject<{
    execution_uuid: z.ZodString;
}, z.core.$strip>;
export type PostAttackDiscoveryGenerationsDismissRequestParams = z.infer<typeof PostAttackDiscoveryGenerationsDismissRequestParams>;
export type PostAttackDiscoveryGenerationsDismissRequestParamsInput = z.input<typeof PostAttackDiscoveryGenerationsDismissRequestParams>;
export declare const PostAttackDiscoveryGenerationsDismissResponse: z.ZodObject<{
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
}, z.core.$strip>;
export type PostAttackDiscoveryGenerationsDismissResponse = z.infer<typeof PostAttackDiscoveryGenerationsDismissResponse>;
