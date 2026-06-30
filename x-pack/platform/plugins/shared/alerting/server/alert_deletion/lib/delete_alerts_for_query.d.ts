import type { QueryDslQueryContainer } from '@elastic/elasticsearch/lib/api/types';
import type { AlertDeletionContext } from '../alert_deletion_client';
export declare const deleteAlertsForQuery: (context: AlertDeletionContext, indices: string[], query: QueryDslQueryContainer, abortController: AbortController) => Promise<{
    numAlertsDeleted: number;
    taskIds: Set<string>;
    alertUuidsToClear: string[];
    errors: string[];
}>;
