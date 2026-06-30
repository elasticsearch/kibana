import { z } from '@kbn/zod/v4';
export declare const EnterContinueNodeSchema: z.ZodObject<{
    stepId: z.ZodString;
    stepType: z.ZodString;
    templateDependencies: z.ZodOptional<z.ZodArray<z.ZodUnknown>>;
    id: z.ZodString;
    type: z.ZodLiteral<"enter-continue">;
    configuration: z.ZodObject<{
        condition: z.ZodUnion<readonly [z.ZodString, z.ZodBoolean]>;
    }, z.core.$strip>;
    exitNodeId: z.ZodString;
}, z.core.$strip>;
export type EnterContinueNode = z.infer<typeof EnterContinueNodeSchema>;
export declare const ExitContinueNodeSchema: z.ZodObject<{
    stepId: z.ZodString;
    stepType: z.ZodString;
    templateDependencies: z.ZodOptional<z.ZodArray<z.ZodUnknown>>;
    id: z.ZodString;
    type: z.ZodLiteral<"exit-continue">;
}, z.core.$strip>;
export type ExitContinueNode = z.infer<typeof ExitContinueNodeSchema>;
export declare const EnterRetryNodeSchema: z.ZodObject<{
    stepId: z.ZodString;
    stepType: z.ZodString;
    templateDependencies: z.ZodOptional<z.ZodArray<z.ZodUnknown>>;
    id: z.ZodString;
    type: z.ZodLiteral<"enter-retry">;
    exitNodeId: z.ZodString;
    configuration: z.ZodObject<{
        'max-attempts': z.ZodNumber;
        condition: z.ZodOptional<z.ZodString>;
        delay: z.ZodOptional<z.ZodString>;
        strategy: z.ZodOptional<z.ZodEnum<{
            fixed: "fixed";
            exponential: "exponential";
        }>>;
        multiplier: z.ZodOptional<z.ZodNumber>;
        'max-delay': z.ZodOptional<z.ZodString>;
        jitter: z.ZodOptional<z.ZodBoolean>;
    }, z.core.$strip>;
}, z.core.$strip>;
export type EnterRetryNode = z.infer<typeof EnterRetryNodeSchema>;
export declare const ExitRetryNodeSchema: z.ZodObject<{
    stepId: z.ZodString;
    stepType: z.ZodString;
    templateDependencies: z.ZodOptional<z.ZodArray<z.ZodUnknown>>;
    id: z.ZodString;
    type: z.ZodLiteral<"exit-retry">;
    startNodeId: z.ZodString;
}, z.core.$strip>;
export type ExitRetryNode = z.infer<typeof ExitRetryNodeSchema>;
export declare const EnterTryBlockNodeSchema: z.ZodObject<{
    stepId: z.ZodString;
    stepType: z.ZodString;
    templateDependencies: z.ZodOptional<z.ZodArray<z.ZodUnknown>>;
    id: z.ZodString;
    type: z.ZodLiteral<"enter-try-block">;
    enterNormalPathNodeId: z.ZodString;
    enterFallbackPathNodeId: z.ZodString;
    exitNodeId: z.ZodString;
}, z.core.$strip>;
export type EnterTryBlockNode = z.infer<typeof EnterTryBlockNodeSchema>;
export declare const ExitTryBlockNodeSchema: z.ZodObject<{
    stepId: z.ZodString;
    stepType: z.ZodString;
    templateDependencies: z.ZodOptional<z.ZodArray<z.ZodUnknown>>;
    id: z.ZodString;
    type: z.ZodLiteral<"exit-try-block">;
    enterNodeId: z.ZodString;
}, z.core.$strip>;
export type ExitTryBlockNode = z.infer<typeof ExitTryBlockNodeSchema>;
export declare const EnterNormalPathNodeSchema: z.ZodObject<{
    stepId: z.ZodString;
    stepType: z.ZodString;
    templateDependencies: z.ZodOptional<z.ZodArray<z.ZodUnknown>>;
    id: z.ZodString;
    type: z.ZodLiteral<"enter-normal-path">;
    enterZoneNodeId: z.ZodString;
    enterFailurePathNodeId: z.ZodString;
}, z.core.$strip>;
export type EnterNormalPathNode = z.infer<typeof EnterNormalPathNodeSchema>;
export declare const ExitNormalPathNodeSchema: z.ZodObject<{
    stepId: z.ZodString;
    stepType: z.ZodString;
    templateDependencies: z.ZodOptional<z.ZodArray<z.ZodUnknown>>;
    id: z.ZodString;
    type: z.ZodLiteral<"exit-normal-path">;
    exitOnFailureZoneNodeId: z.ZodString;
    enterNodeId: z.ZodString;
}, z.core.$strip>;
export type ExitNormalPathNode = z.infer<typeof ExitNormalPathNodeSchema>;
export declare const EnterFallbackPathNodeSchema: z.ZodObject<{
    stepId: z.ZodString;
    stepType: z.ZodString;
    templateDependencies: z.ZodOptional<z.ZodArray<z.ZodUnknown>>;
    id: z.ZodString;
    type: z.ZodLiteral<"enter-fallback-path">;
    enterZoneNodeId: z.ZodString;
}, z.core.$strip>;
export type EnterFallbackPathNode = z.infer<typeof EnterFallbackPathNodeSchema>;
export declare const ExitFallbackPathNodeSchema: z.ZodObject<{
    stepId: z.ZodString;
    stepType: z.ZodString;
    templateDependencies: z.ZodOptional<z.ZodArray<z.ZodUnknown>>;
    id: z.ZodString;
    type: z.ZodLiteral<"exit-fallback-path">;
    exitOnFailureZoneNodeId: z.ZodString;
    enterNodeId: z.ZodString;
}, z.core.$strip>;
export type ExitFallbackPathNode = z.infer<typeof ExitFallbackPathNodeSchema>;
export declare const OnFailureNodeSchema: z.ZodObject<{
    id: z.ZodString;
    stepId: z.ZodString;
    stepType: z.ZodString;
    templateDependencies: z.ZodOptional<z.ZodArray<z.ZodUnknown>>;
    type: z.ZodLiteral<"on-failure">;
}, z.core.$strip>;
export type OnFailureNode = z.infer<typeof OnFailureNodeSchema>;
export declare const StepLevelOnFailureNodeSchema: z.ZodObject<{
    id: z.ZodString;
    stepId: z.ZodString;
    stepType: z.ZodString;
    templateDependencies: z.ZodOptional<z.ZodArray<z.ZodUnknown>>;
    type: z.ZodLiteral<"step-level-on-failure">;
}, z.core.$strip>;
export type StepLevelOnFailureNode = z.infer<typeof StepLevelOnFailureNodeSchema>;
export declare const WorkflowLevelOnFailureNodeSchema: z.ZodObject<{
    id: z.ZodString;
    stepId: z.ZodString;
    stepType: z.ZodString;
    templateDependencies: z.ZodOptional<z.ZodArray<z.ZodUnknown>>;
    type: z.ZodLiteral<"workflow-level-on-failure">;
}, z.core.$strip>;
export type WorkflowLevelOnFailureNode = z.infer<typeof WorkflowLevelOnFailureNodeSchema>;
export declare const EnterTimeoutZoneNodeSchema: z.ZodObject<{
    stepId: z.ZodString;
    templateDependencies: z.ZodOptional<z.ZodArray<z.ZodUnknown>>;
    id: z.ZodString;
    type: z.ZodLiteral<"enter-timeout-zone">;
    timeout: z.ZodString;
    stepType: z.ZodUnion<readonly [z.ZodLiteral<"workflow_level_timeout">, z.ZodLiteral<"step_level_timeout">]>;
}, z.core.$strip>;
export type EnterTimeoutZoneNode = z.infer<typeof EnterTimeoutZoneNodeSchema>;
export declare const ExitTimeoutZoneNodeSchema: z.ZodObject<{
    stepId: z.ZodString;
    templateDependencies: z.ZodOptional<z.ZodArray<z.ZodUnknown>>;
    id: z.ZodString;
    type: z.ZodLiteral<"exit-timeout-zone">;
    stepType: z.ZodUnion<readonly [z.ZodLiteral<"workflow_level_timeout">, z.ZodLiteral<"step_level_timeout">]>;
}, z.core.$strip>;
export type ExitTimeoutZoneNode = z.infer<typeof ExitTimeoutZoneNodeSchema>;
