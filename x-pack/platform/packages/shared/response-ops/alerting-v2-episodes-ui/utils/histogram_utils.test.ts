/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  computeBucketInterval,
  generateTimeBuckets,
  computeOverlapCounts,
  formatHistogramDatatable,
  intervalToMs,
  type HistogramEpisodeRow,
  type TimeBucket,
} from './histogram_utils';

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe('computeBucketInterval', () => {
  it('returns 1m for ranges <= 1 hour', () => {
    expect(computeBucketInterval(0, HOUR)).toBe('1m');
  });
  it('returns 1h for a range just over 1 hour', () => {
    expect(computeBucketInterval(0, HOUR + 1)).toBe('1h');
  });
  it('returns 1h for ranges > 1 hour and <= 24 hours', () => {
    expect(computeBucketInterval(0, DAY)).toBe('1h');
  });
  it('returns 6h for ranges > 24 hours and <= 7 days', () => {
    expect(computeBucketInterval(0, 7 * DAY)).toBe('6h');
  });
  it('returns 1d for ranges > 7 days and <= 30 days', () => {
    expect(computeBucketInterval(0, 30 * DAY)).toBe('1d');
  });
  it('returns 1w for ranges > 30 days', () => {
    expect(computeBucketInterval(0, 31 * DAY)).toBe('1w');
  });
});

describe('intervalToMs', () => {
  it('converts numeric-prefixed intervals', () => {
    expect(intervalToMs('1m')).toBe(MIN);
    expect(intervalToMs('1h')).toBe(HOUR);
    expect(intervalToMs('6h')).toBe(6 * HOUR);
    expect(intervalToMs('1d')).toBe(DAY);
  });

  it('converts bare single-letter intervals', () => {
    expect(intervalToMs('h')).toBe(HOUR);
    expect(intervalToMs('d')).toBe(DAY);
  });
});

describe('generateTimeBuckets', () => {
  it('generates buckets covering the full range with no gaps', () => {
    const buckets = generateTimeBuckets(0, 3 * HOUR, '1h');
    expect(buckets.length).toBe(3);
    expect(buckets[0]).toEqual({ start: 0, end: HOUR });
    expect(buckets[1]).toEqual({ start: HOUR, end: 2 * HOUR });
    expect(buckets[2]).toEqual({ start: 2 * HOUR, end: 3 * HOUR });
  });

  it('aligns bucket starts to interval boundaries', () => {
    // start = 30min into an hour; first bucket starts at the hour boundary
    const buckets = generateTimeBuckets(30 * MIN, 90 * MIN, '1h');
    expect(buckets[0].start).toBe(0); // floored to hour boundary
  });

  it('accepts bare single-letter intervals emitted by unified-histogram (e.g. "h")', () => {
    // unified-histogram's interval selector emits 'h', 'd', 'w' — no digit prefix
    const buckets = generateTimeBuckets(0, 3 * HOUR, 'h');
    expect(buckets.length).toBe(3);
    expect(buckets[0]).toEqual({ start: 0, end: HOUR });
  });

  it('falls back to 1 hour for completely unknown interval formats', () => {
    // An unrecognised string should not throw — it returns 1-hour buckets
    const buckets = generateTimeBuckets(0, 3 * HOUR, 'unknown');
    expect(buckets.length).toBe(3);
  });
});

