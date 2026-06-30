import type { HttpSetup } from '@kbn/core/public';
import type { KueryNode } from '@kbn/es-query';
import type { SnoozeSchedule, BulkEditResponse } from '../../../types';
export declare function snoozeRule({ id, snoozeSchedule, http, }: {
    id: string;
    snoozeSchedule: SnoozeSchedule;
    http: HttpSetup;
}): Promise<void>;
export interface BulkSnoozeRulesProps {
    ids?: string[];
    filter?: KueryNode | null | undefined;
    snoozeSchedule: SnoozeSchedule;
}
export declare function bulkSnoozeRules({ ids, filter, snoozeSchedule, http, }: BulkSnoozeRulesProps & {
    http: HttpSetup;
}): Promise<BulkEditResponse>;
