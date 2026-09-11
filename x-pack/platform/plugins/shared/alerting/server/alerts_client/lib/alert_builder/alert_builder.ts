/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import type { Logger } from '@kbn/core/server';
import type { AlertInstanceContext, AlertInstanceState } from '@kbn/alerting-state-types';
import { flatMap, get, keys, values } from 'lodash';
import type { Alert } from '@kbn/alerts-as-data-utils';
import {
  ALERT_ACTION_GROUP,
  ALERT_STATUS,
  ALERT_STATUS_ACTIVE,
  ALERT_STATUS_DELAYED,
  ALERT_STATUS_RECOVERED,
  ALERT_UUID,
} from '@kbn/rule-data-utils';
import type { DeepPartial } from '@kbn/utility-types';
import { isValidAlertIndexName } from '../../../alerts_service';
import { isAlertImproving, shouldCreateAlertsInAllSpaces } from '..';

import type { RuleAlertData } from '../../../types';
import type { AlertRule, AlertRuleData } from '../../types';
import type { UntypedNormalizedRuleType } from '../../../rule_type_registry';
import type { IIndexPatternString } from '../../../alerts_service/resource_installer_utils';
import type { TrackedAADAlerts } from '../../types';
import { buildOngoingAlert } from './build_ongoing_alert';
import { buildNewAlert } from './build_new_alert';
import { buildGraduatedAlert } from './build_graduated_alert';
import { buildRecoveredAlert } from './build_recovered_alert';
import { buildUpdatedRecoveredAlert } from './build_updated_recovered_alert';
import { buildDelayedAlert } from './build_delayed_alert';
import type { LegacyAlertsClient } from '../../legacy_alerts_client';

interface AlertBuilderOpts<
  State extends AlertInstanceState,
  Context extends AlertInstanceContext,
  ActionGroupIds extends string,
  RecoveryActionGroupId extends string,
  AlertData extends RuleAlertData
> {
  rule: AlertRule;
  reportedAlerts: Record<string, DeepPartial<AlertData>>;
  legacyAlertsClient: LegacyAlertsClient<State, Context, ActionGroupIds, RecoveryActionGroupId>;
  currentTime: string;
  logger: Logger;
  trackedAlerts: TrackedAADAlerts<AlertData>;
  ruleType: UntypedNormalizedRuleType;
  alertRuleData: AlertRuleData;
  runTimestampString?: string;
  kibanaVersion: string;
  indexTemplateAndPattern: IIndexPatternString;
  ruleInfoMessage: string;
  logTags: { tags: string[] };
  isUsingDataStreams: boolean;
}

export class AlertBuilder<
  State extends AlertInstanceState,
  Context extends AlertInstanceContext,
  ActionGroupIds extends string,
  RecoveryActionGroupId extends string,
  AlertData extends RuleAlertData
