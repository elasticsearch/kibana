/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import type { KibanaRequest, Logger } from '@kbn/core/server';
import { cloneDeep, clone, keys } from 'lodash';
import type { MaintenanceWindow } from '@kbn/maintenance-windows-plugin/common';
import { Alert } from '../alert/alert';
import type { AlertFactory } from '../alert/create_alert_factory';
import { createAlertFactory, getPublicAlertFactory } from '../alert/create_alert_factory';
import { toRawAlertInstances, processAlerts } from '../lib';

import { logAlerts } from '../task_runner/log_alerts';
import type {
  AlertInstanceContext,
  AlertInstanceState,
  WithoutReservedActionGroups,
} from '../types';
import type { RulesSettingsFlappingProperties } from '../../common/rules_settings';
import { DEFAULT_FLAPPING_SETTINGS } from '../../common/rules_settings';
import { getMaxAlertLimit } from '../../common';
import type {
  IAlertsClient,
  InitializeExecutionOpts,
  LogAlertsOpts,
  TrackedAlerts,
  DetermineDelayedAlertsOpts,
} from './types';
import { DEFAULT_MAX_ALERTS } from '../config';
import type { UntypedNormalizedRuleType } from '../rule_type_registry';
import type { MaintenanceWindowsService } from '../task_runner/maintenance_windows';
import type { AlertingEventLogger } from '../lib/alerting_event_logger/alerting_event_logger';
import { determineFlappingAlerts } from '../lib/flapping/determine_flapping_alerts';
import { determineDelayedAlerts } from '../lib/determine_delayed_alerts';

export interface LegacyAlertsClientParams {
  alertingEventLogger: AlertingEventLogger;
  logger: Logger;
  maintenanceWindowsService?: MaintenanceWindowsService;
  request: KibanaRequest;
  ruleType: UntypedNormalizedRuleType;
  spaceId: string;
}

export class LegacyAlertsClient<
  State extends AlertInstanceState,
  Context extends AlertInstanceContext,
  ActionGroupIds extends string,
  RecoveryActionGroupId extends string
