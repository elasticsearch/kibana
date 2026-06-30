import type { QueryOptionsOverrides } from '@kbn/alerts-ui-shared/src/common/types/tanstack_query_utility_types';
import type { HttpStart } from '@kbn/core-http-browser';
import type { NotificationsStart } from '@kbn/core-notifications-browser';
import type { MutedAlerts, ServerError } from '../types';
import type { GetMutedAlertsInstancesByRuleParams } from '../apis/get_muted_alerts_instances_by_rule';
declare const getMutedAlerts: ({ http, signal, ruleIds }: GetMutedAlertsInstancesByRuleParams) => Promise<MutedAlerts>;
export interface UseGetMutedAlertsQueryParams {
    ruleIds: string[];
    http: HttpStart;
    notifications: NotificationsStart;
}
export declare const getKey: (ruleIds: string[]) => readonly [string, "mutedInstanceIdsForRuleIds", string[]];
export declare const useGetMutedAlertsQuery: ({ ruleIds, http, notifications: { toasts } }: UseGetMutedAlertsQueryParams, { enabled }?: QueryOptionsOverrides<typeof getMutedAlerts>) => import("@kbn/react-query").UseQueryResult<MutedAlerts, ServerError>;
export {};
