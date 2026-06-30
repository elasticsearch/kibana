import type { Logger, ISavedObjectsRepository } from '@kbn/core/server';
import type { IEventLogClient, IEventLogger } from '@kbn/event-log-plugin/server';
import type { ActionsClient } from '@kbn/actions-plugin/server';
import type { BackfillInitiator } from '../../../../common/constants';
import type { BackfillClient } from '../../../backfill_client/backfill_client';
import type { Gap } from '../gap';
import type { BackfillSchedule } from '../../../application/backfill/result/types';
interface UpdateGapsParams {
    ruleId: string;
    backfillSchedule?: BackfillSchedule[];
    start: Date;
    end: Date;
    eventLogger?: IEventLogger;
    eventLogClient: IEventLogClient;
    logger: Logger;
    savedObjectsRepository: ISavedObjectsRepository;
    shouldRefetchAllBackfills?: boolean;
    backfillClient: BackfillClient;
    actionsClient: ActionsClient;
    gaps?: Gap[];
    initiator: BackfillInitiator | undefined;
}
/**
 * Update gaps for a given rule
 * Prepare gaps for update
 * Update them in bulk
 * If there are conflicts, retry the failed gaps
 * If gaps are passed in, it skips fetching and process them instead
 */
export declare const updateGaps: (params: UpdateGapsParams) => Promise<void>;
export {};
