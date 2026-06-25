/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElasticsearchClient } from '@kbn/core/server';
import type { Logger } from '@kbn/logging';
import { SILENCE_BOOTSTRAP_DAYS } from '@kbn/siem-readiness';
import { toDataStreamName } from './utils';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const VOLUME_PAGE_SIZE = 10_000;
const MAX_VOLUME_PAGES = 100; // safety bound; warns if hit

export interface IndexHealthEntry {
  lastEventMs: number | null;
  /** Date.now() − lastEventMs; null when the stream has never received events. */
  silenceMs: number | null;
  /**
   * Doc count for yesterday (the most recent complete UTC day). The in-progress
   * current day is excluded so a partial day is never compared against full-day
   * baselines. null when the stream is younger than SILENCE_BOOTSTRAP_DAYS
   * (insufficient history).
   */
  lastFullDayDocs: number | null;
  baseline7dAvg: number | null;
  /** Clamped to [0, ∞) — null when baseline unavailable or zero. */
  volumeDropPct: number | null;
}

interface DataStreamsStatsResponseShape {
  data_streams?: Array<{ data_stream: string; maximum_timestamp?: number | null }>;
}

interface DataStreamMetaResponseShape {
  data_streams?: Array<{ name: string; creation_date?: number }>;
}

interface CompositeAggShape {
  by_index_day?: {
    after_key?: Record<string, string | number>;
    buckets: Array<{ key: { index: string; day: number }; doc_count: number }>;
  };
}

/**
 * Page a composite aggregation over every (backing index, day) pair in the past
 * 8 days and return docs summed per data stream and UTC day. Composite enumerates
 * all buckets without the 1000-index cap of a terms agg, so low-volume streams are
 * never silently dropped. Zero-doc days are omitted by composite and zero-filled
 * by the caller via explicit UTC-day lookup.
 */
const fetchVolumeByStreamDay = async (
  esClient: ElasticsearchClient,
  logger?: Logger
): Promise<Map<string, Map<number, number>>> => {
  const volumeByStreamDay = new Map<string, Map<number, number>>();
  let afterKey: Record<string, string | number> | undefined;
  let pages = 0;

  do {
    const volumeResponse = await esClient.search({
      index: ['logs-*', 'metrics-*'],
      size: 0,
      query: { range: { '@timestamp': { gte: 'now-8d/d' } } },
      aggs: {
        by_index_day: {
          composite: {
            size: VOLUME_PAGE_SIZE,
            ...(afterKey ? { after: afterKey } : {}),
            sources: [
              { index: { terms: { field: '_index' } } },
              { day: { date_histogram: { field: '@timestamp', fixed_interval: '1d' } } },
            ],
          },
        },
      },
    });

    const agg = (volumeResponse.aggregations as unknown as CompositeAggShape | undefined)
      ?.by_index_day;
    for (const bucket of agg?.buckets ?? []) {
      const streamName = toDataStreamName(bucket.key.index);
      const byDay = volumeByStreamDay.get(streamName) ?? new Map<number, number>();
      byDay.set(bucket.key.day, (byDay.get(bucket.key.day) ?? 0) + bucket.doc_count);
      volumeByStreamDay.set(streamName, byDay);
    }
    afterKey = agg?.after_key;
  } while (afterKey && ++pages < MAX_VOLUME_PAGES);

  if (pages >= MAX_VOLUME_PAGES && afterKey) {
    logger?.warn(
      'fetchIndexHealth: volume aggregation hit MAX_VOLUME_PAGES; some streams may be missing volume data'
    );
  }

  return volumeByStreamDay;
};

