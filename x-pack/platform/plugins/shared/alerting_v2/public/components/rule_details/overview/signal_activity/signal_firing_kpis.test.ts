/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { deriveSignalFiringKpis } from './signal_firing_kpis';
import type { SignalFiringBucket } from '../../../../hooks/use_fetch_signal_firings';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

const buckets = (...counts: number[]): SignalFiringBucket[] =>
  counts.map((count, i) => ({ timeMs: i * HOUR_MS, count }));

describe('deriveSignalFiringKpis', () => {
  it('sums all bucket counts for the total', () => {
    const kpis = deriveSignalFiringKpis(buckets(1, 2, 3, 4), 0, DAY_MS, '1h');
    expect(kpis.totalFirings).toBe(10);
  });

  it('reports the average per hour for fine-grained intervals', () => {
    // 24 firings over a 24h window → 1/hour.
    const kpis = deriveSignalFiringKpis([{ timeMs: 0, count: 24 }], 0, DAY_MS, '1h');
    expect(kpis.averageUnit).toBe('hour');
    expect(kpis.average).toBeCloseTo(1, 5);
  });

  it('reports the average per day for coarse intervals', () => {
    // 70 firings over a 7-day window → 10/day; a week uses the 6h interval.
    const kpis = deriveSignalFiringKpis([{ timeMs: 0, count: 70 }], 0, 7 * DAY_MS, '6h');
    expect(kpis.averageUnit).toBe('day');
    expect(kpis.average).toBeCloseTo(10, 5);
  });

  it('uses per-minute window as per-hour unit too', () => {
    const kpis = deriveSignalFiringKpis([{ timeMs: 0, count: 30 }], 0, HOUR_MS, '1m');
    expect(kpis.averageUnit).toBe('hour');
    expect(kpis.average).toBeCloseTo(30, 5);
  });

  it('returns zeros for an empty bucket set', () => {
    const kpis = deriveSignalFiringKpis([], 0, DAY_MS, '1h');
    expect(kpis).toEqual({ totalFirings: 0, average: 0, averageUnit: 'hour' });
  });

  it('avoids dividing by a zero-width window', () => {
    const kpis = deriveSignalFiringKpis([{ timeMs: 0, count: 5 }], 100, 100, '1h');
    expect(kpis.average).toBe(0);
  });
});
