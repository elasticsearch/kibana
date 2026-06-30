/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import deepmerge from 'deepmerge';
import { get } from 'lodash';
import type { Alert } from '@kbn/alerts-as-data-utils';
import {
  ALERT_ACTION_GROUP,
  ALERT_CONSECUTIVE_MATCHES,
  ALERT_DURATION,
  ALERT_FLAPPING,
  ALERT_FLAPPING_HISTORY,
  ALERT_INSTANCE_ID,
  ALERT_MAINTENANCE_WINDOW_IDS,
  ALERT_MAINTENANCE_WINDOW_NAMES,
  ALERT_MUTED,
  ALERT_SNOOZED,
  ALERT_PENDING_RECOVERED_COUNT,
  ALERT_RULE_EXECUTION_TIMESTAMP,
  ALERT_RULE_EXECUTION_UUID,
  ALERT_RULE_TAGS,
  ALERT_RULE_UUID,
  ALERT_START,
  ALERT_STATE_NAMESPACE,
  ALERT_STATUS,
  ALERT_STATUS_DELAYED,
  ALERT_TIME_RANGE,
  ALERT_UUID,
  ALERT_WORKFLOW_STATUS,
  EVENT_KIND,
  SPACE_IDS,
  TAGS,
  TIMESTAMP,
  VERSION,
} from '@kbn/rule-data-utils';
import type { DeepPartial } from '@kbn/utility-types';
import type { Alert as LegacyAlert } from '../../../alert/alert';
import type { AlertInstanceContext, AlertInstanceState, RuleAlertData } from '../../../types';
import type { AlertRule, AlertRuleData } from '../../types';
import { stripFrameworkFields } from '../strip_framework_fields';
import { nanosToMicros } from '../nanos_to_micros';
import { filterAlertState } from '../filter_alert_state';
import { getAlertMutedStatus } from '../get_alert_muted_status';
import { getAlertSnoozedStatus } from '../get_alert_snoozed_status';

interface BuildDelayedAlertOpts<
  AlertData extends RuleAlertData,
  LegacyState extends AlertInstanceState,
  LegacyContext extends AlertInstanceContext,
  ActionGroupIds extends string,
  RecoveryActionGroupId extends string
> {
  legacyAlert: LegacyAlert<LegacyState, LegacyContext, ActionGroupIds | RecoveryActionGroupId>;
  rule: AlertRule;
  ruleData?: AlertRuleData;
  payload?: DeepPartial<AlertData>;
  runTimestamp?: string;
  timestamp: string;
  kibanaVersion: string;
  dangerouslyCreateAlertsInAllSpaces?: boolean;
}

/**
 * Builds an alert document for an alert that is in the `delayed` state
 * (i.e. an alert that the executor has reported but that has not yet
 * crossed `alertDelay`).
 *
 * The document includes the rule type payload from this run so that when
 * the alert later transitions to `active` (either by graduating past
 * `alertDelay` or via flap-hold reactivation), the predecessor doc carries
 * enough information for the active builder to produce a complete document
 * even when the executor does not report a payload on the graduation run.
 */

export const buildDelayedAlert = <
  AlertData extends RuleAlertData,
  LegacyState extends AlertInstanceState,
  LegacyContext extends AlertInstanceContext,
  ActionGroupIds extends string,
  RecoveryActionGroupId extends string
>({
  legacyAlert,
  rule,
  ruleData,
  payload,
  runTimestamp,
  timestamp,
  kibanaVersion,
  dangerouslyCreateAlertsInAllSpaces,
}: BuildDelayedAlertOpts<
  AlertData,
  LegacyState,
  LegacyContext,
  ActionGroupIds,
  RecoveryActionGroupId
>): Alert & AlertData => {
  const cleanedPayload = stripFrameworkFields(payload);

  const alertState = legacyAlert.getState();
  const filteredAlertState = filterAlertState(alertState);
  const hasAlertState = Object.keys(filteredAlertState).length > 0;
  const alertInstanceId = legacyAlert.getId();
  const isMuted = getAlertMutedStatus(alertInstanceId, ruleData);
  const isSnoozed = getAlertSnoozedStatus(alertInstanceId, ruleData);

  return deepmerge.all(
    [
      cleanedPayload,
      rule,
      {
        [TIMESTAMP]: timestamp,
        [EVENT_KIND]: 'signal',
        [ALERT_RULE_EXECUTION_TIMESTAMP]: runTimestamp ?? timestamp,
        [ALERT_RULE_UUID]: get(rule, ALERT_RULE_UUID),
        [ALERT_RULE_EXECUTION_UUID]: get(rule, ALERT_RULE_EXECUTION_UUID),
        [ALERT_ACTION_GROUP]: legacyAlert.getScheduledActionOptions()?.actionGroup,
        [ALERT_FLAPPING]: legacyAlert.getFlapping(),
        [ALERT_FLAPPING_HISTORY]: legacyAlert.getFlappingHistory(),
        [ALERT_INSTANCE_ID]: alertInstanceId,
        [ALERT_MAINTENANCE_WINDOW_IDS]: legacyAlert.getMaintenanceWindowIds(),
        [ALERT_MAINTENANCE_WINDOW_NAMES]: legacyAlert.getMaintenanceWindowNames(),
        [ALERT_CONSECUTIVE_MATCHES]: legacyAlert.getActiveCount(),
        [ALERT_PENDING_RECOVERED_COUNT]: legacyAlert.getPendingRecoveredCount(),
        [ALERT_MUTED]: isMuted,
        [ALERT_SNOOZED]: isSnoozed,
        [ALERT_STATUS]: ALERT_STATUS_DELAYED,
        [ALERT_UUID]: legacyAlert.getUuid(),
        [ALERT_WORKFLOW_STATUS]: get(cleanedPayload, ALERT_WORKFLOW_STATUS, 'open'),
        ...(alertState.duration ? { [ALERT_DURATION]: nanosToMicros(alertState.duration) } : {}),
        ...(alertState.start
          ? {
              [ALERT_START]: alertState.start,
              [ALERT_TIME_RANGE]: { gte: alertState.start },
            }
          : {}),
        [SPACE_IDS]: dangerouslyCreateAlertsInAllSpaces === true ? ['*'] : rule[SPACE_IDS],
        [VERSION]: kibanaVersion,
        [TAGS]: Array.from(
          new Set([...((cleanedPayload?.tags as string[]) ?? []), ...(rule[ALERT_RULE_TAGS] ?? [])])
        ),
        ...(hasAlertState ? { [ALERT_STATE_NAMESPACE]: filteredAlertState } : {}),
      },
    ],
    { arrayMerge: (_, sourceArray) => sourceArray }
  ) as Alert & AlertData;
};
