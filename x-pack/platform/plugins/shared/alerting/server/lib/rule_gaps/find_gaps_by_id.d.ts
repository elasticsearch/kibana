import type { IEventLogClient } from '@kbn/event-log-plugin/server';
import type { Logger } from '@kbn/core/server';
import type { FindGapsByIdParams } from '../../application/gaps/types';
import type { Gap } from './gap';
export declare const findGapsById: ({ eventLogClient, logger, params, }: {
    eventLogClient: IEventLogClient;
    logger: Logger;
    params: FindGapsByIdParams;
}) => Promise<Gap[]>;
