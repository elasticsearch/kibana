import type { QueryOptionsOverrides } from '@kbn/alerts-ui-shared/src/common/types/tanstack_query_utility_types';
import type { ServerError } from '@kbn/response-ops-alerts-apis/types';
import type { HttpStart } from '@kbn/core-http-browser';
import type { NotificationsStart } from '@kbn/core-notifications-browser';
import type { Case } from '../apis/bulk_get_cases';
import { bulkGetCases } from '../apis/bulk_get_cases';
export interface UseBulkGetCasesQueryParams {
    caseIds: string[];
    http: HttpStart;
    notifications: NotificationsStart;
}
export declare const useBulkGetCasesQuery: ({ caseIds, http, notifications: { toasts } }: UseBulkGetCasesQueryParams, options?: Pick<QueryOptionsOverrides<typeof bulkGetCases>, "enabled">) => import("@kbn/react-query").UseQueryResult<Map<string, Case>, ServerError>;
