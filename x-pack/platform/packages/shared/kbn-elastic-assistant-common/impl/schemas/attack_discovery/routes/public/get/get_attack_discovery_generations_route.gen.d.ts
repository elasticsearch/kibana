import { z } from '@kbn/zod/v4';
export declare const GetAttackDiscoveryGenerationsRequestQuery: z.ZodObject<{
    end: z.ZodOptional<z.ZodString>;
    size: z.ZodDefault<z.ZodOptional<z.ZodCoercedNumber<unknown>>>;
    start: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type GetAttackDiscoveryGenerationsRequestQuery = z.infer<typeof GetAttackDiscoveryGenerationsRequestQuery>;
export type GetAttackDiscoveryGenerationsRequestQueryInput = z.input<typeof GetAttackDiscoveryGenerationsRequestQuery>;
export declare const GetAttackDiscoveryGenerationsResponse: z.ZodObject<{
    generations: z.ZodArray<z.ZodObject<{
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
export type GetAttackDiscoveryGenerationsResponse = z.infer<typeof GetAttackDiscoveryGenerationsResponse>;