> implements IAlertsClient<{}, State, Context, ActionGroupIds, RecoveryActionGroupId>
{
  private maxAlerts: number = DEFAULT_MAX_ALERTS;
  private flappingSettings: RulesSettingsFlappingProperties = DEFAULT_FLAPPING_SETTINGS;
  private ruleLogPrefix = '';
  private startedAtString: string | null = null;

  // Alerts from the previous execution that are deserialized from the task state
  private trackedAlerts: TrackedAlerts<State, Context> = {
    active: {},
    recovered: {},
  };

  // Alerts reported from the rule executor using the alert factory
  private reportedAlerts: Record<string, Alert<State, Context>> = {};

  private processedAlerts: {
    new: Record<string, Alert<State, Context, ActionGroupIds>>;
    active: Record<string, Alert<State, Context, ActionGroupIds>>;
    trackedActiveAlerts: Record<string, Alert<State, Context, ActionGroupIds>>;
    recovered: Record<string, Alert<State, Context, RecoveryActionGroupId>>;
    trackedRecoveredAlerts: Record<string, Alert<State, Context, RecoveryActionGroupId>>;
    delayed: Record<string, Alert<State, Context, ActionGroupIds>>;
  };

  private alertFactory?: AlertFactory<
    State,
    Context,
    WithoutReservedActionGroups<ActionGroupIds, RecoveryActionGroupId>
  >;

  constructor(private readonly options: LegacyAlertsClientParams) {
    this.processedAlerts = {
      new: {},
      active: {},
      trackedActiveAlerts: {},
      recovered: {},
      trackedRecoveredAlerts: {},
      delayed: {},
    };
  }

  public async initializeExecution({
    maxAlerts,
    ruleLabel,
    startedAt,
    flappingSettings,
    activeAlertsFromState,
    recoveredAlertsFromState,
    snoozedInstances,
  }: InitializeExecutionOpts) {
    this.maxAlerts = getMaxAlertLimit(maxAlerts);
    this.flappingSettings = flappingSettings;
    this.ruleLogPrefix = ruleLabel;
    this.startedAtString = startedAt ? startedAt.toISOString() : null;

    const snoozedInstancesMap = new Map(
      (snoozedInstances ?? []).map((instance) => [instance.instanceId, instance])
    );

    for (const id of keys(activeAlertsFromState)) {
      this.trackedAlerts.active[id] = new Alert<State, Context>(id, activeAlertsFromState[id]);
      const snoozeConfig = snoozedInstancesMap.get(id);
      if (snoozeConfig) {
        this.trackedAlerts.active[id].setSnoozeConfig(snoozeConfig);
      }
    }

    for (const id of keys(recoveredAlertsFromState)) {
      this.trackedAlerts.recovered[id] = new Alert<State, Context>(
        id,
        recoveredAlertsFromState[id]
      );
      const snoozeConfig = snoozedInstancesMap.get(id);
      if (snoozeConfig) {
        this.trackedAlerts.recovered[id].setSnoozeConfig(snoozeConfig);
      }
    }

    // Legacy alerts client creates a copy of the active tracked alerts
    // This copy is updated when rule executors report alerts back to the framework
    // while the original alert is preserved
    this.reportedAlerts = cloneDeep(this.trackedAlerts.active);

    this.alertFactory = createAlertFactory<
      State,
      Context,
      WithoutReservedActionGroups<ActionGroupIds, RecoveryActionGroupId>
    >({
      alerts: this.reportedAlerts,
      logger: this.options.logger,
      configuredMaxAlerts: maxAlerts, // Pass in the configured max alerts value, so we can determine if alert limit is set above the allowed threshold
      autoRecoverAlerts: this.options.ruleType.autoRecoverAlerts ?? true,
      canSetRecoveryContext: this.options.ruleType.doesSetRecoveryContext ?? false,
      snoozedInstancesMap,
    });
  }

  public getAlert(id: string) {
    return this.alertFactory?.get(id);
  }

  public isTrackedAlert(id: string) {
    return !!this.trackedAlerts.active[id];
  }

  public async processAlerts() {
    const {
      newAlerts: processedAlertsNew,
      activeAlerts: processedAlertsActive,
      recoveredAlerts: processedAlertsRecovered,
    } = processAlerts<State, Context, ActionGroupIds, RecoveryActionGroupId>({
      alerts: this.reportedAlerts,
      existingAlerts: this.trackedAlerts.active,
      hasReachedAlertLimit: this.alertFactory!.hasReachedAlertLimit(),
      alertLimit: this.maxAlerts,
      autoRecoverAlerts: this.options.ruleType.autoRecoverAlerts ?? true,
      startedAt: this.startedAtString,
    });

    if (this.options.maintenanceWindowsService) {
      // load maintenance windows if there are any any alerts (new, active, recovered)
      // this is because we need the MW IDs for any active or recovered alerts that may
      // have started during the MW period.
      if (
        keys(processedAlertsNew).length > 0 ||
        keys(processedAlertsActive).length > 0 ||
        keys(processedAlertsRecovered).length > 0
      ) {
        const { maintenanceWindowsWithoutScopedQueryIds, maintenanceWindows } =
          await this.options.maintenanceWindowsService.getMaintenanceWindows({
            eventLogger: this.options.alertingEventLogger,
            request: this.options.request,
            ruleTypeCategory: this.options.ruleType.category,
            spaceId: this.options.spaceId,
          });

        this.removeExpiredMaintenanceWindows({
          processedAlertsActive,
          processedAlertsRecovered,
          maintenanceWindows,
        });

        // Create a map of maintenance window IDs to names
        const maintenanceWindowNamesMap = new Map(
          (maintenanceWindows ?? []).map((mw) => [mw.id, mw.title])
        );

        // Get the names corresponding to the IDs
        const maintenanceWindowsWithoutScopedQueryNames =
          maintenanceWindowsWithoutScopedQueryIds.map(
            (id) => maintenanceWindowNamesMap.get(id) || id
          );

        for (const id in processedAlertsNew) {
          if (Object.hasOwn(processedAlertsNew, id)) {
            processedAlertsNew[id].setMaintenanceWindowIds(maintenanceWindowsWithoutScopedQueryIds);
            processedAlertsNew[id].setMaintenanceWindowNames(
              maintenanceWindowsWithoutScopedQueryNames
            );
          }
        }
      }
    }

    this.processedAlerts.new = processedAlertsNew;
    this.processedAlerts.active = processedAlertsActive;
    this.processedAlerts.trackedActiveAlerts = clone(processedAlertsActive);
    this.processedAlerts.recovered = processedAlertsRecovered;
    this.processedAlerts.trackedRecoveredAlerts = clone(processedAlertsRecovered);
  }

  public logAlerts({ ruleRunMetricsStore, shouldLogAlerts }: LogAlertsOpts) {
    logAlerts({
      logger: this.options.logger,
      alertingEventLogger: this.options.alertingEventLogger,
      newAlerts: this.processedAlerts.new,
      activeAlerts: this.processedAlerts.active,
      recoveredAlerts: this.processedAlerts.recovered,
      ruleLogPrefix: this.ruleLogPrefix,
      ruleRunMetricsStore,
      // don't log alert instance docs to event log if rule type is persistent
      shouldLogAlerts: this.options.ruleType.autoRecoverAlerts ?? true,
      canSetRecoveryContext: this.options.ruleType.doesSetRecoveryContext ?? false,
      shouldPersistAlerts: shouldLogAlerts,
    });
  }

  public getProcessedAlerts(
    type:
      | 'new'
      | 'active'
      | 'trackedActiveAlerts'
      | 'recovered'
      | 'trackedRecoveredAlerts'
      | 'delayed'
  ) {
    if (Object.hasOwn(this.processedAlerts, type)) {
      return this.processedAlerts[type];
    }

    return {};
  }

  public getRawAlertInstancesForState(shouldOptimizeTaskState?: boolean) {
    return toRawAlertInstances<State, Context, ActionGroupIds, RecoveryActionGroupId>(
      this.options.logger,
      this.maxAlerts,
      this.processedAlerts.trackedActiveAlerts,
      this.processedAlerts.trackedRecoveredAlerts,
      shouldOptimizeTaskState
    );
  }

  public determineFlappingAlerts() {
    if (this.flappingSettings.enabled) {
      const alerts = determineFlappingAlerts({
        newAlerts: this.processedAlerts.new,
        activeAlerts: this.processedAlerts.active,
        recoveredAlerts: this.processedAlerts.recovered,
        flappingSettings: this.flappingSettings,
        previouslyRecoveredAlerts: this.trackedAlerts.recovered,
        actionGroupId: this.options.ruleType.defaultActionGroupId,
      });

      this.processedAlerts.new = alerts.newAlerts;
      this.processedAlerts.active = alerts.activeAlerts;
      this.processedAlerts.trackedActiveAlerts = alerts.trackedActiveAlerts;
      this.processedAlerts.recovered = alerts.recoveredAlerts;
      this.processedAlerts.trackedRecoveredAlerts = alerts.trackedRecoveredAlerts;
    }
  }

  public determineDelayedAlerts(opts: DetermineDelayedAlertsOpts) {
    const alerts = determineDelayedAlerts({
      newAlerts: this.processedAlerts.new,
      activeAlerts: this.processedAlerts.active,
      trackedActiveAlerts: this.processedAlerts.trackedActiveAlerts,
      recoveredAlerts: this.processedAlerts.recovered,
      trackedRecoveredAlerts: this.processedAlerts.trackedRecoveredAlerts,
      delayedAlerts: this.processedAlerts.delayed,
      alertDelay: opts.alertDelay,
      startedAt: this.startedAtString,
      ruleRunMetricsStore: opts.ruleRunMetricsStore,
    });

    this.processedAlerts.new = alerts.newAlerts;
    this.processedAlerts.active = alerts.activeAlerts;
    this.processedAlerts.trackedActiveAlerts = alerts.trackedActiveAlerts;
    this.processedAlerts.recovered = alerts.recoveredAlerts;
    this.processedAlerts.trackedRecoveredAlerts = alerts.trackedRecoveredAlerts;
  }

  public hasReachedAlertLimit(): boolean {
    return this.alertFactory!.hasReachedAlertLimit();
  }

  public getMaxAlertLimit(): number {
    return this.maxAlerts;
  }

  public checkLimitUsage() {
    return this.alertFactory!.alertLimit.checkLimitUsage();
  }

  public factory() {
    return getPublicAlertFactory(this.alertFactory!);
  }

  public client() {
    return null;
  }

  public async persistAlerts() {
    return;
  }

  public async getAlertsToUpdateWithMaintenanceWindows() {
    return {};
  }

  public getAlertsToUpdateWithLastScheduledActions() {
    return {};
  }

  public async updatePersistedAlerts() {}

  public async clearSnoozedStatusForAlerts(_conditionExpiredInstanceIds: string[]): Promise<void> {}

  public async setAlertStatusToUntracked() {
    return;
  }

  public getBuiltActiveAlertDataByInstanceId(_instanceId: string): undefined {
    return undefined;
  }

  private removeExpiredMaintenanceWindows({
    processedAlertsActive,
    processedAlertsRecovered,
    maintenanceWindows,
  }: {
    processedAlertsActive: Record<string, Alert<State, Context, ActionGroupIds>>;
    processedAlertsRecovered: Record<string, Alert<State, Context, RecoveryActionGroupId>>;
    maintenanceWindows: MaintenanceWindow[];
  }) {
    const maintenanceWindowIds = maintenanceWindows.map((mw) => mw.id);
    const maintenanceWindowNamesMap = new Map(maintenanceWindows.map((mw) => [mw.id, mw.title]));

    const clearMws = (
      alerts: Record<string, Alert<State, Context, ActionGroupIds | RecoveryActionGroupId>>
    ) => {
      for (const id in alerts) {
        if (Object.hasOwn(alerts, id)) {
          const existingMaintenanceWindowIds = alerts[id].getMaintenanceWindowIds();
          const activeMaintenanceWindowIds = existingMaintenanceWindowIds.filter((mw) => {
            return maintenanceWindowIds.includes(mw);
          });

          // Map active IDs to their corresponding names
          const activeMaintenanceWindowNames = activeMaintenanceWindowIds.map(
            (mwId) => maintenanceWindowNamesMap.get(mwId) || mwId
          );

          alerts[id].setMaintenanceWindowIds(activeMaintenanceWindowIds);
          alerts[id].setMaintenanceWindowNames(activeMaintenanceWindowNames);
        }
      }
    };
    clearMws(processedAlertsActive);
    clearMws(processedAlertsRecovered);
  }
}
