import type { ElasticsearchClient, Logger } from '@kbn/core/server';
interface Opts {
    esClient: ElasticsearchClient;
    eventLogIndex: string;
    logger: Logger;
}
export interface GapAutoFillSchedulerTelemetry {
    hasErrors: boolean;
    errorMessage?: string;
    runsTotal: number;
    runsByStatus: Record<string, number>;
    durationMs: {
        min: number;
        max: number;
        avg: number;
        sum: number;
    };
    uniqueRuleCount: number;
    processedGapsTotal: number;
    resultsByStatus: Record<string, number>;
}
export declare function getGapAutoFillSchedulerTelemetryPerDay({ esClient, eventLogIndex, logger, }: Opts): Promise<GapAutoFillSchedulerTelemetry>;
export {};
