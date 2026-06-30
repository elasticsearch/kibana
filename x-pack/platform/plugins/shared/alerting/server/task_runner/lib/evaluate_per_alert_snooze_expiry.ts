/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { RawRuleSnoozedInstance } from '../../saved_objects/schemas/raw_rule';

export interface EvaluatePerAlertSnoozeExpiryResult {
  activeInstances: RawRuleSnoozedInstance[];
  expiredInstances: RawRuleSnoozedInstance[];
}

export const evaluatePerAlertSnoozeExpiry = (
  snoozedInstances: RawRuleSnoozedInstance[] | undefined,
  now: Date
): EvaluatePerAlertSnoozeExpiryResult => {
  const activeInstances: RawRuleSnoozedInstance[] = [];
  const expiredInstances: RawRuleSnoozedInstance[] = [];

  for (const instance of snoozedInstances ?? []) {
    const isExpired = instance.expiresAt != null && new Date(instance.expiresAt) <= now;
    if (isExpired) {
      expiredInstances.push(instance);
    } else {
      activeInstances.push(instance);
    }
  }

  return { activeInstances, expiredInstances };
};
