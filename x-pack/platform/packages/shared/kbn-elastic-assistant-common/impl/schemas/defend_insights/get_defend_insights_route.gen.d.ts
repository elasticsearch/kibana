import { z } from '@kbn/zod/v4';
export declare const DefendInsightsGetRequestQuery: z.ZodObject<{
    ids: z.ZodOptional<z.ZodPreprocess<z.ZodArray<z.ZodString>>>;
    connector_id: z.ZodOptional<z.ZodString>;
    type: z.ZodOptional<z.ZodEnum<{
        custom: "custom";
        incompatible_antivirus: "incompatible_antivirus";
        policy_response_failure: "policy_response_failure";
    }>>;
    status: z.ZodOptional<z.ZodEnum<{
        running: "running";
        failed: "failed";
        succeeded: "succeeded";
        canceled: "canceled";
    }>>;
    endpoint_ids: z.ZodOptional<z.ZodPreprocess<z.ZodArray<z.ZodString>>>;
    size: z.ZodOptional<z.ZodCoercedNumber<unknown>>;
}, z.core.$strip>;
export type DefendInsightsGetRequestQuery = z.infer<typeof DefendInsightsGetRequestQuery>;
export type DefendInsightsGetRequestQueryInput = z.input<typeof DefendInsightsGetRequestQuery>;
export declare const DefendInsightsGetResponse: z.ZodObject<{
    data: z.ZodArray<z.ZodObject<{
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
    }, z.core.$strip>>;
}, z.core.$strip>;
export type DefendInsightsGetResponse = z.infer<typeof DefendInsightsGetResponse>;
