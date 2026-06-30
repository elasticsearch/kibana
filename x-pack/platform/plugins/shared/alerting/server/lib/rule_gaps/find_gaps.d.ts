import type { IEventLogClient } from '@kbn/event-log-plugin/server';
import type { Logger } from '@kbn/core/server';
import type { SortResults } from '@elastic/elasticsearch/lib/api/types';
import type { FindGapsParams, FindGapsSearchAfterParams } from '../../application/gaps/types';
import type { Gap } from './gap';
export declare const findGaps: ({ eventLogClient, logger, params, }: {
    eventLogClient: IEventLogClient;
    logger: Logger;
    params: FindGapsParams;
}) => Promise<{
    total: number;
    data: Gap[];
    page: number;
    perPage: number;
}>;
/**
 * This function is used to find gaps using search after.
 * It's used when to be able process more than 10,000 gaps with stable sorting.
 */
export declare const findGapsSearchAfter: ({ eventLogClient, logger, params, }: {
    eventLogClient: IEventLogClient;
    logger: Logger;
    params: FindGapsSearchAfterParams;
}) => Promise<{
    total: number;
    data: Gap[];
    searchAfter?: SortResults[];
    pitId?: string;
}>;
