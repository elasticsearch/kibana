/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { ALERT_SEVERITY } from '@kbn/rule-data-utils';
import type { SnoozeAlertInstanceBody } from '../../application/rule/methods/snooze_alert_instance/types';
import type { RawRuleSnoozedInstance } from '../../saved_objects/schemas/raw_rule';

export const getPerAlertSnoozeSnapshotFields = (body: SnoozeAlertInstanceBody): string[] => {
  const fields = new Set<string>();

  body.conditions?.forEach((condition) => {
    if (condition.type === 'field_change') {
      fields.add(condition.field);
    }

    if (condition.type === 'severity_change') {
      fields.add(ALERT_SEVERITY);
    }
  });

  return [...fields];
};

export const buildPerAlertSnoozeEntry = ({
  alertInstanceId,
  body,
  snoozedAt,
  snoozedBy,
  snoozeSnapshot,
}: {
  alertInstanceId: string;
  body: SnoozeAlertInstanceBody;
  snoozedAt: string;
  snoozedBy: string | null;
  snoozeSnapshot?: Record<string, unknown>;
}): RawRuleSnoozedInstance => ({
  instanceId: alertInstanceId,
  expiresAt: body.expiresAt,
  conditions: body.conditions,
  conditionOperator: body.conditionOperator,
  snoozeSnapshot:
    snoozeSnapshot && Object.keys(snoozeSnapshot).length > 0 ? snoozeSnapshot : undefined,
  snoozedAt,
  snoozedBy: snoozedBy ?? '',
});

export const upsertPerAlertSnoozeEntry = ({
  snoozedInstances,
  snoozedInstance,
}: {
  snoozedInstances?: RawRuleSnoozedInstance[];
  snoozedInstance: RawRuleSnoozedInstance;
}): RawRuleSnoozedInstance[] => [
  ...(snoozedInstances ?? []).filter(({ instanceId }) => instanceId !== snoozedInstance.instanceId),
  snoozedInstance,
];

export const removePerAlertSnoozeEntry = ({
  snoozedInstances,
  alertInstanceId,
}: {
  snoozedInstances?: RawRuleSnoozedInstance[];
  alertInstanceId: string;
}): RawRuleSnoozedInstance[] =>
  (snoozedInstances ?? []).filter(({ instanceId }) => instanceId !== alertInstanceId);
