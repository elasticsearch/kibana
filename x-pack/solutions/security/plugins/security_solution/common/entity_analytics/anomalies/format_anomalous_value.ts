/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { formatSeconds, formatValueBasedOnFieldName } from './anomaly_display_utils';

const TEMPORAL_DETECTORS = new Set(['time_of_day', 'time_of_week']);

/**
 * Formats the anomalous value from a raw ML anomaly record for display.
 *
 * - `rare`: returns the by_field_value as-is (categorical string)
 * - `time_of_day` / `time_of_week`: formats seconds since midnight/week-start as "HH:mm" / "Day HH:mm"
 * - metric functions: applies field-aware units (bytes, duration, count suffix, etc.)
 */
export const formatAnomalousValue = (params: {
  detectorFunction: string;
  fieldName: string | null | undefined;
  actual: number[] | undefined;
  byFieldValue: string | undefined;
}): string => {
  const { detectorFunction, fieldName, actual, byFieldValue } = params;

  if (detectorFunction === 'rare') {
    return byFieldValue ?? '-';
  }

  if (TEMPORAL_DETECTORS.has(detectorFunction)) {
    const rawValue = actual?.[0];
    if (rawValue == null) return '-';
    return formatSeconds(String(rawValue), detectorFunction === 'time_of_week');
  }

  const rawValue = actual?.[0];
  if (rawValue == null) return '-';
  return formatValueBasedOnFieldName(detectorFunction, fieldName ?? null, rawValue);
};
