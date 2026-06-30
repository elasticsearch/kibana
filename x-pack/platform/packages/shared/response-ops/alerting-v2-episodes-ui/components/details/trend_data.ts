/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { Comparator, type AlertCondition } from '@kbn/alerting-v2-rule-form';
import type { EpisodeTrendRow } from '../../queries/episode_trend_query';
import { getTrendChartThresholdComparatorLabel } from './translations';
import type { TrendSeries, TrendThreshold } from './trend_types';

/**
 * Pivots `.rule-events` rows into one {@link TrendSeries} per requested label,
 * reading each label's value from the event's evaluated metrics. Events without
 * a value for a label (e.g. status-only recovery events with empty data) yield a
 * `null` point, so the line breaks where the rule recorded no value.
 */
export const mapEventDataToSeries = (
  rows: Array<Pick<EpisodeTrendRow, '@timestamp' | 'metrics'>>,
  seriesLabels: string[]
): TrendSeries[] => {
  const points = rows
    .map((row) => ({ x: Date.parse(row['@timestamp']), metrics: row.metrics }))
    .filter(({ x }) => !Number.isNaN(x));

  return seriesLabels.map((label) => ({
    id: label,
    label,
    points: points.map(({ x, metrics }) => ({ x, y: metrics[label] ?? null })),
  }));
};

const singleThreshold = (
  id: string,
  metric: string,
  comparator: Comparator,
  threshold: number
): TrendThreshold => ({
  id,
  metric,
  label: getTrendChartThresholdComparatorLabel(metric, comparator, threshold),
  values: [threshold],
});

const deriveTrendThreshold = (condition: AlertCondition): TrendThreshold[] => {
  const { id, metric, comparator, threshold } = condition;

  if (comparator === Comparator.BETWEEN) {
    return [
      singleThreshold(`${id}-gte`, metric, Comparator.GTE, threshold[0]),
      singleThreshold(`${id}-lte`, metric, Comparator.LTE, threshold[1]),
    ];
  }

  if (comparator === Comparator.NOT_BETWEEN) {
    return [
      singleThreshold(`${id}-lt`, metric, Comparator.LT, threshold[0]),
      singleThreshold(`${id}-gt`, metric, Comparator.GT, threshold[1]),
    ];
  }

  return [singleThreshold(id, metric, comparator, threshold[0])];
};

const hasThresholdValues = ({ comparator, metric, threshold }: AlertCondition): boolean => {
  if (!metric) return false;
  if (comparator === Comparator.BETWEEN || comparator === Comparator.NOT_BETWEEN) {
    return threshold.length > 1;
  }
  return threshold.length > 0;
};

/** Converts parsed alert conditions into horizontal threshold lines. */
export const deriveTrendThresholds = (conditions: AlertCondition[]): TrendThreshold[] =>
  conditions.filter(hasThresholdValues).flatMap((c) => deriveTrendThreshold(c));
