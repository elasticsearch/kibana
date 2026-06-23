/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { ApiKeyType } from '../task_runner/types';
import type { RawAlertInstance } from '../../common';
import type { AlertingConfig } from '../config';

interface Resolvable<T> {
  resolve: (arg: T) => void;
}

/**
 * Creates a promise which can be resolved externally, useful for
 * coordinating async tests.
 */
export function resolvable<T>(): Promise<T> & Resolvable<T> {
  let resolve: (arg: T) => void;
  return Object.assign(new Promise<T>((r) => (resolve = r)), {
    resolve(arg: T) {
      return setTimeout(() => resolve(arg), 0);
    },
  });
}

// Used to convert a raw Rule's UUID to something that can be used
// to compare with a jest snapshot.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function alertWithAnyUUID(rawAlert: Record<string, any>): Record<string, any> {
  if (!rawAlert?.meta?.uuid) return rawAlert;

  const newAlert = JSON.parse(JSON.stringify(rawAlert));
  newAlert.meta.uuid = expect.any(String);
  return newAlert;
}

export function alertsWithAnyUUID(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rawAlerts: Record<string, any>
): Record<string, RawAlertInstance> {
  const newAlerts: Record<string, RawAlertInstance> = {};
  for (const id of Object.keys(rawAlerts)) {
    newAlerts[id] = alertWithAnyUUID(rawAlerts[id]);
  }
  return newAlerts;
}

export function generateAlertingConfig(overwrites: Partial<AlertingConfig> = {}): AlertingConfig {
  return {
    healthCheck: {
      interval: '5m',
    },
    enableFrameworkAlerts: false,
    alertsService: {
      totalFieldsLimit: 2800,
    },
    ruleChangeTracking: {
      enabled: false,
      scope: ['security'],
    },
    invalidateApiKeysTask: {
      interval: '5m',
      removalDelay: '1h',
    },
    cancelAlertsOnRuleTimeout: true,
    rules: {
      maxScheduledPerMinute: 10000,
      minimumScheduleInterval: { value: '1m', enforce: false },
      run: {
        actions: {
          max: 1000,
        },
        alerts: {
          max: 1000,
        },
      },
      apiKeyType: ApiKeyType.ES,
    },
    rulesSettings: { enabled: true, cacheInterval: 60000 },
    ...overwrites,
  };
}