> {
  private readonly rule: AlertRule;
  private readonly alertRuleData: AlertRuleData;
  private readonly currentTime: string;
  private readonly logger: Logger;
  private readonly trackedAlerts: TrackedAADAlerts<AlertData>;
  private readonly ruleType: UntypedNormalizedRuleType;
  private readonly runTimestampString?: string;
  private readonly kibanaVersion: string;
  private readonly createAlertsInAllSpaces: boolean;
  private readonly indexTemplateAndPattern: IIndexPatternString;
  private readonly ruleInfoMessage: string;
  private readonly logTags: { tags: string[] };
  private readonly isUsingDataStreams: boolean;
  private readonly reportedAlerts: Record<string, DeepPartial<AlertData>> = {};
  private legacyAlertsClient: LegacyAlertsClient<
    State,
    Context,
    ActionGroupIds,
    RecoveryActionGroupId
  >;

  constructor({
    rule,
    legacyAlertsClient,
    currentTime,
    logger,
    trackedAlerts,
    ruleType,
    alertRuleData,
    runTimestampString,
    reportedAlerts,
    kibanaVersion,
    indexTemplateAndPattern,
    ruleInfoMessage,
    logTags,
    isUsingDataStreams,
  }: AlertBuilderOpts<State, Context, ActionGroupIds, RecoveryActionGroupId, AlertData>) {
    this.rule = rule;
    this.currentTime = currentTime;
    this.logger = logger;
    this.trackedAlerts = trackedAlerts;
    this.ruleType = ruleType;
    this.alertRuleData = alertRuleData;
    this.runTimestampString = runTimestampString;
    this.reportedAlerts = reportedAlerts;
    this.kibanaVersion = kibanaVersion;
    this.indexTemplateAndPattern = indexTemplateAndPattern;
    this.ruleInfoMessage = ruleInfoMessage;
    this.logTags = logTags;
    this.isUsingDataStreams = isUsingDataStreams;
    this.legacyAlertsClient = legacyAlertsClient;

    this.createAlertsInAllSpaces = shouldCreateAlertsInAllSpaces({
      ruleTypeId: this.ruleType.id,
      ruleTypeAlertDef: ruleType.alerts,
      logger,
    });
  }

  buildAlerts(): Array<Alert & AlertData> {
    const alertsToIndex = [
      ...this.buildActiveAlerts(),
      ...this.buildRecoveredAlerts(),
      ...this.buildDelayedAlerts(),
    ];

    const alertsWithValidIndexNames: Array<Alert & AlertData> =
      this.getAlertsWithValidIndexNames(alertsToIndex);

    return alertsWithValidIndexNames;
  }

  getBulkBody(alertsToIndex: Array<Alert & AlertData>) {
    return flatMap(
      alertsToIndex.map((alert: Alert & AlertData) => {
        const alertUuid = get(alert, ALERT_UUID);
        return this.getBulkOperation(
          alertUuid,
          this.trackedAlerts.indices[alertUuid],
          this.trackedAlerts.seqNo[alertUuid],
          this.trackedAlerts.primaryTerm[alertUuid],
          this.isUsingDataStreams,
          alert
        );
      })
    );
  }

  private getAlertsWithValidIndexNames(alerts: Array<Alert & AlertData>): Array<Alert & AlertData> {
    return alerts.filter((alert: Alert & AlertData) => {
      const alertUuid = get(alert, ALERT_UUID);
      const alertIndex = this.trackedAlerts.indices[alertUuid];
      if (!alertIndex) {
        return true;
      } else if (!isValidAlertIndexName(alertIndex)) {
        this.logger.warn(
          `Could not update alert ${alertUuid} in ${alertIndex}. Partial and restored alert indices are not supported ${this.ruleInfoMessage}.`,
          this.logTags
        );
        return false;
      }
      return true;
    });
  }

  private buildActiveAlerts(): Array<Alert & AlertData> {
    const { rawActiveAlerts } = this.legacyAlertsClient.getRawAlertInstancesForState();
    const activeAlerts = this.legacyAlertsClient.getProcessedAlerts(ALERT_STATUS_ACTIVE);
    const delayedAlerts = this.legacyAlertsClient.getProcessedAlerts(ALERT_STATUS_DELAYED);

    // TODO - Lifecycle alerts set some other fields based on alert status
    // Example: workflow status - default to 'open' if not set
    // event action: new alert = 'new', active alert: 'active', otherwise 'close'
    const activeAlertsToIndex = [];
    for (const id of keys(rawActiveAlerts)) {
      const activeAlert = activeAlerts[id];
      const delayedAlert = delayedAlerts[id];
      // we keep the delayed alerts in trackedActiveAlerts but we don't index them here
      if (delayedAlert) {
        continue;
      }
      if (activeAlert) {
        const uuid = activeAlert.getUuid();
        const trackedActive = this.trackedAlerts.active[uuid];
        const trackedDelayed = this.trackedAlerts.delayed[uuid];

        if (trackedActive) {
          const isImproving = isAlertImproving<
            AlertData,
            State,
            Context,
            ActionGroupIds,
            RecoveryActionGroupId
          >(trackedActive, activeAlert, this.ruleType.actionGroups);
          activeAlertsToIndex.push(
            buildOngoingAlert<AlertData, State, Context, ActionGroupIds, RecoveryActionGroupId>({
              alert: trackedActive,
              legacyAlert: activeAlert,
              rule: this.rule,
              ruleData: this.alertRuleData,
              isImproving,
              runTimestamp: this.runTimestampString,
              timestamp: this.currentTime,
              payload: this.reportedAlerts[id],
              kibanaVersion: this.kibanaVersion,
              dangerouslyCreateAlertsInAllSpaces: this.createAlertsInAllSpaces,
            })
          );
        } else if (trackedDelayed) {
          // The alert is graduating from `delayed` to `active`. The delayed
          // predecessor doc carries the rule type fields reported during the
          // delayed runs, which the graduated builder merges in. This keeps
          // the resulting active doc complete even when the executor does
          // not report a fresh payload on the run that triggers graduation
          // (e.g. flap-hold reactivation).
          activeAlertsToIndex.push(
            buildGraduatedAlert<AlertData, State, Context, ActionGroupIds, RecoveryActionGroupId>({
              alert: trackedDelayed,
              legacyAlert: activeAlert,
              rule: this.rule,
              ruleData: this.alertRuleData,
              runTimestamp: this.runTimestampString,
              timestamp: this.currentTime,
              payload: this.reportedAlerts[id],
              kibanaVersion: this.kibanaVersion,
              dangerouslyCreateAlertsInAllSpaces: this.createAlertsInAllSpaces,
            })
          );
        } else {
          activeAlertsToIndex.push(
            buildNewAlert<AlertData, State, Context, ActionGroupIds, RecoveryActionGroupId>({
              legacyAlert: activeAlert,
              rule: this.rule,
              ruleData: this.alertRuleData,
              runTimestamp: this.runTimestampString,
              timestamp: this.currentTime,
              payload: this.reportedAlerts[id],
              kibanaVersion: this.kibanaVersion,
              dangerouslyCreateAlertsInAllSpaces: this.createAlertsInAllSpaces,
            })
          );
        }
      } else {
        this.logger.error(
          `Error writing alert(${id}) to ${this.indexTemplateAndPattern.alias} - alert(${id}) doesn't exist in active or delayed alerts ${this.ruleInfoMessage}.`,
          this.logTags
        );
      }
    }
    return activeAlertsToIndex;
  }

  private buildRecoveredAlerts(): Array<Alert & AlertData> {
    const { rawRecoveredAlerts } = this.legacyAlertsClient.getRawAlertInstancesForState();
    const recoveredAlerts = this.legacyAlertsClient.getProcessedAlerts(ALERT_STATUS_RECOVERED);

    const recoveredAlertsToIndex = [];
    for (const id of keys(rawRecoveredAlerts)) {
      const trackedAlert = this.trackedAlerts.getById(id);
      // See if there's an existing alert document
      // If there is not, log an error because there should be
      if (trackedAlert) {
        recoveredAlertsToIndex.push(
          recoveredAlerts[id]
            ? buildRecoveredAlert<AlertData, State, Context, ActionGroupIds, RecoveryActionGroupId>(
                {
                  alert: trackedAlert,
                  legacyAlert: recoveredAlerts[id],
                  rule: this.rule,
                  ruleData: this.alertRuleData,
                  runTimestamp: this.runTimestampString,
                  timestamp: this.currentTime,
                  payload: this.reportedAlerts[id],
                  recoveryActionGroup: this.ruleType.recoveryActionGroup.id,
                  kibanaVersion: this.kibanaVersion,
                  dangerouslyCreateAlertsInAllSpaces: this.createAlertsInAllSpaces,
                }
              )
            : buildUpdatedRecoveredAlert<AlertData>({
                alert: trackedAlert,
                legacyRawAlert: rawRecoveredAlerts[id],
                runTimestamp: this.runTimestampString,
                timestamp: this.currentTime,
                rule: this.rule,
              })
        );
      } else {
        this.logger.error(
          `Error writing recovered alert(${id}) to ${this.indexTemplateAndPattern.alias} - alert(${id}) doesn't exist in tracked alerts ${this.ruleInfoMessage}.`,
          this.logTags
        );
        // The tracked AAD document is missing, but the alert recovered this
        // run. Synthesize a recovered document from current state so the
        // instance is not left status: active with no kibana.alert.end.
        const recoveredAlert = recoveredAlerts[id];
        if (recoveredAlert) {
          const synthesizedAlert = buildNewAlert<
            AlertData,
            State,
            Context,
            ActionGroupIds,
            RecoveryActionGroupId
          >({
            legacyAlert: recoveredAlert,
            rule: this.rule,
            ruleData: this.alertRuleData,
            runTimestamp: this.runTimestampString,
            timestamp: this.currentTime,
            payload: this.reportedAlerts[id],
            kibanaVersion: this.kibanaVersion,
            dangerouslyCreateAlertsInAllSpaces: this.createAlertsInAllSpaces,
          });
          const previousActionGroup = recoveredAlert.getLastScheduledActions()?.group;
          if (previousActionGroup) {
            synthesizedAlert[ALERT_ACTION_GROUP] = previousActionGroup;
          }
          recoveredAlertsToIndex.push(
            buildRecoveredAlert<AlertData, State, Context, ActionGroupIds, RecoveryActionGroupId>({
              alert: synthesizedAlert,
              legacyAlert: recoveredAlert,
              rule: this.rule,
              ruleData: this.alertRuleData,
              runTimestamp: this.runTimestampString,
              timestamp: this.currentTime,
              payload: this.reportedAlerts[id],
              recoveryActionGroup: this.ruleType.recoveryActionGroup.id,
              kibanaVersion: this.kibanaVersion,
              dangerouslyCreateAlertsInAllSpaces: this.createAlertsInAllSpaces,
            })
          );
        }
      }
    }
    return recoveredAlertsToIndex;
  }

  private buildDelayedAlerts(): Array<Alert & AlertData> {
    const delayedAlerts = this.legacyAlertsClient.getProcessedAlerts(ALERT_STATUS_DELAYED);
    const delayedAlertsToIndex = [];
    for (const delayedAlert of values(delayedAlerts)) {
      delayedAlertsToIndex.push(
        buildDelayedAlert<AlertData, State, Context, ActionGroupIds, RecoveryActionGroupId>({
          legacyAlert: delayedAlert,
          rule: this.rule,
          ruleData: this.alertRuleData,
          payload: this.reportedAlerts[delayedAlert.getId()],
          runTimestamp: this.runTimestampString,
          timestamp: this.currentTime,
          kibanaVersion: this.kibanaVersion,
          dangerouslyCreateAlertsInAllSpaces: this.createAlertsInAllSpaces,
        })
      );
    }
    return delayedAlertsToIndex;
  }

  private getBulkOperation(
    uuid: string,
    index: string | undefined,
    seqNo: number | undefined,
    primaryTerm: number | undefined,
    isUsingDataStreams: boolean,
    alert: Alert & AlertData
  ) {
    const shouldDelete = this.isRecoveredDelayedAlert(alert);
    if (shouldDelete) {
      // recovered delayed alerts should always create a new document
      return [
        {
          delete: {
            _id: uuid,
            _index: index,
          },
        },
      ];
    }

    if (index && seqNo != null && primaryTerm != null) {
      return [
        {
          index: {
            _id: uuid,
            _index: index,
            if_seq_no: seqNo,
            if_primary_term: primaryTerm,
            require_alias: false,
          },
        },
        alert,
      ];
    }

    return [
      {
        create: {
          _id: uuid,
          ...(isUsingDataStreams ? {} : { require_alias: true }),
        },
      },
      alert,
    ];
  }

  private isRecoveredDelayedAlert(alert: Alert & AlertData) {
    return (
      get(alert, ALERT_STATUS) === ALERT_STATUS_DELAYED &&
      get(alert, ALERT_ACTION_GROUP) === undefined
    );
  }
}
