import type { Logger, ISavedObjectsRepository } from '@kbn/core/server';
import type { ActionsClient } from '@kbn/actions-plugin/server';
import type { BackfillClient } from '../../../backfill_client/backfill_client';
import type { Gap } from '../gap';
import type { BackfillInitiator } from '../../../../common/constants';
import type { ScheduledItem } from './utils';
interface ApplyScheduledBackfillsToGapParams {
    gap: Gap;
    scheduledItems: ScheduledItem[];
    savedObjectsRepository: ISavedObjectsRepository;
    shouldRefetchAllBackfills?: boolean;
    logger: Logger;
    backfillClient: BackfillClient;
    actionsClient: ActionsClient;
    ruleId: string;
    initiator: BackfillInitiator | undefined;
}
export declare const applyScheduledBackfillsToGap: ({ gap, scheduledItems, savedObjectsRepository, shouldRefetchAllBackfills, logger, backfillClient, actionsClient, ruleId, initiator, }: ApplyScheduledBackfillsToGapParams) => Promise<void>;
export {};
