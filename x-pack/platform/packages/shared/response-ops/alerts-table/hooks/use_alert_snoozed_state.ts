/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useMemo } from 'react';
import { ALERT_INSTANCE_ID, ALERT_RULE_UUID } from '@kbn/rule-data-utils';
import type { Alert } from '@kbn/alerting-types';
import type { SnoozedInstance } from '@kbn/response-ops-alerts-apis/types';
import { useAlertsTableContext } from '../contexts/alerts_table_context';

export const useAlertSnoozedState = (alert?: Alert) => {
  const { snoozedAlerts } = useAlertsTableContext();
  const alertInstanceId = alert && (alert[ALERT_INSTANCE_ID]?.[0] as string);
  const ruleId = alert && (alert[ALERT_RULE_UUID]?.[0] as string);

  return useMemo(() => {
    const ruleSnoozedInstances: SnoozedInstance[] = ruleId ? snoozedAlerts?.[ruleId] ?? [] : [];
    const snoozedInstance = alertInstanceId
      ? ruleSnoozedInstances.find((instance) => instance.instanceId === alertInstanceId)
      : undefined;

    return {
      isSnoozed: snoozedInstance !== undefined,
      expiresAt: snoozedInstance?.expiresAt,
      snoozedInstance,
      ruleId,
      alertInstanceId,
    };
  }, [alertInstanceId, snoozedAlerts, ruleId]);
};
