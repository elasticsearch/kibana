/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { SignalFiringBucket } from '../../../../hooks/use_fetch_signal_firings';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export type FiringRateUnit = 'hour' | 'day';

export interface SignalFiringKpis {
  totalFirings: number;
  /** Average firings per `averageUnit` over the window. */
  average: number;
  averageUnit: FiringRateUnit;
}

/**
 * Derives the signal overview KPIs from the bucketed histogram. The average's
 * unit tracks the chart's bucket interval so the KPI and bars tell one story:
 * fine windows report per-hour, week+ windows report per-day.
 */
export const deriveSignalFiringKpis = (
  buckets: SignalFiringBucket[],
  gteMs: number,
  lteMs: number,
  interval: string
): SignalFiringKpis => {
  const totalFirings = buckets.reduce((sum, bucket) => sum + bucket.count, 0);
  const averageUnit: FiringRateUnit = interval === '1m' || interval === '1h' ? 'hour' : 'day';

  const windowMs = Math.max(lteMs - gteMs, 0);
  const unitMs = averageUnit === 'hour' ? HOUR_MS : DAY_MS;
  const units = windowMs / unitMs;
  const average = units > 0 ? totalFirings / units : 0;

  return { totalFirings, average, averageUnit };
};
