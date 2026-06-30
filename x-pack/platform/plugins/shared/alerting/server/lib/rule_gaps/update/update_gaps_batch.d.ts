import type { Logger, ISavedObjectsRepository } from '@kbn/core/server';
import type { IEventLogClient } from '@kbn/event-log-plugin/server';
import type { ActionsClient } from '@kbn/actions-plugin/server';
import type { BackfillClient } from '../../../backfill_client/backfill_client';
import type { AlertingEventLogger } from '../../alerting_event_logger/alerting_event_logger';
import type { Gap } from '../gap';
import type { BackfillSchedule } from '../../../application/backfill/result/types';
import type { BackfillInitiator } from '../../../../common/constants';
interface UpdateGapsBatchParams {
    gaps: Gap[];
    backfillSchedule?: BackfillSchedule[];
    savedObjectsRepository: ISavedObjectsRepository;
    shouldRefetchAllBackfills?: boolean;
    backfillClient: BackfillClient;
    actionsClient: ActionsClient;
    alertingEventLogger: AlertingEventLogger;
    logger: Logger;
    ruleId: string;
    eventLogClient: IEventLogClient;
    initiator: BackfillInitiator | undefined;
}
export declare const updateGapsBatch: ({ gaps, backfillSchedule, savedObjectsRepository, shouldRefetchAllBackfills, backfillClient, actionsClient, alertingEventLogger, logger, ruleId, eventLogClient, initiator, }: UpdateGapsBatchParams) => Promise<boolean>;
export {};
