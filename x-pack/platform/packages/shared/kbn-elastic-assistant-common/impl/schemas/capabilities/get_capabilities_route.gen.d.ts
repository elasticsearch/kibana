import { z } from '@kbn/zod/v4';
export declare const GetCapabilitiesResponse: z.ZodObject<{
    assistantModelEvaluation: z.ZodBoolean;
    defendInsightsPolicyResponseFailure: z.ZodBoolean;
}, z.core.$strip>;
export type GetCapabilitiesResponse = z.infer<typeof GetCapabilitiesResponse>;
