import type { ElasticsearchClient, Logger } from '@kbn/core/server';
interface Opts {
    esClient: ElasticsearchClient;
    eventLogIndex: string;
    logger: Logger;
}
interface GetBackfillTelemetryPerDayCountResults {
    hasErrors: boolean;
    errorMessage?: string;
    countExecutions: number;
    countBackfillsByExecutionStatus: Record<string, number>;
    countGaps: number;
    totalUnfilledGapDurationMs: number;
    totalFilledGapDurationMs: number;
}
export declare function getBackfillTelemetryPerDay(opts: Opts): Promise<GetBackfillTelemetryPerDayCountResults>;
export {};
