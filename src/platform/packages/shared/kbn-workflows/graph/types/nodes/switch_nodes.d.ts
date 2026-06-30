import { z } from '@kbn/zod/v4';
export declare const EnterSwitchNodeConfigurationSchema: z.ZodObject<{
    type: z.ZodLiteral<"switch">;
    name: z.ZodString;
    if: z.ZodOptional<z.ZodString>;
    expression: z.ZodString;
    'max-step-size': z.ZodOptional<z.ZodString>;
    timeout: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type EnterSwitchNodeConfiguration = z.infer<typeof EnterSwitchNodeConfigurationSchema>;
export declare const EnterSwitchNodeSchema: z.ZodObject<{
    stepId: z.ZodString;
    stepType: z.ZodString;
    templateDependencies: z.ZodOptional<z.ZodArray<z.ZodUnknown>>;
    id: z.ZodString;
    type: z.ZodLiteral<"enter-switch">;
    exitNodeId: z.ZodString;
    configuration: z.ZodObject<{
        type: z.ZodLiteral<"switch">;
        name: z.ZodString;
        if: z.ZodOptional<z.ZodString>;
        expression: z.ZodString;
        'max-step-size': z.ZodOptional<z.ZodString>;
        timeout: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>;
}, z.core.$strip>;
export type EnterSwitchNode = z.infer<typeof EnterSwitchNodeSchema>;
export declare const EnterCaseBranchNodeSchema: z.ZodObject<{
    stepId: z.ZodString;
    stepType: z.ZodString;
    templateDependencies: z.ZodOptional<z.ZodArray<z.ZodUnknown>>;
    id: z.ZodString;
    type: z.ZodLiteral<"enter-case-branch">;
    match: z.ZodUnion<readonly [z.ZodString, z.ZodNumber, z.ZodBoolean]>;
    index: z.ZodNumber;
}, z.core.$strip>;
export type EnterCaseBranchNode = z.infer<typeof EnterCaseBranchNodeSchema>;
export declare const ExitCaseBranchNodeSchema: z.ZodObject<{
    stepId: z.ZodString;
    stepType: z.ZodString;
    templateDependencies: z.ZodOptional<z.ZodArray<z.ZodUnknown>>;
    id: z.ZodString;
    type: z.ZodLiteral<"exit-case-branch">;
    startNodeId: z.ZodString;
}, z.core.$strip>;
export type ExitCaseBranchNode = z.infer<typeof ExitCaseBranchNodeSchema>;
export declare const EnterDefaultBranchNodeSchema: z.ZodObject<{
    stepId: z.ZodString;
    stepType: z.ZodString;
    templateDependencies: z.ZodOptional<z.ZodArray<z.ZodUnknown>>;
    id: z.ZodString;
    type: z.ZodLiteral<"enter-default-branch">;
}, z.core.$strip>;
export type EnterDefaultBranchNode = z.infer<typeof EnterDefaultBranchNodeSchema>;
export declare const ExitDefaultBranchNodeSchema: z.ZodObject<{
    stepId: z.ZodString;
    stepType: z.ZodString;
    templateDependencies: z.ZodOptional<z.ZodArray<z.ZodUnknown>>;
    id: z.ZodString;
    type: z.ZodLiteral<"exit-default-branch">;
    startNodeId: z.ZodString;
}, z.core.$strip>;
export type ExitDefaultBranchNode = z.infer<typeof ExitDefaultBranchNodeSchema>;
export declare const ExitSwitchNodeSchema: z.ZodObject<{
    stepId: z.ZodString;
    stepType: z.ZodString;
    templateDependencies: z.ZodOptional<z.ZodArray<z.ZodUnknown>>;
    id: z.ZodString;
    type: z.ZodLiteral<"exit-switch">;
    startNodeId: z.ZodString;
}, z.core.$strip>;
export type ExitSwitchNode = z.infer<typeof ExitSwitchNodeSchema>;
