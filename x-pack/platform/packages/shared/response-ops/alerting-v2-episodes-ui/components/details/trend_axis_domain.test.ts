/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { computeTrendAxisDomain } from './trend_axis_domain';
import type { TrendPoint, TrendThreshold } from './trend_types';

const points = (ys: Array<number | null>): TrendPoint[] => ys.map((y, i) => ({ x: i, y }));

describe('computeTrendAxisDomain', () => {
  it('returns undefined for no points and no thresholds', () => {
    expect(computeTrendAxisDomain([], [])).toBeUndefined();
  });

  it('returns undefined for all-null points and no thresholds', () => {
    expect(computeTrendAxisDomain(points([null, null]), [])).toBeUndefined();
  });

  it('expands the domain max to cover a threshold above the data range', () => {
    const thresholds: TrendThreshold[] = [
      { id: 't1', metric: 'count', label: 'count > 100', values: [100] },
    ];
    // Values: [10, 20, 100] -> range 90, pad 9. paddedMin = 1 (>= 0, not clamped).
    expect(computeTrendAxisDomain(points([10, 20]), thresholds)).toEqual({ min: 1, max: 109 });
  });

  it('expands the domain min to cover a threshold below the data range', () => {
    const thresholds: TrendThreshold[] = [
      { id: 't1', metric: 'lat', label: 'lat < -50', values: [-50] },
    ];
    // Values: [10, 20, -50] -> range 70, pad 7. Min is negative so no clamping.
    expect(computeTrendAxisDomain(points([10, 20]), thresholds)).toEqual({ min: -57, max: 27 });
  });

  it('includes both bounds of a BETWEEN threshold', () => {
    const thresholds: TrendThreshold[] = [
      { id: 't1', metric: 'count', label: 'count between 50 and 200', values: [50, 200] },
    ];
    // Values: [10, 50, 200] -> range 190, pad 19. paddedMin -9 -> clamped to 0.
    expect(computeTrendAxisDomain(points([10]), thresholds)).toEqual({ min: 0, max: 219 });
  });

  it('pads a flat single-value domain so it is not zero-width', () => {
    // Single value 50, range 0 -> pad = |50| * 0.1 = 5.
    expect(computeTrendAxisDomain(points([50]), [])).toEqual({ min: 45, max: 55 });
  });

  it('falls back to a unit pad when the only value is zero', () => {
    // Value 0, range 0, |0| * 0.1 = 0 -> fallback pad of 1. Min clamped to 0.
    expect(computeTrendAxisDomain(points([0]), [])).toEqual({ min: 0, max: 1 });
  });

  it('clamps paddedMin to zero for non-negative data', () => {
    // Values: [1, 2] -> range 1, pad 0.1. paddedMin = 0.9 -> NOT clamped (>= 0).
    const result = computeTrendAxisDomain(points([1, 2]), []);
    expect(result?.min).toBeGreaterThanOrEqual(0);
  });
});
