/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { isColorDark } from '@elastic/eui';
import type { Datatable } from '@kbn/expressions-plugin/common';

/**
 * Coloring domain for the legacy metric. This is the single source of truth shared by the editor
 *  and the render-time coloring so the two can never diverge:
 *  - a single value is centered at 0: `[0, 2 * value]` (or `[2 * value, 0]` for negatives), matching
 *    the metric chart's single-value behavior.
 *  - a single `0` has no meaningful range, so we fall back to a fixed `[-50, 100]` domain that keeps
 *    the palette visible instead of collapsing to `[0, 0]`.
 *  - multiple rows span the actual min/max of the values, so every tile is colored relative to the others
 */
export const getLegacyMetricDataBounds = (
  metricId?: string,
  data?: Datatable
): { min: number; max: number } => {
  if (!data || !metricId || data.rows.length === 0) {
    return { min: -Infinity, max: Infinity };
  }

  const metricValues = data.rows.map((row) => row[metricId]);

  if (metricValues.length === 1) {
    const [value] = metricValues;
    if (value === 0) {
      return { min: -50, max: 100 };
    }
    return value < 0 ? { min: value * 2, max: 0 } : { min: 0, max: value * 2 };
  }

  const minMaxBounds = metricValues.reduce(
    (bounds, value) => ({
      min: Math.min(bounds.min, value),
      max: Math.max(bounds.max, value),
    }),
    { min: Infinity, max: -Infinity }
  );

  return minMaxBounds;
};

export const parseRgbString = (rgb: string) => {
  const groups = rgb.match(/rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*?(,\s*(\d+)\s*)?\)/) ?? [];
  if (!groups) {
    return null;
  }

  const red = parseFloat(groups[1]);
  const green = parseFloat(groups[2]);
  const blue = parseFloat(groups[3]);
  const opacity = groups[5] ? parseFloat(groups[5]) : undefined;

  return { red, green, blue, opacity };
};

export const shouldApplyColor = (color: string) => {
  const rgb = parseRgbString(color);
  const { opacity } = rgb ?? {};

  // if opacity === 0, it means there is no color to apply to the metric
  return !rgb || (rgb && opacity !== 0);
};

export const needsLightText = (bgColor: string = '') => {
  const rgb = parseRgbString(bgColor);
  if (!rgb) {
    return false;
  }

  const { red, green, blue, opacity } = rgb;
  return isColorDark(red, green, blue) && opacity !== 0;
};
