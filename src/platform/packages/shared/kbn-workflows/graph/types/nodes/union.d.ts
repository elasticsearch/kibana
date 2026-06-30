import { z } from '@kbn/zod/v4';
declare const GraphNodeUnionSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
    stepId: z.ZodString;
    stepType: z.ZodString;
    templateDependencies: z.ZodOptional<z.ZodArray<z.ZodUnknown>>;
    id: z.ZodString;
    type: z.ZodLiteral<"atomic">;
    configuration: z.ZodAny;
}, z.core.$strip>, z.ZodObject<{
    stepId: z.ZodString;
    stepType: z.ZodString;
    templateDependencies: z.ZodOptional<z.ZodArray<z.ZodUnknown>>;
    id: z.ZodString;
    type: z.ZodLiteral<"data.set">;
    configuration: z.ZodObject<{
        name: z.ZodString;
        'max-step-size': z.ZodOptional<z.ZodString>;
        type: z.ZodLiteral<"data.set">;
        with: z.ZodRecord<z.ZodString, z.ZodUnknown>;
    }, z.core.$strip>;
}, z.core.$strip>, z.ZodObject<{
    stepId: z.ZodString;
    stepType: z.ZodString;
    templateDependencies: z.ZodOptional<z.ZodArray<z.ZodUnknown>>;
    id: z.ZodString;
    type: z.ZodString;
    configuration: z.ZodObject<{
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
}, z.core.$strip>, z.ZodObject<{
    stepId: z.ZodString;
    stepType: z.ZodString;
    templateDependencies: z.ZodOptional<z.ZodArray<z.ZodUnknown>>;
    id: z.ZodString;
    type: z.ZodString;
    configuration: z.ZodObject<{
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
}, z.core.$strip>, z.ZodObject<{
    stepId: z.ZodString;
    stepType: z.ZodString;
    templateDependencies: z.ZodOptional<z.ZodArray<z.ZodUnknown>>;
    id: z.ZodString;
    type: z.ZodLiteral<"wait">;
    configuration: z.ZodObject<{
        name: z.ZodString;
        'max-step-size': z.ZodOptional<z.ZodString>;
        type: z.ZodLiteral<"wait">;
        with: z.ZodObject<{
            duration: z.ZodString;
        }, z.core.$strip>;
    }, z.core.$strip>;
}, z.core.$strip>, z.ZodObject<{
    stepId: z.ZodString;
    stepType: z.ZodString;
    templateDependencies: z.ZodOptional<z.ZodArray<z.ZodUnknown>>;
    id: z.ZodString;
    type: z.ZodLiteral<"waitForInput">;
    configuration: z.ZodObject<{
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
                properties: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodType<import("../../../spec/schema/common/json_model_shape_schema").JsonSchema, unknown, z.core.$ZodTypeInternals<import("../../../spec/schema/common/json_model_shape_schema").JsonSchema, unknown>>>>;
                additionalProperties: z.ZodOptional<z.ZodBoolean>;
                required: z.ZodOptional<z.ZodArray<z.ZodString>>;
                definitions: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodType<import("../../../spec/schema/common/json_model_shape_schema").JsonSchema, unknown, z.core.$ZodTypeInternals<import("../../../spec/schema/common/json_model_shape_schema").JsonSchema, unknown>>>>;
                $defs: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodType<import("../../../spec/schema/common/json_model_shape_schema").JsonSchema, unknown, z.core.$ZodTypeInternals<import("../../../spec/schema/common/json_model_shape_schema").JsonSchema, unknown>>>>;
            }, z.core.$strip>>;
        }, z.core.$strip>>;
    }, z.core.$strip>;
}, z.core.$strip>, z.ZodObject<{
    stepId: z.ZodString;
    stepType: z.ZodString;
    templateDependencies: z.ZodOptional<z.ZodArray<z.ZodUnknown>>;
    id: z.ZodString;
    type: z.ZodLiteral<"workflow.execute">;
    configuration: z.ZodObject<{
        name: z.ZodString;
        'max-step-size': z.ZodOptional<z.ZodString>;
        with: z.ZodObject<{
            'workflow-id': z.ZodString;
            inputs: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
        }, z.core.$strip>;
        type: z.ZodLiteral<"workflow.execute">;
    }, z.core.$strip>;
}, z.core.$strip>, z.ZodObject<{
    stepId: z.ZodString;
    stepType: z.ZodString;
    templateDependencies: z.ZodOptional<z.ZodArray<z.ZodUnknown>>;
    id: z.ZodString;
    type: z.ZodLiteral<"workflow.executeAsync">;
    configuration: z.ZodObject<{
        name: z.ZodString;
        'max-step-size': z.ZodOptional<z.ZodString>;
        with: z.ZodObject<{
            'workflow-id': z.ZodString;
            inputs: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
        }, z.core.$strip>;
        type: z.ZodLiteral<"workflow.executeAsync">;
    }, z.core.$strip>;
}, z.core.$strip>, z.ZodObject<{
    stepId: z.ZodString;
    stepType: z.ZodString;
    templateDependencies: z.ZodOptional<z.ZodArray<z.ZodUnknown>>;
    id: z.ZodString;
    type: z.ZodLiteral<"workflow.output">;
    configuration: z.ZodObject<{
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
}, z.core.$strip>, z.ZodObject<{
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
}, z.core.$strip>, z.ZodObject<{
    stepId: z.ZodString;
    stepType: z.ZodString;
    templateDependencies: z.ZodOptional<z.ZodArray<z.ZodUnknown>>;
    id: z.ZodString;
    type: z.ZodLiteral<"exit-if">;
    startNodeId: z.ZodString;
}, z.core.$strip>, z.ZodObject<{
    stepId: z.ZodString;
    stepType: z.ZodString;
    templateDependencies: z.ZodOptional<z.ZodArray<z.ZodUnknown>>;
    id: z.ZodString;
    type: z.ZodUnion<readonly [z.ZodLiteral<"enter-then-branch">, z.ZodLiteral<"enter-else-branch">]>;
    condition: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodUndefined]>>;
}, z.core.$strip>, z.ZodObject<{
    stepId: z.ZodString;
    stepType: z.ZodString;
    templateDependencies: z.ZodOptional<z.ZodArray<z.ZodUnknown>>;
    id: z.ZodString;
    type: z.ZodUnion<readonly [z.ZodLiteral<"exit-then-branch">, z.ZodLiteral<"exit-else-branch">]>;
    startNodeId: z.ZodString;
}, z.core.$strip>, z.ZodObject<{
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
}, z.core.$strip>, z.ZodObject<{
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
}, z.core.$strip>, z.ZodObject<{
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
}, z.core.$strip>, z.ZodObject<{
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
}, z.core.$strip>, z.ZodObject<{
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
}, z.core.$strip>, z.ZodObject<{
    stepId: z.ZodString;
    stepType: z.ZodString;
    templateDependencies: z.ZodOptional<z.ZodArray<z.ZodUnknown>>;
    id: z.ZodString;
    type: z.ZodLiteral<"exit-retry">;
    startNodeId: z.ZodString;
}, z.core.$strip>, z.ZodObject<{
    stepId: z.ZodString;
    stepType: z.ZodString;
    templateDependencies: z.ZodOptional<z.ZodArray<z.ZodUnknown>>;
    id: z.ZodString;
    type: z.ZodLiteral<"enter-continue">;
    configuration: z.ZodObject<{
        condition: z.ZodUnion<readonly [z.ZodString, z.ZodBoolean]>;
    }, z.core.$strip>;
    exitNodeId: z.ZodString;
}, z.core.$strip>, z.ZodObject<{
    stepId: z.ZodString;
    stepType: z.ZodString;
    templateDependencies: z.ZodOptional<z.ZodArray<z.ZodUnknown>>;
    id: z.ZodString;
    type: z.ZodLiteral<"exit-continue">;
}, z.core.$strip>, z.ZodObject<{
    stepId: z.ZodString;
    stepType: z.ZodString;
    templateDependencies: z.ZodOptional<z.ZodArray<z.ZodUnknown>>;
    id: z.ZodString;
    type: z.ZodLiteral<"enter-try-block">;
    enterNormalPathNodeId: z.ZodString;
    enterFallbackPathNodeId: z.ZodString;
    exitNodeId: z.ZodString;
}, z.core.$strip>, z.ZodObject<{
    stepId: z.ZodString;
    stepType: z.ZodString;
    templateDependencies: z.ZodOptional<z.ZodArray<z.ZodUnknown>>;
    id: z.ZodString;
    type: z.ZodLiteral<"exit-try-block">;
    enterNodeId: z.ZodString;
}, z.core.$strip>, z.ZodObject<{
    stepId: z.ZodString;
    stepType: z.ZodString;
    templateDependencies: z.ZodOptional<z.ZodArray<z.ZodUnknown>>;
    id: z.ZodString;
    type: z.ZodLiteral<"enter-normal-path">;
    enterZoneNodeId: z.ZodString;
    enterFailurePathNodeId: z.ZodString;
}, z.core.$strip>, z.ZodObject<{
    stepId: z.ZodString;
    stepType: z.ZodString;
    templateDependencies: z.ZodOptional<z.ZodArray<z.ZodUnknown>>;
    id: z.ZodString;
    type: z.ZodLiteral<"exit-normal-path">;
    exitOnFailureZoneNodeId: z.ZodString;
    enterNodeId: z.ZodString;
}, z.core.$strip>, z.ZodObject<{
    stepId: z.ZodString;
    stepType: z.ZodString;
    templateDependencies: z.ZodOptional<z.ZodArray<z.ZodUnknown>>;
    id: z.ZodString;
    type: z.ZodLiteral<"enter-fallback-path">;
    enterZoneNodeId: z.ZodString;
}, z.core.$strip>, z.ZodObject<{
    stepId: z.ZodString;
    stepType: z.ZodString;
    templateDependencies: z.ZodOptional<z.ZodArray<z.ZodUnknown>>;
    id: z.ZodString;
    type: z.ZodLiteral<"exit-fallback-path">;
    exitOnFailureZoneNodeId: z.ZodString;
    enterNodeId: z.ZodString;
}, z.core.$strip>, z.ZodObject<{
    stepId: z.ZodString;
    templateDependencies: z.ZodOptional<z.ZodArray<z.ZodUnknown>>;
    id: z.ZodString;
    type: z.ZodLiteral<"enter-timeout-zone">;
    timeout: z.ZodString;
    stepType: z.ZodUnion<readonly [z.ZodLiteral<"workflow_level_timeout">, z.ZodLiteral<"step_level_timeout">]>;
}, z.core.$strip>, z.ZodObject<{
    stepId: z.ZodString;
    templateDependencies: z.ZodOptional<z.ZodArray<z.ZodUnknown>>;
    id: z.ZodString;
    type: z.ZodLiteral<"exit-timeout-zone">;
    stepType: z.ZodUnion<readonly [z.ZodLiteral<"workflow_level_timeout">, z.ZodLiteral<"step_level_timeout">]>;
}, z.core.$strip>, z.ZodObject<{
    id: z.ZodString;
    stepId: z.ZodString;
    stepType: z.ZodString;
    templateDependencies: z.ZodOptional<z.ZodArray<z.ZodUnknown>>;
    type: z.ZodLiteral<"on-failure">;
}, z.core.$strip>, z.ZodObject<{
    id: z.ZodString;
    stepId: z.ZodString;
    stepType: z.ZodString;
    templateDependencies: z.ZodOptional<z.ZodArray<z.ZodUnknown>>;
    type: z.ZodLiteral<"step-level-on-failure">;
}, z.core.$strip>, z.ZodObject<{
    id: z.ZodString;
    stepId: z.ZodString;
    stepType: z.ZodString;
    templateDependencies: z.ZodOptional<z.ZodArray<z.ZodUnknown>>;
    type: z.ZodLiteral<"workflow-level-on-failure">;
}, z.core.$strip>, z.ZodObject<{
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
}, z.core.$strip>, z.ZodObject<{
    stepId: z.ZodString;
    stepType: z.ZodString;
    templateDependencies: z.ZodOptional<z.ZodArray<z.ZodUnknown>>;
    id: z.ZodString;
    type: z.ZodLiteral<"enter-case-branch">;
    match: z.ZodUnion<readonly [z.ZodString, z.ZodNumber, z.ZodBoolean]>;
    index: z.ZodNumber;
}, z.core.$strip>, z.ZodObject<{
    stepId: z.ZodString;
    stepType: z.ZodString;
    templateDependencies: z.ZodOptional<z.ZodArray<z.ZodUnknown>>;
    id: z.ZodString;
    type: z.ZodLiteral<"exit-case-branch">;
    startNodeId: z.ZodString;
}, z.core.$strip>, z.ZodObject<{
    stepId: z.ZodString;
    stepType: z.ZodString;
    templateDependencies: z.ZodOptional<z.ZodArray<z.ZodUnknown>>;
    id: z.ZodString;
    type: z.ZodLiteral<"enter-default-branch">;
}, z.core.$strip>, z.ZodObject<{
    stepId: z.ZodString;
    stepType: z.ZodString;
    templateDependencies: z.ZodOptional<z.ZodArray<z.ZodUnknown>>;
    id: z.ZodString;
    type: z.ZodLiteral<"exit-default-branch">;
    startNodeId: z.ZodString;
}, z.core.$strip>, z.ZodObject<{
    stepId: z.ZodString;
    stepType: z.ZodString;
    templateDependencies: z.ZodOptional<z.ZodArray<z.ZodUnknown>>;
    id: z.ZodString;
    type: z.ZodLiteral<"exit-switch">;
    startNodeId: z.ZodString;
}, z.core.$strip>, z.ZodObject<{
    stepId: z.ZodString;
    stepType: z.ZodString;
    templateDependencies: z.ZodOptional<z.ZodArray<z.ZodUnknown>>;
    id: z.ZodString;
    type: z.ZodLiteral<"loop-break">;
    loopExitNodeId: z.ZodString;
    loopStepId: z.ZodString;
}, z.core.$strip>, z.ZodObject<{
    stepId: z.ZodString;
    stepType: z.ZodString;
    templateDependencies: z.ZodOptional<z.ZodArray<z.ZodUnknown>>;
    id: z.ZodString;
    type: z.ZodLiteral<"loop-continue">;
    loopExitNodeId: z.ZodString;
}, z.core.$strip>], "type">;
export type GraphNodeUnion = z.infer<typeof GraphNodeUnionSchema>;
export {};
