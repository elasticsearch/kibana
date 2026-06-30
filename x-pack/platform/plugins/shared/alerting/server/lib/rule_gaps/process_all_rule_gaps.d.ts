import type { Logger } from '@kbn/core/server';
import type { IEventLogClient } from '@kbn/event-log-plugin/server';
import type { Gap } from './gap';
import type { GapStatus, GapReasonType } from '../../../common/constants';
interface ProcessAllRuleGapsParams<T> {
    ruleIds: string[];
    start?: string;
    end?: string;
    statuses?: GapStatus[];
    excludedReasons?: GapReasonType[];
    options?: {
        maxProcessedGapsPerRule?: number;
    };
    eventLogClient: IEventLogClient;
    logger: Logger;
    processGapsBatch: (gaps: Gap[], processingLimitsByRuleId: Record<string, number>) => Promise<Record<string, number>>;
}
export declare const PROCESS_GAPS_DEFAULT_PAGE_SIZE = 500;
/**
 * Fetches all gaps using search_after pagination to process more than 10,000 gaps with stable sorting
 */
export declare const processAllRuleGaps: <T>({ ruleIds, start, end, statuses, excludedReasons, options, logger, eventLogClient, processGapsBatch, }: ProcessAllRuleGapsParams<T>) => Promise<void>;
export {};
