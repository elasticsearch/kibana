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
  ALERT_RULE_TAGS,
  ALERT_SEVERITY_IMPROVING,
  ALERT_START,
  ALERT_STATE_NAMESPACE,
  ALERT_STATUS,
  ALERT_STATUS_ACTIVE,
  ALERT_TIME_RANGE,
  ALERT_UUID,
  ALERT_WORKFLOW_STATUS,
  EVENT_ACTION,
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
import {
  removeUnflattenedFieldsFromAlert,
  replaceEmptyAlertFields,
  replaceRefreshableAlertFields,
} from '../format_alert';
import { filterAlertState } from '../filter_alert_state';
import { getAlertMutedStatus } from '../get_alert_muted_status';
import { getAlertSnoozedStatus } from '../get_alert_snoozed_status';

interface BuildGraduatedAlertOpts<
  AlertData extends RuleAlertData,
  LegacyState extends AlertInstanceState,
  LegacyContext extends AlertInstanceContext,
  ActionGroupIds extends string,
  RecoveryActionGroupId extends string
> {
  alert: Alert & AlertData;
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
 * Builds an alert document for an alert that is graduating from the
 * `delayed` state to `active` for the first time.
 *
 * The predecessor doc (`alert`) is the previously-indexed delayed AAD doc,
 * which already carries the rule type fields reported during the delayed
 * runs. Those fields are preserved via deepmerge so the resulting active
 * doc is complete even if the executor does not report a fresh payload on
 * the run that triggers graduation (e.g. flap-hold reactivation).
 *
 * Field-level differences vs. `buildOngoingAlert`:
 * - `EVENT_ACTION` is `'open'` (the alert is becoming user-visible for the
 *   first time), not `'active'`.
 * - `ALERT_STATUS` is set explicitly to `ALERT_STATUS_ACTIVE`. The
 *   predecessor's status is `'delayed'`, so we must override it; the
 *   ongoing builder relies on the predecessor already being `'active'`.
 * - `ALERT_SEVERITY_IMPROVING` is set to `false`, mirroring `buildNewAlert`.
 *   There is no prior active state to compute an "improving" comparison
 *   against.
 * - `ALERT_PREVIOUS_ACTION_GROUP` is intentionally omitted. There was no
 *   previous *active* action group on this alert.
 */

export const buildGraduatedAlert = <
  AlertData extends RuleAlertData,
  LegacyState extends AlertInstanceState,
  LegacyContext extends AlertInstanceContext,
  ActionGroupIds extends string,
  RecoveryActionGroupId extends string
>({
  alert,
  legacyAlert,
  rule,
  ruleData,
  payload,
  runTimestamp,
  timestamp,
  kibanaVersion,
  dangerouslyCreateAlertsInAllSpaces,
}: BuildGraduatedAlertOpts<
  AlertData,
  LegacyState,
  LegacyContext,
  ActionGroupIds,
  RecoveryActionGroupId
>): Alert & AlertData => {
  // Sets array fields to empty arrays if previously reported on the predecessor
  // delayed doc but not present in the current payload.
  replaceEmptyAlertFields(alert, payload);
  // Rule type fields the executor reported on the graduation run. Empty when
  // the run that triggered graduation did not report (e.g. flap-hold
  // reactivation), in which case the predecessor's payload survives the merge.
  const cleanedPayload = stripFrameworkFields(payload);
  // Framework fields on the predecessor doc that need to be re-flattened so
  // they get refreshed cleanly during the merge.
  const refreshableAlertFields = replaceRefreshableAlertFields(alert);

  const alertState = legacyAlert.getState();
  const filteredAlertState = filterAlertState(alertState);
  const hasAlertState = Object.keys(filteredAlertState).length > 0;
  const alertInstanceId = legacyAlert.getId();
  const isMuted = getAlertMutedStatus(alertInstanceId, ruleData);
  const isSnoozed = getAlertSnoozedStatus(alertInstanceId, ruleData);

  // Framework-owned fields applied for this run. These always win against
  // anything the predecessor or the executor payload could carry.
  const alertUpdates = {
    ...rule,
    [TIMESTAMP]: timestamp,
    [EVENT_ACTION]: 'open',
    [EVENT_KIND]: 'signal',
    [ALERT_RULE_EXECUTION_TIMESTAMP]: runTimestamp ?? timestamp,
    [ALERT_STATUS]: ALERT_STATUS_ACTIVE,
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
    [ALERT_SEVERITY_IMPROVING]: false,
    [ALERT_UUID]: legacyAlert.getUuid(),
    [ALERT_WORKFLOW_STATUS]: get(alert, ALERT_WORKFLOW_STATUS, 'open'),
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
      new Set([
        ...((cleanedPayload?.tags as string[]) ?? []),
        ...(alert.tags ?? []),
        ...(rule[ALERT_RULE_TAGS] ?? []),
      ])
    ),
    ...(hasAlertState ? { [ALERT_STATE_NAMESPACE]: filteredAlertState } : {}),
  };

  // Strip nested copies of any field that will be (re)written below, so the
  // merge does not leave duplicate values across the unflattened tree.
  const expandedAlert = removeUnflattenedFieldsFromAlert(alert, {
    ...cleanedPayload,
    ...alertUpdates,
    ...refreshableAlertFields,
  });

  // Per-field precedence (later sources win):
  //   1. expandedAlert         - rule type fields preserved from the trackedDelayed
  //                              predecessor doc (the safety net for flap-hold
  //                              reactivations where the executor did not report).
  //   2. refreshableAlertFields - re-flattened framework fields from the predecessor.
  //   3. cleanedPayload         - rule type fields the executor reported on this
  //                              run; overrides the predecessor field-by-field.
  //   4. alertUpdates           - framework fields for the graduation run
  //                              (status, event.action, flapping, timestamps, ...).
  return deepmerge.all([expandedAlert, refreshableAlertFields, cleanedPayload, alertUpdates], {
    arrayMerge: (_, sourceArray) => sourceArray,
  }) as Alert & AlertData;
};
