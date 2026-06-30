import { z } from '@kbn/zod/v4';
export declare const WorkflowInputTypeEnum: z.ZodEnum<{
    string: "string";
    number: "number";
    boolean: "boolean";
    array: "array";
    choice: "choice";
}>;
export declare const WorkflowInputStringSchema: z.ZodObject<{
    name: z.ZodString;
    description: z.ZodOptional<z.ZodString>;
    required: z.ZodOptional<z.ZodBoolean>;
    type: z.ZodLiteral<"string">;
    default: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export declare const WorkflowInputNumberSchema: z.ZodObject<{
    name: z.ZodString;
    description: z.ZodOptional<z.ZodString>;
    required: z.ZodOptional<z.ZodBoolean>;
    type: z.ZodLiteral<"number">;
    default: z.ZodOptional<z.ZodNumber>;
}, z.core.$strip>;
export declare const WorkflowInputBooleanSchema: z.ZodObject<{
    name: z.ZodString;
    description: z.ZodOptional<z.ZodString>;
    required: z.ZodOptional<z.ZodBoolean>;
    type: z.ZodLiteral<"boolean">;
    default: z.ZodOptional<z.ZodBoolean>;
}, z.core.$strip>;
export declare const WorkflowInputChoiceSchema: z.ZodObject<{
    name: z.ZodString;
    description: z.ZodOptional<z.ZodString>;
    required: z.ZodOptional<z.ZodBoolean>;
    type: z.ZodLiteral<"choice">;
    default: z.ZodOptional<z.ZodString>;
    options: z.ZodArray<z.ZodString>;
}, z.core.$strip>;
export declare const WorkflowInputArraySchema: z.ZodObject<{
    name: z.ZodString;
    description: z.ZodOptional<z.ZodString>;
    required: z.ZodOptional<z.ZodBoolean>;
    type: z.ZodLiteral<"array">;
    minItems: z.ZodOptional<z.ZodNumber>;
    maxItems: z.ZodOptional<z.ZodNumber>;
    default: z.ZodOptional<z.ZodUnion<readonly [z.ZodArray<z.ZodString>, z.ZodArray<z.ZodNumber>, z.ZodArray<z.ZodBoolean>]>>;
}, z.core.$strip>;
export declare const LegacyWorkflowInputSchema: z.ZodUnion<readonly [z.ZodObject<{
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
export type LegacyWorkflowInput = z.infer<typeof LegacyWorkflowInputSchema>;
export declare const WorkflowInputSchema: z.ZodUnion<readonly [z.ZodObject<{
    type: z.ZodOptional<z.ZodLiteral<"object">>;
    title: z.ZodOptional<z.ZodString>;
    description: z.ZodOptional<z.ZodString>;
    $ref: z.ZodOptional<z.ZodString> | z.ZodOptional<z.ZodUnion<readonly [z.ZodEnum<{
        [x: string]: string;
    }>, z.ZodString]>>;
    properties: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodType<import("../common/json_model_shape_schema").JsonSchema, unknown, z.core.$ZodTypeInternals<import("../common/json_model_shape_schema").JsonSchema, unknown>>>>;
    additionalProperties: z.ZodOptional<z.ZodBoolean>;
    required: z.ZodOptional<z.ZodArray<z.ZodString>>;
    definitions: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodType<import("../common/json_model_shape_schema").JsonSchema, unknown, z.core.$ZodTypeInternals<import("../common/json_model_shape_schema").JsonSchema, unknown>>>>;
    $defs: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodType<import("../common/json_model_shape_schema").JsonSchema, unknown, z.core.$ZodTypeInternals<import("../common/json_model_shape_schema").JsonSchema, unknown>>>>;
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
}, z.core.$strip>]>>]>;
export type WorkflowInput = z.infer<typeof WorkflowInputSchema>;
export declare const ManualTriggerSchema: z.ZodObject<{
    type: z.ZodLiteral<"manual">;
    inputs: z.ZodOptional<z.ZodUnion<readonly [z.ZodObject<{
        type: z.ZodOptional<z.ZodLiteral<"object">>;
        title: z.ZodOptional<z.ZodString>;
        description: z.ZodOptional<z.ZodString>;
        $ref: z.ZodOptional<z.ZodString> | z.ZodOptional<z.ZodUnion<readonly [z.ZodEnum<{
            [x: string]: string;
        }>, z.ZodString]>>;
        properties: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodType<import("../common/json_model_shape_schema").JsonSchema, unknown, z.core.$ZodTypeInternals<import("../common/json_model_shape_schema").JsonSchema, unknown>>>>;
        additionalProperties: z.ZodOptional<z.ZodBoolean>;
        required: z.ZodOptional<z.ZodArray<z.ZodString>>;
        definitions: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodType<import("../common/json_model_shape_schema").JsonSchema, unknown, z.core.$ZodTypeInternals<import("../common/json_model_shape_schema").JsonSchema, unknown>>>>;
        $defs: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodType<import("../common/json_model_shape_schema").JsonSchema, unknown, z.core.$ZodTypeInternals<import("../common/json_model_shape_schema").JsonSchema, unknown>>>>;
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
}, z.core.$strip>;
export type ManualTrigger = z.infer<typeof ManualTriggerSchema>;
export declare const ManualTriggerEventSchema: z.ZodObject<{
    spaceId: z.ZodString;
    inputs: z.ZodOptional<z.ZodUnknown>;
}, z.core.$strip>;
export type ManualTriggerEvent = z.infer<typeof ManualTriggerEventSchema>;
export declare const isManualTrigger: (trigger: {
    type?: string;
}) => trigger is ManualTrigger;