/**
 * Fetch last-event time and volume health for all SIEM data streams.
 *
 * - `lastEventMs` comes from `_data_stream/_stats.maximum_timestamp`, which is
 *   pre-computed by Elasticsearch and requires no query-time aggregation (aligned
 *   with the Dataset Quality data source).
 * - Volume fields (`lastFullDayDocs`, `baseline7dAvg`, `volumeDropPct`) are
 *   computed from a paginated composite aggregation over the past 8 days, which
 *   covers every backing index regardless of count (no 1000-index cap that would
 *   silently drop low-volume streams). We compare yesterday's complete day against
 *   the prior 7 full days' average; days are resolved by explicit UTC-midnight
 *   boundaries (missing days count as zero), and the in-progress current day is
 *   excluded so a partial day never triggers a false volume drop.
 * - Young streams (creation_date within SILENCE_BOOTSTRAP_DAYS) get null volume
 *   fields — the baseline cannot be trusted yet.
 *
 * Results are keyed by data stream name.
 */
export const fetchIndexHealth = async ({
  esClient,
  logger,
}: {
  esClient: ElasticsearchClient;
  logger?: Logger;
}): Promise<Record<string, IndexHealthEntry>> => {
  const now = Date.now();
  const bootstrapCutoff = now - SILENCE_BOOTSTRAP_DAYS * 24 * 60 * 60 * 1000;

  const [statsResponse, dataStreamResponse] = await Promise.all([
    // 1. Pre-computed maximum_timestamp per data stream (cheap — no query-time scan)
    esClient.indices.dataStreamsStats({ name: ['logs-*', 'metrics-*'] }),

    // 2. Data stream metadata — used to guard young streams by creation_date
    esClient.indices.getDataStream({
      name: ['logs-*', 'metrics-*'],
      filter_path: ['data_streams.name', 'data_streams.creation_date'],
    }),
  ]);

  // 3. Daily doc-count volume per data stream, via a paginated composite aggregation.
  const volumeByStreamDay = await fetchVolumeByStreamDay(esClient, logger);

  // Day boundaries (UTC midnight). Yesterday is the last complete day; the baseline
  // is the 7 complete days before yesterday. Missing days count as zero docs.
  const startOfTodayUtc = Math.floor(now / MS_PER_DAY) * MS_PER_DAY;
  const yesterdayStart = startOfTodayUtc - MS_PER_DAY;
  const baselineStarts = Array.from(
    { length: 7 },
    (_, i) => startOfTodayUtc - (i + 2) * MS_PER_DAY
  );

  // Build creation date map: dataStreamName → creationDateMs
  const creationDateByStream = new Map<string, number>();
  for (const ds of (dataStreamResponse as unknown as DataStreamMetaResponseShape).data_streams ??
    []) {
    if (ds.creation_date != null) {
      creationDateByStream.set(ds.name, ds.creation_date);
    }
  }

  // Build lastEventMs map: dataStreamName → epoch ms (from pre-computed maximum_timestamp)
  const lastEventByStream = new Map<string, number | null>();
  for (const ds of (statsResponse as unknown as DataStreamsStatsResponseShape).data_streams ?? []) {
    lastEventByStream.set(ds.data_stream, ds.maximum_timestamp ?? null);
  }

  // Build final result keyed by data stream name
  const result: Record<string, IndexHealthEntry> = {};

  for (const [streamName, lastEventMs] of lastEventByStream.entries()) {
    const silenceMs = lastEventMs !== null ? now - lastEventMs : null;
    const creationDate = creationDateByStream.get(streamName) ?? 0;
    const isYoung = creationDate > bootstrapCutoff;

    let lastFullDayDocs: number | null = null;
    let baseline7dAvg: number | null = null;
    let volumeDropPct: number | null = null;

    if (!isYoung) {
      const byDay = volumeByStreamDay.get(streamName);
      if (byDay !== undefined) {
        lastFullDayDocs = byDay.get(yesterdayStart) ?? 0;
        baseline7dAvg =
          baselineStarts.reduce((sum, d) => sum + (byDay.get(d) ?? 0), 0) / baselineStarts.length;
        volumeDropPct =
          baseline7dAvg === 0
            ? null
            : Math.max(0, Math.round(((baseline7dAvg - lastFullDayDocs) / baseline7dAvg) * 100));
      }
    }

    result[streamName] = {
      lastEventMs,
      silenceMs,
      lastFullDayDocs,
      baseline7dAvg,
      volumeDropPct,
    };
  }

  return result;
};
