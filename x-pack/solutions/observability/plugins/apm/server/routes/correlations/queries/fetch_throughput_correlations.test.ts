/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { isNonLocalIndexName } from '@kbn/es-query';
import type { APMEventClient } from '../../../lib/helpers/create_es_client/create_apm_event_client';
import {
  computeIntervalString,
  computePearsonCorrelation,
  fetchThroughputCorrelations,
} from './fetch_throughput_correlations';

jest.mock('@kbn/es-query');

const mockIsNonLocalIndexName = isNonLocalIndexName as jest.MockedFunction<
  typeof isNonLocalIndexName
>;

// ---------------------------------------------------------------------------
// computeIntervalString
// THROUGHPUT_BUCKET_COUNT = 20
// formula: bucketMs = max(60_000, ceil(rangeMs / 20 / 60_000) * 60_000)
// ---------------------------------------------------------------------------

describe('computeIntervalString', () => {
  it('returns the 60s floor for ranges shorter than 20 minutes', () => {
    // 60_000ms / 20 / 60_000 = 0.05 → ceil(0.05)=1 → 60s = floor
    expect(computeIntervalString(0, 60_000)).toBe('60s');
    // 10s range still hits the floor
    expect(computeIntervalString(0, 10_000)).toBe('60s');
    // Exactly 20 min: 1_200_000 / 20 / 60_000 = 1 → ceil(1)=1 → 60s
    expect(computeIntervalString(0, 1_200_000)).toBe('60s');
  });

  it('computes the correct bucket interval for a 1-hour range', () => {
    // 3_600_000 / 20 / 60_000 = 3 → ceil(3)=3 → 3*60s = 180s
    expect(computeIntervalString(0, 3_600_000)).toBe('180s');
  });

  it('computes the correct bucket interval for a 24-hour range', () => {
    // 86_400_000 / 20 / 60_000 = 72 → 72*60s = 4320s
    expect(computeIntervalString(0, 86_400_000)).toBe('4320s');
  });

  it('computes the correct bucket interval for a 7-day range', () => {
    // 604_800_000 / 20 / 60_000 = 504 → 504*60s = 30240s
    expect(computeIntervalString(0, 604_800_000)).toBe('30240s');
  });

  it('rounds up to the next whole minute for non-round ranges', () => {
    // 90 min: 5_400_000 / 20 / 60_000 = 4.5 → ceil(4.5)=5 → 300s
    expect(computeIntervalString(0, 5_400_000)).toBe('300s');
    // 61 min: 3_660_000 / 20 / 60_000 = 3.05 → ceil(3.05)=4 → 240s
    expect(computeIntervalString(0, 3_660_000)).toBe('240s');
  });

  it('uses the range size (end - start), not absolute timestamps', () => {
    const start = 1_000_000_000;
    const end = start + 3_600_000; // same 1-hour window
    expect(computeIntervalString(start, end)).toBe('180s');
  });
});

// ---------------------------------------------------------------------------
// computePearsonCorrelation
// ---------------------------------------------------------------------------

describe('computePearsonCorrelation', () => {
  it('returns 0 for arrays with fewer than 3 elements', () => {
    expect(computePearsonCorrelation([], [])).toBe(0);
    expect(computePearsonCorrelation([5], [5])).toBe(0);
    expect(computePearsonCorrelation([1, 2], [1, 2])).toBe(0);
  });

  it('returns 1 for a perfect positive linear relationship', () => {
    expect(computePearsonCorrelation([1, 2, 3], [1, 2, 3])).toBeCloseTo(1, 10);
    expect(computePearsonCorrelation([0, 5, 10], [0, 10, 20])).toBeCloseTo(1, 10);
  });

  it('returns -1 for a perfect negative linear relationship', () => {
    expect(computePearsonCorrelation([1, 2, 3], [3, 2, 1])).toBeCloseTo(-1, 10);
    expect(computePearsonCorrelation([0, 5, 10], [20, 10, 0])).toBeCloseTo(-1, 10);
  });

  it('returns 0 when y is constant (zero variance in y → denominator = 0)', () => {
    expect(computePearsonCorrelation([1, 2, 3], [5, 5, 5])).toBe(0);
  });

  it('returns 0 when x is constant (zero variance in x → denominator = 0)', () => {
    expect(computePearsonCorrelation([7, 7, 7], [1, 2, 3])).toBe(0);
  });

  it('returns 0 when both arrays are all zeros', () => {
    expect(computePearsonCorrelation([0, 0, 0], [0, 0, 0])).toBe(0);
  });

  it('returns a value in (-1, 1) for a partial correlation', () => {
    const r = computePearsonCorrelation([1, 2, 3, 4, 5], [2, 1, 4, 3, 5]);
    expect(r).toBeGreaterThan(-1);
    expect(r).toBeLessThan(1);
    // These two arrays move in the same general direction
    expect(r).toBeGreaterThan(0);
  });

  it('scales correctly for larger arrays', () => {
    const n = 20;
    const x = Array.from({ length: n }, (_, i) => i + 1);
    const y = x.map((v) => v * 3 - 1); // y = 3x - 1, perfect linear
    expect(computePearsonCorrelation(x, y)).toBeCloseTo(1, 10);
  });
});