describe('computeOverlapCounts', () => {
  const t0 = new Date('2024-01-01T00:00:00Z').getTime();
  const BUCKET_1: TimeBucket = { start: t0, end: t0 + HOUR };
  const BUCKET_2: TimeBucket = { start: t0 + HOUR, end: t0 + 2 * HOUR };

  const inactive = (firstMs: number, lastMs: number): HistogramEpisodeRow => ({
    first_timestamp: new Date(firstMs).toISOString(),
    last_timestamp: new Date(lastMs).toISOString(),
    'episode.status': 'inactive',
  });

  const active = (firstMs: number): HistogramEpisodeRow => ({
    first_timestamp: new Date(firstMs).toISOString(),
    last_timestamp: new Date(firstMs + HOUR).toISOString(), // ignored for active episodes
    'episode.status': 'active',
  });

  it('counts an episode that spans two buckets in both', () => {
    const episodes = [inactive(t0, t0 + 2 * HOUR)];
    const counts = computeOverlapCounts(episodes, [BUCKET_1, BUCKET_2]);
    expect(counts[0].count).toBe(1);
    expect(counts[1].count).toBe(1);
  });

  it('does not count an episode that ended before the bucket starts', () => {
    const episodes = [inactive(t0 - 2 * HOUR, t0 - MIN)];
    const counts = computeOverlapCounts(episodes, [BUCKET_1]);
    expect(counts[0].count).toBe(0);
  });

  it('does not count an episode that started after the bucket ends', () => {
    const episodes = [inactive(t0 + HOUR + MIN, t0 + 2 * HOUR)];
    const counts = computeOverlapCounts(episodes, [BUCKET_1]);
    expect(counts[0].count).toBe(0);
  });

  it('counts active episodes in all buckets from first_timestamp onward up to now', () => {
    const episodes = [active(t0 + 30 * MIN)];
    const counts = computeOverlapCounts(episodes, [BUCKET_1, BUCKET_2]);
    expect(counts[0].count).toBe(1); // started within bucket 1
    expect(counts[1].count).toBe(1); // still active in bucket 2
  });

  it('does not count active episodes in buckets that start after now', () => {
    // "now" is set to t0+1h so that BUCKET_2 (t0+1h to t0+2h) starts exactly at now —
    // an active episode capped at nowMs must not bleed into that future bucket.
    const nowMs = t0 + HOUR;
    const episodes = [active(t0)];
    const counts = computeOverlapCounts(episodes, [BUCKET_1, BUCKET_2], undefined, nowMs);
    expect(counts[0].count).toBe(1); // bucket 1 ends at nowMs — episode is present
    expect(counts[1].count).toBe(0); // bucket 2 starts at nowMs — episode has already ended
  });

  it('does not count an active episode that has not yet started in a bucket', () => {
    const episodes = [active(t0 + HOUR + 30 * MIN)]; // starts in bucket 2
    const counts = computeOverlapCounts(episodes, [BUCKET_1, BUCKET_2]);
    expect(counts[0].count).toBe(0);
    expect(counts[1].count).toBe(1);
  });

  it('treats a manually deactivated episode (episode.status=active, effective_status=inactive) as still ongoing up to now', () => {
    // episode.status is 'active' in the events index — no recovery event was fired.
    // The episode is capped at nowMs so it appears in buckets up to the current time,
    // letting breakdown-by-effective_status show it as 'inactive' near the right edge.
    const deactivated: HistogramEpisodeRow = {
      first_timestamp: new Date(t0).toISOString(),
      last_timestamp: new Date(t0 + HOUR).toISOString(),
      'episode.status': 'active',
      effective_status: 'inactive',
    };
    const counts = computeOverlapCounts([deactivated], [BUCKET_1, BUCKET_2]);
    expect(counts[0].count).toBe(1);
    expect(counts[1].count).toBe(1); // still present — will appear as inactive via effective_status
  });

  it('uses effective_status as the breakdown label for manually deactivated episodes', () => {
    const deactivated: HistogramEpisodeRow = {
      first_timestamp: new Date(t0).toISOString(),
      last_timestamp: new Date(t0 + HOUR).toISOString(),
      'episode.status': 'active',
      effective_status: 'inactive',
    };
    const counts = computeOverlapCounts([deactivated], [BUCKET_1], 'effective_status');
    expect(counts.find((c) => c.breakdown === 'inactive')?.count).toBe(1);
    expect(counts.find((c) => c.breakdown === 'active')).toBeUndefined();
  });

  it('groups counts by breakdown field across buckets', () => {
    const ep1 = { ...inactive(t0, t0 + 30 * MIN), 'rule.id': 'rule-a' };
    const ep2 = { ...inactive(t0, t0 + 30 * MIN), 'rule.id': 'rule-b' };
    const counts = computeOverlapCounts([ep1, ep2], [BUCKET_1], 'rule.id');
    expect(counts.find((c) => c.breakdown === 'rule-a')?.count).toBe(1);
    expect(counts.find((c) => c.breakdown === 'rule-b')?.count).toBe(1);
  });

  it('emits no row for a bucket with no overlapping episodes when a breakdown is active', () => {
    // Episode falls entirely outside BUCKET_1 — the bucket is absent from the result.
    // Gap-filling (zero-count rows for the full time range) is handled in useEpisodesHistogramQuery.
    const ep = { ...inactive(t0 + HOUR + MIN, t0 + 2 * HOUR), effective_status: 'active' };
    const counts = computeOverlapCounts([ep], [BUCKET_1], 'effective_status');
    expect(counts).toHaveLength(0);
  });
});

describe('formatHistogramDatatable', () => {
  it('returns a datatable with time_bucket and count columns when no breakdown', () => {
    const table = formatHistogramDatatable([{ bucketStart: 0, count: 3 }]);
    expect(table.type).toBe('datatable');
    expect(table.columns.map((c) => c.id)).toEqual(['time_bucket', 'count']);
    expect(table.columns[0].meta.type).toBe('date');
    expect(table.columns[1].meta.type).toBe('number');
    expect(table.rows[0]).toEqual({ time_bucket: new Date(0).toISOString(), count: 3 });
  });

  it('includes a breakdown column when breakdownField is provided', () => {
    const table = formatHistogramDatatable(
      [{ bucketStart: 0, count: 2, breakdown: 'active' }],
      'episode.status'
    );
    expect(table.columns.map((c) => c.id)).toEqual(['time_bucket', 'episode.status', 'count']);
    expect(table.columns[1].name).toBe('episode.status');
    expect(table.rows[0]).toEqual({
      time_bucket: new Date(0).toISOString(),
      'episode.status': 'active',
      count: 2,
    });
  });

  it('sets breakdown column to null when an entry has no breakdown value (defensive)', () => {
    // Guards the formatter against callers that pass entries without a breakdown field.
    const table = formatHistogramDatatable(
      [{ bucketStart: 0, count: 1, breakdown: undefined }],
      'episode.status'
    );
    expect(table.rows[0]['episode.status']).toBeNull();
  });
});
