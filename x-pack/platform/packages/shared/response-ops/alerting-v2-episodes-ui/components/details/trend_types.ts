/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export interface TrendPoint {
  /** Epoch milliseconds for the bucket. */
  x: number;
  /** Stat/evaluation value for the bucket, or null when absent. */
  y: number | null;
}

export interface TrendSeries {
  id: string;
  label: string;
  points: TrendPoint[];
}

export interface TrendThreshold {
  id: string;
  /** Series label this threshold applies to. */
  metric: string;
  /** Human-readable label, e.g. "count > 100". */
  label: string;
  /** Y-axis values for this threshold annotation. */
  values: number[];
}

/** One selectable chart panel: a single metric line and all its threshold conditions. */
export interface TrendMetricGroup {
  /** The stat/eval label — used as the badge label and series id. */
  metricLabel: string;
  /** All threshold conditions referencing this metric. */
  thresholds: TrendThreshold[];
}
