import { z } from '@kbn/zod/v4';
export declare const FindSecurityAIPromptsRequestQuery: z.ZodObject<{
    connector_id: z.ZodOptional<z.ZodString>;
    prompt_group_id: z.ZodString;
    prompt_ids: z.ZodPreprocess<z.ZodArray<z.ZodString>>;
}, z.core.$strip>;
export type FindSecurityAIPromptsRequestQuery = z.infer<typeof FindSecurityAIPromptsRequestQuery>;
export type FindSecurityAIPromptsRequestQueryInput = z.input<typeof FindSecurityAIPromptsRequestQuery>;
export declare const FindSecurityAIPromptsResponse: z.ZodObject<{
    prompts: z.ZodArray<z.ZodObject<{
        promptId: z.ZodString;
        prompt: z.ZodString;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type FindSecurityAIPromptsResponse = z.infer<typeof FindSecurityAIPromptsResponse>;
