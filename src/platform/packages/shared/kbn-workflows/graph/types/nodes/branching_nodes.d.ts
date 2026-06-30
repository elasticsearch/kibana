import { z } from '@kbn/zod/v4';
export declare const EnterIfNodeConfigurationSchema: z.ZodObject<{
    type: z.ZodLiteral<"if">;
    name: z.ZodString;
    condition: z.ZodString;
    'max-step-size': z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export declare const EnterIfNodeSchema: z.ZodObject<{
    stepId: z.ZodString;
    stepType: z.ZodString;
    templateDependencies: z.ZodOptional<z.ZodArray<z.ZodUnknown>>;
    id: z.ZodString;
    type: z.ZodLiteral<"enter-if">;
    exitNodeId: z.ZodString;
    configuration: z.ZodObject<{
        type: z.ZodLiteral<"if">;
        name: z.ZodString;
        condition: z.ZodString;
        'max-step-size': z.ZodOptional<z.ZodString>;
    }, z.core.$strip>;
}, z.core.$strip>;
export type EnterIfNode = z.infer<typeof EnterIfNodeSchema>;
export declare const EnterConditionBranchNodeSchema: z.ZodObject<{
    stepId: z.ZodString;
    stepType: z.ZodString;
    templateDependencies: z.ZodOptional<z.ZodArray<z.ZodUnknown>>;
    id: z.ZodString;
    type: z.ZodUnion<readonly [z.ZodLiteral<"enter-then-branch">, z.ZodLiteral<"enter-else-branch">]>;
    condition: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodUndefined]>>;
}, z.core.$strip>;
export type EnterConditionBranchNode = z.infer<typeof EnterConditionBranchNodeSchema>;
export declare const ExitConditionBranchNodeSchema: z.ZodObject<{
    stepId: z.ZodString;
    stepType: z.ZodString;
    templateDependencies: z.ZodOptional<z.ZodArray<z.ZodUnknown>>;
    id: z.ZodString;
    type: z.ZodUnion<readonly [z.ZodLiteral<"exit-then-branch">, z.ZodLiteral<"exit-else-branch">]>;
    startNodeId: z.ZodString;
}, z.core.$strip>;
export type ExitConditionBranchNode = z.infer<typeof ExitConditionBranchNodeSchema>;
export declare const ExitIfNodeSchema: z.ZodObject<{
    stepId: z.ZodString;
    stepType: z.ZodString;
    templateDependencies: z.ZodOptional<z.ZodArray<z.ZodUnknown>>;
    id: z.ZodString;
    type: z.ZodLiteral<"exit-if">;
    startNodeId: z.ZodString;
}, z.core.$strip>;
export type ExitIfNode = z.infer<typeof ExitIfNodeSchema>;
