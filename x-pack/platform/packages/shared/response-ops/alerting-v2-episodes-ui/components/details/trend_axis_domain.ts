/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { TrendPoint, TrendThreshold } from './trend_types';

export interface TrendAxisDomain {
  min: number;
  max: number;
}

/** Fraction of the value range added as headroom so lines/markers are not flush with the edge. */
const PADDING_RATIO = 0.1;

/**
 * Computes the y-axis domain spanning the series data points and threshold lines, with a
 * small amount of padding so nothing is flush with the chart edge.
 *
 * `@elastic/charts` does not grow the domain to fit `LineAnnotation` (YDomain) values,
 * so a threshold outside the data range would otherwise be clipped.
 *
 * Returns `undefined` when there are no values at all — the chart then auto-fits.
 */
export const computeTrendAxisDomain = (
  points: TrendPoint[],
  thresholds: TrendThreshold[]
): TrendAxisDomain | undefined => {
  const values: number[] = [];

  for (const p of points) {
    if (p.y != null) values.push(p.y);
  }
  for (const t of thresholds) {
    values.push(...t.values);
  }

  if (values.length === 0) return undefined;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;
  const pad = range > 0 ? range * PADDING_RATIO : Math.abs(max) * PADDING_RATIO || 1;

  // Keep a zero baseline for non-negative data rather than padding below zero.
  const paddedMin = min - pad;
  return {
    min: min >= 0 && paddedMin < 0 ? 0 : paddedMin,
    max: max + pad,
  };
};
