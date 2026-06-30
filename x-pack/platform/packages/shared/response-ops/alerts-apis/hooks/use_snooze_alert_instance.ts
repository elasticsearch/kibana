/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useMutation } from '@kbn/react-query';
import { i18n } from '@kbn/i18n';
import { AlertsQueryContext } from '@kbn/alerts-ui-shared/src/common/contexts/alerts_query_context';
import type { HttpStart } from '@kbn/core-http-browser';
import type { NotificationsStart } from '@kbn/core-notifications-browser';
import { mutationKeys } from '../mutation_keys';
import type { ServerError, SnoozeCondition } from '../types';
import { snoozeAlertInstance } from '../apis/snooze_alert_instance';

const ERROR_TITLE = i18n.translate('alertsApis.snoozeAlert.error', {
  defaultMessage: 'Error snoozing alert',
});

export interface UseSnoozeAlertInstanceParams {
  http: HttpStart;
  notifications: NotificationsStart;
}

export interface SnoozeAlertInstanceMutationParams {
  ruleId: string;
  alertInstanceId: string;
  expiresAt?: string;
  conditions?: SnoozeCondition[];
  conditionOperator?: 'any' | 'all';
}

export const getKey = mutationKeys.snoozeAlertInstance;

export const useSnoozeAlertInstance = ({
  http,
  notifications: { toasts },
}: UseSnoozeAlertInstanceParams) => {
  return useMutation(
    ({
      ruleId,
      alertInstanceId,
      expiresAt,
      conditions,
      conditionOperator,
    }: SnoozeAlertInstanceMutationParams) =>
      snoozeAlertInstance({
        http,
        id: ruleId,
        instanceId: alertInstanceId,
        expiresAt,
        conditions,
        conditionOperator,
      }),
    {
      mutationKey: getKey(),
      context: AlertsQueryContext,
      onSuccess() {
        toasts.addSuccess(
          i18n.translate('xpack.responseOpsAlertsApis.alertsTable.alertSnoozed', {
            defaultMessage: 'Alert snoozed',
          })
        );
      },
      onError: (error: ServerError) => {
        if (error.name !== 'AbortError') {
          toasts.addError(
            error.body && error.body.message ? new Error(error.body.message) : error,
            {
              title: ERROR_TITLE,
            }
          );
        }
      },
    }
  );
};
