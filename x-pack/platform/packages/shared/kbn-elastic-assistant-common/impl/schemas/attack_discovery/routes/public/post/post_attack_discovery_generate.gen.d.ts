import { z } from '@kbn/zod/v4';
export declare const PostAttackDiscoveryGenerateRequestBody: z.ZodObject<{
    alertsIndexPattern: z.ZodString;
    anonymizationFields: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        timestamp: z.ZodOptional<z.ZodString>;
        field: z.ZodString;
        allowed: z.ZodOptional<z.ZodBoolean>;
        anonymized: z.ZodOptional<z.ZodBoolean>;
        updatedAt: z.ZodOptional<z.ZodString>;
        updatedBy: z.ZodOptional<z.ZodString>;
        createdAt: z.ZodOptional<z.ZodString>;
        createdBy: z.ZodOptional<z.ZodString>;
        namespace: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
    apiConfig: z.ZodObject<{
        connectorId: z.ZodString;
        actionTypeId: z.ZodString;
        defaultSystemPromptId: z.ZodOptional<z.ZodString>;
        provider: z.ZodOptional<z.ZodEnum<{
            OpenAI: "OpenAI";
            "Azure OpenAI": "Azure OpenAI";
            Other: "Other";
        }>>;
        model: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>;
    connectorName: z.ZodOptional<z.ZodString>;
    end: z.ZodOptional<z.ZodString>;
    filter: z.ZodOptional<z.ZodObject<{}, z.core.$catchall<z.ZodUnknown>>>;
    langSmithProject: z.ZodOptional<z.ZodString>;
    langSmithApiKey: z.ZodOptional<z.ZodString>;
    model: z.ZodOptional<z.ZodString>;
    replacements: z.ZodOptional<z.ZodObject<{}, z.core.$catchall<z.ZodString>>>;
    size: z.ZodNumber;
    start: z.ZodOptional<z.ZodString>;
    subAction: z.ZodEnum<{
        invokeAI: "invokeAI";
        invokeStream: "invokeStream";
    }>;
}, z.core.$strip>;
export type PostAttackDiscoveryGenerateRequestBody = z.infer<typeof PostAttackDiscoveryGenerateRequestBody>;
export type PostAttackDiscoveryGenerateRequestBodyInput = z.input<typeof PostAttackDiscoveryGenerateRequestBody>;
export declare const PostAttackDiscoveryGenerateResponse: z.ZodObject<{
    execution_uuid: z.ZodString;
}, z.core.$strip>;
export type PostAttackDiscoveryGenerateResponse = z.infer<typeof PostAttackDiscoveryGenerateResponse>;
