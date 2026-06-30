import type { Logger } from '@kbn/core/server';
import type { IEventLogClient } from '@kbn/event-log-plugin/server';
import type { AlertingEventLogger } from '../../alerting_event_logger/alerting_event_logger';
import type { Gap } from '../gap';
interface SoftDeleteGapsBatchParams {
    gaps: Gap[];
    alertingEventLogger: AlertingEventLogger;
    logger: Logger;
    eventLogClient: IEventLogClient;
}
export declare const softDeleteGapsBatch: ({ gaps, alertingEventLogger, logger, eventLogClient, }: SoftDeleteGapsBatchParams) => Promise<boolean>;
export {};
