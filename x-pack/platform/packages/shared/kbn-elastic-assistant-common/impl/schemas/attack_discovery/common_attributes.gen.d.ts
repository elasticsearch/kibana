import { z } from '@kbn/zod/v4';
/**
 * An attack discovery generated from one or more alerts
 */
export declare const AttackDiscovery: z.ZodObject<{
    alertIds: z.ZodArray<z.ZodString>;
    id: z.ZodOptional<z.ZodString>;
    detailsMarkdown: z.ZodString;
    entitySummaryMarkdown: z.ZodOptional<z.ZodString>;
    mitreAttackTactics: z.ZodOptional<z.ZodArray<z.ZodString>>;
    summaryMarkdown: z.ZodString;
    title: z.ZodString;
    timestamp: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type AttackDiscovery = z.infer<typeof AttackDiscovery>;
/**
 * Array of attack discoveries
 */
export declare const AttackDiscoveries: z.ZodArray<z.ZodObject<{
    alertIds: z.ZodArray<z.ZodString>;
    id: z.ZodOptional<z.ZodString>;
    detailsMarkdown: z.ZodString;
    entitySummaryMarkdown: z.ZodOptional<z.ZodString>;
    mitreAttackTactics: z.ZodOptional<z.ZodArray<z.ZodString>>;
    summaryMarkdown: z.ZodString;
    title: z.ZodString;
    timestamp: z.ZodOptional<z.ZodString>;
}, z.core.$strip>>;
export type AttackDiscoveries = z.infer<typeof AttackDiscoveries>;
/**
 * The status of the attack discovery.
 */
export declare const AttackDiscoveryStatus: z.ZodEnum<{
    running: "running";
    failed: "failed";
    succeeded: "succeeded";
    canceled: "canceled";
}>;
export type AttackDiscoveryStatus = z.infer<typeof AttackDiscoveryStatus>;
export type AttackDiscoveryStatusEnum = typeof AttackDiscoveryStatus.enum;
export declare const AttackDiscoveryStatusEnum: {
    running: "running";
    failed: "failed";
    succeeded: "succeeded";
    canceled: "canceled";
};
/**
 * Run durations for the attack discovery
 */
export declare const GenerationInterval: z.ZodObject<{
    date: z.ZodString;
    durationMs: z.ZodNumber;
}, z.core.$strip>;
export type GenerationInterval = z.infer<typeof GenerationInterval>;
/**
 * Attack discovery stats
 */
export declare const AttackDiscoveryStat: z.ZodObject<{
    hasViewed: z.ZodBoolean;
    count: z.ZodNumber;
    connectorId: z.ZodString;
    status: z.ZodEnum<{
        running: "running";
        failed: "failed";
        succeeded: "succeeded";
        canceled: "canceled";
    }>;
}, z.core.$strip>;
export type AttackDiscoveryStat = z.infer<typeof AttackDiscoveryStat>;
/**
 * Stats on existing attack discovery documents
 */
export declare const AttackDiscoveryStats: z.ZodObject<{
    newDiscoveriesCount: z.ZodNumber;
    newConnectorResultsCount: z.ZodNumber;
    statsPerConnector: z.ZodArray<z.ZodObject<{
        hasViewed: z.ZodBoolean;
        count: z.ZodNumber;
        connectorId: z.ZodString;
        status: z.ZodEnum<{
            running: "running";
            failed: "failed";
            succeeded: "succeeded";
            canceled: "canceled";
        }>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type AttackDiscoveryStats = z.infer<typeof AttackDiscoveryStats>;
export declare const AttackDiscoveryResponse: z.ZodObject<{
    id: z.ZodString;
    timestamp: z.ZodOptional<z.ZodString>;
    updatedAt: z.ZodString;
    lastViewedAt: z.ZodString;
    alertsContextCount: z.ZodOptional<z.ZodNumber>;
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
    attackDiscoveries: z.ZodArray<z.ZodObject<{
        alertIds: z.ZodArray<z.ZodString>;
        id: z.ZodOptional<z.ZodString>;
        detailsMarkdown: z.ZodString;
        entitySummaryMarkdown: z.ZodOptional<z.ZodString>;
        mitreAttackTactics: z.ZodOptional<z.ZodArray<z.ZodString>>;
        summaryMarkdown: z.ZodString;
        title: z.ZodString;
        timestamp: z.ZodOptional<z.ZodString>;
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
export type AttackDiscoveryResponse = z.infer<typeof AttackDiscoveryResponse>;
export declare const CreateAttackDiscoveryAlertsParams: z.ZodObject<{
    alertsContextCount: z.ZodNumber;
    anonymizedAlerts: z.ZodArray<z.ZodObject<{
        id: z.ZodOptional<z.ZodString>;
        metadata: z.ZodObject<{}, z.core.$strip>;
        pageContent: z.ZodString;
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
    attackDiscoveries: z.ZodArray<z.ZodObject<{
        alertIds: z.ZodArray<z.ZodString>;
        id: z.ZodOptional<z.ZodString>;
        detailsMarkdown: z.ZodString;
        entitySummaryMarkdown: z.ZodOptional<z.ZodString>;
        mitreAttackTactics: z.ZodOptional<z.ZodArray<z.ZodString>>;
        summaryMarkdown: z.ZodString;
        title: z.ZodString;
        timestamp: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
    connectorName: z.ZodString;
    enableFieldRendering: z.ZodBoolean;
    generationUuid: z.ZodString;
    replacements: z.ZodOptional<z.ZodObject<{}, z.core.$catchall<z.ZodString>>>;
    withReplacements: z.ZodBoolean;
}, z.core.$strip>;
export type CreateAttackDiscoveryAlertsParams = z.infer<typeof CreateAttackDiscoveryAlertsParams>;
export declare const FindAttackDiscoveryAlertsParams: z.ZodObject<{
    alertIds: z.ZodOptional<z.ZodArray<z.ZodString>>;
    connectorNames: z.ZodOptional<z.ZodArray<z.ZodString>>;
    enableFieldRendering: z.ZodBoolean;
    end: z.ZodOptional<z.ZodString>;
    executionUuid: z.ZodOptional<z.ZodString>;
    includeUniqueAlertIds: z.ZodOptional<z.ZodBoolean>;
    ids: z.ZodOptional<z.ZodArray<z.ZodString>>;
    page: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
    perPage: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
    search: z.ZodOptional<z.ZodString>;
    shared: z.ZodOptional<z.ZodBoolean>;
    includeAllAuthors: z.ZodOptional<z.ZodBoolean>;
    scheduled: z.ZodOptional<z.ZodBoolean>;
    sortField: z.ZodDefault<z.ZodOptional<z.ZodString>>;
    sortOrder: z.ZodOptional<z.ZodString>;
    start: z.ZodOptional<z.ZodString>;
    status: z.ZodOptional<z.ZodArray<z.ZodString>>;
    withReplacements: z.ZodBoolean;
}, z.core.$strip>;
export type FindAttackDiscoveryAlertsParams = z.infer<typeof FindAttackDiscoveryAlertsParams>;
export declare const AttackDiscoveryGenerationConfig: z.ZodObject<{
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
export type AttackDiscoveryGenerationConfig = z.infer<typeof AttackDiscoveryGenerationConfig>;
