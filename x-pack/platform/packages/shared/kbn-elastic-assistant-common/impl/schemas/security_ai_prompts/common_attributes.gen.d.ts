import { z } from '@kbn/zod/v4';
export declare const PromptItem: z.ZodObject<{
    promptId: z.ZodString;
    prompt: z.ZodString;
}, z.core.$strip>;
export type PromptItem = z.infer<typeof PromptItem>;
/**
 * Prompt array by prompt group id and prompt id.
 */
export declare const PromptItemArray: z.ZodArray<z.ZodObject<{
    promptId: z.ZodString;
    prompt: z.ZodString;
}, z.core.$strip>>;
export type PromptItemArray = z.infer<typeof PromptItemArray>;
