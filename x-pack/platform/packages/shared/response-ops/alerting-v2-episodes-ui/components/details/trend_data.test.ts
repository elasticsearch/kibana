/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { Comparator } from '@kbn/alerting-v2-rule-form';
import { i18n } from '@kbn/i18n';
import type { EpisodeTrendRow } from '../../queries/episode_trend_query';
import { mapEventDataToSeries, deriveTrendThresholds } from './trend_data';

jest.mock('@kbn/i18n', () => ({
  i18n: {
    translate: jest.fn(
      (
        id: string,
        {
          defaultMessage,
          values = {},
        }: { defaultMessage: string; values?: Record<string, number | string> }
      ) =>
        Object.entries(values).reduce(
          (message, [key, value]) => message.replace(`{${key}}`, String(value)),
          defaultMessage
        )
    ),
  },
}));

const mockTranslate = jest.mocked(i18n.translate);

describe('mapEventDataToSeries', () => {
  it('builds one series per label, reading values from each event metrics', () => {
    const rows = [
      { '@timestamp': '2026-06-18T00:00:00.000Z', metrics: { count: 10, error_rate: 1.5 } },
      { '@timestamp': '2026-06-18T01:00:00.000Z', metrics: { count: 20, error_rate: 2.5 } },
    ];
    const series = mapEventDataToSeries(rows, ['count', 'error_rate']);
    expect(series).toHaveLength(2);
    const count = series.find((s) => s.label === 'count')!;
    expect(count.points).toEqual([
      { x: Date.parse('2026-06-18T00:00:00.000Z'), y: 10 },
      { x: Date.parse('2026-06-18T01:00:00.000Z'), y: 20 },
    ]);
  });

  it('yields a null point when the event has no value for the label (e.g. empty data)', () => {
    const rows: Array<Pick<EpisodeTrendRow, '@timestamp' | 'metrics'>> = [
      { '@timestamp': '2026-06-18T00:00:00.000Z', metrics: { count: 10 } },
      { '@timestamp': '2026-06-18T01:00:00.000Z', metrics: { count: null } },
      { '@timestamp': '2026-06-18T02:00:00.000Z', metrics: {} },
    ];
    const [count] = mapEventDataToSeries(rows, ['count']);
    expect(count.points).toEqual([
      { x: Date.parse('2026-06-18T00:00:00.000Z'), y: 10 },
      { x: Date.parse('2026-06-18T01:00:00.000Z'), y: null },
      { x: Date.parse('2026-06-18T02:00:00.000Z'), y: null },
    ]);
  });

  it('skips rows with unparseable timestamps', () => {
    const rows = [
      { '@timestamp': 'not-a-date', metrics: { count: 10 } },
      { '@timestamp': '2026-06-18T01:00:00.000Z', metrics: { count: 20 } },
    ];
    const [count] = mapEventDataToSeries(rows, ['count']);
    expect(count.points).toEqual([{ x: Date.parse('2026-06-18T01:00:00.000Z'), y: 20 }]);
  });
});

describe('deriveTrendThresholds', () => {
  beforeEach(() => {
    mockTranslate.mockClear();
  });

  it('builds a single-value labelled threshold for comparison operators', () => {
    const result = deriveTrendThresholds([
      { id: 'c1', metric: 'count', comparator: Comparator.GT, threshold: [100] },
    ]);
    expect(result).toEqual([{ id: 'c1', metric: 'count', label: 'count > 100', values: [100] }]);
    expect(mockTranslate).toHaveBeenCalledWith(
      'xpack.alertingV2EpisodesUi.details.trendChart.thresholdComparatorLabel',
      {
        defaultMessage: '{metric} {comparator} {threshold}',
        values: { metric: 'count', comparator: Comparator.GT, threshold: 100 },
      }
    );
  });

  it('builds individual threshold labels for BETWEEN bounds', () => {
    const result = deriveTrendThresholds([
      { id: 'c1', metric: 'lat', comparator: Comparator.BETWEEN, threshold: [10, 20] },
    ]);
    expect(result).toEqual([
      { id: 'c1-gte', metric: 'lat', label: 'lat >= 10', values: [10] },
      { id: 'c1-lte', metric: 'lat', label: 'lat <= 20', values: [20] },
    ]);
    expect(mockTranslate).toHaveBeenNthCalledWith(
      1,
      'xpack.alertingV2EpisodesUi.details.trendChart.thresholdComparatorLabel',
      {
        defaultMessage: '{metric} {comparator} {threshold}',
        values: { metric: 'lat', comparator: Comparator.GTE, threshold: 10 },
      }
    );
    expect(mockTranslate).toHaveBeenNthCalledWith(
      2,
      'xpack.alertingV2EpisodesUi.details.trendChart.thresholdComparatorLabel',
      {
        defaultMessage: '{metric} {comparator} {threshold}',
        values: { metric: 'lat', comparator: Comparator.LTE, threshold: 20 },
      }
    );
  });

  it('builds individual threshold labels for NOT_BETWEEN bounds', () => {
    const result = deriveTrendThresholds([
      { id: 'c2', metric: 'lat', comparator: Comparator.NOT_BETWEEN, threshold: [10, 20] },
    ]);
    expect(result).toEqual([
      { id: 'c2-lt', metric: 'lat', label: 'lat < 10', values: [10] },
      { id: 'c2-gt', metric: 'lat', label: 'lat > 20', values: [20] },
    ]);
    expect(mockTranslate).toHaveBeenNthCalledWith(
      1,
      'xpack.alertingV2EpisodesUi.details.trendChart.thresholdComparatorLabel',
      {
        defaultMessage: '{metric} {comparator} {threshold}',
        values: { metric: 'lat', comparator: Comparator.LT, threshold: 10 },
      }
    );
    expect(mockTranslate).toHaveBeenNthCalledWith(
      2,
      'xpack.alertingV2EpisodesUi.details.trendChart.thresholdComparatorLabel',
      {
        defaultMessage: '{metric} {comparator} {threshold}',
        values: { metric: 'lat', comparator: Comparator.GT, threshold: 20 },
      }
    );
  });

  it('skips conditions without a metric or threshold', () => {
    expect(
      deriveTrendThresholds([
        { id: 'c1', metric: '', comparator: Comparator.GT, threshold: [1] },
        { id: 'c2', metric: 'x', comparator: Comparator.GT, threshold: [] },
        { id: 'c3', metric: 'x', comparator: Comparator.BETWEEN, threshold: [1] },
      ])
    ).toEqual([]);
  });
});
