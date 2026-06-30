import { z } from '@kbn/zod/v4';
/**
 * A Defend insight event
 */
export declare const DefendInsightEvent: z.ZodObject<{
    id: z.ZodString;
    endpointId: z.ZodString;
    value: z.ZodString;
}, z.core.$strip>;
export type DefendInsightEvent = z.infer<typeof DefendInsightEvent>;
/**
 * The insight type (ie. incompatible_antivirus)
 */
export declare const DefendInsightType: z.ZodEnum<{
    custom: "custom";
    incompatible_antivirus: "incompatible_antivirus";
    policy_response_failure: "policy_response_failure";
}>;
export type DefendInsightType = z.infer<typeof DefendInsightType>;
export type DefendInsightTypeEnum = typeof DefendInsightType.enum;
export declare const DefendInsightTypeEnum: {
    custom: "custom";
    incompatible_antivirus: "incompatible_antivirus";
    policy_response_failure: "policy_response_failure";
};
/**
 * A Defend insight generated from endpoint events
 */
export declare const DefendInsight: z.ZodObject<{
    group: z.ZodString;
    events: z.ZodOptional<z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        endpointId: z.ZodString;
        value: z.ZodString;
    }, z.core.$strip>>>;
    remediation: z.ZodOptional<z.ZodObject<{}, z.core.$catchall<z.ZodUnknown>>>;
}, z.core.$strip>;
export type DefendInsight = z.infer<typeof DefendInsight>;
/**
 * Array of Defend insights
 */
export declare const DefendInsights: z.ZodArray<z.ZodObject<{
    group: z.ZodString;
    events: z.ZodOptional<z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        endpointId: z.ZodString;
        value: z.ZodString;
    }, z.core.$strip>>>;
    remediation: z.ZodOptional<z.ZodObject<{}, z.core.$catchall<z.ZodUnknown>>>;
}, z.core.$strip>>;
export type DefendInsights = z.infer<typeof DefendInsights>;
/**
 * The status of the Defend insight.
 */
export declare const DefendInsightStatus: z.ZodEnum<{
    running: "running";
    failed: "failed";
    succeeded: "succeeded";
    canceled: "canceled";
}>;
export type DefendInsightStatus = z.infer<typeof DefendInsightStatus>;
export type DefendInsightStatusEnum = typeof DefendInsightStatus.enum;
export declare const DefendInsightStatusEnum: {
    running: "running";
    failed: "failed";
    succeeded: "succeeded";
    canceled: "canceled";
};
/**
 * Run durations for the Defend insight
 */
export declare const DefendInsightGenerationInterval: z.ZodObject<{
    date: z.ZodString;
    durationMs: z.ZodNumber;
}, z.core.$strip>;
export type DefendInsightGenerationInterval = z.infer<typeof DefendInsightGenerationInterval>;
export declare const DefendInsightsResponse: z.ZodObject<{
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
export type DefendInsightsResponse = z.infer<typeof DefendInsightsResponse>;
export declare const DefendInsightUpdateProps: z.ZodObject<{
    id: z.ZodString;
    apiConfig: z.ZodOptional<z.ZodObject<{
        connectorId: z.ZodString;
        actionTypeId: z.ZodString;
        defaultSystemPromptId: z.ZodOptional<z.ZodString>;
        provider: z.ZodOptional<z.ZodEnum<{
            OpenAI: "OpenAI";
            "Azure OpenAI": "Azure OpenAI";
            Other: "Other";
        }>>;
        model: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
    eventsContextCount: z.ZodOptional<z.ZodNumber>;
    insights: z.ZodOptional<z.ZodArray<z.ZodObject<{
        group: z.ZodString;
        events: z.ZodOptional<z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            endpointId: z.ZodString;
            value: z.ZodString;
        }, z.core.$strip>>>;
        remediation: z.ZodOptional<z.ZodObject<{}, z.core.$catchall<z.ZodUnknown>>>;
    }, z.core.$strip>>>;
    status: z.ZodOptional<z.ZodEnum<{
        running: "running";
        failed: "failed";
        succeeded: "succeeded";
        canceled: "canceled";
    }>>;
    replacements: z.ZodOptional<z.ZodObject<{}, z.core.$catchall<z.ZodString>>>;
    generationIntervals: z.ZodOptional<z.ZodArray<z.ZodObject<{
        date: z.ZodString;
        durationMs: z.ZodNumber;
    }, z.core.$strip>>>;
    backingIndex: z.ZodString;
    failureReason: z.ZodOptional<z.ZodString>;
    lastViewedAt: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type DefendInsightUpdateProps = z.infer<typeof DefendInsightUpdateProps>;
export declare const DefendInsightsUpdateProps: z.ZodArray<z.ZodObject<{
    id: z.ZodString;
    apiConfig: z.ZodOptional<z.ZodObject<{
        connectorId: z.ZodString;
        actionTypeId: z.ZodString;
        defaultSystemPromptId: z.ZodOptional<z.ZodString>;
        provider: z.ZodOptional<z.ZodEnum<{
            OpenAI: "OpenAI";
            "Azure OpenAI": "Azure OpenAI";
            Other: "Other";
        }>>;
        model: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
    eventsContextCount: z.ZodOptional<z.ZodNumber>;
    insights: z.ZodOptional<z.ZodArray<z.ZodObject<{
        group: z.ZodString;
        events: z.ZodOptional<z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            endpointId: z.ZodString;
            value: z.ZodString;
        }, z.core.$strip>>>;
        remediation: z.ZodOptional<z.ZodObject<{}, z.core.$catchall<z.ZodUnknown>>>;
    }, z.core.$strip>>>;
    status: z.ZodOptional<z.ZodEnum<{
        running: "running";
        failed: "failed";
        succeeded: "succeeded";
        canceled: "canceled";
    }>>;
    replacements: z.ZodOptional<z.ZodObject<{}, z.core.$catchall<z.ZodString>>>;
    generationIntervals: z.ZodOptional<z.ZodArray<z.ZodObject<{
        date: z.ZodString;
        durationMs: z.ZodNumber;
    }, z.core.$strip>>>;
    backingIndex: z.ZodString;
    failureReason: z.ZodOptional<z.ZodString>;
    lastViewedAt: z.ZodOptional<z.ZodString>;
}, z.core.$strip>>;
export type DefendInsightsUpdateProps = z.infer<typeof DefendInsightsUpdateProps>;
export declare const DefendInsightCreateProps: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    status: z.ZodEnum<{
        running: "running";
        failed: "failed";
        succeeded: "succeeded";
        canceled: "canceled";
    }>;
    eventsContextCount: z.ZodOptional<z.ZodNumber>;
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
    replacements: z.ZodOptional<z.ZodObject<{}, z.core.$catchall<z.ZodString>>>;
}, z.core.$strip>;
export type DefendInsightCreateProps = z.infer<typeof DefendInsightCreateProps>;
