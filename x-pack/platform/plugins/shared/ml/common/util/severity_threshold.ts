/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { ML_ANOMALY_THRESHOLD } from '@kbn/ml-anomaly-utils';
import type { SeverityThreshold } from '@kbn/ml-server-schemas/embeddables/anomaly_charts';

/**
 * Returns the human-readable score range for a given severity threshold value,
 * e.g. 75 → "75-100". Placed in common so UI code that only needs this pure
 * helper doesn't transitively pull in the full SelectSeverity component tree.
 */
export const getSeverityRangeDisplay = (val: number): string => {
  switch (val) {
    case ML_ANOMALY_THRESHOLD.CRITICAL:
      return '75-100';
    case ML_ANOMALY_THRESHOLD.MAJOR:
      return '50-75';
    case ML_ANOMALY_THRESHOLD.MINOR:
      return '25-50';
    case ML_ANOMALY_THRESHOLD.WARNING:
      return '3-25';
    case ML_ANOMALY_THRESHOLD.LOW:
      return '0-3';
    default:
      return val.toString();
  }
};

/**
 * Returns the upper bound of a severity threshold, or `undefined` for the
 * open-ended `critical` band. `SeverityThreshold` is a discriminated union whose
 * `critical` member carries no `max`, so the bound must be read through an `in`
 * guard rather than a direct property access.
 */
export const getSeverityThresholdMax = (threshold: SeverityThreshold): number | undefined =>
  'max' in threshold ? threshold.max : undefined;

/**
 * Utility function to resolve severity format from old to new format
 * @param value - The severity value which could be in old (number) or new (array) format
 * @returns Resolved severity value in the new format (array)
 */
export const resolveSeverityFormat = (value: number | SeverityThreshold[]): SeverityThreshold[] => {
  // Check if this is the old format (single number instead of array)
  if (typeof value === 'number') {
    // Convert old single number format to new array format
    // Create thresholds for all severity levels >= the provided value
    const thresholds: SeverityThreshold[] = [];

    // Add thresholds based on the ML_ANOMALY_THRESHOLD constants
    if (value <= ML_ANOMALY_THRESHOLD.LOW) {
      thresholds.push({ min: ML_ANOMALY_THRESHOLD.LOW, max: ML_ANOMALY_THRESHOLD.WARNING });
    }

    if (value <= ML_ANOMALY_THRESHOLD.WARNING) {
      thresholds.push({ min: ML_ANOMALY_THRESHOLD.WARNING, max: ML_ANOMALY_THRESHOLD.MINOR });
    }

    if (value <= ML_ANOMALY_THRESHOLD.MINOR) {
      thresholds.push({ min: ML_ANOMALY_THRESHOLD.MINOR, max: ML_ANOMALY_THRESHOLD.MAJOR });
    }

    if (value <= ML_ANOMALY_THRESHOLD.MAJOR) {
      thresholds.push({ min: ML_ANOMALY_THRESHOLD.MAJOR, max: ML_ANOMALY_THRESHOLD.CRITICAL });
    }

    if (value <= ML_ANOMALY_THRESHOLD.CRITICAL) {
      thresholds.push({ min: ML_ANOMALY_THRESHOLD.CRITICAL });
    }

    return thresholds;
  }

  // Already in new format
  return value;
};
