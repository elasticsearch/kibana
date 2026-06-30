import { z } from '@kbn/zod/v4';
export declare const LoopBreakNodeSchema: z.ZodObject<{
    stepId: z.ZodString;
    stepType: z.ZodString;
    templateDependencies: z.ZodOptional<z.ZodArray<z.ZodUnknown>>;
    id: z.ZodString;
    type: z.ZodLiteral<"loop-break">;
    loopExitNodeId: z.ZodString;
    loopStepId: z.ZodString;
}, z.core.$strip>;
export type LoopBreakNode = z.infer<typeof LoopBreakNodeSchema>;
export declare const LoopContinueNodeSchema: z.ZodObject<{
    stepId: z.ZodString;
    stepType: z.ZodString;
    templateDependencies: z.ZodOptional<z.ZodArray<z.ZodUnknown>>;
    id: z.ZodString;
    type: z.ZodLiteral<"loop-continue">;
    loopExitNodeId: z.ZodString;
}, z.core.$strip>;
export type LoopContinueNode = z.infer<typeof LoopContinueNodeSchema>;
