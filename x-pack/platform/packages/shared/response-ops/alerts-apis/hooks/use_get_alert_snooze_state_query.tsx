/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';
import { useQuery } from '@kbn/react-query';
import { AlertsQueryContext } from '@kbn/alerts-ui-shared/src/common/contexts/alerts_query_context';
import type { QueryOptionsOverrides } from '@kbn/alerts-ui-shared/src/common/types/tanstack_query_utility_types';
import type { HttpStart } from '@kbn/core-http-browser';
import type { NotificationsStart } from '@kbn/core-notifications-browser';
import { queryKeys } from '../query_keys';
import type { MutedAlerts, SnoozedAlerts, ServerError } from '../types';
import type { GetAlertSnoozeStateByRuleParams } from '../apis/get_muted_alerts_instances_by_rule';
import { getAlertSnoozeStateByRule } from '../apis/get_muted_alerts_instances_by_rule';

const ERROR_TITLE = i18n.translate('xpack.responseOpsAlertsApis.alertSnoozeState.api.get', {
  defaultMessage: 'Error fetching alert snooze state',
});

export interface AlertSnoozeState {
  mutedAlerts: MutedAlerts;
  snoozedAlerts: SnoozedAlerts;
}

const getAlertSnoozeState = ({
  http,
  signal,
  ruleIds,
}: GetAlertSnoozeStateByRuleParams): Promise<AlertSnoozeState> =>
  getAlertSnoozeStateByRule({ http, ruleIds, signal }).then(({ data: rules }) => {
    const mutedAlerts: MutedAlerts = {};
    const snoozedAlerts: SnoozedAlerts = {};
    for (const rule of rules ?? []) {
      mutedAlerts[rule.id] = rule.mutedAlertIds;
      snoozedAlerts[rule.id] = rule.snoozedInstances;
    }
    return { mutedAlerts, snoozedAlerts };
  });

export interface UseGetAlertSnoozeStateQueryParams {
  ruleIds: string[];
  http: HttpStart;
  notifications: NotificationsStart;
}

export const getKey = queryKeys.getAlertSnoozeState;

export const useGetAlertSnoozeStateQuery = (
  { ruleIds, http, notifications: { toasts } }: UseGetAlertSnoozeStateQueryParams,
  { enabled }: QueryOptionsOverrides<typeof getAlertSnoozeState> = {}
) => {
  return useQuery({
    context: AlertsQueryContext,
    queryKey: getKey(ruleIds),
    queryFn: ({ signal }) => getAlertSnoozeState({ http, signal, ruleIds }),
    onError: (error: ServerError) => {
      if (error.name !== 'AbortError') {
        toasts.addError(error.body?.message ? new Error(error.body.message) : error, {
          title: ERROR_TITLE,
        });
      }
    },
    enabled: ruleIds.length > 0 && enabled !== false,
    refetchOnWindowFocus: false,
  });
};
