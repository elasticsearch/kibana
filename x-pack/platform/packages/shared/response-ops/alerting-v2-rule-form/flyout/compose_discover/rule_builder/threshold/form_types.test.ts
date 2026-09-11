/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { AlertCondition, SeverityConfig } from './form_types';
import {
  Aggregation,
  areAllStatsValid,
  Comparator,
  compareSeverity,
  getSeverityValidationError,
  normalizeSeverityOrder,
  nextSeverityLevel,
  isMultiSeveritySupported,
  isSeveritySupported,
  isStatFieldValid,
  isStatLabelValid,
  nextStatLabel,
  reconcileAlertConditionMetrics,
  reconcileSeverity,
  shouldSyncConditionMetricOnLabelChange,
  syncConditionToSeverityThreshold,
  syncSeverityToConditionThreshold,
} from './form_types';

describe('nextStatLabel', () => {
  it('returns the base label when it is not already used', () => {
    expect(nextStatLabel([], Aggregation.COUNT)).toBe('count');
  });

  it('returns a suffixed label when the base label already exists', () => {
    expect(nextStatLabel(['count'], Aggregation.COUNT)).toBe('count_2');
    expect(nextStatLabel(['count', 'count_2'], Aggregation.COUNT)).toBe('count_3');
  });
});

describe('shouldSyncConditionMetricOnLabelChange', () => {
  it('returns false when multiple items share the old label', () => {
    expect(shouldSyncConditionMetricOnLabelChange(['count', 'count'], 1, 'count', 'errors')).toBe(
      false
    );
  });

  it('returns true when only the edited item owns the old label', () => {
    expect(shouldSyncConditionMetricOnLabelChange(['count', 'count_2'], 0, 'count', 'total')).toBe(
      true
    );
  });
});

describe('isStatLabelValid', () => {
  it('returns false when label is blank', () => {
    expect(isStatLabelValid({ id: '1', label: '  ', aggregation: Aggregation.COUNT })).toBe(false);
  });
});

describe('isStatFieldValid', () => {
  it('returns false when aggregation requires a field but none is set', () => {
    expect(isStatFieldValid({ id: '1', label: 'avg_val', aggregation: Aggregation.AVG })).toBe(
      false
    );
  });
});

describe('areAllStatsValid', () => {
  it('returns false when any stat has an invalid label', () => {
    expect(
      areAllStatsValid([
        { id: '1', label: 'count', aggregation: Aggregation.COUNT },
        { id: '2', label: '', aggregation: Aggregation.COUNT },
      ])
    ).toBe(false);
  });

  it('returns false when any stat is missing a required field', () => {
    expect(
      areAllStatsValid([
        { id: '1', label: 'count', aggregation: Aggregation.COUNT },
        { id: '2', label: 'avg_val', aggregation: Aggregation.AVG },
      ])
    ).toBe(false);
  });

  it('returns true only when every stat is valid', () => {
    expect(
      areAllStatsValid([
        { id: '1', label: 'count', aggregation: Aggregation.COUNT },
        { id: '2', label: 'errors', aggregation: Aggregation.COUNT },
      ])
    ).toBe(true);
  });
});

describe('reconcileAlertConditionMetrics', () => {
  it('restores the first available metric when the condition metric is missing', () => {
    const result = reconcileAlertConditionMetrics(
      [{ id: '1', metric: '', comparator: Comparator.GT, threshold: [100] }],
      [{ id: 's1', label: 'count', aggregation: Aggregation.COUNT }],
      []
    );

    expect(result[0].metric).toBe('count');
  });
});

