/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import chalk from 'chalk';
import type { ConfidenceInterval } from './diff/get_confidence_interval';
import type { MetricFormat, MetricSummary } from './types';

export function formatDuration(ms: number | undefined): string {
  if (ms == null) return '—';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const s = ms / 1000;
  const fixed = s % 1 === 0 ? s.toFixed(0) : s.toFixed(1);
  return `${fixed}s`;
}

export function formatNumber(value: number | undefined): string {
  if (value == null) return '—';
  const abs = Math.abs(value);

  // Determine unit (simple K/M/B scaling)
  let divisor = 1;
  let suffix = '';
  if (abs >= 1_000_000_000) {
    divisor = 1_000_000_000;
    suffix = 'B';
  } else if (abs >= 1_000_000) {
    divisor = 1_000_000;
    suffix = 'M';
  } else if (abs >= 1_000) {
    divisor = 1_000;
    suffix = 'K';
  }

  const scaled = value / divisor;

  let str: string;
  if (Math.abs(scaled) >= 1) {
    // two digit precision above 1, trim trailing zeros
    str = scaled.toFixed(2);
    str = str.replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
  } else {
    // show up to 3 decimals when between -1 and 1
    str = scaled.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
  }

  return str + suffix;
}

export function formatSize(bytes: number | undefined): string {
  if (bytes == null) return '—';
  if (bytes === 0) return '0 B';

  const sign = bytes < 0 ? '-' : '';
  const absBytes = Math.abs(bytes);

  if (absBytes < 1) {
    return `${bytes.toFixed(2)} B`;
  }

  const i = Math.floor(Math.log(absBytes) / Math.log(1024));
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  return `${sign}${(absBytes / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`;
}

export function formatPercentage(value: number | undefined): string {
  if (value == null) return '—';
  return `${value.toFixed(1)}%`;
}

export function formatMetric(format: MetricFormat, value: number | undefined) {
  switch (format) {
    default:
    case 'number':
      return formatNumber(value);
    case 'duration':
      return formatDuration(value);
    case 'percentage':
      return formatPercentage(value);
    case 'size':
      return formatSize(value);
  }
}

export function formatMetricSummary(format: MetricFormat, summary: MetricSummary | null) {
  if (!summary) {
    return '-';
  }
  const value = summary.avg;

  const leftStdDevPct = summary.avg && summary.stdDev ? (summary.stdDev / summary.avg) * 100 : 0;

  const formatted =
    value != null
      ? `${formatMetric(format, value)} ${chalk.dim(`±${leftStdDevPct.toFixed(1)}%`)}`
      : '—';

  return formatted;
}

export function formatDelta(
  format: MetricFormat,
  delta: { absolute: number; relative: number } | null,
  invert?: boolean
) {
  if (!delta) {
    return '-';
  }

  const { absolute, relative } = delta;

  const formattedDiff = formatMetric(format, absolute);

  if (!Number.isFinite(relative)) {
    return `${formattedDiff} ${chalk.dim('(n/a)')}`;
  }

  const pctSign = relative >= 0 ? '+' : '';
  const pctString = `(${pctSign}${(relative * 100).toFixed(1)}%)`;

  if (absolute === 0) {
    return `${formattedDiff} ${chalk.dim(pctString)}`;
  }

  const improved = invert ? absolute > 0 : absolute < 0;
  const color = improved ? chalk.green : chalk.red;

  return color(`${formattedDiff} ${chalk.bold(pctString)}`);
}

export function formatConfidence(ci: ConfidenceInterval | null) {
  if (!ci) return '—';
  const { range, runUntil } = ci;
  const low = range.min;
  const high = range.max;

  // If we don't have a range, show dash
  if (!isFinite(low) || !isFinite(high)) return '—';

  // If CI spans 0, prefer a run count suggestion when available
  if (low <= 0 && high >= 0) {
    const count = runUntil?.count ?? 0;
    if (count > 0) {
      return `Run ${count} more ${count === 1 ? 'time' : 'times'}`;
    }
    return '-';
  }

  const lowStr = `${low >= 0 ? '+' : ''}${low.toFixed(1)}%`;
  const highStr = `${high >= 0 ? '+' : ''}${high.toFixed(1)}%`;
  return `95%, ${lowStr}–${highStr}`;
}