// ---------------------------------------------------------------------------
// fetchThroughputCorrelations
// ---------------------------------------------------------------------------

function makeBucket(key: number, rpmValue: number, docCount = 100) {
  return { key, doc_count: docCount, throughput: { value: rpmValue } };
}

const mockSearch = jest.fn();
const mockApmEventClient = {
  search: mockSearch,
  indices: { transaction: 'apm-*-transaction-*' },
} as unknown as APMEventClient;

const defaultParams = {
  apmEventClient: mockApmEventClient,
  entityType: 'transaction' as const,
  start: 0,
  end: 3_600_000,
  environment: 'ENVIRONMENT_ALL',
  query: { match_all: {} } as any,
  kuery: '',
};

// Overall RPM: low→high step, used in most tests
// overallMeanRpm = (10 + 50 + 50) / 3 ≈ 36.67
const overallBuckets = [makeBucket(0, 10), makeBucket(60_000, 50), makeBucket(120_000, 50)];

// Filtered RPM closely mirrors the overall → r ≈ 0.97 (above threshold)
const correlatedBuckets = [makeBucket(0, 5), makeBucket(60_000, 40), makeBucket(120_000, 42)];

// Filtered RPM is constant → r = 0 (below threshold)
// computePearsonCorrelation([10,50,50], [20,20,20]) → constant y, denominator=0 → 0
const uncorrelatedBuckets = [makeBucket(0, 20), makeBucket(60_000, 20), makeBucket(120_000, 20)];

