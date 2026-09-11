/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  StatusRuleCondition,
  TimeWindow,
} from '@kbn/response-ops-rule-params/synthetics_monitor_status';
import { isEmpty } from 'lodash';

export const DEFAULT_PENDING_THRESHOLD = 2;
export const MIN_PENDING_THRESHOLD = 1;
export const MAX_PENDING_THRESHOLD = 100;
export const DEFAULT_DOWN_THRESHOLD = 3;
export const DEFAULT_LOCATIONS_THRESHOLD = 1;

export const getConditionType = (condition?: StatusRuleCondition) => {
  let numberOfChecks = 1;
  let timeWindow: TimeWindow = { unit: 'm', size: 1 };
  if (isEmpty(condition) || !condition?.window) {
    return {
      isLocationBased: false,
      useTimeWindow: false,
      timeWindow,
      useLatestChecks: true,
      numberOfChecks,
      downThreshold: 1,
      locationsThreshold: 1,
      pendingThreshold: condition?.pendingThreshold ?? DEFAULT_PENDING_THRESHOLD,
      isDefaultRule: true,
    };
  }
  const useTimeWindow = condition.window && 'time' in condition.window;
  const useLatestChecks = condition.window && 'numberOfChecks' in condition.window;

  if (useLatestChecks) {
    numberOfChecks =
      condition && 'numberOfChecks' in condition.window ? condition.window.numberOfChecks : 1;
  }

  if (useTimeWindow) {
    timeWindow = condition.window.time;
    numberOfChecks = condition?.downThreshold ?? 1;
  }

  return {
    useTimeWindow,
    timeWindow,
    useLatestChecks,
    numberOfChecks,
    locationsThreshold: condition?.locationsThreshold ?? 1,
    downThreshold: condition?.downThreshold ?? 1,
    pendingThreshold: condition?.pendingThreshold ?? DEFAULT_PENDING_THRESHOLD,
    isDefaultRule: isEmpty(condition),
  };
};
