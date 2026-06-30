import type { Logger } from '@kbn/core/server';
import type { IEventLogClient, IEventLogger } from '@kbn/event-log-plugin/server';
import type { RulesClientContext } from '../../../rules_client/types';
interface CleanupStuckInProgressGapsParams {
    rulesClientContext: RulesClientContext;
    eventLogClient: IEventLogClient;
    eventLogger: IEventLogger;
    logger: Logger;
    startDate: Date;
}
/**
 * Cleanup stuck in-progress gaps that don't have corresponding backfills.
 * Finds gaps with in_progress_intervals that were updated more than 12 hours ago,
 * checks if backfills exist for them, and resets the in_progress_intervals if no backfills exist.
 */
export declare const cleanupStuckInProgressGaps: ({ rulesClientContext, eventLogClient, eventLogger, logger, startDate, }: CleanupStuckInProgressGapsParams) => Promise<void>;
export {};