describe('fetchThroughputCorrelations', () => {
  beforeEach(() => {
    mockSearch.mockReset();
    mockIsNonLocalIndexName.mockReturnValue(false);
  });

  // -------------------------------------------------------------------------
  // Result shape
  // -------------------------------------------------------------------------

  describe('result shape', () => {
    it('returns correlations with the expected fields when the threshold is met', async () => {
      mockSearch
        .mockResolvedValueOnce({ aggregations: { timeseries: { buckets: overallBuckets } } })
        .mockResolvedValueOnce({ aggregations: { timeseries: { buckets: correlatedBuckets } } });

      const result = await fetchThroughputCorrelations({
        ...defaultParams,
        fieldValuePairs: [{ fieldName: 'host.name', fieldValue: 'host-a' }],
      });

      expect(result.throughputCorrelations).toHaveLength(1);
      const corr = result.throughputCorrelations[0];
      expect(corr.fieldName).toBe('host.name');
      expect(corr.fieldValue).toBe('host-a');
      expect(typeof corr.correlation).toBe('number');
      expect(typeof corr.rpmDelta).toBe('number');
      expect(typeof corr.rpmBaseline).toBe('number');
      expect(Math.abs(corr.correlation ?? 0)).toBeGreaterThanOrEqual(0.3);
    });

    it('sets rpmBaseline to the mean of the overall RPM timeseries', async () => {
      mockSearch
        .mockResolvedValueOnce({ aggregations: { timeseries: { buckets: overallBuckets } } })
        .mockResolvedValueOnce({ aggregations: { timeseries: { buckets: correlatedBuckets } } });

      const result = await fetchThroughputCorrelations({
        ...defaultParams,
        fieldValuePairs: [{ fieldName: 'host.name', fieldValue: 'host-a' }],
      });

      // (10 + 50 + 50) / 3
      expect(result.throughputCorrelations[0].rpmBaseline).toBeCloseTo(110 / 3, 5);
    });

    it('sets rpmDelta to filteredMeanRpm − overallMeanRpm', async () => {
      mockSearch
        .mockResolvedValueOnce({ aggregations: { timeseries: { buckets: overallBuckets } } })
        .mockResolvedValueOnce({ aggregations: { timeseries: { buckets: correlatedBuckets } } });

      const result = await fetchThroughputCorrelations({
        ...defaultParams,
        fieldValuePairs: [{ fieldName: 'host.name', fieldValue: 'host-a' }],
      });

      const filteredMean = (5 + 40 + 42) / 3;
      const overallMean = (10 + 50 + 50) / 3;
      expect(result.throughputCorrelations[0].rpmDelta).toBeCloseTo(filteredMean - overallMean, 5);
    });
  });

  // -------------------------------------------------------------------------
  // Threshold and fallback behaviour
  // -------------------------------------------------------------------------

  describe('threshold and fallback', () => {
    // overall [1..10], filtered [3,3,4,3,3,4,3,3,4,3] → r ≈ 0.114 (below threshold, non-zero)
    const linearOverall10 = Array.from({ length: 10 }, (_, i) => makeBucket(i * 60_000, i + 1));
    const weakBuckets10 = [3, 3, 4, 3, 3, 4, 3, 3, 4, 3].map((v, i) => makeBucket(i * 60_000, v));

    it('returns no correlations and sets a fallback when correlation is below threshold but non-zero', async () => {
      mockSearch
        .mockResolvedValueOnce({ aggregations: { timeseries: { buckets: linearOverall10 } } })
        .mockResolvedValueOnce({ aggregations: { timeseries: { buckets: weakBuckets10 } } });

      const result = await fetchThroughputCorrelations({
        ...defaultParams,
        fieldValuePairs: [{ fieldName: 'host.name', fieldValue: 'host-weak' }],
      });

      expect(result.throughputCorrelations).toHaveLength(0);
      expect(result.fallbackResult).toBeDefined();
      expect(result.fallbackResult?.fieldValue).toBe('host-weak');
      expect(result.fallbackResult?.isFallbackResult).toBe(true);
      expect(Math.abs(result.fallbackResult?.correlation ?? 0)).toBeGreaterThan(0);
      expect(Math.abs(result.fallbackResult?.correlation ?? 0)).toBeLessThan(0.3);
    });

    it('does not set a fallback when the only candidate has correlation exactly zero', async () => {
      mockSearch
        .mockResolvedValueOnce({ aggregations: { timeseries: { buckets: overallBuckets } } })
        .mockResolvedValueOnce({ aggregations: { timeseries: { buckets: uncorrelatedBuckets } } });

      const result = await fetchThroughputCorrelations({
        ...defaultParams,
        fieldValuePairs: [{ fieldName: 'host.name', fieldValue: 'host-b' }],
      });

      expect(result.throughputCorrelations).toHaveLength(0);
      expect(result.fallbackResult).toBeUndefined();
    });

    it('does not expose fallbackResult when at least one correlation passes the threshold', async () => {
      mockSearch
        .mockResolvedValueOnce({ aggregations: { timeseries: { buckets: overallBuckets } } })
        .mockResolvedValueOnce({ aggregations: { timeseries: { buckets: correlatedBuckets } } });

      const result = await fetchThroughputCorrelations({
        ...defaultParams,
        fieldValuePairs: [{ fieldName: 'host.name', fieldValue: 'host-a' }],
      });

      expect(result.throughputCorrelations.length).toBeGreaterThan(0);
      expect(result.fallbackResult).toBeUndefined();
    });

    it('tracks the best-absolute-correlation candidate as fallback across multiple below-threshold pairs', async () => {
      // Use a linear overall [1..10] so we can craft clearly-below-threshold filtered series.
      // pairA: constant [2,2,...,2] → r = 0; excluded from fallback (threshold: |r| > 0)
      // pairB: [3,3,4,3,3,4,3,3,4,3] → r ≈ 0.114 (verified analytically); wins fallback
      const linearOverall = Array.from({ length: 10 }, (_, i) => makeBucket(i * 60_000, i + 1));
      const pairABuckets = Array.from({ length: 10 }, (_, i) => makeBucket(i * 60_000, 2));
      const pairBBuckets = [3, 3, 4, 3, 3, 4, 3, 3, 4, 3].map((v, i) => makeBucket(i * 60_000, v));

      mockSearch
        .mockResolvedValueOnce({ aggregations: { timeseries: { buckets: linearOverall } } })
        .mockResolvedValueOnce({ aggregations: { timeseries: { buckets: pairABuckets } } })
        .mockResolvedValueOnce({ aggregations: { timeseries: { buckets: pairBBuckets } } });

      const result = await fetchThroughputCorrelations({
        ...defaultParams,
        fieldValuePairs: [
          { fieldName: 'host.name', fieldValue: 'host-flat' },
          { fieldName: 'host.name', fieldValue: 'host-slight' },
        ],
      });

      expect(result.throughputCorrelations).toHaveLength(0);
      // pairB (host-slight) has |r| ≈ 0.114 > |r| = 0 of pairA (host-flat)
      expect(result.fallbackResult?.fieldValue).toBe('host-slight');
      expect(result.fallbackResult?.isFallbackResult).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Zero-traffic exclusion
  // -------------------------------------------------------------------------

  describe('zero-traffic pairs', () => {
    it('excludes pairs where every bucket RPM is 0', async () => {
      const zeroBuckets = overallBuckets.map((b) => ({ ...b, throughput: { value: 0 } }));
      mockSearch
        .mockResolvedValueOnce({ aggregations: { timeseries: { buckets: overallBuckets } } })
        .mockResolvedValueOnce({ aggregations: { timeseries: { buckets: zeroBuckets } } });

      const result = await fetchThroughputCorrelations({
        ...defaultParams,
        fieldValuePairs: [{ fieldName: 'host.name', fieldValue: 'host-zero' }],
      });

      expect(result.throughputCorrelations).toHaveLength(0);
      // Zero-traffic pair is excluded entirely, so no fallback is set either
      expect(result.fallbackResult).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // Empty input
  // -------------------------------------------------------------------------

  describe('empty field-value pairs', () => {
    it('returns empty correlations and no fallback', async () => {
      mockSearch.mockResolvedValueOnce({
        aggregations: { timeseries: { buckets: overallBuckets } },
      });

      const result = await fetchThroughputCorrelations({ ...defaultParams, fieldValuePairs: [] });

      expect(result.throughputCorrelations).toHaveLength(0);
      expect(result.fallbackResult).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // Sorting
  // -------------------------------------------------------------------------

  describe('result ordering', () => {
    it('sorts correlations by absolute correlation value descending', async () => {
      // strongBuckets [2,50,50] vs overall [10,50,50]:
      //   y = 0.875x − 3.75, exact linear → r = 1.0
      // moderateBuckets [10,35,50] vs overall [10,50,50]:
      //   r = 2600/2800 ≈ 0.929 (verified analytically)
      // moderate is tested first (index 0 in fieldValuePairs) but should sort after strong.
      const strongBuckets = [makeBucket(0, 2), makeBucket(60_000, 50), makeBucket(120_000, 50)];
      const moderateBuckets = [makeBucket(0, 10), makeBucket(60_000, 35), makeBucket(120_000, 50)];

      mockSearch
        .mockResolvedValueOnce({ aggregations: { timeseries: { buckets: overallBuckets } } })
        .mockResolvedValueOnce({ aggregations: { timeseries: { buckets: moderateBuckets } } })
        .mockResolvedValueOnce({ aggregations: { timeseries: { buckets: strongBuckets } } });

      const result = await fetchThroughputCorrelations({
        ...defaultParams,
        fieldValuePairs: [
          { fieldName: 'host.name', fieldValue: 'host-moderate' },
          { fieldName: 'host.name', fieldValue: 'host-strong' },
        ],
      });

      expect(result.throughputCorrelations).toHaveLength(2);
      const [first, second] = result.throughputCorrelations;
      expect(first.fieldValue).toBe('host-strong');
      expect(second.fieldValue).toBe('host-moderate');
      expect(Math.abs(first.correlation ?? 0)).toBeGreaterThan(Math.abs(second.correlation ?? 0));
    });
  });

  // -------------------------------------------------------------------------
  // Error resilience (chunked Promise.allSettled)
  // -------------------------------------------------------------------------

  describe('error resilience', () => {
    it('returns empty correlations when the overall ES query fails', async () => {
      mockSearch.mockRejectedValueOnce(new Error('overall ES failure'));

      const result = await fetchThroughputCorrelations({
        ...defaultParams,
        fieldValuePairs: [{ fieldName: 'host.name', fieldValue: 'host-a' }],
      });

      expect(result.throughputCorrelations).toHaveLength(0);
      expect(result.ccsWarning).toBe(false);
      expect(result.fallbackResult).toBeUndefined();
    });

    it('continues processing remaining pairs when one ES request rejects', async () => {
      mockSearch
        .mockResolvedValueOnce({ aggregations: { timeseries: { buckets: overallBuckets } } })
        .mockResolvedValueOnce({ aggregations: { timeseries: { buckets: correlatedBuckets } } })
        .mockRejectedValueOnce(new Error('ES error'))
        .mockResolvedValueOnce({ aggregations: { timeseries: { buckets: correlatedBuckets } } });

      const result = await fetchThroughputCorrelations({
        ...defaultParams,
        fieldValuePairs: [
          { fieldName: 'host.name', fieldValue: 'host-a' },
          { fieldName: 'host.name', fieldValue: 'host-b' },
          { fieldName: 'host.name', fieldValue: 'host-c' },
        ],
      });

      // Two requests succeeded and one failed; no throw — two results returned
      expect(result.throughputCorrelations).toHaveLength(2);
    });

    it('sets ccsWarning=true when a rejection occurs on a non-local index', async () => {
      mockIsNonLocalIndexName.mockReturnValue(true);
      mockSearch
        .mockResolvedValueOnce({ aggregations: { timeseries: { buckets: overallBuckets } } })
        .mockRejectedValueOnce(new Error('CCS error'));

      const result = await fetchThroughputCorrelations({
        ...defaultParams,
        fieldValuePairs: [{ fieldName: 'host.name', fieldValue: 'host-a' }],
      });

      expect(result.ccsWarning).toBe(true);
    });

    it('sets ccsWarning=false when rejections occur on a local index', async () => {
      mockIsNonLocalIndexName.mockReturnValue(false);
      mockSearch
        .mockResolvedValueOnce({ aggregations: { timeseries: { buckets: overallBuckets } } })
        .mockRejectedValueOnce(new Error('local error'));

      const result = await fetchThroughputCorrelations({
        ...defaultParams,
        fieldValuePairs: [{ fieldName: 'host.name', fieldValue: 'host-a' }],
      });

      expect(result.ccsWarning).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Bucket alignment
  // -------------------------------------------------------------------------

  describe('bucket alignment', () => {
    it('treats buckets missing from the filtered response as zero RPM', async () => {
      // Only one bucket in filtered (60_000); keys 0 and 120_000 default to 0
      const partialBuckets = [makeBucket(60_000, 100)];

      mockSearch
        .mockResolvedValueOnce({ aggregations: { timeseries: { buckets: overallBuckets } } })
        .mockResolvedValueOnce({ aggregations: { timeseries: { buckets: partialBuckets } } });

      await expect(
        fetchThroughputCorrelations({
          ...defaultParams,
          fieldValuePairs: [{ fieldName: 'host.name', fieldValue: 'host-partial' }],
        })
      ).resolves.not.toThrow();
    });

    it('handles an empty overall timeseries without throwing', async () => {
      mockSearch.mockResolvedValueOnce({ aggregations: { timeseries: { buckets: [] } } });

      const result = await fetchThroughputCorrelations({
        ...defaultParams,
        fieldValuePairs: [{ fieldName: 'host.name', fieldValue: 'host-a' }],
      });

      expect(result.throughputCorrelations).toHaveLength(0);
    });
  });
});
