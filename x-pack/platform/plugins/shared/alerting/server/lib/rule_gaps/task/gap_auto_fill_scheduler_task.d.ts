import type { TaskManagerSetupContract } from '@kbn/task-manager-plugin/server';
import type { Logger } from '@kbn/core/server';
import type { KibanaRequest } from '@kbn/core/server';
import type { IEventLogger } from '@kbn/event-log-plugin/server';
import type { RulesClientApi } from '../../../types';
import type { GapReasonType } from '../../../../common/constants/gap_reason';
import type { createGapAutoFillSchedulerEventLogger } from './gap_auto_fill_scheduler_event_log';
import type { RulesClientContext } from '../../../rules_client/types';
import type { AggregatedByRuleEntry } from './utils';
export declare enum SchedulerLoopState {
    COMPLETED = "completed",
    CAPACITY_EXHAUSTED = "capacity_exhausted",
    CANCELLED = "cancelled"
}
interface ProcessRuleBatchesResult {
    aggregatedByRule: Map<string, AggregatedByRuleEntry>;
    state: SchedulerLoopState;
}
interface ProcessGapsForRulesResult {
    aggregatedByRule: Map<string, AggregatedByRuleEntry>;
    remainingBackfills: number;
    state: SchedulerLoopState;
}
type LoggerMessageBuilder = (message: string) => string;
export declare function processRuleBatches({ abortController, gapsPerPage, gapFetchMaxIterations, logger, loggerMessage, logEvent, remainingBackfills, ruleIds, rulesBatchSize, rulesClient, rulesClientContext, sortOrder, startISO, endISO, taskInstanceId, numRetries, excludedReasons, }: {
    abortController: AbortController;
    gapsPerPage: number;
    gapFetchMaxIterations: number;
    logger: Logger;
    loggerMessage: LoggerMessageBuilder;
    logEvent: ReturnType<typeof createGapAutoFillSchedulerEventLogger>;
    remainingBackfills: number;
    ruleIds: string[];
    rulesBatchSize: number;
    rulesClient: RulesClientApi;
    rulesClientContext: RulesClientContext;
    sortOrder: 'asc' | 'desc';
    startISO: string;
    endISO: string;
    taskInstanceId: string;
    numRetries: number;
    excludedReasons?: GapReasonType[];
}): Promise<ProcessRuleBatchesResult>;
export declare function processGapsForRules({ abortController, aggregatedByRule, endISO, gapsPerPage, gapFetchMaxIterations, logger, loggerMessage, logEvent, remainingBackfills, rulesClientContext, sortOrder, startISO, taskInstanceId, toProcessRuleIds, numRetries, excludedReasons, }: {
    abortController: AbortController;
    aggregatedByRule: Map<string, AggregatedByRuleEntry>;
    endISO: string;
    gapsPerPage: number;
    gapFetchMaxIterations: number;
    logger: Logger;
    loggerMessage: LoggerMessageBuilder;
    logEvent: ReturnType<typeof createGapAutoFillSchedulerEventLogger>;
    remainingBackfills: number;
    rulesClientContext: RulesClientContext;
    sortOrder: 'asc' | 'desc';
    startISO: string;
    taskInstanceId: string;
    toProcessRuleIds: string[];
    numRetries: number;
    excludedReasons?: GapReasonType[];
}): Promise<ProcessGapsForRulesResult>;
/**
 * Gap Auto Fill Scheduler task
 *
 * This function registers the Gap Auto Fill Scheduler task. It is used to scan for rules that
 * have detection gaps and schedules backfills to fill those gaps. The scheduler:
 * - Loads its runtime configuration from a `gap_auto_fill_scheduler` saved object
 *   (referenced by `configId` in task params)
 * - Cleans up stuck in-progress gaps that don't have corresponding backfills
 * - Honors a global backfill capacity limit before scheduling and tracks the
 *   remaining capacity locally throughout the task run
 * - Processes rules in batches, prioritizing the rules with the oldest gaps first
 * - Uses PIT + search_after pagination to fetch gaps efficiently from event log
 * - Skips gaps that overlap with already scheduled/running backfills to prevent duplicates
 * - Aggregates per-rule results and logs a single summarized event at the end
 * - Supports cancellation and shutdown via `cancel()` and AbortController
 */
export declare function registerGapAutoFillSchedulerTask({ taskManager, logger, getRulesClientWithRequest, eventLogger, schedulerConfig, }: {
    taskManager: TaskManagerSetupContract;
    logger: Logger;
    getRulesClientWithRequest: (request: KibanaRequest) => Promise<RulesClientApi> | undefined;
    eventLogger: IEventLogger;
    schedulerConfig?: {
        timeout?: string;
    };
}): void;
export {};
