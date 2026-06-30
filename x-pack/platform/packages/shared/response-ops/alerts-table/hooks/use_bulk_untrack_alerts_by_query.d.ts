import type { QueryDslQueryContainer } from '@elastic/elasticsearch/lib/api/types';
import type { HttpStart } from '@kbn/core-http-browser';
import type { NotificationsStart } from '@kbn/core-notifications-browser';
export interface UseBulkUntrackAlertsByQueryParams {
    http: HttpStart;
    notifications: NotificationsStart;
}
export declare const useBulkUntrackAlertsByQuery: ({ http, notifications: { toasts }, }: UseBulkUntrackAlertsByQueryParams) => import("@kbn/react-query").UseMutationResult<string, string, {
    query: Partial<Pick<NonNullable<QueryDslQueryContainer>, "bool" | "ids">>;
    ruleTypeIds: string[];
}, unknown>;
