import type { ISavedObjectsRepository, Logger } from '@kbn/core/server';
import type { ActionsClient } from '@kbn/actions-plugin/server';
import type { Gap } from '../gap';
import type { BackfillClient } from '../../../backfill_client/backfill_client';
/**
 * Find all overlapping backfill tasks and update the gap status accordingly
 */
export declare const calculateGapStateFromAllBackfills: ({ gap, savedObjectsRepository, ruleId, backfillClient, actionsClient, logger, }: {
    gap: Gap;
    savedObjectsRepository: ISavedObjectsRepository;
    ruleId: string;
    backfillClient: BackfillClient;
    actionsClient: ActionsClient;
    logger: Logger;
}) => Promise<Gap>;
