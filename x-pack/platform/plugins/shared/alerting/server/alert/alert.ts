/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { v4 as uuidV4 } from 'uuid';
import type { AADAlert } from '@kbn/alerts-as-data-utils';
import { get, isEmpty } from 'lodash';
import type { MutableAlertInstanceMeta } from '@kbn/alerting-state-types';
import type { AlertStatus } from '@kbn/rule-data-utils';
import { ALERT_STATUS_DELAYED, ALERT_UUID } from '@kbn/rule-data-utils';
import type { AlertHit, CombinedSummarizedAlerts } from '../types';
import type { RawRuleSnoozedInstance } from '../saved_objects/schemas/raw_rule';
import type {
  AlertInstanceMeta,
  AlertInstanceState,
  RawAlertInstance,
  AlertInstanceContext,
  DefaultActionGroupId,
  LastScheduledActions,
} from '../../common';

import { parseDuration } from '../lib';

interface ScheduledExecutionOptions<
  State extends AlertInstanceState,
  Context extends AlertInstanceContext,
  ActionGroupIds extends string = DefaultActionGroupId
> {
  actionGroup: ActionGroupIds;
  context: Context;
  state: State;
}

export type PublicAlert<
  State extends AlertInstanceState = AlertInstanceState,
  Context extends AlertInstanceContext = AlertInstanceContext,
  ActionGroupIds extends string = DefaultActionGroupId
> = Pick<
  Alert<State, Context, ActionGroupIds, AADAlert>,
  | 'getContext'
  | 'getState'
  | 'getUuid'
  | 'getStart'
  | 'hasContext'
  | 'replaceState'
  | 'scheduleActions'
  | 'setContext'
>;

export class Alert<
  State extends AlertInstanceState = AlertInstanceState,
  Context extends AlertInstanceContext = AlertInstanceContext,
  ActionGroupIds extends string = never,
  AlertAsData extends AADAlert = AADAlert
