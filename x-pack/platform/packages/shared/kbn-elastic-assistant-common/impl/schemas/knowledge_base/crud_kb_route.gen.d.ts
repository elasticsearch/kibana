import { z } from '@kbn/zod/v4';
/**
 * AI assistant KnowledgeBase.
 */
export declare const KnowledgeBaseResponse: z.ZodObject<{
    success: z.ZodOptional<z.ZodBoolean>;
}, z.core.$strip>;
export type KnowledgeBaseResponse = z.infer<typeof KnowledgeBaseResponse>;
export declare const KnowledgeBaseResponse400: z.ZodObject<{
    statusCode: z.ZodOptional<z.ZodNumber>;
    error: z.ZodOptional<z.ZodString>;
    message: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type KnowledgeBaseResponse400 = z.infer<typeof KnowledgeBaseResponse400>;
export declare const KnowledgeBaseReadResponse200: z.ZodObject<{
    elser_exists: z.ZodOptional<z.ZodBoolean>;
    is_setup_available: z.ZodOptional<z.ZodBoolean>;
    is_setup_in_progress: z.ZodOptional<z.ZodBoolean>;
    security_labs_exists: z.ZodOptional<z.ZodBoolean>;
    defend_insights_exists: z.ZodOptional<z.ZodBoolean>;
    user_data_exists: z.ZodOptional<z.ZodBoolean>;
    product_documentation_status: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type KnowledgeBaseReadResponse200 = z.infer<typeof KnowledgeBaseReadResponse200>;
export declare const CreateKnowledgeBaseRequestQuery: z.ZodObject<{
    modelId: z.ZodOptional<z.ZodString>;
    ignoreSecurityLabs: z.ZodDefault<z.ZodOptional<z.ZodUnion<readonly [z.ZodPipe<z.ZodEnum<{
        true: "true";
        false: "false";
    }>, z.ZodTransform<boolean, "true" | "false">>, z.ZodBoolean]> & import("@kbn/zod-helpers/v4/kbn_zod_types/kbn_zod_type").KbnZodType>>;
}, z.core.$strip>;
export type CreateKnowledgeBaseRequestQuery = z.infer<typeof CreateKnowledgeBaseRequestQuery>;
export type CreateKnowledgeBaseRequestQueryInput = z.input<typeof CreateKnowledgeBaseRequestQuery>;
export declare const CreateKnowledgeBaseRequestParams: z.ZodObject<{
    resource: z.ZodString;
}, z.core.$strip>;
export type CreateKnowledgeBaseRequestParams = z.infer<typeof CreateKnowledgeBaseRequestParams>;
export type CreateKnowledgeBaseRequestParamsInput = z.input<typeof CreateKnowledgeBaseRequestParams>;
export declare const CreateKnowledgeBaseResponse: z.ZodObject<{
    success: z.ZodOptional<z.ZodBoolean>;
}, z.core.$strip>;
export type CreateKnowledgeBaseResponse = z.infer<typeof CreateKnowledgeBaseResponse>;
export declare const GetKnowledgeBaseResponse: z.ZodObject<{
    elser_exists: z.ZodOptional<z.ZodBoolean>;
    is_setup_available: z.ZodOptional<z.ZodBoolean>;
    is_setup_in_progress: z.ZodOptional<z.ZodBoolean>;
    security_labs_exists: z.ZodOptional<z.ZodBoolean>;
    defend_insights_exists: z.ZodOptional<z.ZodBoolean>;
    user_data_exists: z.ZodOptional<z.ZodBoolean>;
    product_documentation_status: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type GetKnowledgeBaseResponse = z.infer<typeof GetKnowledgeBaseResponse>;
export declare const PostKnowledgeBaseRequestQuery: z.ZodObject<{
    modelId: z.ZodOptional<z.ZodString>;
    ignoreSecurityLabs: z.ZodDefault<z.ZodOptional<z.ZodUnion<readonly [z.ZodPipe<z.ZodEnum<{
        true: "true";
        false: "false";
    }>, z.ZodTransform<boolean, "true" | "false">>, z.ZodBoolean]> & import("@kbn/zod-helpers/v4/kbn_zod_types/kbn_zod_type").KbnZodType>>;
}, z.core.$strip>;
export type PostKnowledgeBaseRequestQuery = z.infer<typeof PostKnowledgeBaseRequestQuery>;
export type PostKnowledgeBaseRequestQueryInput = z.input<typeof PostKnowledgeBaseRequestQuery>;
export declare const PostKnowledgeBaseResponse: z.ZodObject<{
    success: z.ZodOptional<z.ZodBoolean>;
}, z.core.$strip>;
export type PostKnowledgeBaseResponse = z.infer<typeof PostKnowledgeBaseResponse>;
export declare const ReadKnowledgeBaseRequestParams: z.ZodObject<{
    resource: z.ZodString;
}, z.core.$strip>;
export type ReadKnowledgeBaseRequestParams = z.infer<typeof ReadKnowledgeBaseRequestParams>;
export type ReadKnowledgeBaseRequestParamsInput = z.input<typeof ReadKnowledgeBaseRequestParams>;
export declare const ReadKnowledgeBaseResponse: z.ZodObject<{
    elser_exists: z.ZodOptional<z.ZodBoolean>;
    is_setup_available: z.ZodOptional<z.ZodBoolean>;
    is_setup_in_progress: z.ZodOptional<z.ZodBoolean>;
    security_labs_exists: z.ZodOptional<z.ZodBoolean>;
    defend_insights_exists: z.ZodOptional<z.ZodBoolean>;
    user_data_exists: z.ZodOptional<z.ZodBoolean>;
    product_documentation_status: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type ReadKnowledgeBaseResponse = z.infer<typeof ReadKnowledgeBaseResponse>;
