import type { InternalFields } from '@kbn/event-log-plugin/server/es/cluster_client_adapter';
import type { BackfillSchedule } from '../../../application/backfill/result/types';
import type { Gap } from '../gap';
import type { GapBase } from '../../../application/gaps/types';
export interface ScheduledItem {
    from: Date;
    to: Date;
    status: BackfillSchedule['status'];
}
export declare const toScheduledItem: (backfillSchedule: BackfillSchedule) => ScheduledItem;
export declare const findOverlappingIntervals: (gaps: Gap[], scheduledItems: ScheduledItem[]) => {
    gap: Gap;
    scheduled: ScheduledItem[];
}[];
/**
 * Converts an array of Gap objects to the format expected by updateGapsInEventLog.
 * Filters out gaps without internalFields.
 */
export declare const prepareGapsForUpdate: (gaps: Gap[]) => Array<{
    gap: GapBase;
    internalFields: InternalFields;
}>;
