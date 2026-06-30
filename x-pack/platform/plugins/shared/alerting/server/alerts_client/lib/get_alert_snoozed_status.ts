/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { AlertRuleData } from '../types';

export function getAlertSnoozedStatus(alertInstanceId: string, ruleData?: AlertRuleData): boolean {
  if (!ruleData?.snoozedInstances?.length) {
    return false;
  }

  return ruleData.snoozedInstances.some((instance) => instance.instanceId === alertInstanceId);
}
