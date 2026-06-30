import { z } from '@kbn/zod/v4';
export declare const DurationSchema: z.ZodString;
export declare const ByteSizeSchema: z.ZodString;
export declare const RetryPolicySchema: z.ZodObject<{
    'max-attempts': z.ZodOptional<z.ZodNumber>;
    'timeout-seconds': z.ZodOptional<z.ZodNumber>;
}, z.core.$strip>;
export declare const RetryDelayStrategySchema: z.ZodEnum<{
    fixed: "fixed";
    exponential: "exponential";
}>;
export type RetryDelayStrategy = z.infer<typeof RetryDelayStrategySchema>;
export declare const WorkflowRetrySchema: z.ZodObject<{
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
export type WorkflowRetry = z.infer<typeof WorkflowRetrySchema>;
export declare const BaseStepSchema: z.ZodObject<{
    name: z.ZodString;
    type: z.ZodString;
    'max-step-size': z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type BaseStep = z.infer<typeof BaseStepSchema>;
export declare const WorkflowOnFailureSchema: z.ZodObject<{
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
}, z.core.$strip>;
export type WorkflowOnFailure = z.infer<typeof WorkflowOnFailureSchema>;
export declare function getOnFailureStepSchema(stepSchema: z.ZodType, loose?: boolean): z.ZodObject<{
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
    continue: z.ZodOptional<z.ZodUnion<readonly [z.ZodBoolean, z.ZodString]>>;
    fallback: z.ZodOptional<z.ZodArray<z.ZodType<unknown, unknown, z.core.$ZodTypeInternals<unknown, unknown>>>>;
}, z.core.$strip> | z.ZodObject<{
    retry: z.ZodOptional<z.ZodOptional<z.ZodObject<{
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
    }, z.core.$strip>>>;
    continue: z.ZodOptional<z.ZodOptional<z.ZodUnion<readonly [z.ZodBoolean, z.ZodString]>>>;
    fallback: z.ZodOptional<z.ZodOptional<z.ZodArray<z.ZodType<unknown, unknown, z.core.$ZodTypeInternals<unknown, unknown>>>>>;
}, z.core.$strip>;
export declare const CollisionStrategySchema: z.ZodEnum<{
    drop: "drop";
    "cancel-in-progress": "cancel-in-progress";
}>;
export type CollisionStrategy = z.infer<typeof CollisionStrategySchema>;
export declare const ConcurrencySettingsSchema: z.ZodObject<{
    key: z.ZodOptional<z.ZodString>;
    strategy: z.ZodOptional<z.ZodEnum<{
        drop: "drop";
        "cancel-in-progress": "cancel-in-progress";
    }>>;
    max: z.ZodOptional<z.ZodNumber>;
}, z.core.$strip>;
export type ConcurrencySettings = z.infer<typeof ConcurrencySettingsSchema>;
export declare const LIQUID_PARSE_LIMIT_MAX = 600000;
export declare const LIQUID_RENDER_LIMIT_MAX = 2000;
export declare const LIQUID_MEMORY_LIMIT_MAX = 60000000;
export declare const LiquidSettingsSchema: z.ZodObject<{
    parseLimit: z.ZodOptional<z.ZodNumber>;
    renderLimit: z.ZodOptional<z.ZodNumber>;
    memoryLimit: z.ZodOptional<z.ZodNumber>;
}, z.core.$strip>;
export type LiquidSettings = z.infer<typeof LiquidSettingsSchema>;
export declare const WorkflowSettingsSchema: z.ZodObject<{
    'on-failure': z.ZodOptional<z.ZodObject<{
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
    timezone: z.ZodOptional<z.ZodString>;
    timeout: z.ZodOptional<z.ZodString>;
    concurrency: z.ZodOptional<z.ZodObject<{
        key: z.ZodOptional<z.ZodString>;
        strategy: z.ZodOptional<z.ZodEnum<{
            drop: "drop";
            "cancel-in-progress": "cancel-in-progress";
        }>>;
        max: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strip>>;
    'max-step-size': z.ZodOptional<z.ZodString>;
    liquid: z.ZodOptional<z.ZodObject<{
        parseLimit: z.ZodOptional<z.ZodNumber>;
        renderLimit: z.ZodOptional<z.ZodNumber>;
        memoryLimit: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type WorkflowSettings = z.infer<typeof WorkflowSettingsSchema>;
export declare function getWorkflowSettingsSchema(stepSchema: z.ZodType, loose?: boolean): z.ZodObject<{
    timezone: z.ZodOptional<z.ZodString>;
    timeout: z.ZodOptional<z.ZodString>;
    concurrency: z.ZodOptional<z.ZodObject<{
        key: z.ZodOptional<z.ZodString>;
        strategy: z.ZodOptional<z.ZodEnum<{
            drop: "drop";
            "cancel-in-progress": "cancel-in-progress";
        }>>;
        max: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strip>>;
    'max-step-size': z.ZodOptional<z.ZodString>;
    liquid: z.ZodOptional<z.ZodObject<{
        parseLimit: z.ZodOptional<z.ZodNumber>;
        renderLimit: z.ZodOptional<z.ZodNumber>;
        memoryLimit: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strip>>;
    'on-failure': z.ZodOptional<z.ZodObject<{
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
        continue: z.ZodOptional<z.ZodUnion<readonly [z.ZodBoolean, z.ZodString]>>;
        fallback: z.ZodOptional<z.ZodArray<z.ZodType<unknown, unknown, z.core.$ZodTypeInternals<unknown, unknown>>>>;
    }, z.core.$strip>> | z.ZodOptional<z.ZodObject<{
        retry: z.ZodOptional<z.ZodOptional<z.ZodObject<{
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
        }, z.core.$strip>>>;
        continue: z.ZodOptional<z.ZodOptional<z.ZodUnion<readonly [z.ZodBoolean, z.ZodString]>>>;
        fallback: z.ZodOptional<z.ZodOptional<z.ZodArray<z.ZodType<unknown, unknown, z.core.$ZodTypeInternals<unknown, unknown>>>>>;
    }, z.core.$strip>>;
}, z.core.$strip> | z.ZodObject<{
    timezone: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    timeout: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    concurrency: z.ZodOptional<z.ZodOptional<z.ZodObject<{
        key: z.ZodOptional<z.ZodString>;
        strategy: z.ZodOptional<z.ZodEnum<{
            drop: "drop";
            "cancel-in-progress": "cancel-in-progress";
        }>>;
        max: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strip>>>;
    'max-step-size': z.ZodOptional<z.ZodOptional<z.ZodString>>;
    liquid: z.ZodOptional<z.ZodOptional<z.ZodObject<{
        parseLimit: z.ZodOptional<z.ZodNumber>;
        renderLimit: z.ZodOptional<z.ZodNumber>;
        memoryLimit: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strip>>>;
    'on-failure': z.ZodOptional<z.ZodOptional<z.ZodObject<{
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
        continue: z.ZodOptional<z.ZodUnion<readonly [z.ZodBoolean, z.ZodString]>>;
        fallback: z.ZodOptional<z.ZodArray<z.ZodType<unknown, unknown, z.core.$ZodTypeInternals<unknown, unknown>>>>;
    }, z.core.$strip>> | z.ZodOptional<z.ZodObject<{
        retry: z.ZodOptional<z.ZodOptional<z.ZodObject<{
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
        }, z.core.$strip>>>;
        continue: z.ZodOptional<z.ZodOptional<z.ZodUnion<readonly [z.ZodBoolean, z.ZodString]>>>;
        fallback: z.ZodOptional<z.ZodOptional<z.ZodArray<z.ZodType<unknown, unknown, z.core.$ZodTypeInternals<unknown, unknown>>>>>;
    }, z.core.$strip>>>;
}, z.core.$strip>;
export declare const TimeoutPropSchema: z.ZodObject<{
    timeout: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type TimeoutProp = z.infer<typeof TimeoutPropSchema>;
export declare const MaxStepSizePropSchema: z.ZodObject<{
    'max-step-size': z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type MaxStepSizeProp = z.infer<typeof MaxStepSizePropSchema>;
export declare const MaxIterationsObjectSchema: z.ZodObject<{
    limit: z.ZodNumber;
    'on-limit': z.ZodEnum<{
        continue: "continue";
        fail: "fail";
    }>;
}, z.core.$strip>;
export declare const MaxIterationsSchema: z.ZodUnion<readonly [z.ZodNumber, z.ZodObject<{
    limit: z.ZodNumber;
    'on-limit': z.ZodEnum<{
        continue: "continue";
        fail: "fail";
    }>;
}, z.core.$strip>]>;
export type MaxIterations = z.infer<typeof MaxIterationsSchema>;
export declare const DEFAULT_LOOP_MAX_ITERATIONS = 2000;
export declare const LoopStepPropsSchema: z.ZodObject<{
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
export type LoopStepProps = z.infer<typeof LoopStepPropsSchema>;
declare const StepWithForEachSchema: z.ZodObject<{
    foreach: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodArray<z.ZodUnknown>]>>;
}, z.core.$strip>;
export type StepWithForeach = z.infer<typeof StepWithForEachSchema>;
export type StepWithOnFailure = z.infer<typeof StepWithOnFailureSchema>;
export declare const StepWithIfConditionSchema: z.ZodObject<{
    if: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type StepWithIfCondition = z.infer<typeof StepWithIfConditionSchema>;
export declare const StepWithOnFailureSchema: z.ZodObject<{
    'on-failure': z.ZodOptional<z.ZodObject<{
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
export declare const BaseConnectorStepSchema: z.ZodObject<{
    name: z.ZodString;
    'max-step-size': z.ZodOptional<z.ZodString>;
    type: z.ZodString;
    with: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
    if: z.ZodOptional<z.ZodString>;
    foreach: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodArray<z.ZodUnknown>]>>;
    timeout: z.ZodOptional<z.ZodString>;
    'on-failure': z.ZodOptional<z.ZodObject<{
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
export type ConnectorStep = z.infer<typeof BaseConnectorStepSchema>;
export declare const BuiltInStepProperties: string[];
export type BuiltInStepProperty = (typeof BuiltInStepProperties)[number];
export declare const WaitStepInputSchema: z.ZodObject<{
    duration: z.ZodString;
}, z.core.$strip>;
export declare const WaitStepSchema: z.ZodObject<{
    name: z.ZodString;
    'max-step-size': z.ZodOptional<z.ZodString>;
    type: z.ZodLiteral<"wait">;
    with: z.ZodObject<{
        duration: z.ZodString;
    }, z.core.$strip>;
}, z.core.$strip>;
export type WaitStep = z.infer<typeof WaitStepSchema>;
export declare const WaitForInputStepInputSchema: z.ZodOptional<z.ZodObject<{
    message: z.ZodOptional<z.ZodString>;
    schema: z.ZodOptional<z.ZodObject<{
        type: z.ZodOptional<z.ZodLiteral<"object">>;
        title: z.ZodOptional<z.ZodString>;
        description: z.ZodOptional<z.ZodString>;
        $ref: z.ZodOptional<z.ZodString> | z.ZodOptional<z.ZodUnion<readonly [z.ZodEnum<{
            [x: string]: string;
        }>, z.ZodString]>>;
        properties: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodType<import("./schema/common/json_model_shape_schema").JsonSchema, unknown, z.core.$ZodTypeInternals<import("./schema/common/json_model_shape_schema").JsonSchema, unknown>>>>;
        additionalProperties: z.ZodOptional<z.ZodBoolean>;
        required: z.ZodOptional<z.ZodArray<z.ZodString>>;
        definitions: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodType<import("./schema/common/json_model_shape_schema").JsonSchema, unknown, z.core.$ZodTypeInternals<import("./schema/common/json_model_shape_schema").JsonSchema, unknown>>>>;
        $defs: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodType<import("./schema/common/json_model_shape_schema").JsonSchema, unknown, z.core.$ZodTypeInternals<import("./schema/common/json_model_shape_schema").JsonSchema, unknown>>>>;
    }, z.core.$strip>>;
}, z.core.$strip>>;
export declare const WaitForInputStepSchema: z.ZodObject<{
    name: z.ZodString;
    'max-step-size': z.ZodOptional<z.ZodString>;
    type: z.ZodLiteral<"waitForInput">;
    with: z.ZodOptional<z.ZodObject<{
        message: z.ZodOptional<z.ZodString>;
        schema: z.ZodOptional<z.ZodObject<{
            type: z.ZodOptional<z.ZodLiteral<"object">>;
            title: z.ZodOptional<z.ZodString>;
            description: z.ZodOptional<z.ZodString>;
            $ref: z.ZodOptional<z.ZodString> | z.ZodOptional<z.ZodUnion<readonly [z.ZodEnum<{
                [x: string]: string;
            }>, z.ZodString]>>;
            properties: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodType<import("./schema/common/json_model_shape_schema").JsonSchema, unknown, z.core.$ZodTypeInternals<import("./schema/common/json_model_shape_schema").JsonSchema, unknown>>>>;
            additionalProperties: z.ZodOptional<z.ZodBoolean>;
            required: z.ZodOptional<z.ZodArray<z.ZodString>>;
            definitions: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodType<import("./schema/common/json_model_shape_schema").JsonSchema, unknown, z.core.$ZodTypeInternals<import("./schema/common/json_model_shape_schema").JsonSchema, unknown>>>>;
            $defs: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodType<import("./schema/common/json_model_shape_schema").JsonSchema, unknown, z.core.$ZodTypeInternals<import("./schema/common/json_model_shape_schema").JsonSchema, unknown>>>>;
        }, z.core.$strip>>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type WaitForInputStep = z.infer<typeof WaitForInputStepSchema>;
export declare const DataSetStepInputSchema: z.ZodRecord<z.ZodString, z.ZodUnknown>;
export declare const DataSetStepSchema: z.ZodObject<{
    name: z.ZodString;
    'max-step-size': z.ZodOptional<z.ZodString>;
    type: z.ZodLiteral<"data.set">;
    with: z.ZodRecord<z.ZodString, z.ZodUnknown>;
}, z.core.$strip>;
export type DataSetStep = z.infer<typeof DataSetStepSchema>;
export declare const FetcherConfigSchema: z.ZodOptional<z.ZodObject<{
    skip_ssl_verification: z.ZodOptional<z.ZodBoolean>;
    follow_redirects: z.ZodOptional<z.ZodBoolean>;
    max_redirects: z.ZodOptional<z.ZodNumber>;
    keep_alive: z.ZodOptional<z.ZodBoolean>;
    max_content_length: z.ZodOptional<z.ZodNumber>;
}, z.core.$strip>>;
export declare const KibanaHttpMethods: readonly ["GET", "POST", "PUT", "PATCH", "DELETE"];
export declare const KibanaHttpMethodSchema: z.ZodEnum<{
    PATCH: "PATCH";
    POST: "POST";
    GET: "GET";
    PUT: "PUT";
    DELETE: "DELETE";
}>;
export declare const ElasticsearchStepInputSchema: z.ZodUnion<readonly [z.ZodObject<{
    request: z.ZodObject<{
        method: z.ZodDefault<z.ZodOptional<z.ZodEnum<{
            PATCH: "PATCH";
            POST: "POST";
            GET: "GET";
            PUT: "PUT";
            DELETE: "DELETE";
            HEAD: "HEAD";
        }>>>;
        path: z.ZodString;
        body: z.ZodOptional<z.ZodAny>;
    }, z.core.$strip>;
}, z.core.$strip>, z.ZodIntersection<z.ZodObject<{
    index: z.ZodOptional<z.ZodString>;
    id: z.ZodOptional<z.ZodString>;
    query: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
    body: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
    size: z.ZodOptional<z.ZodNumber>;
    from: z.ZodOptional<z.ZodNumber>;
    sort: z.ZodOptional<z.ZodArray<z.ZodAny>>;
    _source: z.ZodOptional<z.ZodUnion<readonly [z.ZodBoolean, z.ZodArray<z.ZodString>, z.ZodString]>>;
    aggs: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
    aggregations: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
}, z.core.$strip>, z.ZodRecord<z.ZodString, z.ZodAny>>]>;
export declare const ElasticsearchStepSchema: z.ZodObject<{
    name: z.ZodString;
    'max-step-size': z.ZodOptional<z.ZodString>;
    type: z.ZodString;
    with: z.ZodUnion<readonly [z.ZodObject<{
        request: z.ZodObject<{
            method: z.ZodDefault<z.ZodOptional<z.ZodEnum<{
                PATCH: "PATCH";
                POST: "POST";
                GET: "GET";
                PUT: "PUT";
                DELETE: "DELETE";
                HEAD: "HEAD";
            }>>>;
            path: z.ZodString;
            body: z.ZodOptional<z.ZodAny>;
        }, z.core.$strip>;
    }, z.core.$strip>, z.ZodIntersection<z.ZodObject<{
        index: z.ZodOptional<z.ZodString>;
        id: z.ZodOptional<z.ZodString>;
        query: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
        body: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
        size: z.ZodOptional<z.ZodNumber>;
        from: z.ZodOptional<z.ZodNumber>;
        sort: z.ZodOptional<z.ZodArray<z.ZodAny>>;
        _source: z.ZodOptional<z.ZodUnion<readonly [z.ZodBoolean, z.ZodArray<z.ZodString>, z.ZodString]>>;
        aggs: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
        aggregations: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
    }, z.core.$strip>, z.ZodRecord<z.ZodString, z.ZodAny>>]>;
}, z.core.$strip>;
export type ElasticsearchStep = z.infer<typeof ElasticsearchStepSchema>;
export declare const KibanaStepMetaSchema: {
    use_server_info: z.ZodOptional<z.ZodBoolean>;
    use_localhost: z.ZodOptional<z.ZodBoolean>;
    debug: z.ZodOptional<z.ZodBoolean>;
};
export declare const KibanaStepInputSchema: z.ZodUnion<readonly [z.ZodObject<{
    use_server_info: z.ZodOptional<z.ZodBoolean>;
    use_localhost: z.ZodOptional<z.ZodBoolean>;
    debug: z.ZodOptional<z.ZodBoolean>;
    request: z.ZodObject<{
        method: z.ZodDefault<z.ZodOptional<z.ZodEnum<{
            PATCH: "PATCH";
            POST: "POST";
            GET: "GET";
            PUT: "PUT";
            DELETE: "DELETE";
        }>>>;
        path: z.ZodString;
        body: z.ZodOptional<z.ZodAny>;
        headers: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
    }, z.core.$strip>;
    fetcher: z.ZodOptional<z.ZodObject<{
        skip_ssl_verification: z.ZodOptional<z.ZodBoolean>;
        follow_redirects: z.ZodOptional<z.ZodBoolean>;
        max_redirects: z.ZodOptional<z.ZodNumber>;
        keep_alive: z.ZodOptional<z.ZodBoolean>;
        max_content_length: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strip>>;
}, z.core.$strip>, z.ZodIntersection<z.ZodObject<{
    use_server_info: z.ZodOptional<z.ZodBoolean>;
    use_localhost: z.ZodOptional<z.ZodBoolean>;
    debug: z.ZodOptional<z.ZodBoolean>;
    title: z.ZodOptional<z.ZodString>;
    description: z.ZodOptional<z.ZodString>;
    tags: z.ZodOptional<z.ZodArray<z.ZodString>>;
    severity: z.ZodOptional<z.ZodEnum<{
        high: "high";
        low: "low";
        medium: "medium";
        critical: "critical";
    }>>;
    assignees: z.ZodOptional<z.ZodArray<z.ZodString>>;
    owner: z.ZodOptional<z.ZodString>;
    connector: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
    settings: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
    id: z.ZodOptional<z.ZodString>;
    case_id: z.ZodOptional<z.ZodString>;
    space_id: z.ZodOptional<z.ZodString>;
    page: z.ZodOptional<z.ZodNumber>;
    perPage: z.ZodOptional<z.ZodNumber>;
    status: z.ZodOptional<z.ZodString>;
    fetcher: z.ZodOptional<z.ZodObject<{
        skip_ssl_verification: z.ZodOptional<z.ZodBoolean>;
        follow_redirects: z.ZodOptional<z.ZodBoolean>;
        max_redirects: z.ZodOptional<z.ZodNumber>;
        keep_alive: z.ZodOptional<z.ZodBoolean>;
        max_content_length: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strip>>;
}, z.core.$strip>, z.ZodRecord<z.ZodString, z.ZodAny>>]>;
export declare const KibanaStepSchema: z.ZodObject<{
    name: z.ZodString;
    'max-step-size': z.ZodOptional<z.ZodString>;
    type: z.ZodString;
    with: z.ZodUnion<readonly [z.ZodObject<{
        use_server_info: z.ZodOptional<z.ZodBoolean>;
        use_localhost: z.ZodOptional<z.ZodBoolean>;
        debug: z.ZodOptional<z.ZodBoolean>;
        request: z.ZodObject<{
            method: z.ZodDefault<z.ZodOptional<z.ZodEnum<{
                PATCH: "PATCH";
                POST: "POST";
                GET: "GET";
                PUT: "PUT";
                DELETE: "DELETE";
            }>>>;
            path: z.ZodString;
            body: z.ZodOptional<z.ZodAny>;
            headers: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
        }, z.core.$strip>;
        fetcher: z.ZodOptional<z.ZodObject<{
            skip_ssl_verification: z.ZodOptional<z.ZodBoolean>;
            follow_redirects: z.ZodOptional<z.ZodBoolean>;
            max_redirects: z.ZodOptional<z.ZodNumber>;
            keep_alive: z.ZodOptional<z.ZodBoolean>;
            max_content_length: z.ZodOptional<z.ZodNumber>;
        }, z.core.$strip>>;
    }, z.core.$strip>, z.ZodIntersection<z.ZodObject<{
        use_server_info: z.ZodOptional<z.ZodBoolean>;
        use_localhost: z.ZodOptional<z.ZodBoolean>;
        debug: z.ZodOptional<z.ZodBoolean>;
        title: z.ZodOptional<z.ZodString>;
        description: z.ZodOptional<z.ZodString>;
        tags: z.ZodOptional<z.ZodArray<z.ZodString>>;
        severity: z.ZodOptional<z.ZodEnum<{
            high: "high";
            low: "low";
            medium: "medium";
            critical: "critical";
        }>>;
        assignees: z.ZodOptional<z.ZodArray<z.ZodString>>;
        owner: z.ZodOptional<z.ZodString>;
        connector: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
        settings: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
        id: z.ZodOptional<z.ZodString>;
        case_id: z.ZodOptional<z.ZodString>;
        space_id: z.ZodOptional<z.ZodString>;
        page: z.ZodOptional<z.ZodNumber>;
        perPage: z.ZodOptional<z.ZodNumber>;
        status: z.ZodOptional<z.ZodString>;
        fetcher: z.ZodOptional<z.ZodObject<{
            skip_ssl_verification: z.ZodOptional<z.ZodBoolean>;
            follow_redirects: z.ZodOptional<z.ZodBoolean>;
            max_redirects: z.ZodOptional<z.ZodNumber>;
            keep_alive: z.ZodOptional<z.ZodBoolean>;
            max_content_length: z.ZodOptional<z.ZodNumber>;
        }, z.core.$strip>>;
    }, z.core.$strip>, z.ZodRecord<z.ZodString, z.ZodAny>>]>;
}, z.core.$strip>;
export type KibanaStep = z.infer<typeof KibanaStepSchema>;
export declare const ForEachStepConfigSchema: z.ZodObject<{
    foreach: z.ZodUnion<readonly [z.ZodString, z.ZodArray<z.ZodUnknown>]>;
    steps: z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        type: z.ZodString;
        'max-step-size': z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export declare const ForEachStepSchema: z.ZodObject<{
    name: z.ZodString;
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
    if: z.ZodOptional<z.ZodString>;
    foreach: z.ZodUnion<readonly [z.ZodString, z.ZodArray<z.ZodUnknown>]>;
    steps: z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        type: z.ZodString;
        'max-step-size': z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
    type: z.ZodLiteral<"foreach">;
}, z.core.$strip>;
export type ForEachStep = z.infer<typeof ForEachStepSchema>;
export declare const getForEachStepSchema: (stepSchema: z.ZodType, loose?: boolean) => z.ZodObject<{
    name: z.ZodString;
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
    if: z.ZodOptional<z.ZodString>;
    foreach: z.ZodUnion<readonly [z.ZodString, z.ZodArray<z.ZodUnknown>]>;
    type: z.ZodLiteral<"foreach">;
    'on-failure': z.ZodOptional<z.ZodObject<{
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
        continue: z.ZodOptional<z.ZodUnion<readonly [z.ZodBoolean, z.ZodString]>>;
        fallback: z.ZodOptional<z.ZodArray<z.ZodType<unknown, unknown, z.core.$ZodTypeInternals<unknown, unknown>>>>;
    }, z.core.$strip>> | z.ZodOptional<z.ZodObject<{
        retry: z.ZodOptional<z.ZodOptional<z.ZodObject<{
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
        }, z.core.$strip>>>;
        continue: z.ZodOptional<z.ZodOptional<z.ZodUnion<readonly [z.ZodBoolean, z.ZodString]>>>;
        fallback: z.ZodOptional<z.ZodOptional<z.ZodArray<z.ZodType<unknown, unknown, z.core.$ZodTypeInternals<unknown, unknown>>>>>;
    }, z.core.$strip>>;
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
        continue: z.ZodOptional<z.ZodUnion<readonly [z.ZodBoolean, z.ZodString]>>;
        fallback: z.ZodOptional<z.ZodArray<z.ZodType<unknown, unknown, z.core.$ZodTypeInternals<unknown, unknown>>>>;
    }, z.core.$strip>> | z.ZodOptional<z.ZodObject<{
        retry: z.ZodOptional<z.ZodOptional<z.ZodObject<{
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
        }, z.core.$strip>>>;
        continue: z.ZodOptional<z.ZodOptional<z.ZodUnion<readonly [z.ZodBoolean, z.ZodString]>>>;
        fallback: z.ZodOptional<z.ZodOptional<z.ZodArray<z.ZodType<unknown, unknown, z.core.$ZodTypeInternals<unknown, unknown>>>>>;
    }, z.core.$strip>>;
    steps: z.ZodArray<z.ZodType<unknown, unknown, z.core.$ZodTypeInternals<unknown, unknown>>>;
}, z.core.$strip> | z.ZodObject<{
    name: z.ZodOptional<z.ZodString>;
    'max-step-size': z.ZodOptional<z.ZodOptional<z.ZodString>>;
    timeout: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    'max-iterations': z.ZodOptional<z.ZodOptional<z.ZodUnion<readonly [z.ZodNumber, z.ZodObject<{
        limit: z.ZodNumber;
        'on-limit': z.ZodEnum<{
            continue: "continue";
            fail: "fail";
        }>;
    }, z.core.$strip>]>>>;
    'iteration-timeout': z.ZodOptional<z.ZodOptional<z.ZodString>>;
    if: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    foreach: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodArray<z.ZodUnknown>]>>;
    type: z.ZodNonOptional<z.ZodOptional<z.ZodLiteral<"foreach">>>;
    'on-failure': z.ZodOptional<z.ZodOptional<z.ZodObject<{
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
        continue: z.ZodOptional<z.ZodUnion<readonly [z.ZodBoolean, z.ZodString]>>;
        fallback: z.ZodOptional<z.ZodArray<z.ZodType<unknown, unknown, z.core.$ZodTypeInternals<unknown, unknown>>>>;
    }, z.core.$strip>> | z.ZodOptional<z.ZodObject<{
        retry: z.ZodOptional<z.ZodOptional<z.ZodObject<{
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
        }, z.core.$strip>>>;
        continue: z.ZodOptional<z.ZodOptional<z.ZodUnion<readonly [z.ZodBoolean, z.ZodString]>>>;
        fallback: z.ZodOptional<z.ZodOptional<z.ZodArray<z.ZodType<unknown, unknown, z.core.$ZodTypeInternals<unknown, unknown>>>>>;
    }, z.core.$strip>>>;
    'iteration-on-failure': z.ZodOptional<z.ZodOptional<z.ZodObject<{
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
        continue: z.ZodOptional<z.ZodUnion<readonly [z.ZodBoolean, z.ZodString]>>;
        fallback: z.ZodOptional<z.ZodArray<z.ZodType<unknown, unknown, z.core.$ZodTypeInternals<unknown, unknown>>>>;
    }, z.core.$strip>> | z.ZodOptional<z.ZodObject<{
        retry: z.ZodOptional<z.ZodOptional<z.ZodObject<{
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
        }, z.core.$strip>>>;
        continue: z.ZodOptional<z.ZodOptional<z.ZodUnion<readonly [z.ZodBoolean, z.ZodString]>>>;
        fallback: z.ZodOptional<z.ZodOptional<z.ZodArray<z.ZodType<unknown, unknown, z.core.$ZodTypeInternals<unknown, unknown>>>>>;
    }, z.core.$strip>>>;
    steps: z.ZodOptional<z.ZodArray<z.ZodType<unknown, unknown, z.core.$ZodTypeInternals<unknown, unknown>>>>;
}, z.core.$strip>;
export declare const WhileStepConfigSchema: z.ZodObject<{
    condition: z.ZodString;
    steps: z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        type: z.ZodString;
        'max-step-size': z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export declare const WhileStepSchema: z.ZodObject<{
    name: z.ZodString;
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
    if: z.ZodOptional<z.ZodString>;
    condition: z.ZodString;
    steps: z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        type: z.ZodString;
        'max-step-size': z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
    type: z.ZodLiteral<"while">;
}, z.core.$strip>;
export type WhileStep = z.infer<typeof WhileStepSchema>;
export declare const getWhileStepSchema: (stepSchema: z.ZodType, loose?: boolean) => z.ZodObject<{
    name: z.ZodString;
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
    if: z.ZodOptional<z.ZodString>;
    condition: z.ZodString;
    type: z.ZodLiteral<"while">;
    'on-failure': z.ZodOptional<z.ZodObject<{
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
        continue: z.ZodOptional<z.ZodUnion<readonly [z.ZodBoolean, z.ZodString]>>;
        fallback: z.ZodOptional<z.ZodArray<z.ZodType<unknown, unknown, z.core.$ZodTypeInternals<unknown, unknown>>>>;
    }, z.core.$strip>> | z.ZodOptional<z.ZodObject<{
        retry: z.ZodOptional<z.ZodOptional<z.ZodObject<{
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
        }, z.core.$strip>>>;
        continue: z.ZodOptional<z.ZodOptional<z.ZodUnion<readonly [z.ZodBoolean, z.ZodString]>>>;
        fallback: z.ZodOptional<z.ZodOptional<z.ZodArray<z.ZodType<unknown, unknown, z.core.$ZodTypeInternals<unknown, unknown>>>>>;
    }, z.core.$strip>>;
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
        continue: z.ZodOptional<z.ZodUnion<readonly [z.ZodBoolean, z.ZodString]>>;
        fallback: z.ZodOptional<z.ZodArray<z.ZodType<unknown, unknown, z.core.$ZodTypeInternals<unknown, unknown>>>>;
    }, z.core.$strip>> | z.ZodOptional<z.ZodObject<{
        retry: z.ZodOptional<z.ZodOptional<z.ZodObject<{
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
        }, z.core.$strip>>>;
        continue: z.ZodOptional<z.ZodOptional<z.ZodUnion<readonly [z.ZodBoolean, z.ZodString]>>>;
        fallback: z.ZodOptional<z.ZodOptional<z.ZodArray<z.ZodType<unknown, unknown, z.core.$ZodTypeInternals<unknown, unknown>>>>>;
    }, z.core.$strip>>;
    steps: z.ZodArray<z.ZodType<unknown, unknown, z.core.$ZodTypeInternals<unknown, unknown>>>;
}, z.core.$strip> | z.ZodObject<{
    name: z.ZodOptional<z.ZodString>;
    'max-step-size': z.ZodOptional<z.ZodOptional<z.ZodString>>;
    timeout: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    'max-iterations': z.ZodOptional<z.ZodOptional<z.ZodUnion<readonly [z.ZodNumber, z.ZodObject<{
        limit: z.ZodNumber;
        'on-limit': z.ZodEnum<{
            continue: "continue";
            fail: "fail";
        }>;
    }, z.core.$strip>]>>>;
    'iteration-timeout': z.ZodOptional<z.ZodOptional<z.ZodString>>;
    if: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    condition: z.ZodOptional<z.ZodString>;
    type: z.ZodNonOptional<z.ZodOptional<z.ZodLiteral<"while">>>;
    'on-failure': z.ZodOptional<z.ZodOptional<z.ZodObject<{
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
        continue: z.ZodOptional<z.ZodUnion<readonly [z.ZodBoolean, z.ZodString]>>;
        fallback: z.ZodOptional<z.ZodArray<z.ZodType<unknown, unknown, z.core.$ZodTypeInternals<unknown, unknown>>>>;
    }, z.core.$strip>> | z.ZodOptional<z.ZodObject<{
        retry: z.ZodOptional<z.ZodOptional<z.ZodObject<{
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
        }, z.core.$strip>>>;
        continue: z.ZodOptional<z.ZodOptional<z.ZodUnion<readonly [z.ZodBoolean, z.ZodString]>>>;
        fallback: z.ZodOptional<z.ZodOptional<z.ZodArray<z.ZodType<unknown, unknown, z.core.$ZodTypeInternals<unknown, unknown>>>>>;
    }, z.core.$strip>>>;
    'iteration-on-failure': z.ZodOptional<z.ZodOptional<z.ZodObject<{
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
        continue: z.ZodOptional<z.ZodUnion<readonly [z.ZodBoolean, z.ZodString]>>;
        fallback: z.ZodOptional<z.ZodArray<z.ZodType<unknown, unknown, z.core.$ZodTypeInternals<unknown, unknown>>>>;
    }, z.core.$strip>> | z.ZodOptional<z.ZodObject<{
        retry: z.ZodOptional<z.ZodOptional<z.ZodObject<{
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
        }, z.core.$strip>>>;
        continue: z.ZodOptional<z.ZodOptional<z.ZodUnion<readonly [z.ZodBoolean, z.ZodString]>>>;
        fallback: z.ZodOptional<z.ZodOptional<z.ZodArray<z.ZodType<unknown, unknown, z.core.$ZodTypeInternals<unknown, unknown>>>>>;
    }, z.core.$strip>>>;
    steps: z.ZodOptional<z.ZodArray<z.ZodType<unknown, unknown, z.core.$ZodTypeInternals<unknown, unknown>>>>;
}, z.core.$strip>;
export declare const SwitchCaseSchema: z.ZodObject<{
    match: z.ZodUnion<readonly [z.ZodString, z.ZodNumber, z.ZodBoolean]>;
    steps: z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        type: z.ZodString;
        'max-step-size': z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type SwitchCase = z.infer<typeof SwitchCaseSchema>;
export declare const SwitchStepConfigSchema: z.ZodObject<{
    expression: z.ZodString;
    cases: z.ZodArray<z.ZodObject<{
        match: z.ZodUnion<readonly [z.ZodString, z.ZodNumber, z.ZodBoolean]>;
        steps: z.ZodArray<z.ZodObject<{
            name: z.ZodString;
            type: z.ZodString;
            'max-step-size': z.ZodOptional<z.ZodString>;
        }, z.core.$strip>>;
    }, z.core.$strip>>;
    default: z.ZodOptional<z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        type: z.ZodString;
        'max-step-size': z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>>;
}, z.core.$strip>;
export declare const SwitchStepSchema: z.ZodObject<{
    name: z.ZodString;
    'max-step-size': z.ZodOptional<z.ZodString>;
    timeout: z.ZodOptional<z.ZodString>;
    if: z.ZodOptional<z.ZodString>;
    expression: z.ZodString;
    cases: z.ZodArray<z.ZodObject<{
        match: z.ZodUnion<readonly [z.ZodString, z.ZodNumber, z.ZodBoolean]>;
        steps: z.ZodArray<z.ZodObject<{
            name: z.ZodString;
            type: z.ZodString;
            'max-step-size': z.ZodOptional<z.ZodString>;
        }, z.core.$strip>>;
    }, z.core.$strip>>;
    default: z.ZodOptional<z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        type: z.ZodString;
        'max-step-size': z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>>;
    type: z.ZodLiteral<"switch">;
}, z.core.$strip>;
export type SwitchStep = z.infer<typeof SwitchStepSchema>;
export declare const getSwitchStepSchema: (stepSchema: z.ZodType, loose?: boolean) => z.ZodObject<{
    name: z.ZodString;
    'max-step-size': z.ZodOptional<z.ZodString>;
    timeout: z.ZodOptional<z.ZodString>;
    if: z.ZodOptional<z.ZodString>;
    expression: z.ZodString;
    type: z.ZodLiteral<"switch">;
    cases: z.ZodArray<z.ZodObject<{
        match: z.ZodUnion<readonly [z.ZodString, z.ZodNumber, z.ZodBoolean]>;
        steps: z.ZodArray<z.ZodType<unknown, unknown, z.core.$ZodTypeInternals<unknown, unknown>>>;
    }, z.core.$strip>>;
    default: z.ZodOptional<z.ZodArray<z.ZodType<unknown, unknown, z.core.$ZodTypeInternals<unknown, unknown>>>>;
}, z.core.$strip> | z.ZodObject<{
    name: z.ZodOptional<z.ZodString>;
    'max-step-size': z.ZodOptional<z.ZodOptional<z.ZodString>>;
    timeout: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    if: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    expression: z.ZodOptional<z.ZodString>;
    type: z.ZodNonOptional<z.ZodOptional<z.ZodLiteral<"switch">>>;
    cases: z.ZodOptional<z.ZodArray<z.ZodObject<{
        match: z.ZodUnion<readonly [z.ZodString, z.ZodNumber, z.ZodBoolean]>;
        steps: z.ZodArray<z.ZodType<unknown, unknown, z.core.$ZodTypeInternals<unknown, unknown>>>;
    }, z.core.$strip>>>;
    default: z.ZodOptional<z.ZodOptional<z.ZodArray<z.ZodType<unknown, unknown, z.core.$ZodTypeInternals<unknown, unknown>>>>>;
}, z.core.$strip>;
export declare const IfStepConfigSchema: z.ZodObject<{
    condition: z.ZodString;
    steps: z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        type: z.ZodString;
        'max-step-size': z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
    else: z.ZodOptional<z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        type: z.ZodString;
        'max-step-size': z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>>;
}, z.core.$strip>;
export declare const IfStepSchema: z.ZodObject<{
    name: z.ZodString;
    'max-step-size': z.ZodOptional<z.ZodString>;
    condition: z.ZodString;
    steps: z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        type: z.ZodString;
        'max-step-size': z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
    else: z.ZodOptional<z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        type: z.ZodString;
        'max-step-size': z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>>;
    type: z.ZodLiteral<"if">;
}, z.core.$strip>;
export type IfStep = z.infer<typeof IfStepSchema>;
export declare const getIfStepSchema: (stepSchema: z.ZodType, loose?: boolean) => z.ZodObject<{
    name: z.ZodString;
    'max-step-size': z.ZodOptional<z.ZodString>;
    condition: z.ZodString;
    type: z.ZodLiteral<"if">;
    steps: z.ZodArray<z.ZodType<unknown, unknown, z.core.$ZodTypeInternals<unknown, unknown>>>;
    else: z.ZodOptional<z.ZodArray<z.ZodType<unknown, unknown, z.core.$ZodTypeInternals<unknown, unknown>>>>;
}, z.core.$strip> | z.ZodObject<{
    name: z.ZodOptional<z.ZodString>;
    'max-step-size': z.ZodOptional<z.ZodOptional<z.ZodString>>;
    condition: z.ZodOptional<z.ZodString>;
    type: z.ZodNonOptional<z.ZodOptional<z.ZodLiteral<"if">>>;
    steps: z.ZodOptional<z.ZodArray<z.ZodType<unknown, unknown, z.core.$ZodTypeInternals<unknown, unknown>>>>;
    else: z.ZodOptional<z.ZodOptional<z.ZodArray<z.ZodType<unknown, unknown, z.core.$ZodTypeInternals<unknown, unknown>>>>>;
}, z.core.$strip>;
export declare const ParallelStepConfigSchema: z.ZodObject<{
    branches: z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        steps: z.ZodArray<z.ZodObject<{
            name: z.ZodString;
            type: z.ZodString;
            'max-step-size': z.ZodOptional<z.ZodString>;
        }, z.core.$strip>>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export declare const ParallelStepSchema: z.ZodObject<{
    name: z.ZodString;
    'max-step-size': z.ZodOptional<z.ZodString>;
    branches: z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        steps: z.ZodArray<z.ZodObject<{
            name: z.ZodString;
            type: z.ZodString;
            'max-step-size': z.ZodOptional<z.ZodString>;
        }, z.core.$strip>>;
    }, z.core.$strip>>;
    type: z.ZodLiteral<"parallel">;
}, z.core.$strip>;
export type ParallelStep = z.infer<typeof ParallelStepSchema>;
export declare const getParallelStepSchema: (stepSchema: z.ZodType, loose?: boolean) => z.ZodObject<{
    name: z.ZodString;
    'max-step-size': z.ZodOptional<z.ZodString>;
    type: z.ZodLiteral<"parallel">;
    branches: z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        steps: z.ZodArray<z.ZodType<unknown, unknown, z.core.$ZodTypeInternals<unknown, unknown>>>;
    }, z.core.$strip>>;
}, z.core.$strip> | z.ZodObject<{
    name: z.ZodOptional<z.ZodString>;
    'max-step-size': z.ZodOptional<z.ZodOptional<z.ZodString>>;
    type: z.ZodNonOptional<z.ZodOptional<z.ZodLiteral<"parallel">>>;
    branches: z.ZodOptional<z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        steps: z.ZodArray<z.ZodType<unknown, unknown, z.core.$ZodTypeInternals<unknown, unknown>>>;
    }, z.core.$strip>>>;
}, z.core.$strip>;
export declare const MergeStepConfigSchema: z.ZodObject<{
    sources: z.ZodArray<z.ZodString>;
    steps: z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        type: z.ZodString;
        'max-step-size': z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export declare const MergeStepSchema: z.ZodObject<{
    name: z.ZodString;
    'max-step-size': z.ZodOptional<z.ZodString>;
    sources: z.ZodArray<z.ZodString>;
    steps: z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        type: z.ZodString;
        'max-step-size': z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
    type: z.ZodLiteral<"merge">;
}, z.core.$strip>;
export type MergeStep = z.infer<typeof MergeStepSchema>;
export declare const getMergeStepSchema: (stepSchema: z.ZodType, loose?: boolean) => z.ZodObject<{
    name: z.ZodString;
    'max-step-size': z.ZodOptional<z.ZodString>;
    sources: z.ZodArray<z.ZodString>;
    type: z.ZodLiteral<"merge">;
    steps: z.ZodArray<z.ZodType<unknown, unknown, z.core.$ZodTypeInternals<unknown, unknown>>>;
}, z.core.$strip> | z.ZodObject<{
    name: z.ZodOptional<z.ZodString>;
    'max-step-size': z.ZodOptional<z.ZodOptional<z.ZodString>>;
    sources: z.ZodOptional<z.ZodArray<z.ZodString>>;
    type: z.ZodNonOptional<z.ZodOptional<z.ZodLiteral<"merge">>>;
    steps: z.ZodOptional<z.ZodArray<z.ZodType<unknown, unknown, z.core.$ZodTypeInternals<unknown, unknown>>>>;
}, z.core.$strip>;
export declare const LoopBreakStepSchema: z.ZodObject<{
    name: z.ZodString;
    'max-step-size': z.ZodOptional<z.ZodString>;
    if: z.ZodOptional<z.ZodString>;
    type: z.ZodLiteral<"loop.break">;
}, z.core.$strip>;
export type LoopBreakStep = z.infer<typeof LoopBreakStepSchema>;
export declare const LoopContinueStepSchema: z.ZodObject<{
    name: z.ZodString;
    'max-step-size': z.ZodOptional<z.ZodString>;
    if: z.ZodOptional<z.ZodString>;
    type: z.ZodLiteral<"loop.continue">;
}, z.core.$strip>;
export type LoopContinueStep = z.infer<typeof LoopContinueStepSchema>;
export declare const ConsoleStepInputSchema: z.ZodObject<{
    message: z.ZodOptional<z.ZodUnknown>;
}, z.core.$strip>;
export declare const WorkflowExecuteStepInputSchema: z.ZodObject<{
    'workflow-id': z.ZodString;
    inputs: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, z.core.$strip>;
export declare const WorkflowExecuteStepSchema: z.ZodObject<{
    name: z.ZodString;
    'max-step-size': z.ZodOptional<z.ZodString>;
    with: z.ZodObject<{
        'workflow-id': z.ZodString;
        inputs: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    }, z.core.$strip>;
    type: z.ZodLiteral<"workflow.execute">;
}, z.core.$strip>;
export type WorkflowExecuteStep = z.infer<typeof WorkflowExecuteStepSchema>;
export declare const WorkflowExecuteAsyncStepSchema: z.ZodObject<{
    name: z.ZodString;
    'max-step-size': z.ZodOptional<z.ZodString>;
    with: z.ZodObject<{
        'workflow-id': z.ZodString;
        inputs: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    }, z.core.$strip>;
    type: z.ZodLiteral<"workflow.executeAsync">;
}, z.core.$strip>;
export type WorkflowExecuteAsyncStep = z.infer<typeof WorkflowExecuteAsyncStepSchema>;
export declare const WorkflowExecuteAsyncStepOutputSchema: z.ZodObject<{
    workflowId: z.ZodString;
    executionId: z.ZodString;
    awaited: z.ZodBoolean;
    status: z.ZodString;
    startedAt: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export declare const WorkflowOutputStepSchema: z.ZodObject<{
    name: z.ZodString;
    'max-step-size': z.ZodOptional<z.ZodString>;
    type: z.ZodLiteral<"workflow.output">;
    status: z.ZodDefault<z.ZodOptional<z.ZodEnum<{
        completed: "completed";
        cancelled: "cancelled";
        failed: "failed";
    }>>>;
    with: z.ZodRecord<z.ZodString, z.ZodAny>;
    if: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type WorkflowOutputStep = z.infer<typeof WorkflowOutputStepSchema>;
export declare const WorkflowFailStepSchema: z.ZodObject<{
    name: z.ZodString;
    'max-step-size': z.ZodOptional<z.ZodString>;
    type: z.ZodLiteral<"workflow.fail">;
    with: z.ZodOptional<z.ZodObject<{
        message: z.ZodOptional<z.ZodString>;
        reason: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
    if: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type WorkflowFailStep = z.infer<typeof WorkflowFailStepSchema>;
export declare const WorkflowOutputSchema: z.ZodUnion<readonly [z.ZodObject<{
    name: z.ZodString;
    description: z.ZodOptional<z.ZodString>;
    required: z.ZodOptional<z.ZodBoolean>;
    type: z.ZodLiteral<"string">;
    default: z.ZodOptional<z.ZodString>;
}, z.core.$strip>, z.ZodObject<{
    name: z.ZodString;
    description: z.ZodOptional<z.ZodString>;
    required: z.ZodOptional<z.ZodBoolean>;
    type: z.ZodLiteral<"number">;
    default: z.ZodOptional<z.ZodNumber>;
}, z.core.$strip>, z.ZodObject<{
    name: z.ZodString;
    description: z.ZodOptional<z.ZodString>;
    required: z.ZodOptional<z.ZodBoolean>;
    type: z.ZodLiteral<"boolean">;
    default: z.ZodOptional<z.ZodBoolean>;
}, z.core.$strip>, z.ZodObject<{
    name: z.ZodString;
    description: z.ZodOptional<z.ZodString>;
    required: z.ZodOptional<z.ZodBoolean>;
    type: z.ZodLiteral<"choice">;
    default: z.ZodOptional<z.ZodString>;
    options: z.ZodArray<z.ZodString>;
}, z.core.$strip>, z.ZodObject<{
    name: z.ZodString;
    description: z.ZodOptional<z.ZodString>;
    required: z.ZodOptional<z.ZodBoolean>;
    type: z.ZodLiteral<"array">;
    minItems: z.ZodOptional<z.ZodNumber>;
    maxItems: z.ZodOptional<z.ZodNumber>;
    default: z.ZodOptional<z.ZodUnion<readonly [z.ZodArray<z.ZodString>, z.ZodArray<z.ZodNumber>, z.ZodArray<z.ZodBoolean>]>>;
}, z.core.$strip>]>;
export type WorkflowOutput = z.infer<typeof WorkflowOutputSchema>;
export declare const WorkflowConstsSchema: z.ZodRecord<z.ZodString, z.ZodUnion<readonly [z.ZodString, z.ZodNumber, z.ZodBoolean, z.ZodRecord<z.ZodString, z.ZodAny>, z.ZodObject<{}, z.core.$strip>, z.ZodArray<z.ZodAny>]>>;
declare const StepSchema: z.ZodLazy<z.ZodUnion<readonly [z.ZodObject<{
    name: z.ZodString;
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
    if: z.ZodOptional<z.ZodString>;
    foreach: z.ZodUnion<readonly [z.ZodString, z.ZodArray<z.ZodUnknown>]>;
    steps: z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        type: z.ZodString;
        'max-step-size': z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
    type: z.ZodLiteral<"foreach">;
}, z.core.$strip>, z.ZodObject<{
    name: z.ZodString;
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
    if: z.ZodOptional<z.ZodString>;
    condition: z.ZodString;
    steps: z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        type: z.ZodString;
        'max-step-size': z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
    type: z.ZodLiteral<"while">;
}, z.core.$strip>, z.ZodObject<{
    name: z.ZodString;
    'max-step-size': z.ZodOptional<z.ZodString>;
    condition: z.ZodString;
    steps: z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        type: z.ZodString;
        'max-step-size': z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
    else: z.ZodOptional<z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        type: z.ZodString;
        'max-step-size': z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>>;
    type: z.ZodLiteral<"if">;
}, z.core.$strip>, z.ZodObject<{
    name: z.ZodString;
    'max-step-size': z.ZodOptional<z.ZodString>;
    timeout: z.ZodOptional<z.ZodString>;
    if: z.ZodOptional<z.ZodString>;
    expression: z.ZodString;
    cases: z.ZodArray<z.ZodObject<{
        match: z.ZodUnion<readonly [z.ZodString, z.ZodNumber, z.ZodBoolean]>;
        steps: z.ZodArray<z.ZodObject<{
            name: z.ZodString;
            type: z.ZodString;
            'max-step-size': z.ZodOptional<z.ZodString>;
        }, z.core.$strip>>;
    }, z.core.$strip>>;
    default: z.ZodOptional<z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        type: z.ZodString;
        'max-step-size': z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>>;
    type: z.ZodLiteral<"switch">;
}, z.core.$strip>, z.ZodObject<{
    name: z.ZodString;
    'max-step-size': z.ZodOptional<z.ZodString>;
    type: z.ZodLiteral<"wait">;
    with: z.ZodObject<{
        duration: z.ZodString;
    }, z.core.$strip>;
}, z.core.$strip>, z.ZodObject<{
    name: z.ZodString;
    'max-step-size': z.ZodOptional<z.ZodString>;
    type: z.ZodLiteral<"waitForInput">;
    with: z.ZodOptional<z.ZodObject<{
        message: z.ZodOptional<z.ZodString>;
        schema: z.ZodOptional<z.ZodObject<{
            type: z.ZodOptional<z.ZodLiteral<"object">>;
            title: z.ZodOptional<z.ZodString>;
            description: z.ZodOptional<z.ZodString>;
            $ref: z.ZodOptional<z.ZodString> | z.ZodOptional<z.ZodUnion<readonly [z.ZodEnum<{
                [x: string]: string;
            }>, z.ZodString]>>;
            properties: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodType<import("./schema/common/json_model_shape_schema").JsonSchema, unknown, z.core.$ZodTypeInternals<import("./schema/common/json_model_shape_schema").JsonSchema, unknown>>>>;
            additionalProperties: z.ZodOptional<z.ZodBoolean>;
            required: z.ZodOptional<z.ZodArray<z.ZodString>>;
            definitions: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodType<import("./schema/common/json_model_shape_schema").JsonSchema, unknown, z.core.$ZodTypeInternals<import("./schema/common/json_model_shape_schema").JsonSchema, unknown>>>>;
            $defs: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodType<import("./schema/common/json_model_shape_schema").JsonSchema, unknown, z.core.$ZodTypeInternals<import("./schema/common/json_model_shape_schema").JsonSchema, unknown>>>>;
        }, z.core.$strip>>;
    }, z.core.$strip>>;
}, z.core.$strip>, z.ZodObject<{
    name: z.ZodString;
    'max-step-size': z.ZodOptional<z.ZodString>;
    type: z.ZodLiteral<"data.set">;
    with: z.ZodRecord<z.ZodString, z.ZodUnknown>;
}, z.core.$strip>, z.ZodObject<{
    name: z.ZodString;
    'max-step-size': z.ZodOptional<z.ZodString>;
    type: z.ZodString;
    with: z.ZodUnion<readonly [z.ZodObject<{
        request: z.ZodObject<{
            method: z.ZodDefault<z.ZodOptional<z.ZodEnum<{
                PATCH: "PATCH";
                POST: "POST";
                GET: "GET";
                PUT: "PUT";
                DELETE: "DELETE";
                HEAD: "HEAD";
            }>>>;
            path: z.ZodString;
            body: z.ZodOptional<z.ZodAny>;
        }, z.core.$strip>;
    }, z.core.$strip>, z.ZodIntersection<z.ZodObject<{
        index: z.ZodOptional<z.ZodString>;
        id: z.ZodOptional<z.ZodString>;
        query: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
        body: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
        size: z.ZodOptional<z.ZodNumber>;
        from: z.ZodOptional<z.ZodNumber>;
        sort: z.ZodOptional<z.ZodArray<z.ZodAny>>;
        _source: z.ZodOptional<z.ZodUnion<readonly [z.ZodBoolean, z.ZodArray<z.ZodString>, z.ZodString]>>;
        aggs: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
        aggregations: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
    }, z.core.$strip>, z.ZodRecord<z.ZodString, z.ZodAny>>]>;
}, z.core.$strip>, z.ZodObject<{
    name: z.ZodString;
    'max-step-size': z.ZodOptional<z.ZodString>;
    type: z.ZodString;
    with: z.ZodUnion<readonly [z.ZodObject<{
        use_server_info: z.ZodOptional<z.ZodBoolean>;
        use_localhost: z.ZodOptional<z.ZodBoolean>;
        debug: z.ZodOptional<z.ZodBoolean>;
        request: z.ZodObject<{
            method: z.ZodDefault<z.ZodOptional<z.ZodEnum<{
                PATCH: "PATCH";
                POST: "POST";
                GET: "GET";
                PUT: "PUT";
                DELETE: "DELETE";
            }>>>;
            path: z.ZodString;
            body: z.ZodOptional<z.ZodAny>;
            headers: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
        }, z.core.$strip>;
        fetcher: z.ZodOptional<z.ZodObject<{
            skip_ssl_verification: z.ZodOptional<z.ZodBoolean>;
            follow_redirects: z.ZodOptional<z.ZodBoolean>;
            max_redirects: z.ZodOptional<z.ZodNumber>;
            keep_alive: z.ZodOptional<z.ZodBoolean>;
            max_content_length: z.ZodOptional<z.ZodNumber>;
        }, z.core.$strip>>;
    }, z.core.$strip>, z.ZodIntersection<z.ZodObject<{
        use_server_info: z.ZodOptional<z.ZodBoolean>;
        use_localhost: z.ZodOptional<z.ZodBoolean>;
        debug: z.ZodOptional<z.ZodBoolean>;
        title: z.ZodOptional<z.ZodString>;
        description: z.ZodOptional<z.ZodString>;
        tags: z.ZodOptional<z.ZodArray<z.ZodString>>;
        severity: z.ZodOptional<z.ZodEnum<{
            high: "high";
            low: "low";
            medium: "medium";
            critical: "critical";
        }>>;
        assignees: z.ZodOptional<z.ZodArray<z.ZodString>>;
        owner: z.ZodOptional<z.ZodString>;
        connector: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
        settings: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
        id: z.ZodOptional<z.ZodString>;
        case_id: z.ZodOptional<z.ZodString>;
        space_id: z.ZodOptional<z.ZodString>;
        page: z.ZodOptional<z.ZodNumber>;
        perPage: z.ZodOptional<z.ZodNumber>;
        status: z.ZodOptional<z.ZodString>;
        fetcher: z.ZodOptional<z.ZodObject<{
            skip_ssl_verification: z.ZodOptional<z.ZodBoolean>;
            follow_redirects: z.ZodOptional<z.ZodBoolean>;
            max_redirects: z.ZodOptional<z.ZodNumber>;
            keep_alive: z.ZodOptional<z.ZodBoolean>;
            max_content_length: z.ZodOptional<z.ZodNumber>;
        }, z.core.$strip>>;
    }, z.core.$strip>, z.ZodRecord<z.ZodString, z.ZodAny>>]>;
}, z.core.$strip>, z.ZodObject<{
    name: z.ZodString;
    'max-step-size': z.ZodOptional<z.ZodString>;
    branches: z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        steps: z.ZodArray<z.ZodObject<{
            name: z.ZodString;
            type: z.ZodString;
            'max-step-size': z.ZodOptional<z.ZodString>;
        }, z.core.$strip>>;
    }, z.core.$strip>>;
    type: z.ZodLiteral<"parallel">;
}, z.core.$strip>, z.ZodObject<{
    name: z.ZodString;
    'max-step-size': z.ZodOptional<z.ZodString>;
    sources: z.ZodArray<z.ZodString>;
    steps: z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        type: z.ZodString;
        'max-step-size': z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
    type: z.ZodLiteral<"merge">;
}, z.core.$strip>, z.ZodObject<{
    name: z.ZodString;
    'max-step-size': z.ZodOptional<z.ZodString>;
    with: z.ZodObject<{
        'workflow-id': z.ZodString;
        inputs: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    }, z.core.$strip>;
    type: z.ZodLiteral<"workflow.execute">;
}, z.core.$strip>, z.ZodObject<{
    name: z.ZodString;
    'max-step-size': z.ZodOptional<z.ZodString>;
    with: z.ZodObject<{
        'workflow-id': z.ZodString;
        inputs: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    }, z.core.$strip>;
    type: z.ZodLiteral<"workflow.executeAsync">;
}, z.core.$strip>, z.ZodObject<{
    name: z.ZodString;
    'max-step-size': z.ZodOptional<z.ZodString>;
    type: z.ZodLiteral<"workflow.output">;
    status: z.ZodDefault<z.ZodOptional<z.ZodEnum<{
        completed: "completed";
        cancelled: "cancelled";
        failed: "failed";
    }>>>;
    with: z.ZodRecord<z.ZodString, z.ZodAny>;
    if: z.ZodOptional<z.ZodString>;
}, z.core.$strip>, z.ZodObject<{
    name: z.ZodString;
    'max-step-size': z.ZodOptional<z.ZodString>;
    type: z.ZodLiteral<"workflow.fail">;
    with: z.ZodOptional<z.ZodObject<{
        message: z.ZodOptional<z.ZodString>;
        reason: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
    if: z.ZodOptional<z.ZodString>;
}, z.core.$strip>, z.ZodObject<{
    name: z.ZodString;
    'max-step-size': z.ZodOptional<z.ZodString>;
    if: z.ZodOptional<z.ZodString>;
    type: z.ZodLiteral<"loop.break">;
}, z.core.$strip>, z.ZodObject<{
    name: z.ZodString;
    'max-step-size': z.ZodOptional<z.ZodString>;
    if: z.ZodOptional<z.ZodString>;
    type: z.ZodLiteral<"loop.continue">;
}, z.core.$strip>, z.ZodObject<{
    name: z.ZodString;
    'max-step-size': z.ZodOptional<z.ZodString>;
    type: z.ZodString;
    with: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
    if: z.ZodOptional<z.ZodString>;
    foreach: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodArray<z.ZodUnknown>]>>;
    timeout: z.ZodOptional<z.ZodString>;
    'on-failure': z.ZodOptional<z.ZodObject<{
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
}, z.core.$strip>]>>;
export type Step = z.infer<typeof StepSchema>;
export declare const LoopStepTypes: readonly ["foreach", "while"];
export type LoopStepType = (typeof LoopStepTypes)[number];
export declare const BuiltInStepTypes: ("switch" | "if" | "merge" | "wait" | "foreach" | "waitForInput" | "data.set" | "while" | "parallel" | "loop.break" | "loop.continue" | "workflow.execute" | "workflow.executeAsync" | "workflow.output" | "workflow.fail")[];
export type BuiltInStepType = (typeof BuiltInStepTypes)[number];
declare const WorkflowSchemaBase: z.ZodObject<{
    version: z.ZodDefault<z.ZodOptional<z.ZodLiteral<"1">>>;
    name: z.ZodString;
    description: z.ZodOptional<z.ZodString>;
    settings: z.ZodOptional<z.ZodObject<{
        'on-failure': z.ZodOptional<z.ZodObject<{
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
        timezone: z.ZodOptional<z.ZodString>;
        timeout: z.ZodOptional<z.ZodString>;
        concurrency: z.ZodOptional<z.ZodObject<{
            key: z.ZodOptional<z.ZodString>;
            strategy: z.ZodOptional<z.ZodEnum<{
                drop: "drop";
                "cancel-in-progress": "cancel-in-progress";
            }>>;
            max: z.ZodOptional<z.ZodNumber>;
        }, z.core.$strip>>;
        'max-step-size': z.ZodOptional<z.ZodString>;
        liquid: z.ZodOptional<z.ZodObject<{
            parseLimit: z.ZodOptional<z.ZodNumber>;
            renderLimit: z.ZodOptional<z.ZodNumber>;
            memoryLimit: z.ZodOptional<z.ZodNumber>;
        }, z.core.$strip>>;
    }, z.core.$strip>>;
    enabled: z.ZodDefault<z.ZodBoolean>;
    tags: z.ZodOptional<z.ZodArray<z.ZodString>>;
    outputs: z.ZodOptional<z.ZodUnion<readonly [z.ZodObject<{
        type: z.ZodOptional<z.ZodLiteral<"object">>;
        title: z.ZodOptional<z.ZodString>;
        description: z.ZodOptional<z.ZodString>;
        $ref: z.ZodOptional<z.ZodString> | z.ZodOptional<z.ZodUnion<readonly [z.ZodEnum<{
            [x: string]: string;
        }>, z.ZodString]>>;
        properties: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodType<import("./schema/common/json_model_shape_schema").JsonSchema, unknown, z.core.$ZodTypeInternals<import("./schema/common/json_model_shape_schema").JsonSchema, unknown>>>>;
        additionalProperties: z.ZodOptional<z.ZodBoolean>;
        required: z.ZodOptional<z.ZodArray<z.ZodString>>;
        definitions: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodType<import("./schema/common/json_model_shape_schema").JsonSchema, unknown, z.core.$ZodTypeInternals<import("./schema/common/json_model_shape_schema").JsonSchema, unknown>>>>;
        $defs: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodType<import("./schema/common/json_model_shape_schema").JsonSchema, unknown, z.core.$ZodTypeInternals<import("./schema/common/json_model_shape_schema").JsonSchema, unknown>>>>;
    }, z.core.$strip>, z.ZodArray<z.ZodUnion<readonly [z.ZodObject<{
        name: z.ZodString;
        description: z.ZodOptional<z.ZodString>;
        required: z.ZodOptional<z.ZodBoolean>;
        type: z.ZodLiteral<"string">;
        default: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>, z.ZodObject<{
        name: z.ZodString;
        description: z.ZodOptional<z.ZodString>;
        required: z.ZodOptional<z.ZodBoolean>;
        type: z.ZodLiteral<"number">;
        default: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strip>, z.ZodObject<{
        name: z.ZodString;
        description: z.ZodOptional<z.ZodString>;
        required: z.ZodOptional<z.ZodBoolean>;
        type: z.ZodLiteral<"boolean">;
        default: z.ZodOptional<z.ZodBoolean>;
    }, z.core.$strip>, z.ZodObject<{
        name: z.ZodString;
        description: z.ZodOptional<z.ZodString>;
        required: z.ZodOptional<z.ZodBoolean>;
        type: z.ZodLiteral<"choice">;
        default: z.ZodOptional<z.ZodString>;
        options: z.ZodArray<z.ZodString>;
    }, z.core.$strip>, z.ZodObject<{
        name: z.ZodString;
        description: z.ZodOptional<z.ZodString>;
        required: z.ZodOptional<z.ZodBoolean>;
        type: z.ZodLiteral<"array">;
        minItems: z.ZodOptional<z.ZodNumber>;
        maxItems: z.ZodOptional<z.ZodNumber>;
        default: z.ZodOptional<z.ZodUnion<readonly [z.ZodArray<z.ZodString>, z.ZodArray<z.ZodNumber>, z.ZodArray<z.ZodBoolean>]>>;
    }, z.core.$strip>]>>]>>;
    consts: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnion<readonly [z.ZodString, z.ZodNumber, z.ZodBoolean, z.ZodRecord<z.ZodString, z.ZodAny>, z.ZodObject<{}, z.core.$strip>, z.ZodArray<z.ZodAny>]>>>;
    steps: z.ZodArray<z.ZodLazy<z.ZodUnion<readonly [z.ZodObject<{
        name: z.ZodString;
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
        if: z.ZodOptional<z.ZodString>;
        foreach: z.ZodUnion<readonly [z.ZodString, z.ZodArray<z.ZodUnknown>]>;
        steps: z.ZodArray<z.ZodObject<{
            name: z.ZodString;
            type: z.ZodString;
            'max-step-size': z.ZodOptional<z.ZodString>;
        }, z.core.$strip>>;
        type: z.ZodLiteral<"foreach">;
    }, z.core.$strip>, z.ZodObject<{
        name: z.ZodString;
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
        if: z.ZodOptional<z.ZodString>;
        condition: z.ZodString;
        steps: z.ZodArray<z.ZodObject<{
            name: z.ZodString;
            type: z.ZodString;
            'max-step-size': z.ZodOptional<z.ZodString>;
        }, z.core.$strip>>;
        type: z.ZodLiteral<"while">;
    }, z.core.$strip>, z.ZodObject<{
        name: z.ZodString;
        'max-step-size': z.ZodOptional<z.ZodString>;
        condition: z.ZodString;
        steps: z.ZodArray<z.ZodObject<{
            name: z.ZodString;
            type: z.ZodString;
            'max-step-size': z.ZodOptional<z.ZodString>;
        }, z.core.$strip>>;
        else: z.ZodOptional<z.ZodArray<z.ZodObject<{
            name: z.ZodString;
            type: z.ZodString;
            'max-step-size': z.ZodOptional<z.ZodString>;
        }, z.core.$strip>>>;
        type: z.ZodLiteral<"if">;
    }, z.core.$strip>, z.ZodObject<{
        name: z.ZodString;
        'max-step-size': z.ZodOptional<z.ZodString>;
        timeout: z.ZodOptional<z.ZodString>;
        if: z.ZodOptional<z.ZodString>;
        expression: z.ZodString;
        cases: z.ZodArray<z.ZodObject<{
            match: z.ZodUnion<readonly [z.ZodString, z.ZodNumber, z.ZodBoolean]>;
            steps: z.ZodArray<z.ZodObject<{
                name: z.ZodString;
                type: z.ZodString;
                'max-step-size': z.ZodOptional<z.ZodString>;
            }, z.core.$strip>>;
        }, z.core.$strip>>;
        default: z.ZodOptional<z.ZodArray<z.ZodObject<{
            name: z.ZodString;
            type: z.ZodString;
            'max-step-size': z.ZodOptional<z.ZodString>;
        }, z.core.$strip>>>;
        type: z.ZodLiteral<"switch">;
    }, z.core.$strip>, z.ZodObject<{
        name: z.ZodString;
        'max-step-size': z.ZodOptional<z.ZodString>;
        type: z.ZodLiteral<"wait">;
        with: z.ZodObject<{
            duration: z.ZodString;
        }, z.core.$strip>;
    }, z.core.$strip>, z.ZodObject<{
        name: z.ZodString;
        'max-step-size': z.ZodOptional<z.ZodString>;
        type: z.ZodLiteral<"waitForInput">;
        with: z.ZodOptional<z.ZodObject<{
            message: z.ZodOptional<z.ZodString>;
            schema: z.ZodOptional<z.ZodObject<{
                type: z.ZodOptional<z.ZodLiteral<"object">>;
                title: z.ZodOptional<z.ZodString>;
                description: z.ZodOptional<z.ZodString>;
                $ref: z.ZodOptional<z.ZodString> | z.ZodOptional<z.ZodUnion<readonly [z.ZodEnum<{
                    [x: string]: string;
                }>, z.ZodString]>>;
                properties: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodType<import("./schema/common/json_model_shape_schema").JsonSchema, unknown, z.core.$ZodTypeInternals<import("./schema/common/json_model_shape_schema").JsonSchema, unknown>>>>;
                additionalProperties: z.ZodOptional<z.ZodBoolean>;
                required: z.ZodOptional<z.ZodArray<z.ZodString>>;
                definitions: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodType<import("./schema/common/json_model_shape_schema").JsonSchema, unknown, z.core.$ZodTypeInternals<import("./schema/common/json_model_shape_schema").JsonSchema, unknown>>>>;
                $defs: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodType<import("./schema/common/json_model_shape_schema").JsonSchema, unknown, z.core.$ZodTypeInternals<import("./schema/common/json_model_shape_schema").JsonSchema, unknown>>>>;
            }, z.core.$strip>>;
        }, z.core.$strip>>;
    }, z.core.$strip>, z.ZodObject<{
        name: z.ZodString;
        'max-step-size': z.ZodOptional<z.ZodString>;
        type: z.ZodLiteral<"data.set">;
        with: z.ZodRecord<z.ZodString, z.ZodUnknown>;
    }, z.core.$strip>, z.ZodObject<{
        name: z.ZodString;
        'max-step-size': z.ZodOptional<z.ZodString>;
        type: z.ZodString;
        with: z.ZodUnion<readonly [z.ZodObject<{
            request: z.ZodObject<{
                method: z.ZodDefault<z.ZodOptional<z.ZodEnum<{
                    PATCH: "PATCH";
                    POST: "POST";
                    GET: "GET";
                    PUT: "PUT";
                    DELETE: "DELETE";
                    HEAD: "HEAD";
                }>>>;
                path: z.ZodString;
                body: z.ZodOptional<z.ZodAny>;
            }, z.core.$strip>;
        }, z.core.$strip>, z.ZodIntersection<z.ZodObject<{
            index: z.ZodOptional<z.ZodString>;
            id: z.ZodOptional<z.ZodString>;
            query: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
            body: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
            size: z.ZodOptional<z.ZodNumber>;
            from: z.ZodOptional<z.ZodNumber>;
            sort: z.ZodOptional<z.ZodArray<z.ZodAny>>;
            _source: z.ZodOptional<z.ZodUnion<readonly [z.ZodBoolean, z.ZodArray<z.ZodString>, z.ZodString]>>;
            aggs: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
            aggregations: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
        }, z.core.$strip>, z.ZodRecord<z.ZodString, z.ZodAny>>]>;
    }, z.core.$strip>, z.ZodObject<{
        name: z.ZodString;
        'max-step-size': z.ZodOptional<z.ZodString>;
        type: z.ZodString;
        with: z.ZodUnion<readonly [z.ZodObject<{
            use_server_info: z.ZodOptional<z.ZodBoolean>;
            use_localhost: z.ZodOptional<z.ZodBoolean>;
            debug: z.ZodOptional<z.ZodBoolean>;
            request: z.ZodObject<{
                method: z.ZodDefault<z.ZodOptional<z.ZodEnum<{
                    PATCH: "PATCH";
                    POST: "POST";
                    GET: "GET";
                    PUT: "PUT";
                    DELETE: "DELETE";
                }>>>;
                path: z.ZodString;
                body: z.ZodOptional<z.ZodAny>;
                headers: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
            }, z.core.$strip>;
            fetcher: z.ZodOptional<z.ZodObject<{
                skip_ssl_verification: z.ZodOptional<z.ZodBoolean>;
                follow_redirects: z.ZodOptional<z.ZodBoolean>;
                max_redirects: z.ZodOptional<z.ZodNumber>;
                keep_alive: z.ZodOptional<z.ZodBoolean>;
                max_content_length: z.ZodOptional<z.ZodNumber>;
            }, z.core.$strip>>;
        }, z.core.$strip>, z.ZodIntersection<z.ZodObject<{
            use_server_info: z.ZodOptional<z.ZodBoolean>;
            use_localhost: z.ZodOptional<z.ZodBoolean>;
            debug: z.ZodOptional<z.ZodBoolean>;
            title: z.ZodOptional<z.ZodString>;
            description: z.ZodOptional<z.ZodString>;
            tags: z.ZodOptional<z.ZodArray<z.ZodString>>;
            severity: z.ZodOptional<z.ZodEnum<{
                high: "high";
                low: "low";
                medium: "medium";
                critical: "critical";
            }>>;
            assignees: z.ZodOptional<z.ZodArray<z.ZodString>>;
            owner: z.ZodOptional<z.ZodString>;
            connector: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
            settings: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
            id: z.ZodOptional<z.ZodString>;
            case_id: z.ZodOptional<z.ZodString>;
            space_id: z.ZodOptional<z.ZodString>;
            page: z.ZodOptional<z.ZodNumber>;
            perPage: z.ZodOptional<z.ZodNumber>;
            status: z.ZodOptional<z.ZodString>;
            fetcher: z.ZodOptional<z.ZodObject<{
                skip_ssl_verification: z.ZodOptional<z.ZodBoolean>;
                follow_redirects: z.ZodOptional<z.ZodBoolean>;
                max_redirects: z.ZodOptional<z.ZodNumber>;
                keep_alive: z.ZodOptional<z.ZodBoolean>;
                max_content_length: z.ZodOptional<z.ZodNumber>;
            }, z.core.$strip>>;
        }, z.core.$strip>, z.ZodRecord<z.ZodString, z.ZodAny>>]>;
    }, z.core.$strip>, z.ZodObject<{
        name: z.ZodString;
        'max-step-size': z.ZodOptional<z.ZodString>;
        branches: z.ZodArray<z.ZodObject<{
            name: z.ZodString;
            steps: z.ZodArray<z.ZodObject<{
                name: z.ZodString;
                type: z.ZodString;
                'max-step-size': z.ZodOptional<z.ZodString>;
            }, z.core.$strip>>;
        }, z.core.$strip>>;
        type: z.ZodLiteral<"parallel">;
    }, z.core.$strip>, z.ZodObject<{
        name: z.ZodString;
        'max-step-size': z.ZodOptional<z.ZodString>;
        sources: z.ZodArray<z.ZodString>;
        steps: z.ZodArray<z.ZodObject<{
            name: z.ZodString;
            type: z.ZodString;
            'max-step-size': z.ZodOptional<z.ZodString>;
        }, z.core.$strip>>;
        type: z.ZodLiteral<"merge">;
    }, z.core.$strip>, z.ZodObject<{
        name: z.ZodString;
        'max-step-size': z.ZodOptional<z.ZodString>;
        with: z.ZodObject<{
            'workflow-id': z.ZodString;
            inputs: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
        }, z.core.$strip>;
        type: z.ZodLiteral<"workflow.execute">;
    }, z.core.$strip>, z.ZodObject<{
        name: z.ZodString;
        'max-step-size': z.ZodOptional<z.ZodString>;
        with: z.ZodObject<{
            'workflow-id': z.ZodString;
            inputs: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
        }, z.core.$strip>;
        type: z.ZodLiteral<"workflow.executeAsync">;
    }, z.core.$strip>, z.ZodObject<{
        name: z.ZodString;
        'max-step-size': z.ZodOptional<z.ZodString>;
        type: z.ZodLiteral<"workflow.output">;
        status: z.ZodDefault<z.ZodOptional<z.ZodEnum<{
            completed: "completed";
            cancelled: "cancelled";
            failed: "failed";
        }>>>;
        with: z.ZodRecord<z.ZodString, z.ZodAny>;
        if: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>, z.ZodObject<{
        name: z.ZodString;
        'max-step-size': z.ZodOptional<z.ZodString>;
        type: z.ZodLiteral<"workflow.fail">;
        with: z.ZodOptional<z.ZodObject<{
            message: z.ZodOptional<z.ZodString>;
            reason: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>>;
        if: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>, z.ZodObject<{
        name: z.ZodString;
        'max-step-size': z.ZodOptional<z.ZodString>;
        if: z.ZodOptional<z.ZodString>;
        type: z.ZodLiteral<"loop.break">;
    }, z.core.$strip>, z.ZodObject<{
        name: z.ZodString;
        'max-step-size': z.ZodOptional<z.ZodString>;
        if: z.ZodOptional<z.ZodString>;
        type: z.ZodLiteral<"loop.continue">;
    }, z.core.$strip>, z.ZodObject<{
        name: z.ZodString;
        'max-step-size': z.ZodOptional<z.ZodString>;
        type: z.ZodString;
        with: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
        if: z.ZodOptional<z.ZodString>;
        foreach: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodArray<z.ZodUnknown>]>>;
        timeout: z.ZodOptional<z.ZodString>;
        'on-failure': z.ZodOptional<z.ZodObject<{
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
    }, z.core.$strip>]>>>;
}, z.core.$strip>;
export declare const WorkflowSchema: z.ZodPipe<z.ZodObject<{
    version: z.ZodDefault<z.ZodOptional<z.ZodLiteral<"1">>>;
    name: z.ZodString;
    description: z.ZodOptional<z.ZodString>;
    settings: z.ZodOptional<z.ZodObject<{
        'on-failure': z.ZodOptional<z.ZodObject<{
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
        timezone: z.ZodOptional<z.ZodString>;
        timeout: z.ZodOptional<z.ZodString>;
        concurrency: z.ZodOptional<z.ZodObject<{
            key: z.ZodOptional<z.ZodString>;
            strategy: z.ZodOptional<z.ZodEnum<{
                drop: "drop";
                "cancel-in-progress": "cancel-in-progress";
            }>>;
            max: z.ZodOptional<z.ZodNumber>;
        }, z.core.$strip>>;
        'max-step-size': z.ZodOptional<z.ZodString>;
        liquid: z.ZodOptional<z.ZodObject<{
            parseLimit: z.ZodOptional<z.ZodNumber>;
            renderLimit: z.ZodOptional<z.ZodNumber>;
            memoryLimit: z.ZodOptional<z.ZodNumber>;
        }, z.core.$strip>>;
    }, z.core.$strip>>;
    enabled: z.ZodDefault<z.ZodBoolean>;
    tags: z.ZodOptional<z.ZodArray<z.ZodString>>;
    outputs: z.ZodOptional<z.ZodUnion<readonly [z.ZodObject<{
        type: z.ZodOptional<z.ZodLiteral<"object">>;
        title: z.ZodOptional<z.ZodString>;
        description: z.ZodOptional<z.ZodString>;
        $ref: z.ZodOptional<z.ZodString> | z.ZodOptional<z.ZodUnion<readonly [z.ZodEnum<{
            [x: string]: string;
        }>, z.ZodString]>>;
        properties: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodType<import("./schema/common/json_model_shape_schema").JsonSchema, unknown, z.core.$ZodTypeInternals<import("./schema/common/json_model_shape_schema").JsonSchema, unknown>>>>;
        additionalProperties: z.ZodOptional<z.ZodBoolean>;
        required: z.ZodOptional<z.ZodArray<z.ZodString>>;
        definitions: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodType<import("./schema/common/json_model_shape_schema").JsonSchema, unknown, z.core.$ZodTypeInternals<import("./schema/common/json_model_shape_schema").JsonSchema, unknown>>>>;
        $defs: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodType<import("./schema/common/json_model_shape_schema").JsonSchema, unknown, z.core.$ZodTypeInternals<import("./schema/common/json_model_shape_schema").JsonSchema, unknown>>>>;
    }, z.core.$strip>, z.ZodArray<z.ZodUnion<readonly [z.ZodObject<{
        name: z.ZodString;
        description: z.ZodOptional<z.ZodString>;
        required: z.ZodOptional<z.ZodBoolean>;
        type: z.ZodLiteral<"string">;
        default: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>, z.ZodObject<{
        name: z.ZodString;
        description: z.ZodOptional<z.ZodString>;
        required: z.ZodOptional<z.ZodBoolean>;
        type: z.ZodLiteral<"number">;
        default: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strip>, z.ZodObject<{
        name: z.ZodString;
        description: z.ZodOptional<z.ZodString>;
        required: z.ZodOptional<z.ZodBoolean>;
        type: z.ZodLiteral<"boolean">;
        default: z.ZodOptional<z.ZodBoolean>;
    }, z.core.$strip>, z.ZodObject<{
        name: z.ZodString;
        description: z.ZodOptional<z.ZodString>;
        required: z.ZodOptional<z.ZodBoolean>;
        type: z.ZodLiteral<"choice">;
        default: z.ZodOptional<z.ZodString>;
        options: z.ZodArray<z.ZodString>;
    }, z.core.$strip>, z.ZodObject<{
        name: z.ZodString;
        description: z.ZodOptional<z.ZodString>;
        required: z.ZodOptional<z.ZodBoolean>;
        type: z.ZodLiteral<"array">;
        minItems: z.ZodOptional<z.ZodNumber>;
        maxItems: z.ZodOptional<z.ZodNumber>;
        default: z.ZodOptional<z.ZodUnion<readonly [z.ZodArray<z.ZodString>, z.ZodArray<z.ZodNumber>, z.ZodArray<z.ZodBoolean>]>>;
    }, z.core.$strip>]>>]>>;
    consts: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnion<readonly [z.ZodString, z.ZodNumber, z.ZodBoolean, z.ZodRecord<z.ZodString, z.ZodAny>, z.ZodObject<{}, z.core.$strip>, z.ZodArray<z.ZodAny>]>>>;
    steps: z.ZodArray<z.ZodLazy<z.ZodUnion<readonly [z.ZodObject<{
        name: z.ZodString;
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
        if: z.ZodOptional<z.ZodString>;
        foreach: z.ZodUnion<readonly [z.ZodString, z.ZodArray<z.ZodUnknown>]>;
        steps: z.ZodArray<z.ZodObject<{
            name: z.ZodString;
            type: z.ZodString;
            'max-step-size': z.ZodOptional<z.ZodString>;
        }, z.core.$strip>>;
        type: z.ZodLiteral<"foreach">;
    }, z.core.$strip>, z.ZodObject<{
        name: z.ZodString;
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
        if: z.ZodOptional<z.ZodString>;
        condition: z.ZodString;
        steps: z.ZodArray<z.ZodObject<{
            name: z.ZodString;
            type: z.ZodString;
            'max-step-size': z.ZodOptional<z.ZodString>;
        }, z.core.$strip>>;
        type: z.ZodLiteral<"while">;
    }, z.core.$strip>, z.ZodObject<{
        name: z.ZodString;
        'max-step-size': z.ZodOptional<z.ZodString>;
        condition: z.ZodString;
        steps: z.ZodArray<z.ZodObject<{
            name: z.ZodString;
            type: z.ZodString;
            'max-step-size': z.ZodOptional<z.ZodString>;
        }, z.core.$strip>>;
        else: z.ZodOptional<z.ZodArray<z.ZodObject<{
            name: z.ZodString;
            type: z.ZodString;
            'max-step-size': z.ZodOptional<z.ZodString>;
        }, z.core.$strip>>>;
        type: z.ZodLiteral<"if">;
    }, z.core.$strip>, z.ZodObject<{
        name: z.ZodString;
        'max-step-size': z.ZodOptional<z.ZodString>;
        timeout: z.ZodOptional<z.ZodString>;
        if: z.ZodOptional<z.ZodString>;
        expression: z.ZodString;
        cases: z.ZodArray<z.ZodObject<{
            match: z.ZodUnion<readonly [z.ZodString, z.ZodNumber, z.ZodBoolean]>;
            steps: z.ZodArray<z.ZodObject<{
                name: z.ZodString;
                type: z.ZodString;
                'max-step-size': z.ZodOptional<z.ZodString>;
            }, z.core.$strip>>;
        }, z.core.$strip>>;
        default: z.ZodOptional<z.ZodArray<z.ZodObject<{
            name: z.ZodString;
            type: z.ZodString;
            'max-step-size': z.ZodOptional<z.ZodString>;
        }, z.core.$strip>>>;
        type: z.ZodLiteral<"switch">;
    }, z.core.$strip>, z.ZodObject<{
        name: z.ZodString;
        'max-step-size': z.ZodOptional<z.ZodString>;
        type: z.ZodLiteral<"wait">;
        with: z.ZodObject<{
            duration: z.ZodString;
        }, z.core.$strip>;
    }, z.core.$strip>, z.ZodObject<{
        name: z.ZodString;
        'max-step-size': z.ZodOptional<z.ZodString>;
        type: z.ZodLiteral<"waitForInput">;
        with: z.ZodOptional<z.ZodObject<{
            message: z.ZodOptional<z.ZodString>;
            schema: z.ZodOptional<z.ZodObject<{
                type: z.ZodOptional<z.ZodLiteral<"object">>;
                title: z.ZodOptional<z.ZodString>;
                description: z.ZodOptional<z.ZodString>;
                $ref: z.ZodOptional<z.ZodString> | z.ZodOptional<z.ZodUnion<readonly [z.ZodEnum<{
                    [x: string]: string;
                }>, z.ZodString]>>;
                properties: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodType<import("./schema/common/json_model_shape_schema").JsonSchema, unknown, z.core.$ZodTypeInternals<import("./schema/common/json_model_shape_schema").JsonSchema, unknown>>>>;
                additionalProperties: z.ZodOptional<z.ZodBoolean>;
                required: z.ZodOptional<z.ZodArray<z.ZodString>>;
                definitions: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodType<import("./schema/common/json_model_shape_schema").JsonSchema, unknown, z.core.$ZodTypeInternals<import("./schema/common/json_model_shape_schema").JsonSchema, unknown>>>>;
                $defs: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodType<import("./schema/common/json_model_shape_schema").JsonSchema, unknown, z.core.$ZodTypeInternals<import("./schema/common/json_model_shape_schema").JsonSchema, unknown>>>>;
            }, z.core.$strip>>;
        }, z.core.$strip>>;
    }, z.core.$strip>, z.ZodObject<{
        name: z.ZodString;
        'max-step-size': z.ZodOptional<z.ZodString>;
        type: z.ZodLiteral<"data.set">;
        with: z.ZodRecord<z.ZodString, z.ZodUnknown>;
    }, z.core.$strip>, z.ZodObject<{
        name: z.ZodString;
        'max-step-size': z.ZodOptional<z.ZodString>;
        type: z.ZodString;
        with: z.ZodUnion<readonly [z.ZodObject<{
            request: z.ZodObject<{
                method: z.ZodDefault<z.ZodOptional<z.ZodEnum<{
                    PATCH: "PATCH";
                    POST: "POST";
                    GET: "GET";
                    PUT: "PUT";
                    DELETE: "DELETE";
                    HEAD: "HEAD";
                }>>>;
                path: z.ZodString;
                body: z.ZodOptional<z.ZodAny>;
            }, z.core.$strip>;
        }, z.core.$strip>, z.ZodIntersection<z.ZodObject<{
            index: z.ZodOptional<z.ZodString>;
            id: z.ZodOptional<z.ZodString>;
            query: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
            body: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
            size: z.ZodOptional<z.ZodNumber>;
            from: z.ZodOptional<z.ZodNumber>;
            sort: z.ZodOptional<z.ZodArray<z.ZodAny>>;
            _source: z.ZodOptional<z.ZodUnion<readonly [z.ZodBoolean, z.ZodArray<z.ZodString>, z.ZodString]>>;
            aggs: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
            aggregations: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
        }, z.core.$strip>, z.ZodRecord<z.ZodString, z.ZodAny>>]>;
    }, z.core.$strip>, z.ZodObject<{
        name: z.ZodString;
        'max-step-size': z.ZodOptional<z.ZodString>;
        type: z.ZodString;
        with: z.ZodUnion<readonly [z.ZodObject<{
            use_server_info: z.ZodOptional<z.ZodBoolean>;
            use_localhost: z.ZodOptional<z.ZodBoolean>;
            debug: z.ZodOptional<z.ZodBoolean>;
            request: z.ZodObject<{
                method: z.ZodDefault<z.ZodOptional<z.ZodEnum<{
                    PATCH: "PATCH";
                    POST: "POST";
                    GET: "GET";
                    PUT: "PUT";
                    DELETE: "DELETE";
                }>>>;
                path: z.ZodString;
                body: z.ZodOptional<z.ZodAny>;
                headers: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
            }, z.core.$strip>;
            fetcher: z.ZodOptional<z.ZodObject<{
                skip_ssl_verification: z.ZodOptional<z.ZodBoolean>;
                follow_redirects: z.ZodOptional<z.ZodBoolean>;
                max_redirects: z.ZodOptional<z.ZodNumber>;
                keep_alive: z.ZodOptional<z.ZodBoolean>;
                max_content_length: z.ZodOptional<z.ZodNumber>;
            }, z.core.$strip>>;
        }, z.core.$strip>, z.ZodIntersection<z.ZodObject<{
            use_server_info: z.ZodOptional<z.ZodBoolean>;
            use_localhost: z.ZodOptional<z.ZodBoolean>;
            debug: z.ZodOptional<z.ZodBoolean>;
            title: z.ZodOptional<z.ZodString>;
            description: z.ZodOptional<z.ZodString>;
            tags: z.ZodOptional<z.ZodArray<z.ZodString>>;
            severity: z.ZodOptional<z.ZodEnum<{
                high: "high";
                low: "low";
                medium: "medium";
                critical: "critical";
            }>>;
            assignees: z.ZodOptional<z.ZodArray<z.ZodString>>;
            owner: z.ZodOptional<z.ZodString>;
            connector: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
            settings: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
            id: z.ZodOptional<z.ZodString>;
            case_id: z.ZodOptional<z.ZodString>;
            space_id: z.ZodOptional<z.ZodString>;
            page: z.ZodOptional<z.ZodNumber>;
            perPage: z.ZodOptional<z.ZodNumber>;
            status: z.ZodOptional<z.ZodString>;
            fetcher: z.ZodOptional<z.ZodObject<{
                skip_ssl_verification: z.ZodOptional<z.ZodBoolean>;
                follow_redirects: z.ZodOptional<z.ZodBoolean>;
                max_redirects: z.ZodOptional<z.ZodNumber>;
                keep_alive: z.ZodOptional<z.ZodBoolean>;
                max_content_length: z.ZodOptional<z.ZodNumber>;
            }, z.core.$strip>>;
        }, z.core.$strip>, z.ZodRecord<z.ZodString, z.ZodAny>>]>;
    }, z.core.$strip>, z.ZodObject<{
        name: z.ZodString;
        'max-step-size': z.ZodOptional<z.ZodString>;
        branches: z.ZodArray<z.ZodObject<{
            name: z.ZodString;
            steps: z.ZodArray<z.ZodObject<{
                name: z.ZodString;
                type: z.ZodString;
                'max-step-size': z.ZodOptional<z.ZodString>;
            }, z.core.$strip>>;
        }, z.core.$strip>>;
        type: z.ZodLiteral<"parallel">;
    }, z.core.$strip>, z.ZodObject<{
        name: z.ZodString;
        'max-step-size': z.ZodOptional<z.ZodString>;
        sources: z.ZodArray<z.ZodString>;
        steps: z.ZodArray<z.ZodObject<{
            name: z.ZodString;
            type: z.ZodString;
            'max-step-size': z.ZodOptional<z.ZodString>;
        }, z.core.$strip>>;
        type: z.ZodLiteral<"merge">;
    }, z.core.$strip>, z.ZodObject<{
        name: z.ZodString;
        'max-step-size': z.ZodOptional<z.ZodString>;
        with: z.ZodObject<{
            'workflow-id': z.ZodString;
            inputs: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
        }, z.core.$strip>;
        type: z.ZodLiteral<"workflow.execute">;
    }, z.core.$strip>, z.ZodObject<{
        name: z.ZodString;
        'max-step-size': z.ZodOptional<z.ZodString>;
        with: z.ZodObject<{
            'workflow-id': z.ZodString;
            inputs: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
        }, z.core.$strip>;
        type: z.ZodLiteral<"workflow.executeAsync">;
    }, z.core.$strip>, z.ZodObject<{
        name: z.ZodString;
        'max-step-size': z.ZodOptional<z.ZodString>;
        type: z.ZodLiteral<"workflow.output">;
        status: z.ZodDefault<z.ZodOptional<z.ZodEnum<{
            completed: "completed";
            cancelled: "cancelled";
            failed: "failed";
        }>>>;
        with: z.ZodRecord<z.ZodString, z.ZodAny>;
        if: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>, z.ZodObject<{
        name: z.ZodString;
        'max-step-size': z.ZodOptional<z.ZodString>;
        type: z.ZodLiteral<"workflow.fail">;
        with: z.ZodOptional<z.ZodObject<{
            message: z.ZodOptional<z.ZodString>;
            reason: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>>;
        if: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>, z.ZodObject<{
        name: z.ZodString;
        'max-step-size': z.ZodOptional<z.ZodString>;
        if: z.ZodOptional<z.ZodString>;
        type: z.ZodLiteral<"loop.break">;
    }, z.core.$strip>, z.ZodObject<{
        name: z.ZodString;
        'max-step-size': z.ZodOptional<z.ZodString>;
        if: z.ZodOptional<z.ZodString>;
        type: z.ZodLiteral<"loop.continue">;
    }, z.core.$strip>, z.ZodObject<{
        name: z.ZodString;
        'max-step-size': z.ZodOptional<z.ZodString>;
        type: z.ZodString;
        with: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
        if: z.ZodOptional<z.ZodString>;
        foreach: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodArray<z.ZodUnknown>]>>;
        timeout: z.ZodOptional<z.ZodString>;
        'on-failure': z.ZodOptional<z.ZodObject<{
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
    }, z.core.$strip>]>>>;
    triggers: z.ZodArray<z.ZodDiscriminatedUnion<[z.ZodObject<{
        type: z.ZodLiteral<"alert">;
    }, z.core.$strip>, z.ZodObject<{
        type: z.ZodLiteral<"scheduled">;
        with: z.ZodUnion<readonly [z.ZodObject<{
            every: z.ZodString;
        }, z.core.$strip>, z.ZodObject<{
            rrule: z.ZodObject<{
                freq: z.ZodEnum<{
                    DAILY: "DAILY";
                    WEEKLY: "WEEKLY";
                    MONTHLY: "MONTHLY";
                }>;
                interval: z.ZodNumber;
                tzid: z.ZodDefault<z.ZodOptional<z.ZodEnum<{
                    [x: string]: string;
                }>>>;
                dtstart: z.ZodOptional<z.ZodString>;
                byhour: z.ZodOptional<z.ZodArray<z.ZodNumber>>;
                byminute: z.ZodOptional<z.ZodArray<z.ZodNumber>>;
                byweekday: z.ZodOptional<z.ZodArray<z.ZodEnum<{
                    MO: "MO";
                    TU: "TU";
                    WE: "WE";
                    TH: "TH";
                    FR: "FR";
                    SA: "SA";
                    SU: "SU";
                }>>>;
                bymonthday: z.ZodOptional<z.ZodArray<z.ZodNumber>>;
            }, z.core.$strip>;
        }, z.core.$strip>]>;
    }, z.core.$strip>, z.ZodObject<{
        type: z.ZodLiteral<"manual">;
        inputs: z.ZodOptional<z.ZodUnion<readonly [z.ZodObject<{
            type: z.ZodOptional<z.ZodLiteral<"object">>;
            title: z.ZodOptional<z.ZodString>;
            description: z.ZodOptional<z.ZodString>;
            $ref: z.ZodOptional<z.ZodString> | z.ZodOptional<z.ZodUnion<readonly [z.ZodEnum<{
                [x: string]: string;
            }>, z.ZodString]>>;
            properties: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodType<import("./schema/common/json_model_shape_schema").JsonSchema, unknown, z.core.$ZodTypeInternals<import("./schema/common/json_model_shape_schema").JsonSchema, unknown>>>>;
            additionalProperties: z.ZodOptional<z.ZodBoolean>;
            required: z.ZodOptional<z.ZodArray<z.ZodString>>;
            definitions: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodType<import("./schema/common/json_model_shape_schema").JsonSchema, unknown, z.core.$ZodTypeInternals<import("./schema/common/json_model_shape_schema").JsonSchema, unknown>>>>;
            $defs: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodType<import("./schema/common/json_model_shape_schema").JsonSchema, unknown, z.core.$ZodTypeInternals<import("./schema/common/json_model_shape_schema").JsonSchema, unknown>>>>;
        }, z.core.$strip>, z.ZodArray<z.ZodUnion<readonly [z.ZodObject<{
            name: z.ZodString;
            description: z.ZodOptional<z.ZodString>;
            required: z.ZodOptional<z.ZodBoolean>;
            type: z.ZodLiteral<"string">;
            default: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>, z.ZodObject<{
            name: z.ZodString;
            description: z.ZodOptional<z.ZodString>;
            required: z.ZodOptional<z.ZodBoolean>;
            type: z.ZodLiteral<"number">;
            default: z.ZodOptional<z.ZodNumber>;
        }, z.core.$strip>, z.ZodObject<{
            name: z.ZodString;
            description: z.ZodOptional<z.ZodString>;
            required: z.ZodOptional<z.ZodBoolean>;
            type: z.ZodLiteral<"boolean">;
            default: z.ZodOptional<z.ZodBoolean>;
        }, z.core.$strip>, z.ZodObject<{
            name: z.ZodString;
            description: z.ZodOptional<z.ZodString>;
            required: z.ZodOptional<z.ZodBoolean>;
            type: z.ZodLiteral<"choice">;
            default: z.ZodOptional<z.ZodString>;
            options: z.ZodArray<z.ZodString>;
        }, z.core.$strip>, z.ZodObject<{
            name: z.ZodString;
            description: z.ZodOptional<z.ZodString>;
            required: z.ZodOptional<z.ZodBoolean>;
            type: z.ZodLiteral<"array">;
            minItems: z.ZodOptional<z.ZodNumber>;
            maxItems: z.ZodOptional<z.ZodNumber>;
            default: z.ZodOptional<z.ZodUnion<readonly [z.ZodArray<z.ZodString>, z.ZodArray<z.ZodNumber>, z.ZodArray<z.ZodBoolean>]>>;
        }, z.core.$strip>]>>]>>;
    }, z.core.$strip>], "type">>;
}, z.core.$strip>, z.ZodTransform<{
    triggers: ({
        type: "alert";
    } | {
        type: "manual";
        inputs?: {
            type?: "object" | undefined;
            title?: string | undefined;
            description?: string | undefined;
            $ref?: string | undefined;
            properties?: Record<string, import("./schema/common/json_model_shape_schema").JsonSchema> | undefined;
            additionalProperties?: boolean | undefined;
            required?: string[] | undefined;
            definitions?: Record<string, import("./schema/common/json_model_shape_schema").JsonSchema> | undefined;
            $defs?: Record<string, import("./schema/common/json_model_shape_schema").JsonSchema> | undefined;
        } | ({
            name: string;
            type: "string";
            description?: string | undefined;
            required?: boolean | undefined;
            default?: string | undefined;
        } | {
            name: string;
            type: "number";
            description?: string | undefined;
            required?: boolean | undefined;
            default?: number | undefined;
        } | {
            name: string;
            type: "boolean";
            description?: string | undefined;
            required?: boolean | undefined;
            default?: boolean | undefined;
        } | {
            name: string;
            type: "choice";
            options: string[];
            description?: string | undefined;
            required?: boolean | undefined;
            default?: string | undefined;
        } | {
            name: string;
            type: "array";
            description?: string | undefined;
            required?: boolean | undefined;
            minItems?: number | undefined;
            maxItems?: number | undefined;
            default?: boolean[] | string[] | number[] | undefined;
        })[] | undefined;
    } | {
        type: "scheduled";
        with: {
            every: string;
        } | {
            rrule: {
                freq: "DAILY" | "WEEKLY" | "MONTHLY";
                interval: number;
                tzid: string;
                dtstart?: string | undefined;
                byhour?: number[] | undefined;
                byminute?: number[] | undefined;
                byweekday?: ("MO" | "TU" | "WE" | "TH" | "FR" | "SA" | "SU")[] | undefined;
                bymonthday?: number[] | undefined;
            };
        };
    })[];
    outputs?: {
        type?: "object" | undefined;
        title?: string | undefined;
        description?: string | undefined;
        $ref?: string | undefined;
        properties?: Record<string, import("./schema/common/json_model_shape_schema").JsonSchema> | undefined;
        additionalProperties?: boolean | undefined;
        required?: string[] | undefined;
        definitions?: Record<string, import("./schema/common/json_model_shape_schema").JsonSchema> | undefined;
        $defs?: Record<string, import("./schema/common/json_model_shape_schema").JsonSchema> | undefined;
    } | undefined;
    version: "1";
    name: string;
    enabled: boolean;
    steps: ({
        name: string;
        type: string;
        'max-step-size'?: string | undefined;
        with?: Record<string, any> | undefined;
        if?: string | undefined;
        foreach?: string | unknown[] | undefined;
        timeout?: string | undefined;
        'on-failure'?: {
            retry?: {
                'max-attempts': number;
                condition?: string | undefined;
                delay?: string | undefined;
                strategy?: "fixed" | "exponential" | undefined;
                multiplier?: number | undefined;
                'max-delay'?: string | undefined;
                jitter?: boolean | undefined;
            } | undefined;
            fallback?: {
                name: string;
                type: string;
                'max-step-size'?: string | undefined;
            }[] | undefined;
            continue?: string | boolean | undefined;
        } | undefined;
    } | {
        name: string;
        type: "wait";
        with: {
            duration: string;
        };
        'max-step-size'?: string | undefined;
    } | {
        name: string;
        type: "waitForInput";
        'max-step-size'?: string | undefined;
        with?: {
            message?: string | undefined;
            schema?: {
                type?: "object" | undefined;
                title?: string | undefined;
                description?: string | undefined;
                $ref?: string | undefined;
                properties?: Record<string, import("./schema/common/json_model_shape_schema").JsonSchema> | undefined;
                additionalProperties?: boolean | undefined;
                required?: string[] | undefined;
                definitions?: Record<string, import("./schema/common/json_model_shape_schema").JsonSchema> | undefined;
                $defs?: Record<string, import("./schema/common/json_model_shape_schema").JsonSchema> | undefined;
            } | undefined;
        } | undefined;
    } | {
        name: string;
        type: "data.set";
        with: Record<string, unknown>;
        'max-step-size'?: string | undefined;
    } | {
        name: string;
        type: string;
        with: {
            request: {
                method: "PATCH" | "POST" | "GET" | "PUT" | "DELETE" | "HEAD";
                path: string;
                body?: any;
            };
        } | ({
            index?: string | undefined;
            id?: string | undefined;
            query?: Record<string, any> | undefined;
            body?: Record<string, any> | undefined;
            size?: number | undefined;
            from?: number | undefined;
            sort?: any[] | undefined;
            _source?: string | boolean | string[] | undefined;
            aggs?: Record<string, any> | undefined;
            aggregations?: Record<string, any> | undefined;
        } & Record<string, any>);
        'max-step-size'?: string | undefined;
    } | {
        name: string;
        type: string;
        with: {
            request: {
                method: "PATCH" | "POST" | "GET" | "PUT" | "DELETE";
                path: string;
                body?: any;
                headers?: Record<string, string> | undefined;
            };
            use_server_info?: boolean | undefined;
            use_localhost?: boolean | undefined;
            debug?: boolean | undefined;
            fetcher?: {
                skip_ssl_verification?: boolean | undefined;
                follow_redirects?: boolean | undefined;
                max_redirects?: number | undefined;
                keep_alive?: boolean | undefined;
                max_content_length?: number | undefined;
            } | undefined;
        } | ({
            use_server_info?: boolean | undefined;
            use_localhost?: boolean | undefined;
            debug?: boolean | undefined;
            title?: string | undefined;
            description?: string | undefined;
            tags?: string[] | undefined;
            severity?: "high" | "low" | "medium" | "critical" | undefined;
            assignees?: string[] | undefined;
            owner?: string | undefined;
            connector?: Record<string, any> | undefined;
            settings?: Record<string, any> | undefined;
            id?: string | undefined;
            case_id?: string | undefined;
            space_id?: string | undefined;
            page?: number | undefined;
            perPage?: number | undefined;
            status?: string | undefined;
            fetcher?: {
                skip_ssl_verification?: boolean | undefined;
                follow_redirects?: boolean | undefined;
                max_redirects?: number | undefined;
                keep_alive?: boolean | undefined;
                max_content_length?: number | undefined;
            } | undefined;
        } & Record<string, any>);
        'max-step-size'?: string | undefined;
    } | {
        name: string;
        foreach: string | unknown[];
        steps: {
            name: string;
            type: string;
            'max-step-size'?: string | undefined;
        }[];
        type: "foreach";
        'max-step-size'?: string | undefined;
        timeout?: string | undefined;
        'max-iterations'?: number | {
            limit: number;
            'on-limit': "continue" | "fail";
        } | undefined;
        'iteration-timeout'?: string | undefined;
        'iteration-on-failure'?: {
            retry?: {
                'max-attempts': number;
                condition?: string | undefined;
                delay?: string | undefined;
                strategy?: "fixed" | "exponential" | undefined;
                multiplier?: number | undefined;
                'max-delay'?: string | undefined;
                jitter?: boolean | undefined;
            } | undefined;
            fallback?: {
                name: string;
                type: string;
                'max-step-size'?: string | undefined;
            }[] | undefined;
            continue?: string | boolean | undefined;
        } | undefined;
        if?: string | undefined;
    } | {
        name: string;
        condition: string;
        steps: {
            name: string;
            type: string;
            'max-step-size'?: string | undefined;
        }[];
        type: "while";
        'max-step-size'?: string | undefined;
        timeout?: string | undefined;
        'max-iterations'?: number | {
            limit: number;
            'on-limit': "continue" | "fail";
        } | undefined;
        'iteration-timeout'?: string | undefined;
        'iteration-on-failure'?: {
            retry?: {
                'max-attempts': number;
                condition?: string | undefined;
                delay?: string | undefined;
                strategy?: "fixed" | "exponential" | undefined;
                multiplier?: number | undefined;
                'max-delay'?: string | undefined;
                jitter?: boolean | undefined;
            } | undefined;
            fallback?: {
                name: string;
                type: string;
                'max-step-size'?: string | undefined;
            }[] | undefined;
            continue?: string | boolean | undefined;
        } | undefined;
        if?: string | undefined;
    } | {
        name: string;
        expression: string;
        cases: {
            match: string | number | boolean;
            steps: {
                name: string;
                type: string;
                'max-step-size'?: string | undefined;
            }[];
        }[];
        type: "switch";
        'max-step-size'?: string | undefined;
        timeout?: string | undefined;
        if?: string | undefined;
        default?: {
            name: string;
            type: string;
            'max-step-size'?: string | undefined;
        }[] | undefined;
    } | {
        name: string;
        condition: string;
        steps: {
            name: string;
            type: string;
            'max-step-size'?: string | undefined;
        }[];
        type: "if";
        'max-step-size'?: string | undefined;
        else?: {
            name: string;
            type: string;
            'max-step-size'?: string | undefined;
        }[] | undefined;
    } | {
        name: string;
        branches: {
            name: string;
            steps: {
                name: string;
                type: string;
                'max-step-size'?: string | undefined;
            }[];
        }[];
        type: "parallel";
        'max-step-size'?: string | undefined;
    } | {
        name: string;
        sources: string[];
        steps: {
            name: string;
            type: string;
            'max-step-size'?: string | undefined;
        }[];
        type: "merge";
        'max-step-size'?: string | undefined;
    } | {
        name: string;
        type: "loop.break";
        'max-step-size'?: string | undefined;
        if?: string | undefined;
    } | {
        name: string;
        type: "loop.continue";
        'max-step-size'?: string | undefined;
        if?: string | undefined;
    } | {
        name: string;
        with: {
            'workflow-id': string;
            inputs?: Record<string, unknown> | undefined;
        };
        type: "workflow.execute";
        'max-step-size'?: string | undefined;
    } | {
        name: string;
        with: {
            'workflow-id': string;
            inputs?: Record<string, unknown> | undefined;
        };
        type: "workflow.executeAsync";
        'max-step-size'?: string | undefined;
    } | {
        name: string;
        type: "workflow.output";
        status: "completed" | "cancelled" | "failed";
        with: Record<string, any>;
        'max-step-size'?: string | undefined;
        if?: string | undefined;
    } | {
        name: string;
        type: "workflow.fail";
        'max-step-size'?: string | undefined;
        with?: {
            message?: string | undefined;
            reason?: string | undefined;
        } | undefined;
        if?: string | undefined;
    })[];
    description?: string | undefined;
    settings?: {
        'on-failure'?: {
            retry?: {
                'max-attempts': number;
                condition?: string | undefined;
                delay?: string | undefined;
                strategy?: "fixed" | "exponential" | undefined;
                multiplier?: number | undefined;
                'max-delay'?: string | undefined;
                jitter?: boolean | undefined;
            } | undefined;
            fallback?: {
                name: string;
                type: string;
                'max-step-size'?: string | undefined;
            }[] | undefined;
            continue?: string | boolean | undefined;
        } | undefined;
        timezone?: string | undefined;
        timeout?: string | undefined;
        concurrency?: {
            key?: string | undefined;
            strategy?: "drop" | "cancel-in-progress" | undefined;
            max?: number | undefined;
        } | undefined;
        'max-step-size'?: string | undefined;
        liquid?: {
            parseLimit?: number | undefined;
            renderLimit?: number | undefined;
            memoryLimit?: number | undefined;
        } | undefined;
    } | undefined;
    tags?: string[] | undefined;
    consts?: Record<string, string | number | boolean | any[] | Record<string, never> | Record<string, any>> | undefined;
}, {
    version: "1";
    name: string;
    enabled: boolean;
    steps: ({
        name: string;
        type: string;
        'max-step-size'?: string | undefined;
        with?: Record<string, any> | undefined;
        if?: string | undefined;
        foreach?: string | unknown[] | undefined;
        timeout?: string | undefined;
        'on-failure'?: {
            retry?: {
                'max-attempts': number;
                condition?: string | undefined;
                delay?: string | undefined;
                strategy?: "fixed" | "exponential" | undefined;
                multiplier?: number | undefined;
                'max-delay'?: string | undefined;
                jitter?: boolean | undefined;
            } | undefined;
            fallback?: {
                name: string;
                type: string;
                'max-step-size'?: string | undefined;
            }[] | undefined;
            continue?: string | boolean | undefined;
        } | undefined;
    } | {
        name: string;
        type: "wait";
        with: {
            duration: string;
        };
        'max-step-size'?: string | undefined;
    } | {
        name: string;
        type: "waitForInput";
        'max-step-size'?: string | undefined;
        with?: {
            message?: string | undefined;
            schema?: {
                type?: "object" | undefined;
                title?: string | undefined;
                description?: string | undefined;
                $ref?: string | undefined;
                properties?: Record<string, import("./schema/common/json_model_shape_schema").JsonSchema> | undefined;
                additionalProperties?: boolean | undefined;
                required?: string[] | undefined;
                definitions?: Record<string, import("./schema/common/json_model_shape_schema").JsonSchema> | undefined;
                $defs?: Record<string, import("./schema/common/json_model_shape_schema").JsonSchema> | undefined;
            } | undefined;
        } | undefined;
    } | {
        name: string;
        type: "data.set";
        with: Record<string, unknown>;
        'max-step-size'?: string | undefined;
    } | {
        name: string;
        type: string;
        with: {
            request: {
                method: "PATCH" | "POST" | "GET" | "PUT" | "DELETE" | "HEAD";
                path: string;
                body?: any;
            };
        } | ({
            index?: string | undefined;
            id?: string | undefined;
            query?: Record<string, any> | undefined;
            body?: Record<string, any> | undefined;
            size?: number | undefined;
            from?: number | undefined;
            sort?: any[] | undefined;
            _source?: string | boolean | string[] | undefined;
            aggs?: Record<string, any> | undefined;
            aggregations?: Record<string, any> | undefined;
        } & Record<string, any>);
        'max-step-size'?: string | undefined;
    } | {
        name: string;
        type: string;
        with: {
            request: {
                method: "PATCH" | "POST" | "GET" | "PUT" | "DELETE";
                path: string;
                body?: any;
                headers?: Record<string, string> | undefined;
            };
            use_server_info?: boolean | undefined;
            use_localhost?: boolean | undefined;
            debug?: boolean | undefined;
            fetcher?: {
                skip_ssl_verification?: boolean | undefined;
                follow_redirects?: boolean | undefined;
                max_redirects?: number | undefined;
                keep_alive?: boolean | undefined;
                max_content_length?: number | undefined;
            } | undefined;
        } | ({
            use_server_info?: boolean | undefined;
            use_localhost?: boolean | undefined;
            debug?: boolean | undefined;
            title?: string | undefined;
            description?: string | undefined;
            tags?: string[] | undefined;
            severity?: "high" | "low" | "medium" | "critical" | undefined;
            assignees?: string[] | undefined;
            owner?: string | undefined;
            connector?: Record<string, any> | undefined;
            settings?: Record<string, any> | undefined;
            id?: string | undefined;
            case_id?: string | undefined;
            space_id?: string | undefined;
            page?: number | undefined;
            perPage?: number | undefined;
            status?: string | undefined;
            fetcher?: {
                skip_ssl_verification?: boolean | undefined;
                follow_redirects?: boolean | undefined;
                max_redirects?: number | undefined;
                keep_alive?: boolean | undefined;
                max_content_length?: number | undefined;
            } | undefined;
        } & Record<string, any>);
        'max-step-size'?: string | undefined;
    } | {
        name: string;
        foreach: string | unknown[];
        steps: {
            name: string;
            type: string;
            'max-step-size'?: string | undefined;
        }[];
        type: "foreach";
        'max-step-size'?: string | undefined;
        timeout?: string | undefined;
        'max-iterations'?: number | {
            limit: number;
            'on-limit': "continue" | "fail";
        } | undefined;
        'iteration-timeout'?: string | undefined;
        'iteration-on-failure'?: {
            retry?: {
                'max-attempts': number;
                condition?: string | undefined;
                delay?: string | undefined;
                strategy?: "fixed" | "exponential" | undefined;
                multiplier?: number | undefined;
                'max-delay'?: string | undefined;
                jitter?: boolean | undefined;
            } | undefined;
            fallback?: {
                name: string;
                type: string;
                'max-step-size'?: string | undefined;
            }[] | undefined;
            continue?: string | boolean | undefined;
        } | undefined;
        if?: string | undefined;
    } | {
        name: string;
        condition: string;
        steps: {
            name: string;
            type: string;
            'max-step-size'?: string | undefined;
        }[];
        type: "while";
        'max-step-size'?: string | undefined;
        timeout?: string | undefined;
        'max-iterations'?: number | {
            limit: number;
            'on-limit': "continue" | "fail";
        } | undefined;
        'iteration-timeout'?: string | undefined;
        'iteration-on-failure'?: {
            retry?: {
                'max-attempts': number;
                condition?: string | undefined;
                delay?: string | undefined;
                strategy?: "fixed" | "exponential" | undefined;
                multiplier?: number | undefined;
                'max-delay'?: string | undefined;
                jitter?: boolean | undefined;
            } | undefined;
            fallback?: {
                name: string;
                type: string;
                'max-step-size'?: string | undefined;
            }[] | undefined;
            continue?: string | boolean | undefined;
        } | undefined;
        if?: string | undefined;
    } | {
        name: string;
        expression: string;
        cases: {
            match: string | number | boolean;
            steps: {
                name: string;
                type: string;
                'max-step-size'?: string | undefined;
            }[];
        }[];
        type: "switch";
        'max-step-size'?: string | undefined;
        timeout?: string | undefined;
        if?: string | undefined;
        default?: {
            name: string;
            type: string;
            'max-step-size'?: string | undefined;
        }[] | undefined;
    } | {
        name: string;
        condition: string;
        steps: {
            name: string;
            type: string;
            'max-step-size'?: string | undefined;
        }[];
        type: "if";
        'max-step-size'?: string | undefined;
        else?: {
            name: string;
            type: string;
            'max-step-size'?: string | undefined;
        }[] | undefined;
    } | {
        name: string;
        branches: {
            name: string;
            steps: {
                name: string;
                type: string;
                'max-step-size'?: string | undefined;
            }[];
        }[];
        type: "parallel";
        'max-step-size'?: string | undefined;
    } | {
        name: string;
        sources: string[];
        steps: {
            name: string;
            type: string;
            'max-step-size'?: string | undefined;
        }[];
        type: "merge";
        'max-step-size'?: string | undefined;
    } | {
        name: string;
        type: "loop.break";
        'max-step-size'?: string | undefined;
        if?: string | undefined;
    } | {
        name: string;
        type: "loop.continue";
        'max-step-size'?: string | undefined;
        if?: string | undefined;
    } | {
        name: string;
        with: {
            'workflow-id': string;
            inputs?: Record<string, unknown> | undefined;
        };
        type: "workflow.execute";
        'max-step-size'?: string | undefined;
    } | {
        name: string;
        with: {
            'workflow-id': string;
            inputs?: Record<string, unknown> | undefined;
        };
        type: "workflow.executeAsync";
        'max-step-size'?: string | undefined;
    } | {
        name: string;
        type: "workflow.output";
        status: "completed" | "cancelled" | "failed";
        with: Record<string, any>;
        'max-step-size'?: string | undefined;
        if?: string | undefined;
    } | {
        name: string;
        type: "workflow.fail";
        'max-step-size'?: string | undefined;
        with?: {
            message?: string | undefined;
            reason?: string | undefined;
        } | undefined;
        if?: string | undefined;
    })[];
    triggers: ({
        type: "alert";
    } | {
        type: "manual";
        inputs?: {
            type?: "object" | undefined;
            title?: string | undefined;
            description?: string | undefined;
            $ref?: string | undefined;
            properties?: Record<string, import("./schema/common/json_model_shape_schema").JsonSchema> | undefined;
            additionalProperties?: boolean | undefined;
            required?: string[] | undefined;
            definitions?: Record<string, import("./schema/common/json_model_shape_schema").JsonSchema> | undefined;
            $defs?: Record<string, import("./schema/common/json_model_shape_schema").JsonSchema> | undefined;
        } | ({
            name: string;
            type: "string";
            description?: string | undefined;
            required?: boolean | undefined;
            default?: string | undefined;
        } | {
            name: string;
            type: "number";
            description?: string | undefined;
            required?: boolean | undefined;
            default?: number | undefined;
        } | {
            name: string;
            type: "boolean";
            description?: string | undefined;
            required?: boolean | undefined;
            default?: boolean | undefined;
        } | {
            name: string;
            type: "choice";
            options: string[];
            description?: string | undefined;
            required?: boolean | undefined;
            default?: string | undefined;
        } | {
            name: string;
            type: "array";
            description?: string | undefined;
            required?: boolean | undefined;
            minItems?: number | undefined;
            maxItems?: number | undefined;
            default?: boolean[] | string[] | number[] | undefined;
        })[] | undefined;
    } | {
        type: "scheduled";
        with: {
            every: string;
        } | {
            rrule: {
                freq: "DAILY" | "WEEKLY" | "MONTHLY";
                interval: number;
                tzid: string;
                dtstart?: string | undefined;
                byhour?: number[] | undefined;
                byminute?: number[] | undefined;
                byweekday?: ("MO" | "TU" | "WE" | "TH" | "FR" | "SA" | "SU")[] | undefined;
                bymonthday?: number[] | undefined;
            };
        };
    })[];
    description?: string | undefined;
    settings?: {
        'on-failure'?: {
            retry?: {
                'max-attempts': number;
                condition?: string | undefined;
                delay?: string | undefined;
                strategy?: "fixed" | "exponential" | undefined;
                multiplier?: number | undefined;
                'max-delay'?: string | undefined;
                jitter?: boolean | undefined;
            } | undefined;
            fallback?: {
                name: string;
                type: string;
                'max-step-size'?: string | undefined;
            }[] | undefined;
            continue?: string | boolean | undefined;
        } | undefined;
        timezone?: string | undefined;
        timeout?: string | undefined;
        concurrency?: {
            key?: string | undefined;
            strategy?: "drop" | "cancel-in-progress" | undefined;
            max?: number | undefined;
        } | undefined;
        'max-step-size'?: string | undefined;
        liquid?: {
            parseLimit?: number | undefined;
            renderLimit?: number | undefined;
            memoryLimit?: number | undefined;
        } | undefined;
    } | undefined;
    tags?: string[] | undefined;
    outputs?: {
        type?: "object" | undefined;
        title?: string | undefined;
        description?: string | undefined;
        $ref?: string | undefined;
        properties?: Record<string, import("./schema/common/json_model_shape_schema").JsonSchema> | undefined;
        additionalProperties?: boolean | undefined;
        required?: string[] | undefined;
        definitions?: Record<string, import("./schema/common/json_model_shape_schema").JsonSchema> | undefined;
        $defs?: Record<string, import("./schema/common/json_model_shape_schema").JsonSchema> | undefined;
    } | ({
        name: string;
        type: "string";
        description?: string | undefined;
        required?: boolean | undefined;
        default?: string | undefined;
    } | {
        name: string;
        type: "number";
        description?: string | undefined;
        required?: boolean | undefined;
        default?: number | undefined;
    } | {
        name: string;
        type: "boolean";
        description?: string | undefined;
        required?: boolean | undefined;
        default?: boolean | undefined;
    } | {
        name: string;
        type: "choice";
        options: string[];
        description?: string | undefined;
        required?: boolean | undefined;
        default?: string | undefined;
    } | {
        name: string;
        type: "array";
        description?: string | undefined;
        required?: boolean | undefined;
        minItems?: number | undefined;
        maxItems?: number | undefined;
        default?: boolean[] | string[] | number[] | undefined;
    })[] | undefined;
    consts?: Record<string, string | number | boolean | any[] | Record<string, never> | Record<string, any>> | undefined;
}>>;
export { WorkflowSchemaBase };
export type WorkflowYaml = z.infer<typeof WorkflowSchema>;
declare const WorkflowSchemaForAutocompleteBase: z.ZodObject<{
    version: z.ZodOptional<z.ZodLiteral<"1">>;
    name: z.ZodOptional<z.ZodString>;
    description: z.ZodOptional<z.ZodString>;
    settings: z.ZodOptional<z.ZodObject<{
        'on-failure': z.ZodOptional<z.ZodObject<{
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
        timezone: z.ZodOptional<z.ZodString>;
        timeout: z.ZodOptional<z.ZodString>;
        concurrency: z.ZodOptional<z.ZodObject<{
            key: z.ZodOptional<z.ZodString>;
            strategy: z.ZodOptional<z.ZodEnum<{
                drop: "drop";
                "cancel-in-progress": "cancel-in-progress";
            }>>;
            max: z.ZodOptional<z.ZodNumber>;
        }, z.core.$strip>>;
        'max-step-size': z.ZodOptional<z.ZodString>;
        liquid: z.ZodOptional<z.ZodObject<{
            parseLimit: z.ZodOptional<z.ZodNumber>;
            renderLimit: z.ZodOptional<z.ZodNumber>;
            memoryLimit: z.ZodOptional<z.ZodNumber>;
        }, z.core.$strip>>;
    }, z.core.$strip>>;
    enabled: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    tags: z.ZodOptional<z.ZodArray<z.ZodString>>;
    triggers: z.ZodDefault<z.ZodCatch<z.ZodArray<z.ZodObject<{
        type: z.ZodCatch<z.ZodString>;
    }, z.core.$loose>>>>;
    outputs: z.ZodCatch<z.ZodOptional<z.ZodUnion<readonly [z.ZodObject<{
        type: z.ZodOptional<z.ZodLiteral<"object">>;
        title: z.ZodOptional<z.ZodString>;
        description: z.ZodOptional<z.ZodString>;
        $ref: z.ZodOptional<z.ZodString> | z.ZodOptional<z.ZodUnion<readonly [z.ZodEnum<{
            [x: string]: string;
        }>, z.ZodString]>>;
        properties: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodType<import("./schema/common/json_model_shape_schema").JsonSchema, unknown, z.core.$ZodTypeInternals<import("./schema/common/json_model_shape_schema").JsonSchema, unknown>>>>;
        additionalProperties: z.ZodOptional<z.ZodBoolean>;
        required: z.ZodOptional<z.ZodArray<z.ZodString>>;
        definitions: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodType<import("./schema/common/json_model_shape_schema").JsonSchema, unknown, z.core.$ZodTypeInternals<import("./schema/common/json_model_shape_schema").JsonSchema, unknown>>>>;
        $defs: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodType<import("./schema/common/json_model_shape_schema").JsonSchema, unknown, z.core.$ZodTypeInternals<import("./schema/common/json_model_shape_schema").JsonSchema, unknown>>>>;
    }, z.core.$strip>, z.ZodArray<z.ZodObject<{
        name: z.ZodCatch<z.ZodString>;
        type: z.ZodCatch<z.ZodString>;
    }, z.core.$loose>>]>>>;
    consts: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnion<readonly [z.ZodString, z.ZodNumber, z.ZodBoolean, z.ZodRecord<z.ZodString, z.ZodAny>, z.ZodObject<{}, z.core.$strip>, z.ZodArray<z.ZodAny>]>>>;
    steps: z.ZodDefault<z.ZodCatch<z.ZodArray<z.ZodObject<{
        type: z.ZodCatch<z.ZodString>;
        name: z.ZodCatch<z.ZodString>;
    }, z.core.$loose>>>>;
}, z.core.$loose>;
export declare const WorkflowSchemaForAutocomplete: z.ZodPipe<z.ZodObject<{
    version: z.ZodOptional<z.ZodLiteral<"1">>;
    name: z.ZodOptional<z.ZodString>;
    description: z.ZodOptional<z.ZodString>;
    settings: z.ZodOptional<z.ZodObject<{
        'on-failure': z.ZodOptional<z.ZodObject<{
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
        timezone: z.ZodOptional<z.ZodString>;
        timeout: z.ZodOptional<z.ZodString>;
        concurrency: z.ZodOptional<z.ZodObject<{
            key: z.ZodOptional<z.ZodString>;
            strategy: z.ZodOptional<z.ZodEnum<{
                drop: "drop";
                "cancel-in-progress": "cancel-in-progress";
            }>>;
            max: z.ZodOptional<z.ZodNumber>;
        }, z.core.$strip>>;
        'max-step-size': z.ZodOptional<z.ZodString>;
        liquid: z.ZodOptional<z.ZodObject<{
            parseLimit: z.ZodOptional<z.ZodNumber>;
            renderLimit: z.ZodOptional<z.ZodNumber>;
            memoryLimit: z.ZodOptional<z.ZodNumber>;
        }, z.core.$strip>>;
    }, z.core.$strip>>;
    enabled: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    tags: z.ZodOptional<z.ZodArray<z.ZodString>>;
    triggers: z.ZodDefault<z.ZodCatch<z.ZodArray<z.ZodObject<{
        type: z.ZodCatch<z.ZodString>;
    }, z.core.$loose>>>>;
    outputs: z.ZodCatch<z.ZodOptional<z.ZodUnion<readonly [z.ZodObject<{
        type: z.ZodOptional<z.ZodLiteral<"object">>;
        title: z.ZodOptional<z.ZodString>;
        description: z.ZodOptional<z.ZodString>;
        $ref: z.ZodOptional<z.ZodString> | z.ZodOptional<z.ZodUnion<readonly [z.ZodEnum<{
            [x: string]: string;
        }>, z.ZodString]>>;
        properties: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodType<import("./schema/common/json_model_shape_schema").JsonSchema, unknown, z.core.$ZodTypeInternals<import("./schema/common/json_model_shape_schema").JsonSchema, unknown>>>>;
        additionalProperties: z.ZodOptional<z.ZodBoolean>;
        required: z.ZodOptional<z.ZodArray<z.ZodString>>;
        definitions: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodType<import("./schema/common/json_model_shape_schema").JsonSchema, unknown, z.core.$ZodTypeInternals<import("./schema/common/json_model_shape_schema").JsonSchema, unknown>>>>;
        $defs: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodType<import("./schema/common/json_model_shape_schema").JsonSchema, unknown, z.core.$ZodTypeInternals<import("./schema/common/json_model_shape_schema").JsonSchema, unknown>>>>;
    }, z.core.$strip>, z.ZodArray<z.ZodObject<{
        name: z.ZodCatch<z.ZodString>;
        type: z.ZodCatch<z.ZodString>;
    }, z.core.$loose>>]>>>;
    consts: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnion<readonly [z.ZodString, z.ZodNumber, z.ZodBoolean, z.ZodRecord<z.ZodString, z.ZodAny>, z.ZodObject<{}, z.core.$strip>, z.ZodArray<z.ZodAny>]>>>;
    steps: z.ZodDefault<z.ZodCatch<z.ZodArray<z.ZodObject<{
        type: z.ZodCatch<z.ZodString>;
        name: z.ZodCatch<z.ZodString>;
    }, z.core.$loose>>>>;
}, z.core.$loose>, z.ZodTransform<{
    version: "1";
    triggers: {
        [x: string]: unknown;
        type: string;
    }[];
    steps: {
        [x: string]: unknown;
        type: string;
        name: string;
    }[];
    name?: string | undefined;
    description?: string | undefined;
    settings?: {
        'on-failure'?: {
            retry?: {
                'max-attempts': number;
                condition?: string | undefined;
                delay?: string | undefined;
                strategy?: "fixed" | "exponential" | undefined;
                multiplier?: number | undefined;
                'max-delay'?: string | undefined;
                jitter?: boolean | undefined;
            } | undefined;
            fallback?: {
                name: string;
                type: string;
                'max-step-size'?: string | undefined;
            }[] | undefined;
            continue?: string | boolean | undefined;
        } | undefined;
        timezone?: string | undefined;
        timeout?: string | undefined;
        concurrency?: {
            key?: string | undefined;
            strategy?: "drop" | "cancel-in-progress" | undefined;
            max?: number | undefined;
        } | undefined;
        'max-step-size'?: string | undefined;
        liquid?: {
            parseLimit?: number | undefined;
            renderLimit?: number | undefined;
            memoryLimit?: number | undefined;
        } | undefined;
    } | undefined;
    enabled?: boolean | undefined;
    tags?: string[] | undefined;
    outputs?: {
        type?: "object" | undefined;
        title?: string | undefined;
        description?: string | undefined;
        $ref?: string | undefined;
        properties?: Record<string, import("./schema/common/json_model_shape_schema").JsonSchema> | undefined;
        additionalProperties?: boolean | undefined;
        required?: string[] | undefined;
        definitions?: Record<string, import("./schema/common/json_model_shape_schema").JsonSchema> | undefined;
        $defs?: Record<string, import("./schema/common/json_model_shape_schema").JsonSchema> | undefined;
    } | {
        [x: string]: unknown;
        name: string;
        type: string;
    }[] | undefined;
    consts?: Record<string, string | number | boolean | any[] | Record<string, never> | Record<string, any>> | undefined;
}, {
    [x: string]: unknown;
    triggers: {
        [x: string]: unknown;
        type: string;
    }[];
    steps: {
        [x: string]: unknown;
        type: string;
        name: string;
    }[];
    version?: "1" | undefined;
    name?: string | undefined;
    description?: string | undefined;
    settings?: {
        'on-failure'?: {
            retry?: {
                'max-attempts': number;
                condition?: string | undefined;
                delay?: string | undefined;
                strategy?: "fixed" | "exponential" | undefined;
                multiplier?: number | undefined;
                'max-delay'?: string | undefined;
                jitter?: boolean | undefined;
            } | undefined;
            fallback?: {
                name: string;
                type: string;
                'max-step-size'?: string | undefined;
            }[] | undefined;
            continue?: string | boolean | undefined;
        } | undefined;
        timezone?: string | undefined;
        timeout?: string | undefined;
        concurrency?: {
            key?: string | undefined;
            strategy?: "drop" | "cancel-in-progress" | undefined;
            max?: number | undefined;
        } | undefined;
        'max-step-size'?: string | undefined;
        liquid?: {
            parseLimit?: number | undefined;
            renderLimit?: number | undefined;
            memoryLimit?: number | undefined;
        } | undefined;
    } | undefined;
    enabled?: boolean | undefined;
    tags?: string[] | undefined;
    outputs?: {
        type?: "object" | undefined;
        title?: string | undefined;
        description?: string | undefined;
        $ref?: string | undefined;
        properties?: Record<string, import("./schema/common/json_model_shape_schema").JsonSchema> | undefined;
        additionalProperties?: boolean | undefined;
        required?: string[] | undefined;
        definitions?: Record<string, import("./schema/common/json_model_shape_schema").JsonSchema> | undefined;
        $defs?: Record<string, import("./schema/common/json_model_shape_schema").JsonSchema> | undefined;
    } | {
        [x: string]: unknown;
        name: string;
        type: string;
    }[] | undefined;
    consts?: Record<string, string | number | boolean | any[] | Record<string, never> | Record<string, any>> | undefined;
}>>;
export { WorkflowSchemaForAutocompleteBase };
export declare const WorkflowTokenUsageSchema: z.ZodObject<{
    inputTokens: z.ZodNumber;
    outputTokens: z.ZodNumber;
    totalTokens: z.ZodNumber;
}, z.core.$strip>;
export declare const WorkflowExecutionContextSchema: z.ZodObject<{
    id: z.ZodString;
    isTestRun: z.ZodBoolean;
    startedAt: z.ZodDate;
    url: z.ZodString;
    executedBy: z.ZodOptional<z.ZodString>;
    triggeredBy: z.ZodOptional<z.ZodString>;
    usage: z.ZodOptional<z.ZodObject<{
        inputTokens: z.ZodNumber;
        outputTokens: z.ZodNumber;
        totalTokens: z.ZodNumber;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type WorkflowExecutionContext = z.infer<typeof WorkflowExecutionContextSchema>;
export declare const WorkflowDataContextSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    enabled: z.ZodBoolean;
    spaceId: z.ZodString;
}, z.core.$strip>;
export type WorkflowDataContext = z.infer<typeof WorkflowDataContextSchema>;
/**
 * Timestamp injected by the platform for event-driven (custom) trigger events only.
 */
export declare const EventTimestampSchema: z.ZodObject<{
    timestamp: z.ZodString;
}, z.core.$strip>;
export declare const WorkflowContextSchema: z.ZodObject<{
    inputs: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    event: z.ZodOptional<z.ZodObject<{
        alerts: z.ZodArray<z.ZodUnion<readonly [z.ZodObject<{
            _id: z.ZodString;
            _index: z.ZodString;
            kibana: z.ZodObject<{
                alert: z.ZodUnknown;
            }, z.core.$strip>;
            '@timestamp': z.ZodString;
        }, z.core.$strip>, z.ZodUnknown]>>;
        rule: z.ZodObject<{
            id: z.ZodString;
            name: z.ZodString;
            tags: z.ZodArray<z.ZodString>;
            consumer: z.ZodString;
            producer: z.ZodString;
            ruleTypeId: z.ZodString;
        }, z.core.$strip>;
        params: z.ZodUnknown;
        spaceId: z.ZodString;
    }, z.core.$strip>>;
    execution: z.ZodObject<{
        id: z.ZodString;
        isTestRun: z.ZodBoolean;
        startedAt: z.ZodDate;
        url: z.ZodString;
        executedBy: z.ZodOptional<z.ZodString>;
        triggeredBy: z.ZodOptional<z.ZodString>;
        usage: z.ZodOptional<z.ZodObject<{
            inputTokens: z.ZodNumber;
            outputTokens: z.ZodNumber;
            totalTokens: z.ZodNumber;
        }, z.core.$strip>>;
    }, z.core.$strip>;
    workflow: z.ZodObject<{
        id: z.ZodString;
        name: z.ZodString;
        enabled: z.ZodBoolean;
        spaceId: z.ZodString;
    }, z.core.$strip>;
    kibanaUrl: z.ZodString;
    output: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnion<readonly [z.ZodString, z.ZodNumber, z.ZodBoolean, z.ZodUnion<readonly [z.ZodArray<z.ZodString>, z.ZodArray<z.ZodNumber>, z.ZodArray<z.ZodBoolean>]>]>>>;
    consts: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
    now: z.ZodOptional<z.ZodDate>;
    parent: z.ZodOptional<z.ZodObject<{
        workflowId: z.ZodString;
        executionId: z.ZodString;
        depth: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strip>>;
    metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, z.core.$strip>;
export type WorkflowContext = z.infer<typeof WorkflowContextSchema>;
export declare const DynamicWorkflowContextSchema: z.ZodObject<{
    execution: z.ZodObject<{
        id: z.ZodString;
        isTestRun: z.ZodBoolean;
        startedAt: z.ZodDate;
        url: z.ZodString;
        executedBy: z.ZodOptional<z.ZodString>;
        triggeredBy: z.ZodOptional<z.ZodString>;
        usage: z.ZodOptional<z.ZodObject<{
            inputTokens: z.ZodNumber;
            outputTokens: z.ZodNumber;
            totalTokens: z.ZodNumber;
        }, z.core.$strip>>;
    }, z.core.$strip>;
    workflow: z.ZodObject<{
        id: z.ZodString;
        name: z.ZodString;
        enabled: z.ZodBoolean;
        spaceId: z.ZodString;
    }, z.core.$strip>;
    kibanaUrl: z.ZodString;
    now: z.ZodOptional<z.ZodDate>;
    parent: z.ZodOptional<z.ZodObject<{
        workflowId: z.ZodString;
        executionId: z.ZodString;
        depth: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strip>>;
    metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    inputs: z.ZodObject<{}, z.core.$strip>;
    output: z.ZodObject<{}, z.core.$strip>;
    consts: z.ZodObject<{}, z.core.$strip>;
    event: z.ZodOptional<z.ZodObject<{
        spaceId: z.ZodString;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type DynamicWorkflowContext = z.infer<typeof DynamicWorkflowContextSchema>;
export declare const StepDataSchema: z.ZodObject<{
    output: z.ZodOptional<z.ZodAny>;
    error: z.ZodOptional<z.ZodAny>;
}, z.core.$strip>;
export type StepData = z.infer<typeof StepDataSchema>;
export declare const ForEachContextSchema: z.ZodObject<{
    items: z.ZodArray<z.ZodUnknown>;
    index: z.ZodNumber;
    item: z.ZodUnknown;
    total: z.ZodNumber;
}, z.core.$strip>;
export type ForEachContext = z.infer<typeof ForEachContextSchema>;
export declare const BaseSerializedErrorSchema: z.ZodObject<{
    type: z.ZodString;
    message: z.ZodString;
    details: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, z.core.$strip>;
export type SerializedError = z.infer<typeof BaseSerializedErrorSchema>;
export declare const WhileContextSchema: z.ZodObject<{
    iteration: z.ZodNumber;
}, z.core.$strip>;
export type WhileContext = z.infer<typeof WhileContextSchema>;
export declare const StepContextSchema: z.ZodObject<{
    inputs: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    event: z.ZodOptional<z.ZodObject<{
        alerts: z.ZodArray<z.ZodUnion<readonly [z.ZodObject<{
            _id: z.ZodString;
            _index: z.ZodString;
            kibana: z.ZodObject<{
                alert: z.ZodUnknown;
            }, z.core.$strip>;
            '@timestamp': z.ZodString;
        }, z.core.$strip>, z.ZodUnknown]>>;
        rule: z.ZodObject<{
            id: z.ZodString;
            name: z.ZodString;
            tags: z.ZodArray<z.ZodString>;
            consumer: z.ZodString;
            producer: z.ZodString;
            ruleTypeId: z.ZodString;
        }, z.core.$strip>;
        params: z.ZodUnknown;
        spaceId: z.ZodString;
    }, z.core.$strip>>;
    execution: z.ZodObject<{
        id: z.ZodString;
        isTestRun: z.ZodBoolean;
        startedAt: z.ZodDate;
        url: z.ZodString;
        executedBy: z.ZodOptional<z.ZodString>;
        triggeredBy: z.ZodOptional<z.ZodString>;
        usage: z.ZodOptional<z.ZodObject<{
            inputTokens: z.ZodNumber;
            outputTokens: z.ZodNumber;
            totalTokens: z.ZodNumber;
        }, z.core.$strip>>;
    }, z.core.$strip>;
    workflow: z.ZodObject<{
        id: z.ZodString;
        name: z.ZodString;
        enabled: z.ZodBoolean;
        spaceId: z.ZodString;
    }, z.core.$strip>;
    kibanaUrl: z.ZodString;
    output: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnion<readonly [z.ZodString, z.ZodNumber, z.ZodBoolean, z.ZodUnion<readonly [z.ZodArray<z.ZodString>, z.ZodArray<z.ZodNumber>, z.ZodArray<z.ZodBoolean>]>]>>>;
    consts: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
    now: z.ZodOptional<z.ZodDate>;
    parent: z.ZodOptional<z.ZodObject<{
        workflowId: z.ZodString;
        executionId: z.ZodString;
        depth: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strip>>;
    metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    steps: z.ZodRecord<z.ZodString, z.ZodObject<{
        output: z.ZodOptional<z.ZodAny>;
        error: z.ZodOptional<z.ZodAny>;
    }, z.core.$strip>>;
    foreach: z.ZodOptional<z.ZodObject<{
        items: z.ZodArray<z.ZodUnknown>;
        index: z.ZodNumber;
        item: z.ZodUnknown;
        total: z.ZodNumber;
    }, z.core.$strip>>;
    while: z.ZodOptional<z.ZodObject<{
        iteration: z.ZodNumber;
    }, z.core.$strip>>;
    variables: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    error: z.ZodOptional<z.ZodObject<{
        type: z.ZodString;
        message: z.ZodString;
        details: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type StepContext = z.infer<typeof StepContextSchema>;
export declare const DynamicStepContextSchema: z.ZodObject<{
    execution: z.ZodObject<{
        id: z.ZodString;
        isTestRun: z.ZodBoolean;
        startedAt: z.ZodDate;
        url: z.ZodString;
        executedBy: z.ZodOptional<z.ZodString>;
        triggeredBy: z.ZodOptional<z.ZodString>;
        usage: z.ZodOptional<z.ZodObject<{
            inputTokens: z.ZodNumber;
            outputTokens: z.ZodNumber;
            totalTokens: z.ZodNumber;
        }, z.core.$strip>>;
    }, z.core.$strip>;
    workflow: z.ZodObject<{
        id: z.ZodString;
        name: z.ZodString;
        enabled: z.ZodBoolean;
        spaceId: z.ZodString;
    }, z.core.$strip>;
    kibanaUrl: z.ZodString;
    now: z.ZodOptional<z.ZodDate>;
    parent: z.ZodOptional<z.ZodObject<{
        workflowId: z.ZodString;
        executionId: z.ZodString;
        depth: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strip>>;
    metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    inputs: z.ZodObject<{}, z.core.$strip>;
    output: z.ZodObject<{}, z.core.$strip>;
    consts: z.ZodObject<{}, z.core.$strip>;
    event: z.ZodOptional<z.ZodObject<{
        spaceId: z.ZodString;
    }, z.core.$strip>>;
    steps: z.ZodObject<{}, z.core.$strip>;
}, z.core.$strip>;
export type DynamicStepContext = z.infer<typeof DynamicStepContextSchema>;