describe('severity helpers', () => {
  const condition = (comparator: Comparator): AlertCondition => ({
    id: '1',
    metric: 'count',
    comparator,
    threshold: [100],
  });

  describe('isSeverityAvailable', () => {
    it('is true only for a single alert condition', () => {
      expect(isSeveritySupported([condition(Comparator.GT)])).toBe(true);
      expect(isSeveritySupported([condition(Comparator.GT), condition(Comparator.LT)])).toBe(false);
      expect(isSeveritySupported([])).toBe(false);
    });
  });

  describe('isMultiSeveritySupported', () => {
    it('is false for range comparators', () => {
      expect(isMultiSeveritySupported(Comparator.GT)).toBe(true);
      expect(isMultiSeveritySupported(Comparator.LTE)).toBe(true);
      expect(isMultiSeveritySupported(Comparator.BETWEEN)).toBe(false);
      expect(isMultiSeveritySupported(Comparator.NOT_BETWEEN)).toBe(false);
    });
  });

  describe('reconcileSeverity', () => {
    const severity = { mode: 'multi' as const, singleLevelSeverity: 'high' as const, levels: [] };

    it('clears severity for multiple conditions', () => {
      expect(
        reconcileSeverity(severity, [condition(Comparator.GT), condition(Comparator.LT)])
      ).toBeUndefined();
    });

    it('downgrades multi to single for range comparators', () => {
      expect(reconcileSeverity(severity, [condition(Comparator.BETWEEN)])).toEqual({
        ...severity,
        mode: 'single',
      });
    });

    it('keeps a valid multi config unchanged', () => {
      expect(reconcileSeverity(severity, [condition(Comparator.GT)])).toEqual(severity);
    });

    it('passes through undefined', () => {
      expect(reconcileSeverity(undefined, [condition(Comparator.GT)])).toBeUndefined();
    });
  });

  describe('threshold coupling', () => {
    const multi = (levels: SeverityConfig['levels']): SeverityConfig => ({
      mode: 'multi',
      singleLevelSeverity: 'high',
      levels,
    });

    describe('syncSeverityToConditionThreshold', () => {
      it('mirrors the condition threshold onto the lowest multi level', () => {
        const result = syncSeverityToConditionThreshold(
          multi([
            { id: 'l1', severity: 'low', threshold: 0.8 },
            { id: 'l2', severity: 'high', threshold: 0.95 },
          ]),
          0.6
        );
        expect(result?.levels[0].threshold).toBe(0.6);
        expect(result?.levels[1].threshold).toBe(0.95);
      });

      it('leaves single mode untouched', () => {
        const single: SeverityConfig = { mode: 'single', singleLevelSeverity: 'high', levels: [] };
        expect(syncSeverityToConditionThreshold(single, 0.6)).toBe(single);
      });

      it('is a no-op for undefined severity or threshold', () => {
        expect(syncSeverityToConditionThreshold(undefined, 0.6)).toBeUndefined();
        const config = multi([{ id: 'l1', severity: 'low', threshold: 0.8 }]);
        expect(syncSeverityToConditionThreshold(config, undefined)).toBe(config);
      });
    });

    describe('syncConditionToSeverityThreshold', () => {
      it('mirrors the lowest multi level onto the single condition', () => {
        const result = syncConditionToSeverityThreshold(
          [condition(Comparator.GT)],
          multi([
            { id: 'l1', severity: 'low', threshold: 0.6 },
            { id: 'l2', severity: 'high', threshold: 0.95 },
          ])
        );
        expect(result[0].threshold).toEqual([0.6]);
      });

      it('preserves an upper bound if present', () => {
        const result = syncConditionToSeverityThreshold(
          [{ id: '1', metric: 'm', comparator: Comparator.GT, threshold: [100, 200] }],
          multi([{ id: 'l1', severity: 'low', threshold: 50 }])
        );
        expect(result[0].threshold).toEqual([50, 200]);
      });

      it('is a no-op for multiple conditions or single-mode severity', () => {
        const conditions = [condition(Comparator.GT), condition(Comparator.LT)];
        expect(syncConditionToSeverityThreshold(conditions, multi([]))).toBe(conditions);
        const single = [condition(Comparator.GT)];
        expect(
          syncConditionToSeverityThreshold(single, {
            mode: 'single',
            singleLevelSeverity: 'high',
            levels: [],
          })
        ).toBe(single);
      });
    });
  });

  describe('compareSeverity', () => {
    it('orders by ascending severity', () => {
      expect(compareSeverity('low', 'high')).toBeLessThan(0);
      expect(compareSeverity('critical', 'info')).toBeGreaterThan(0);
      expect(compareSeverity('medium', 'medium')).toBe(0);
    });
  });

  describe('normalizeSeverityOrder', () => {
    it('sorts multi levels least-to-most severe (keeps each level threshold)', () => {
      const result = normalizeSeverityOrder({
        mode: 'multi',
        singleLevelSeverity: 'high',
        levels: [
          { id: 'a', severity: 'critical', threshold: 0.95 },
          { id: 'b', severity: 'medium', threshold: 0.9 },
        ],
      });
      expect(result?.levels.map((l) => [l.severity, l.threshold])).toEqual([
        ['medium', 0.9],
        ['critical', 0.95],
      ]);
    });

    it('leaves single mode and undefined untouched', () => {
      const single: SeverityConfig = { mode: 'single', singleLevelSeverity: 'high', levels: [] };
      expect(normalizeSeverityOrder(single)).toBe(single);
      expect(normalizeSeverityOrder(undefined)).toBeUndefined();
    });
  });

  describe('nextSeverityLevel', () => {
    it('returns the next unused level above the most severe one used', () => {
      expect(nextSeverityLevel([{ id: 'a', severity: 'low', threshold: 1 }])).toBe('medium');
      expect(
        nextSeverityLevel([
          { id: 'a', severity: 'low', threshold: 1 },
          { id: 'b', severity: 'medium', threshold: 2 },
        ])
      ).toBe('high');
    });

    it('fills a lower gap when nothing above the max is free', () => {
      expect(nextSeverityLevel([{ id: 'a', severity: 'critical', threshold: 1 }])).toBe('info');
      expect(
        nextSeverityLevel([
          { id: 'a', severity: 'medium', threshold: 1 },
          { id: 'b', severity: 'high', threshold: 2 },
          { id: 'c', severity: 'critical', threshold: 3 },
        ])
      ).toBe('info');
    });

    it('never repeats an already-used level', () => {
      const levels = [
        { id: 'a', severity: 'info' as const, threshold: 1 },
        { id: 'b', severity: 'low' as const, threshold: 2 },
        { id: 'c', severity: 'high' as const, threshold: 3 },
        { id: 'd', severity: 'critical' as const, threshold: 4 },
      ];
      // Only `medium` is free.
      expect(nextSeverityLevel(levels)).toBe('medium');
    });

    it('falls back to the lowest level when there are none', () => {
      expect(nextSeverityLevel([])).toBe('info');
    });
  });

  describe('getSeverityValidationError', () => {
    const multi = (levels: SeverityConfig['levels']): SeverityConfig => ({
      mode: 'multi',
      singleLevelSeverity: 'high',
      levels,
    });

    it('accepts disabled and single-mode severity', () => {
      expect(getSeverityValidationError(undefined, Comparator.GT)).toBeNull();
      expect(
        getSeverityValidationError(
          { mode: 'single', singleLevelSeverity: 'high', levels: [] },
          Comparator.LT
        )
      ).toBeNull();
    });

    it('accepts ascending thresholds for a > comparator', () => {
      expect(
        getSeverityValidationError(
          multi([
            { id: 'a', severity: 'low', threshold: 0.8 },
            { id: 'b', severity: 'medium', threshold: 0.9 },
            { id: 'c', severity: 'high', threshold: 0.95 },
          ]),
          Comparator.GT
        )
      ).toBeNull();
    });

    it('accepts descending thresholds for a < comparator', () => {
      expect(
        getSeverityValidationError(
          multi([
            { id: 'a', severity: 'low', threshold: 500 },
            { id: 'b', severity: 'medium', threshold: 300 },
            { id: 'c', severity: 'high', threshold: 100 },
          ]),
          Comparator.LT
        )
      ).toBeNull();
    });

    it('flags empty levels and non-finite thresholds', () => {
      expect(getSeverityValidationError(multi([]), Comparator.GT)).toBe('invalid_threshold');
      expect(
        getSeverityValidationError(
          multi([{ id: 'a', severity: 'low', threshold: NaN }]),
          Comparator.GT
        )
      ).toBe('invalid_threshold');
    });

    it('flags duplicate severity levels', () => {
      expect(
        getSeverityValidationError(
          multi([
            { id: 'a', severity: 'low', threshold: 1 },
            { id: 'b', severity: 'low', threshold: 2 },
          ]),
          Comparator.GT
        )
      ).toBe('duplicate_level');
    });

    it('flags duplicate thresholds', () => {
      expect(
        getSeverityValidationError(
          multi([
            { id: 'a', severity: 'low', threshold: 1 },
            { id: 'b', severity: 'high', threshold: 1 },
          ]),
          Comparator.GT
        )
      ).toBe('duplicate_threshold');
    });

    it('flags thresholds not ordered by severity (ascending)', () => {
      expect(
        getSeverityValidationError(
          multi([
            { id: 'a', severity: 'low', threshold: 0.9 },
            { id: 'b', severity: 'high', threshold: 0.8 },
          ]),
          Comparator.GT
        )
      ).toBe('threshold_order');
    });

    it('flags thresholds not ordered by severity (descending)', () => {
      expect(
        getSeverityValidationError(
          multi([
            { id: 'a', severity: 'low', threshold: 100 },
            { id: 'b', severity: 'high', threshold: 300 },
          ]),
          Comparator.LT
        )
      ).toBe('threshold_order');
    });
  });
});
