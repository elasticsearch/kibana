/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElasticsearchClient } from '@kbn/core/server';
import { SILENCE_BOOTSTRAP_DAYS } from '@kbn/siem-readiness';
import { fetchIndexHealth } from './fetch_index_health';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const NOW = 1_700_000_000_000; // fixed epoch ms
const BOOTSTRAP_CUTOFF = NOW - SILENCE_BOOTSTRAP_DAYS * 24 * 60 * 60 * 1000;

// UTC-midnight boundaries the implementation computes from `now`.
const START_OF_TODAY_UTC = Math.floor(NOW / MS_PER_DAY) * MS_PER_DAY;
// offset 0 = today (partial, ignored), 1 = yesterday, 2..8 = baseline days
const dayMs = (offsetFromToday: number) => START_OF_TODAY_UTC - offsetFromToday * MS_PER_DAY;

const baselineOf = (value: number) => Array.from({ length: 7 }, () => value);

interface CompositeBucket {
  key: { index: string; day: number };
  doc_count: number;
}

interface CompositePage {
  buckets: CompositeBucket[];
  after_key?: Record<string, string | number>;
}

/**
 * Build composite buckets for a single index: yesterday + 7 baseline days, and
 * optionally an in-progress "today" bucket (which must be ignored by the impl).
 */
const makeDayBuckets = (
  index: string,
  { yesterday, baseline, today }: { yesterday: number; baseline: number[]; today?: number }
): CompositeBucket[] => {
  const buckets: CompositeBucket[] = [];
  if (today !== undefined) {
    buckets.push({ key: { index, day: dayMs(0) }, doc_count: today });
  }
  buckets.push({ key: { index, day: dayMs(1) }, doc_count: yesterday });
  baseline.forEach((value, i) => {
    buckets.push({ key: { index, day: dayMs(i + 2) }, doc_count: value });
  });
  return buckets;
};

const makeEsClient = ({
  streams = [] as Array<{ name: string; maximum_timestamp?: number | null }>,
  creationDates = {} as Record<string, number>,
  volumeBuckets = [] as CompositeBucket[],
  volumePages,
}: {
  streams?: Array<{ name: string; maximum_timestamp?: number | null }>;
  creationDates?: Record<string, number>;
  volumeBuckets?: CompositeBucket[];
  volumePages?: CompositePage[];
} = {}): ElasticsearchClient => {
  // A single page with no after_key terminates the pagination loop after one call.
  const pages: CompositePage[] = volumePages ?? [{ buckets: volumeBuckets }];
  let callIdx = 0;

  return {
    indices: {
      dataStreamsStats: jest.fn().mockResolvedValue({
        data_streams: streams.map((s) => ({
          data_stream: s.name,
          maximum_timestamp: s.maximum_timestamp ?? null,
        })),
      }),
      getDataStream: jest.fn().mockResolvedValue({
        data_streams: Object.entries(creationDates).map(([name, creation_date]) => ({
          name,
          creation_date,
        })),
      }),
    },
    search: jest.fn().mockImplementation(() => {
      const page = pages[callIdx] ?? { buckets: [] };
      callIdx += 1;
      return Promise.resolve({ aggregations: { by_index_day: page } });
    }),
  } as unknown as ElasticsearchClient;
};

