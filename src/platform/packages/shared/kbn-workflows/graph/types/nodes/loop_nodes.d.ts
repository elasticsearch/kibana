import { z } from '@kbn/zod/v4';
export declare const EnterForeachNodeConfigurationSchema: z.ZodObject<{
    type: z.ZodLiteral<"foreach">;
    name: z.ZodString;
    if: z.ZodOptional<z.ZodString>;
    'max-step-size': z.ZodOptional<z.ZodString>;
    timeout: z.ZodOptional<z.ZodString>;
    'max-iterations': z.ZodOptional<z.ZodUnion<readonly [z.ZodNumber, z.ZodObject<{
        limit: z.ZodNumber;
        'on-limit': z.ZodEnum<{
            continue: "continue";
            fail: "fail";
        }>;
    }, z.core.$strip>]>>;
    'iteration-timeout': z.ZodOptional<z.ZodString>;
    'iteration-on-failure': z.ZodOptional<z.ZodObject<{
        retry: z.ZodOptional<z.ZodObject<{
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
        }, z.core.$strip>>;
        fallback: z.ZodOptional<z.ZodArray<z.ZodObject<{
            name: z.ZodString;
            type: z.ZodString;
            'max-step-size': z.ZodOptional<z.ZodString>;
        }, z.core.$strip>>>;
        continue: z.ZodOptional<z.ZodUnion<readonly [z.ZodBoolean, z.ZodString]>>;
    }, z.core.$strip>>;
    foreach: z.ZodUnion<readonly [z.ZodString, z.ZodArray<z.ZodUnknown>]>;
}, z.core.$strip>;
export type EnterForeachNodeConfiguration = z.infer<typeof EnterForeachNodeConfigurationSchema>;
export declare const EnterForeachNodeSchema: z.ZodObject<{
    stepId: z.ZodString;
    stepType: z.ZodString;
    templateDependencies: z.ZodOptional<z.ZodArray<z.ZodUnknown>>;
    id: z.ZodString;
    type: z.ZodLiteral<"enter-foreach">;
    exitNodeId: z.ZodString;
    configuration: z.ZodObject<{
        type: z.ZodLiteral<"foreach">;
        name: z.ZodString;
        if: z.ZodOptional<z.ZodString>;
        'max-step-size': z.ZodOptional<z.ZodString>;
        timeout: z.ZodOptional<z.ZodString>;
        'max-iterations': z.ZodOptional<z.ZodUnion<readonly [z.ZodNumber, z.ZodObject<{
            limit: z.ZodNumber;
            'on-limit': z.ZodEnum<{
                continue: "continue";
                fail: "fail";
            }>;
        }, z.core.$strip>]>>;
        'iteration-timeout': z.ZodOptional<z.ZodString>;
        'iteration-on-failure': z.ZodOptional<z.ZodObject<{
            retry: z.ZodOptional<z.ZodObject<{
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
            }, z.core.$strip>>;
            fallback: z.ZodOptional<z.ZodArray<z.ZodObject<{
                name: z.ZodString;
                type: z.ZodString;
                'max-step-size': z.ZodOptional<z.ZodString>;
            }, z.core.$strip>>>;
            continue: z.ZodOptional<z.ZodUnion<readonly [z.ZodBoolean, z.ZodString]>>;
        }, z.core.$strip>>;
        foreach: z.ZodUnion<readonly [z.ZodString, z.ZodArray<z.ZodUnknown>]>;
    }, z.core.$strip>;
}, z.core.$strip>;
export type EnterForeachNode = z.infer<typeof EnterForeachNodeSchema>;
export declare const ExitForeachNodeSchema: z.ZodObject<{
    stepId: z.ZodString;
    stepType: z.ZodString;
    templateDependencies: z.ZodOptional<z.ZodArray<z.ZodUnknown>>;
    id: z.ZodString;
    type: z.ZodLiteral<"exit-foreach">;
    startNodeId: z.ZodString;
    maxIterations: z.ZodOptional<z.ZodNumber>;
    onLimit: z.ZodOptional<z.ZodEnum<{
        continue: "continue";
        fail: "fail";
    }>>;
}, z.core.$strip>;
export type ExitForeachNode = z.infer<typeof ExitForeachNodeSchema>;
export declare const EnterWhileNodeConfigurationSchema: z.ZodObject<{
    type: z.ZodLiteral<"while">;
    name: z.ZodString;
    if: z.ZodOptional<z.ZodString>;
    condition: z.ZodString;
    'max-step-size': z.ZodOptional<z.ZodString>;
    timeout: z.ZodOptional<z.ZodString>;
    'max-iterations': z.ZodOptional<z.ZodUnion<readonly [z.ZodNumber, z.ZodObject<{
        limit: z.ZodNumber;
        'on-limit': z.ZodEnum<{
            continue: "continue";
            fail: "fail";
        }>;
    }, z.core.$strip>]>>;
    'iteration-timeout': z.ZodOptional<z.ZodString>;
    'iteration-on-failure': z.ZodOptional<z.ZodObject<{
        retry: z.ZodOptional<z.ZodObject<{
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
        }, z.core.$strip>>;
        fallback: z.ZodOptional<z.ZodArray<z.ZodObject<{
            name: z.ZodString;
            type: z.ZodString;
            'max-step-size': z.ZodOptional<z.ZodString>;
        }, z.core.$strip>>>;
        continue: z.ZodOptional<z.ZodUnion<readonly [z.ZodBoolean, z.ZodString]>>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type EnterWhileNodeConfiguration = z.infer<typeof EnterWhileNodeConfigurationSchema>;
export declare const EnterWhileNodeSchema: z.ZodObject<{
    stepId: z.ZodString;
    stepType: z.ZodString;
    templateDependencies: z.ZodOptional<z.ZodArray<z.ZodUnknown>>;
    id: z.ZodString;
    type: z.ZodLiteral<"enter-while">;
    exitNodeId: z.ZodString;
    configuration: z.ZodObject<{
        type: z.ZodLiteral<"while">;
        name: z.ZodString;
        if: z.ZodOptional<z.ZodString>;
        condition: z.ZodString;
        'max-step-size': z.ZodOptional<z.ZodString>;
        timeout: z.ZodOptional<z.ZodString>;
        'max-iterations': z.ZodOptional<z.ZodUnion<readonly [z.ZodNumber, z.ZodObject<{
            limit: z.ZodNumber;
            'on-limit': z.ZodEnum<{
                continue: "continue";
                fail: "fail";
            }>;
        }, z.core.$strip>]>>;
        'iteration-timeout': z.ZodOptional<z.ZodString>;
        'iteration-on-failure': z.ZodOptional<z.ZodObject<{
            retry: z.ZodOptional<z.ZodObject<{
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
            }, z.core.$strip>>;
            fallback: z.ZodOptional<z.ZodArray<z.ZodObject<{
                name: z.ZodString;
                type: z.ZodString;
                'max-step-size': z.ZodOptional<z.ZodString>;
            }, z.core.$strip>>>;
            continue: z.ZodOptional<z.ZodUnion<readonly [z.ZodBoolean, z.ZodString]>>;
        }, z.core.$strip>>;
    }, z.core.$strip>;
}, z.core.$strip>;
export type EnterWhileNode = z.infer<typeof EnterWhileNodeSchema>;
export declare const ExitWhileNodeSchema: z.ZodObject<{
    stepId: z.ZodString;
    stepType: z.ZodString;
    templateDependencies: z.ZodOptional<z.ZodArray<z.ZodUnknown>>;
    id: z.ZodString;
    type: z.ZodLiteral<"exit-while">;
    startNodeId: z.ZodString;
    condition: z.ZodString;
    maxIterations: z.ZodOptional<z.ZodNumber>;
    onLimit: z.ZodOptional<z.ZodEnum<{
        continue: "continue";
        fail: "fail";
    }>>;
}, z.core.$strip>;
export type ExitWhileNode = z.infer<typeof ExitWhileNodeSchema>;
