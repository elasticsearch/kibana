/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Logger } from '@kbn/core/server';
import { cloneDeep } from 'lodash';
import type { AlertInstanceContext, AlertInstanceState } from '../types';
import type { PublicAlert } from './alert';
import { Alert } from './alert';
import { processAlerts } from '../lib';
import { ALLOWED_MAX_ALERTS, getMaxAlertLimit } from '../../common';
import type { RawRuleSnoozedInstance } from '../saved_objects/schemas/raw_rule';

export interface AlertFactory<
  State extends AlertInstanceState,
  Context extends AlertInstanceContext,
  ActionGroupIds extends string
> {
  create: (id: string) => PublicAlert<State, Context, ActionGroupIds>;
  get: (id: string) => PublicAlert<State, Context, ActionGroupIds> | null;
  alertLimit: {
    getValue: () => number;
    setLimitReached: (reached: boolean) => void;
    checkLimitUsage: () => void;
  };
  hasReachedAlertLimit: () => boolean;
  done: () => AlertFactoryDoneUtils<State, Context, ActionGroupIds>;
}

export type PublicAlertFactory<
  State extends AlertInstanceState,
  Context extends AlertInstanceContext,
  ActionGroupIds extends string
> = Pick<AlertFactory<State, Context, ActionGroupIds>, 'create' | 'done'> & {
  alertLimit: Pick<
    AlertFactory<State, Context, ActionGroupIds>['alertLimit'],
    'getValue' | 'setLimitReached'
  >;
};

export interface AlertFactoryDoneUtils<
  State extends AlertInstanceState,
  Context extends AlertInstanceContext,
  ActionGroupIds extends string
> {
  getRecoveredAlerts: () => Array<Alert<State, Context, ActionGroupIds>>;
}

export interface CreateAlertFactoryOpts<
  State extends AlertInstanceState,
  Context extends AlertInstanceContext
> {
  alerts: Record<string, Alert<State, Context>>;
  logger: Logger;
  configuredMaxAlerts: number;
  autoRecoverAlerts: boolean;
  canSetRecoveryContext?: boolean;
  snoozedInstancesMap?: Map<string, RawRuleSnoozedInstance>;
}

export function createAlertFactory<
  State extends AlertInstanceState,
  Context extends AlertInstanceContext,
  ActionGroupIds extends string
>({
  alerts,
  logger,
  configuredMaxAlerts,
  autoRecoverAlerts,
  canSetRecoveryContext = false,
  snoozedInstancesMap,
}: CreateAlertFactoryOpts<State, Context>): AlertFactory<State, Context, ActionGroupIds> {
  // Keep track of which alerts we started with so we can determine which have recovered
  const originalAlerts = cloneDeep(alerts);

  // Number of alerts reported
  let numAlertsCreated = 0;

  // Whether the number of alerts reported has reached max allowed
  let hasReachedAlertLimit = false;

  // Whether rule type has asked for the alert limit
  let hasRequestedAlertLimit = false;

  // Whether rule type has reported back if alert limit was reached
  let hasReportedLimitReached = false;

  const maxAlerts = getMaxAlertLimit(configuredMaxAlerts);

  let isDone = false;
  return {
    create: (id: string): PublicAlert<State, Context, ActionGroupIds> => {
      if (isDone) {
        throw new Error(`Can't create new alerts after calling done() in AlertsFactory.`);
      }

      if (numAlertsCreated++ >= maxAlerts) {
        hasReachedAlertLimit = true;
        if (configuredMaxAlerts > ALLOWED_MAX_ALERTS) {
          logger.warn(
            `The configured maximum alert limit exceeds the allowed threshold. Only ${ALLOWED_MAX_ALERTS} alerts are being returned. Please consider adjusting xpack.alerting.rules.run.alerts.max.`
          );
        }
        throw new Error(`Rule reported more than ${maxAlerts} alerts.`);
      }

      if (!alerts[id]) {
        alerts[id] = new Alert<State, Context>(id);
        const snoozeConfig = snoozedInstancesMap?.get(id);
        if (snoozeConfig) {
          alerts[id].setSnoozeConfig(snoozeConfig);
        }
      }

      return alerts[id];
    },
    get: (id: string): PublicAlert<State, Context, ActionGroupIds> | null => {
      return alerts[id] ? alerts[id] : null;
    },
    // namespace alert limit services for rule type executors to use
    alertLimit: {
      getValue: (): number => {
        hasRequestedAlertLimit = true;
        return maxAlerts;
      },
      setLimitReached: (reached: boolean) => {
        hasReportedLimitReached = true;
        hasReachedAlertLimit = reached;
      },
      checkLimitUsage: () => {
        // If the rule type has requested the value but never reported back, throw an error
        if (hasRequestedAlertLimit && !hasReportedLimitReached) {
          throw new Error(
            `Rule has not reported whether alert limit has been reached after requesting limit value!`
          );
        }
      },
    },
    hasReachedAlertLimit: (): boolean => hasReachedAlertLimit,
    done: (): AlertFactoryDoneUtils<State, Context, ActionGroupIds> => {
      isDone = true;
      return {
        getRecoveredAlerts: () => {
          if (!canSetRecoveryContext) {
            logger.debug(
              `Set doesSetRecoveryContext to true on rule type to get access to recovered alerts.`
            );
            return [];
          }
          if (!autoRecoverAlerts) {
            logger.debug(
              `Set autoRecoverAlerts to true on rule type to get access to recovered alerts.`
            );
            return [];
          }

          const { recoveredAlerts } = processAlerts<State, Context, ActionGroupIds, ActionGroupIds>(
            {
              alerts,
              existingAlerts: originalAlerts,
              hasReachedAlertLimit,
              alertLimit: maxAlerts,
              autoRecoverAlerts,
            }
          );
          return Object.keys(recoveredAlerts ?? {}).map(
            (alertId: string) => recoveredAlerts[alertId]
          );
        },
      };
    },
  };
}

export function getPublicAlertFactory<
  State extends AlertInstanceState = AlertInstanceState,
  Context extends AlertInstanceContext = AlertInstanceContext,
  ActionGroupIds extends string = string
>(
  alertFactory: AlertFactory<State, Context, ActionGroupIds>
): PublicAlertFactory<State, Context, ActionGroupIds> {
  return {
    create: (...args): PublicAlert<State, Context, ActionGroupIds> => alertFactory.create(...args),
    alertLimit: {
      getValue: (): number => alertFactory.alertLimit.getValue(),
      setLimitReached: (...args): void => alertFactory.alertLimit.setLimitReached(...args),
    },
    done: (): AlertFactoryDoneUtils<State, Context, ActionGroupIds> => alertFactory.done(),
  };
}