> {
  private scheduledExecutionOptions?: ScheduledExecutionOptions<State, Context, ActionGroupIds>;
  private meta: MutableAlertInstanceMeta;
  private state: State;
  private context: Context;
  private readonly id: string;
  private alertAsData: AlertAsData | undefined;
  private status: AlertStatus | undefined;
  private _snoozeConfig?: RawRuleSnoozedInstance;

  constructor(id: string, { state, meta = {} }: RawAlertInstance = {}) {
    this.id = id;
    this.state = (state || {}) as State;
    this.context = {} as Context;
    this.meta = meta;
    this.meta.uuid = meta.uuid ?? uuidV4();
    this.meta.maintenanceWindowIds = meta.maintenanceWindowIds ?? [];
    this.meta.maintenanceWindowNames = meta.maintenanceWindowNames ?? [];
    if (!this.meta.flappingHistory) {
      this.meta.flappingHistory = [];
    }
  }

  getId() {
    return this.id;
  }

  getUuid() {
    return this.meta.uuid!;
  }

  matchesUuid(uuid: string): boolean {
    return this.meta.uuid === uuid || this.id === uuid;
  }

  isAlertAsData() {
    return this.alertAsData !== undefined;
  }

  setAlertAsData(alertAsData: AlertAsData) {
    this.alertAsData = alertAsData;
  }

  getAlertAsData() {
    return this.alertAsData;
  }

  getStart(): string | null {
    return this.state.start ? `${this.state.start}` : null;
  }

  hasScheduledActions() {
    return this.scheduledExecutionOptions !== undefined;
  }

  isThrottled({
    throttle,
    actionHash,
    uuid,
  }: {
    throttle: string | null;
    actionHash?: string;
    uuid?: string;
  }) {
    if (this.scheduledExecutionOptions === undefined) {
      return false;
    }
    const throttleMills = throttle ? parseDuration(throttle) : 0;
    if (
      this.meta.lastScheduledActions &&
      this.scheduledActionGroupIsUnchanged(
        this.meta.lastScheduledActions,
        this.scheduledExecutionOptions
      )
    ) {
      if (uuid && actionHash) {
        if (this.meta.lastScheduledActions.actions) {
          const actionInState =
            this.meta.lastScheduledActions.actions[uuid] ||
            this.meta.lastScheduledActions.actions[actionHash]; // actionHash must be removed once all the hash identifiers removed from the task state
          const lastTriggerDate = actionInState?.date;
          return !!(
            lastTriggerDate && new Date(lastTriggerDate).getTime() + throttleMills > Date.now()
          );
        }
        return false;
      } else {
        return new Date(this.meta.lastScheduledActions.date).getTime() + throttleMills > Date.now();
      }
    }
    return false;
  }

  scheduledActionGroupHasChanged(): boolean {
    if (!this.meta.lastScheduledActions && this.scheduledExecutionOptions) {
      // it is considered a change when there are no previous scheduled actions
      // and new scheduled actions
      return true;
    }

    if (this.meta.lastScheduledActions && this.scheduledExecutionOptions) {
      // compare previous and new scheduled actions if both exist
      return !this.scheduledActionGroupIsUnchanged(
        this.meta.lastScheduledActions,
        this.scheduledExecutionOptions
      );
    }
    // no previous and no new scheduled actions
    return false;
  }

  private scheduledActionGroupIsUnchanged(
    lastScheduledActions: NonNullable<AlertInstanceMeta['lastScheduledActions']>,
    scheduledExecutionOptions: ScheduledExecutionOptions<State, Context, ActionGroupIds>
  ) {
    return lastScheduledActions.group === scheduledExecutionOptions.actionGroup;
  }

  getLastScheduledActions() {
    return this.meta.lastScheduledActions;
  }

  getScheduledActionOptions() {
    return this.scheduledExecutionOptions;
  }

  unscheduleActions() {
    this.scheduledExecutionOptions = undefined;
    return this;
  }

  getState() {
    return this.state;
  }

  getContext() {
    return this.context;
  }

  hasContext() {
    return !isEmpty(this.context);
  }

  scheduleActions(actionGroup: ActionGroupIds, context: Context = {} as Context) {
    this.ensureHasNoScheduledActions();
    this.setContext(context);
    this.scheduledExecutionOptions = {
      actionGroup,
      context,
      state: this.state,
    };
    return this;
  }

  setContext(context: Context) {
    this.context = context;
    return this;
  }

  private ensureHasNoScheduledActions() {
    if (this.hasScheduledActions()) {
      throw new Error('Alert instance execution has already been scheduled, cannot schedule twice');
    }
  }

  replaceState(state: State) {
    this.state = state;
    return this;
  }

  clearThrottlingLastScheduledActions(allActionUuids: string[]) {
    const throttlingActions = this.meta.lastScheduledActions?.actions || {};
    Object.keys(throttlingActions).forEach((id) => {
      if (!allActionUuids.includes(id)) {
        delete throttlingActions[id];
      }
    });
  }

  updateLastScheduledActions(group: ActionGroupIds, actionHash?: string | null, uuid?: string) {
    if (!this.meta.lastScheduledActions) {
      this.meta.lastScheduledActions = {} as LastScheduledActions;
    }
    const date = new Date().toISOString();
    this.meta.lastScheduledActions.group = group;
    this.meta.lastScheduledActions.date = date;

    // action group has changed, clear out the actions history
    if (this.meta.lastScheduledActions.group !== group) {
      this.meta.lastScheduledActions.actions = {};
    } else if (uuid) {
      // uuid is provided, this is an action on interval
      if (!this.meta.lastScheduledActions.actions) {
        this.meta.lastScheduledActions.actions = {};
      }
      // remove deprecated actionHash
      if (!!actionHash && this.meta.lastScheduledActions.actions[actionHash]) {
        delete this.meta.lastScheduledActions.actions[actionHash];
      }
      this.meta.lastScheduledActions.actions[uuid] = { date };
    }
  }

  /**
   * Used to serialize alert instance state
   */
  toJSON() {
    return this.toRaw();
  }

  toRaw(recovered = false): RawAlertInstance {
    return recovered
      ? {
          // for a recovered alert, we only care to track the flappingHistory,
          // the flapping flag, and the UUID
          meta: {
            maintenanceWindowIds: this.meta.maintenanceWindowIds,
            maintenanceWindowNames: this.meta.maintenanceWindowNames,
            flappingHistory: this.meta.flappingHistory,
            flapping: this.meta.flapping,
            uuid: this.meta.uuid,
            activeCount: this.meta.activeCount,
          },
        }
      : {
          state: this.state,
          meta: this.meta,
        };
  }

  setFlappingHistory(fh: boolean[] = []) {
    this.meta.flappingHistory = fh;
  }

  getFlappingHistory() {
    return this.meta.flappingHistory;
  }

  setFlapping(f: boolean) {
    this.meta.flapping = f;
  }

  getFlapping() {
    return this.meta.flapping || false;
  }

  incrementPendingRecoveredCount() {
    if (!this.meta.pendingRecoveredCount) {
      this.meta.pendingRecoveredCount = 0;
    }
    this.meta.pendingRecoveredCount++;
  }

  getPendingRecoveredCount() {
    return this.meta.pendingRecoveredCount || 0;
  }

  resetPendingRecoveredCount() {
    this.meta.pendingRecoveredCount = 0;
  }

  /**
   * Checks whether this alert exists in the given alert summary
   */
  isFilteredOut(summarizedAlerts: CombinedSummarizedAlerts | null) {
    if (summarizedAlerts === null) {
      return false;
    }

    // We check the alert UUID against both the alert ID and the UUID here
    // The framework generates a UUID for each new reported alert.
    // For lifecycle rule types, this UUID is written out in the ALERT_UUID field
    // so we can compare ALERT_UUID to getUuid()
    // For persistence rule types, the executor generates its own UUID which is a SHA
    // of the alert data and stores it in the ALERT_UUID and uses it as the alert ID
    // before reporting the alert back to the framework. The framework then generates
    // another UUID that is never persisted. For these alerts, we want to compare
    // ALERT_UUID to getId()
    //
    // Related issue: https://github.com/elastic/kibana/issues/144862

    return !summarizedAlerts.all.data.some((alert: AlertHit) => {
      const alertUuid = get(alert, ALERT_UUID);
      return alertUuid === this.getId() || alertUuid === this.getUuid();
    });
  }

  setMaintenanceWindowIds(maintenanceWindowIds: string[] = []) {
    this.meta.maintenanceWindowIds = maintenanceWindowIds;
  }

  getMaintenanceWindowIds() {
    return this.meta.maintenanceWindowIds ?? [];
  }

  setMaintenanceWindowNames(maintenanceWindowNames: string[] = []) {
    this.meta.maintenanceWindowNames = maintenanceWindowNames;
  }

  getMaintenanceWindowNames() {
    return this.meta.maintenanceWindowNames ?? [];
  }

  setSnoozeConfig(config: RawRuleSnoozedInstance) {
    this._snoozeConfig = config;
  }

  getSnoozeConfig(): RawRuleSnoozedInstance | undefined {
    return this._snoozeConfig;
  }

  incrementActiveCount() {
    if (!this.meta.activeCount) {
      this.meta.activeCount = 0;
    }
    this.meta.activeCount++;
  }

  getActiveCount() {
    return this.meta.activeCount || 0;
  }

  resetActiveCount() {
    this.meta.activeCount = 0;
  }

  setStatus(status: AlertStatus) {
    this.status = status;
  }

  isDelayed() {
    return this.status === ALERT_STATUS_DELAYED;
  }
}
