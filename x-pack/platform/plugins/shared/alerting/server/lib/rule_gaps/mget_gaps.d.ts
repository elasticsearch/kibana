import type { IEventLogClient } from '@kbn/event-log-plugin/server';
import type { Logger } from '@kbn/core/server';
import type { Gap } from './gap';
export declare const mgetGaps: ({ eventLogClient, logger, params, }: {
    eventLogClient: IEventLogClient;
    logger: Logger;
    params: {
        docs: Array<{
            _id: string;
            _index: string;
        }>;
    };
}) => Promise<Gap[]>;
