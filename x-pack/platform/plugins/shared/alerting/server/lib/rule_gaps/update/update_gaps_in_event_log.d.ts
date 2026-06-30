import type { Logger } from '@kbn/core/server';
import type { IEventLogClient } from '@kbn/event-log-plugin/server';
import type { InternalFields } from '@kbn/event-log-plugin/server/es/cluster_client_adapter';
import type { AlertingEventLogger } from '../../alerting_event_logger/alerting_event_logger';
import type { Gap } from '../gap';
import type { GapBase } from '../../../application/gaps/types';
export declare const updateGapsInEventLog: ({ gaps, prepareGaps, alertingEventLogger, logger, eventLogClient, }: {
    gaps: Gap[];
    prepareGaps: (gaps: Gap[]) => Promise<Array<{
        gap: GapBase;
        internalFields: InternalFields;
    }>>;
    alertingEventLogger: AlertingEventLogger;
    logger: Logger;
    eventLogClient: IEventLogClient;
}) => Promise<boolean>;
