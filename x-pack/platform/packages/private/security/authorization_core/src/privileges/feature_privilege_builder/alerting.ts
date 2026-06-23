/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { get, uniq } from 'lodash';

import type { AlertingKibanaPrivilege } from '@kbn/features-plugin/common/alerting_kibana_privilege';
import type { FeatureKibanaPrivileges, KibanaFeature } from '@kbn/features-plugin/server';

import { BaseFeaturePrivilegeBuilder } from './feature_privilege_builder';

enum AlertingEntity {
  RULE = 'rule',
  ALERT = 'alert',
}

const readOperations: Record<AlertingEntity, string[]> = {
  rule: [
    'get',
    'bulkGet',
    'getRuleState',
    'getAlertSummary',
    'getExecutionLog',
    'getActionErrorLog',
    'find',
    'getRuleExecutionKPI',
    'getBackfill',
    'findBackfill',
    'findGaps',
    'bulkEditParams',
    'getGapAutoFillScheduler',
    'findGapAutoFillSchedulerLogs',
    'getHistory',
  ],
  alert: ['get', 'find', 'getAuthorizedAlertsIndices', 'getAlertSummary'],
};

const manualRunOperations: Record<AlertingEntity, string[]> = {
  rule: ['deleteBackfill', 'fillGaps', 'scheduleBackfill'],
  alert: [],
};

const enableOperations: Record<AlertingEntity, string[]> = {
  rule: ['enable', 'disable', 'bulkEnable', 'bulkDisable'],
  alert: [],
};

const manageRuleSettingsOperations: Record<AlertingEntity, string[]> = {
  rule: [
    'getGapAutoFillScheduler',
    'findGapAutoFillSchedulerLogs',
    'createGapAutoFillScheduler',
    'updateGapAutoFillScheduler',
    'deleteGapAutoFillScheduler',
    'find',
    'findBackfill',
    'scheduleBackfill',
  ],
  alert: [],
};

// Covers both per-alert snooze/unsnooze and muteAlert/unmuteAlert
const muteAlertsOperations: Record<AlertingEntity, string[]> = {
  rule: ['muteAlert', 'unmuteAlert'],
  alert: [],
};

const writeOperations: Record<AlertingEntity, string[]> = {
  rule: [
    'create',
    'delete',
    'update',
    'updateApiKey',
    'muteAll',
    'unmuteAll',
    'muteAlert',
    'unmuteAlert',
    'snooze',
    'bulkEdit',
    'bulkDelete',
    'unsnooze',
    'runSoon',
  ],
  alert: ['update'],
};
const allOperations: Record<AlertingEntity, string[]> = {
  rule: [...readOperations.rule, ...writeOperations.rule],
  alert: [...readOperations.alert, ...writeOperations.alert],
};

export class FeaturePrivilegeAlertingBuilder extends BaseFeaturePrivilegeBuilder {
  public getActions(
    privilegeDefinition: FeatureKibanaPrivileges,
    feature: KibanaFeature
  ): string[] {
    const getAlertingPrivilege = (
      operations: string[],
      privileges: AlertingKibanaPrivilege,
      alertingEntity: string
    ) =>
      privileges.flatMap(({ ruleTypeId, consumers }) =>
        consumers.flatMap((consumer) =>
          operations.map((operation) =>
            this.actions.alerting.get(ruleTypeId, consumer, alertingEntity, operation)
          )
        )
      );

    const getPrivilegesForEntity = (entity: AlertingEntity) => {
      const all = get(privilegeDefinition.alerting, `${entity}.all`) ?? [];
      const enable = get(privilegeDefinition.alerting, `${entity}.enable`) ?? [];
      const manualRun = get(privilegeDefinition.alerting, `${entity}.manual_run`) ?? [];
      const manageRuleSettings =
        get(privilegeDefinition.alerting, `${entity}.manage_rule_settings`) ?? [];
      const muteAlerts = get(privilegeDefinition.alerting, `${entity}.mute_alerts`) ?? [];
      const read = get(privilegeDefinition.alerting, `${entity}.read`) ?? [];

      return uniq([
        ...getAlertingPrivilege(allOperations[entity], all, entity),
        ...getAlertingPrivilege(readOperations[entity], read, entity),
        ...getAlertingPrivilege(enableOperations[entity], enable, entity),
        ...getAlertingPrivilege(manualRunOperations[entity], manualRun, entity),
        ...getAlertingPrivilege(manageRuleSettingsOperations[entity], manageRuleSettings, entity),
        ...getAlertingPrivilege(muteAlertsOperations[entity], muteAlerts, entity),
      ]);
    };

    return uniq([
      ...getPrivilegesForEntity(AlertingEntity.RULE),
      ...getPrivilegesForEntity(AlertingEntity.ALERT),
    ]);
  }
}
