import { z } from '@kbn/zod/v4';
export declare const DefendInsightsPostRequestBody: z.ZodObject<{
    endpointIds: z.ZodArray<z.ZodString>;
    insightType: z.ZodEnum<{
        custom: "custom";
        incompatible_antivirus: "incompatible_antivirus";
        policy_response_failure: "policy_response_failure";
    }>;
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
    langSmithProject: z.ZodOptional<z.ZodString>;
    langSmithApiKey: z.ZodOptional<z.ZodString>;
    model: z.ZodOptional<z.ZodString>;
    replacements: z.ZodOptional<z.ZodObject<{}, z.core.$catchall<z.ZodString>>>;
    subAction: z.ZodEnum<{
        invokeAI: "invokeAI";
        invokeStream: "invokeStream";
    }>;
}, z.core.$strip>;
export type DefendInsightsPostRequestBody = z.infer<typeof DefendInsightsPostRequestBody>;
export type DefendInsightsPostRequestBodyInput = z.input<typeof DefendInsightsPostRequestBody>;
export declare const DefendInsightsPostResponse: z.ZodObject<{
    id: z.ZodString;
    timestamp: z.ZodOptional<z.ZodString>;
    updatedAt: z.ZodString;
    lastViewedAt: z.ZodString;
    eventsContextCount: z.ZodOptional<z.ZodNumber>;
    createdAt: z.ZodString;
    replacements: z.ZodOptional<z.ZodObject<{}, z.core.$catchall<z.ZodString>>>;
    users: z.ZodArray<z.ZodObject<{
        id: z.ZodOptional<z.ZodString>;
        name: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
    status: z.ZodEnum<{
        running: "running";
        failed: "failed";
        succeeded: "succeeded";
        canceled: "canceled";
    }>;
    endpointIds: z.ZodArray<z.ZodString>;
    insightType: z.ZodEnum<{
        custom: "custom";
        incompatible_antivirus: "incompatible_antivirus";
        policy_response_failure: "policy_response_failure";
    }>;
    insights: z.ZodArray<z.ZodObject<{
        group: z.ZodString;
        events: z.ZodOptional<z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            endpointId: z.ZodString;
            value: z.ZodString;
        }, z.core.$strip>>>;
        remediation: z.ZodOptional<z.ZodObject<{}, z.core.$catchall<z.ZodUnknown>>>;
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
    namespace: z.ZodString;
    backingIndex: z.ZodString;
    generationIntervals: z.ZodArray<z.ZodObject<{
        date: z.ZodString;
        durationMs: z.ZodNumber;
    }, z.core.$strip>>;
    averageIntervalMs: z.ZodNumber;
    failureReason: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type DefendInsightsPostResponse = z.infer<typeof DefendInsightsPostResponse>;
