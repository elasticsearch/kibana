import { z } from '@kbn/zod/v4';
export declare const GraphNodeSchema: z.ZodObject<{
    id: z.ZodString;
    type: z.ZodString;
    stepId: z.ZodString;
    stepType: z.ZodString;
    templateDependencies: z.ZodOptional<z.ZodArray<z.ZodUnknown>>;
}, z.core.$strip>;
export declare const AtomicGraphNodeSchema: z.ZodObject<{
    stepId: z.ZodString;
    stepType: z.ZodString;
    templateDependencies: z.ZodOptional<z.ZodArray<z.ZodUnknown>>;
    id: z.ZodString;
    type: z.ZodLiteral<"atomic">;
    configuration: z.ZodAny;
}, z.core.$strip>;
export type AtomicGraphNode = z.infer<typeof AtomicGraphNodeSchema>;
export declare const WaitGraphNodeSchema: z.ZodObject<{
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
}, z.core.$strip>;
export type WaitGraphNode = z.infer<typeof WaitGraphNodeSchema>;
export declare const WaitForInputGraphNodeSchema: z.ZodObject<{
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
}, z.core.$strip>;
export type WaitForInputGraphNode = z.infer<typeof WaitForInputGraphNodeSchema>;
export declare const DataSetGraphNodeSchema: z.ZodObject<{
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
}, z.core.$strip>;
export type DataSetGraphNode = z.infer<typeof DataSetGraphNodeSchema>;
export declare const ElasticsearchGraphNodeSchema: z.ZodObject<{
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
}, z.core.$strip>;
export type ElasticsearchGraphNode = z.infer<typeof ElasticsearchGraphNodeSchema>;
export declare const KibanaGraphNodeSchema: z.ZodObject<{
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
}, z.core.$strip>;
export type KibanaGraphNode = z.infer<typeof KibanaGraphNodeSchema>;
export declare const WorkflowExecuteGraphNodeSchema: z.ZodObject<{
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
}, z.core.$strip>;
export type WorkflowExecuteGraphNode = z.infer<typeof WorkflowExecuteGraphNodeSchema>;
export declare const WorkflowExecuteAsyncGraphNodeSchema: z.ZodObject<{
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
}, z.core.$strip>;
export type WorkflowExecuteAsyncGraphNode = z.infer<typeof WorkflowExecuteAsyncGraphNodeSchema>;
export declare const WorkflowOutputGraphNodeSchema: z.ZodObject<{
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
}, z.core.$strip>;
export type WorkflowOutputGraphNode = z.infer<typeof WorkflowOutputGraphNodeSchema>;