describe('fetchIndexHealth', () => {
  beforeEach(() => {
    jest.spyOn(Date, 'now').mockReturnValue(NOW);
  });
  afterEach(() => jest.restoreAllMocks());

  describe('lastEventMs and silenceMs from maximum_timestamp', () => {
    it('reads lastEventMs from _data_stream/_stats maximum_timestamp', async () => {
      const lastEventMs = NOW - 10 * 60 * 1000; // 10 min ago
      const esClient = makeEsClient({
        streams: [{ name: 'logs-endpoint.events-default', maximum_timestamp: lastEventMs }],
        creationDates: { 'logs-endpoint.events-default': BOOTSTRAP_CUTOFF - 1 },
      });

      const result = await fetchIndexHealth({ esClient });
      expect(result['logs-endpoint.events-default'].lastEventMs).toBe(lastEventMs);
      expect(result['logs-endpoint.events-default'].silenceMs).toBe(NOW - lastEventMs);
    });

    it('returns null lastEventMs and silenceMs when maximum_timestamp is null', async () => {
      const esClient = makeEsClient({
        streams: [{ name: 'logs-new.stream-default', maximum_timestamp: null }],
        creationDates: { 'logs-new.stream-default': BOOTSTRAP_CUTOFF - 1 },
      });

      const result = await fetchIndexHealth({ esClient });
      expect(result['logs-new.stream-default'].lastEventMs).toBeNull();
      expect(result['logs-new.stream-default'].silenceMs).toBeNull();
    });
  });

  describe('young stream guard (creation_date within SILENCE_BOOTSTRAP_DAYS)', () => {
    it('returns null volume fields for a stream younger than SILENCE_BOOTSTRAP_DAYS', async () => {
      const youngCreationDate = NOW - (SILENCE_BOOTSTRAP_DAYS - 1) * 24 * 60 * 60 * 1000;
      const esClient = makeEsClient({
        streams: [{ name: 'logs-young-default', maximum_timestamp: NOW - 1000 }],
        creationDates: { 'logs-young-default': youngCreationDate },
        volumeBuckets: makeDayBuckets('logs-young-default', {
          yesterday: 50,
          baseline: baselineOf(100),
        }),
      });

      const result = await fetchIndexHealth({ esClient });
      expect(result['logs-young-default'].lastFullDayDocs).toBeNull();
      expect(result['logs-young-default'].baseline7dAvg).toBeNull();
      expect(result['logs-young-default'].volumeDropPct).toBeNull();
    });

    it('returns volume fields for a stream older than SILENCE_BOOTSTRAP_DAYS', async () => {
      const oldCreationDate = BOOTSTRAP_CUTOFF - 1;
      const esClient = makeEsClient({
        streams: [{ name: 'logs-old-default', maximum_timestamp: NOW - 1000 }],
        creationDates: { 'logs-old-default': oldCreationDate },
        volumeBuckets: makeDayBuckets('logs-old-default', {
          yesterday: 10,
          baseline: baselineOf(100),
        }),
      });

      const result = await fetchIndexHealth({ esClient });
      expect(result['logs-old-default'].lastFullDayDocs).toBe(10);
      expect(result['logs-old-default'].baseline7dAvg).toBe(100);
    });
  });

  describe('volumeDropPct calculation', () => {
    it('computes 90% drop correctly and ignores the in-progress current day', async () => {
      const esClient = makeEsClient({
        streams: [{ name: 'logs-drop-default', maximum_timestamp: NOW - 1000 }],
        creationDates: { 'logs-drop-default': BOOTSTRAP_CUTOFF - 1 },
        // today (partial) is huge but must be excluded from the comparison
        volumeBuckets: makeDayBuckets('logs-drop-default', {
          today: 9999,
          yesterday: 10,
          baseline: baselineOf(100),
        }),
      });

      const result = await fetchIndexHealth({ esClient });
      expect(result['logs-drop-default'].volumeDropPct).toBe(90);
    });

    it('clamps volumeDropPct to 0 on a volume spike', async () => {
      const esClient = makeEsClient({
        streams: [{ name: 'logs-spike-default', maximum_timestamp: NOW - 1000 }],
        creationDates: { 'logs-spike-default': BOOTSTRAP_CUTOFF - 1 },
        volumeBuckets: makeDayBuckets('logs-spike-default', {
          yesterday: 500,
          baseline: baselineOf(100),
        }),
      });

      const result = await fetchIndexHealth({ esClient });
      expect(result['logs-spike-default'].volumeDropPct).toBe(0);
    });

    it('returns null volumeDropPct when baseline is zero', async () => {
      const esClient = makeEsClient({
        streams: [{ name: 'logs-zero-default', maximum_timestamp: NOW - 1000 }],
        creationDates: { 'logs-zero-default': BOOTSTRAP_CUTOFF - 1 },
        volumeBuckets: makeDayBuckets('logs-zero-default', {
          yesterday: 10,
          baseline: baselineOf(0),
        }),
      });

      const result = await fetchIndexHealth({ esClient });
      expect(result['logs-zero-default'].volumeDropPct).toBeNull();
    });

    it('zero-fills missing baseline days into the 7-day average', async () => {
      // Only some baseline days are present; absent days must count as zero docs.
      // baseline = [100, 100, 0, 0, 100, 100, 100] -> avg = 500 / 7 ≈ 71.43
      const esClient = makeEsClient({
        streams: [{ name: 'logs-sparse-default', maximum_timestamp: NOW - 1000 }],
        creationDates: { 'logs-sparse-default': BOOTSTRAP_CUTOFF - 1 },
        volumeBuckets: makeDayBuckets('logs-sparse-default', {
          yesterday: 70,
          baseline: [100, 100, 0, 0, 100, 100, 100],
        }),
      });

      const result = await fetchIndexHealth({ esClient });
      expect(result['logs-sparse-default'].baseline7dAvg).toBeCloseTo(500 / 7, 5);
      // drop = round((71.43 - 70) / 71.43 * 100) = 2
      expect(result['logs-sparse-default'].volumeDropPct).toBe(2);
    });
  });

  describe('backing index → data stream name resolution', () => {
    it('aggregates volume from backing index names into data stream name key', async () => {
      const backingIndex = '.ds-logs-endpoint.events-default-2024.01.15-000001';
      const streamName = 'logs-endpoint.events-default';

      const esClient = makeEsClient({
        streams: [{ name: streamName, maximum_timestamp: NOW - 1000 }],
        creationDates: { [streamName]: BOOTSTRAP_CUTOFF - 1 },
        volumeBuckets: makeDayBuckets(backingIndex, {
          yesterday: 50,
          baseline: baselineOf(100),
        }),
      });

      const result = await fetchIndexHealth({ esClient });
      expect(result[streamName]).toBeDefined();
      expect(result[streamName].lastFullDayDocs).toBe(50);
      expect(result[streamName].baseline7dAvg).toBe(100);
    });

    it('sums multiple backing indices of the same stream across days', async () => {
      const streamName = 'logs-endpoint.events-default';
      const esClient = makeEsClient({
        streams: [{ name: streamName, maximum_timestamp: NOW - 1000 }],
        creationDates: { [streamName]: BOOTSTRAP_CUTOFF - 1 },
        volumeBuckets: [
          ...makeDayBuckets('.ds-logs-endpoint.events-default-2024.01.15-000001', {
            yesterday: 30,
            baseline: baselineOf(60),
          }),
          ...makeDayBuckets('.ds-logs-endpoint.events-default-2024.01.16-000002', {
            yesterday: 20,
            baseline: baselineOf(40),
          }),
        ],
      });

      const result = await fetchIndexHealth({ esClient });
      expect(result[streamName].lastFullDayDocs).toBe(50);
      expect(result[streamName].baseline7dAvg).toBe(100);
    });
  });

  describe('composite pagination (no 1000-index cap)', () => {
    it('computes volume for low-volume streams returned on later pages', async () => {
      const esClient = makeEsClient({
        streams: [
          { name: 'logs-busy-default', maximum_timestamp: NOW - 1000 },
          { name: 'logs-quiet-default', maximum_timestamp: NOW - 1000 },
        ],
        creationDates: {
          'logs-busy-default': BOOTSTRAP_CUTOFF - 1,
          'logs-quiet-default': BOOTSTRAP_CUTOFF - 1,
        },
        volumePages: [
          {
            buckets: makeDayBuckets('logs-busy-default', {
              yesterday: 1000,
              baseline: baselineOf(1000),
            }),
            after_key: { index: 'logs-busy-default', day: dayMs(2) },
          },
          {
            // Second page: a quiet stream that a capped terms agg would have dropped.
            buckets: makeDayBuckets('logs-quiet-default', {
              yesterday: 5,
              baseline: baselineOf(100),
            }),
          },
        ],
      });

      const result = await fetchIndexHealth({ esClient });
      expect(result['logs-quiet-default'].lastFullDayDocs).toBe(5);
      expect(result['logs-quiet-default'].baseline7dAvg).toBe(100);
      expect(result['logs-quiet-default'].volumeDropPct).toBe(95);
      expect(esClient.search).toHaveBeenCalledTimes(2);
    });
  });
});
