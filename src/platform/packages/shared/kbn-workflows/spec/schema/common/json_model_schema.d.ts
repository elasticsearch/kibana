import type { z } from '@kbn/zod/v4';
export declare const JsonModelSchema: z.ZodObject<{
    type: z.ZodOptional<z.ZodLiteral<"object">>;
    title: z.ZodOptional<z.ZodString>;
    description: z.ZodOptional<z.ZodString>;
    $ref: z.ZodOptional<z.ZodString> | z.ZodOptional<z.ZodUnion<readonly [z.ZodEnum<{
        [x: string]: string;
    }>, z.ZodString]>>;
    properties: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodType<import("./json_model_shape_schema").JsonSchema, unknown, z.core.$ZodTypeInternals<import("./json_model_shape_schema").JsonSchema, unknown>>>>;
    additionalProperties: z.ZodOptional<z.ZodBoolean>;
    required: z.ZodOptional<z.ZodArray<z.ZodString>>;
    definitions: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodType<import("./json_model_shape_schema").JsonSchema, unknown, z.core.$ZodTypeInternals<import("./json_model_shape_schema").JsonSchema, unknown>>>>;
    $defs: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodType<import("./json_model_shape_schema").JsonSchema, unknown, z.core.$ZodTypeInternals<import("./json_model_shape_schema").JsonSchema, unknown>>>>;
}, z.core.$strip>;
export type JsonModelSchemaType = z.infer<typeof JsonModelSchema>;
