import type { HttpSetup } from '@kbn/core/public';
import type { KueryNode } from '@kbn/es-query';
import type { BulkEditResponse } from '../../../types';
export declare function unsnoozeRule({ id, http, scheduleIds, }: {
    id: string;
    http: HttpSetup;
    scheduleIds?: string[];
}): Promise<void>;
export interface BulkUnsnoozeRulesProps {
    ids?: string[];
    filter?: KueryNode | null | undefined;
    scheduleIds?: string[];
}
export declare function bulkUnsnoozeRules({ ids, filter, scheduleIds, http, }: BulkUnsnoozeRulesProps & {
    http: HttpSetup;
}): Promise<BulkEditResponse>;
