/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  IndicesStatsIndicesStats,
  SearchRequest,
  QueryDslQueryContainer,
} from '@elastic/elasticsearch/lib/api/types';
import type { ElasticsearchClient } from '@kbn/core/server';
import { isNotFoundError } from '@kbn/es-errors';
import type { ESQLSearchResponse } from '@kbn/es-types';
import type { StreamDocsStat } from '../../../../common';
import type { StreamsClient } from '../../../lib/streams/client';
import {
  getDataStreamsMeteringStats,
  getLastBackingIndexByStream,
  processAsyncInChunks,
} from './utils';

/**
 * Fetches total document counts for one or all streams.
 *
 * The current implementation no longer uses a time range. Instead it:
 * 1) calls the indices.getDataStream API to resolve data streams and their backing indices
 * 2) prefers the _metering/stats API (ES3 / serverless) to get total doc counts per data stream
 * 3) falls back to the indices.stats docs metric (stateful) when _metering/stats is unavailable
 */
export async function getDocCountsForStreams(options: {
  isServerless: boolean;
  esClient: ElasticsearchClient;
  /**
   * When available (serverless), this client should be used to call the
   * _metering/stats API as a secondary auth user to ensure proper permissions.
   */
  esClientAsSecondaryAuthUser?: ElasticsearchClient;
  /**
   * When provided, limits the computation to a single stream name.
   * When omitted, doc counts are returned for all streams.
   */
  streamName?: string;
}): Promise<StreamDocsStat[]> {
  const { isServerless, esClient, esClientAsSecondaryAuthUser, streamName } = options;

  const { data_streams: streams } = streamName
    ? await esClient.indices.getDataStream({ name: streamName }).catch((error) => {
        if (isNotFoundError(error)) {
          return { data_streams: [] };
        }
        throw error;
      })
    : await esClient.indices.getDataStream();
  if (!streams.length) {
    return [];
  }
  const lastBackingIndexByStream = getLastBackingIndexByStream(streams);
  const allBackingIndices = Array.from(new Set(lastBackingIndexByStream.values()));

  if (!allBackingIndices.length) {
    return [];
  }

  // Accumulate doc counts per backing index, then map those back to stream names below.
  const docsByBackingIndex: Record<string, number> = {};

  // Use _metering/stats API for serverless when a secondary auth user client is available.
  if (isServerless && esClientAsSecondaryAuthUser) {
    const meteringStatsByBackingIndex = await getDataStreamsMeteringStats({
      esClient: esClientAsSecondaryAuthUser,
      dataStreams: allBackingIndices,
    });

    for (const [indexName, stats] of Object.entries(meteringStatsByBackingIndex)) {
      docsByBackingIndex[indexName] = stats.totalDocs ?? 0;
    }
  } else {
    // Stateful fallback – use indices.stats, chunked for large numbers of indices.
    const indicesStats: Record<string, IndicesStatsIndicesStats> = {};
    const statsResponses = await processAsyncInChunks<
      string,
      { indices?: Record<string, IndicesStatsIndicesStats> }
    >({
      items: allBackingIndices,
      processChunk: async (indexChunk) =>
        (esClientAsSecondaryAuthUser ?? esClient).indices.stats({
          index: indexChunk,
          metric: ['docs'],
          filter_path: 'indices.*.primaries.docs.count',
        }),
    });

    for (const statsResponse of statsResponses) {
      if (statsResponse.indices) {
        Object.assign(indicesStats, statsResponse.indices);
      }
    }

    for (const [indexName, stats] of Object.entries(indicesStats)) {
      const docsCount = stats.primaries?.docs?.count ?? 0;
      docsByBackingIndex[indexName] = docsCount;
    }
  }

  const results: StreamDocsStat[] = [];

  for (const [stream, index] of lastBackingIndexByStream.entries()) {
    const docsCount = docsByBackingIndex[index] ?? 0;

    if (docsCount > 0) {
      results.push({
        stream,
        count: docsCount,
      });
    }
  }

  return results;
}

/**
 * Fetches degraded document counts for one or all streams.
 *
 * For each stream we:
 * 1) resolve the data stream and its backing indices via indices.getDataStream
 * 2) pick the last backing index
 * 3) run a search against that index with an _ignored exists query
 */
export async function getDegradedDocCountsForStreams(options: {
  esClient: ElasticsearchClient;
  /**
   * When provided, limits the computation to a single stream name.
   * When omitted, degraded counts are returned for all streams.
   */
  streamName?: string;
}): Promise<StreamDocsStat[]> {
  const { esClient, streamName } = options;

  const { data_streams: streams } = streamName
    ? await esClient.indices.getDataStream({ name: streamName }).catch((error) => {
        if (isNotFoundError(error)) {
          return { data_streams: [] };
        }
        throw error;
      })
    : await esClient.indices.getDataStream();

  if (!streams.length) {
    return [];
  }

  const lastBackingIndexByStream = getLastBackingIndexByStream(streams);
  const indexToStreams = new Map<string, string>();

  for (const [stream, index] of lastBackingIndexByStream.entries()) {
    indexToStreams.set(index, stream);
  }

  const allIndices = Array.from(indexToStreams.keys());
  if (!allIndices.length) {
    return [];
  }

  const results: StreamDocsStat[] = [];

  const chunkResponses = await processAsyncInChunks<
    string,
    { indices: string[]; buckets: Record<string, { doc_count: number }> }
  >({
    items: allIndices,
    processChunk: async (indicesInChunk) => {
      // Build a filters aggregation keyed by index name so we get per-index counts in a single search.
      const filters: Record<string, QueryDslQueryContainer> = {};
      for (const index of indicesInChunk) {
        filters[index] = {
          term: {
            _index: index,
          },
        };
      }

      const response = await esClient.search<SearchRequest>({
        index: indicesInChunk,
        size: 0,
        track_total_hits: false,
        query: {
          exists: {
            field: '_ignored',
          },
        },
        aggs: {
          per_index: {
            filters: {
              filters,
            },
          },
        },
      });

      const buckets =
        // @ts-expect-error Aggregations are not strongly typed here
        response.aggregations?.per_index?.buckets ?? {};

      return { indices: indicesInChunk, buckets };
    },
  });

  for (const { indices, buckets } of chunkResponses) {
    for (const index of indices) {
      const bucket = buckets[index];
      const docCount: number = bucket?.doc_count ?? 0;

      if (docCount <= 0) {
        continue;
      }

      const streamForIndex = indexToStreams.get(index);
      if (streamForIndex) {
        results.push({ stream: streamForIndex, count: docCount });
      }
    }
  }

  return results;
}

export async function getIngestionDocCountsForStreams(options: {
  esClient: ElasticsearchClient;
  streamsClient: StreamsClient;
  start: number;
  end: number;
  streamName?: string;
}): Promise<StreamDocsStat[]> {
  const { esClient, streamsClient, start, end, streamName } = options;

  const { data_streams: streams } = streamName
    ? await esClient.indices.getDataStream({ name: streamName }).catch((error) => {
        if (isNotFoundError(error)) {
          return { data_streams: [] };
        }
        throw error;
      })
    : await esClient.indices.getDataStream();

  if (!streams.length) {
    return [];
  }

  const streamNames = streams.map((stream) => stream.name);
  const privilegeChunks = await processAsyncInChunks<
    string,
    Record<string, { read_failure_store: boolean }>
  >({
    items: streamNames,
    processChunk: (chunk) => streamsClient.getPrivilegesPerStream(chunk),
  });
  const readFailureStoreByStream: Record<string, { read_failure_store: boolean }> = Object.assign(
    {},
    ...privilegeChunks
  );

  const indexToStream = new Map<string, string>();
  for (const stream of streams) {
    for (const index of stream.indices ?? []) {
      indexToStream.set(index.index_name, stream.name);
    }
    if (readFailureStoreByStream[stream.name]?.read_failure_store) {
      for (const index of stream.failure_store?.indices ?? []) {
        indexToStream.set(index.index_name, stream.name);
      }
    }
  }

  const allIndices = Array.from(indexToStream.keys());
  if (!allIndices.length) {
    return [];
  }

  interface PerIndexAggs {
    per_index: { buckets: Record<string, { doc_count: number }> };
  }

  const chunkResponses = await processAsyncInChunks<
    string,
    { indices: string[]; buckets: Record<string, { doc_count: number }> }
  >({
    items: allIndices,
    processChunk: async (indicesInChunk) => {
      // Build a filters aggregation keyed by index name so we get per-index counts in a single search.
      const filters: Record<string, QueryDslQueryContainer> = {};
      for (const index of indicesInChunk) {
        filters[index] = {
          term: {
            _index: index,
          },
        };
      }

      const response = await esClient.search<unknown, PerIndexAggs>({
        index: indicesInChunk,
        ignore_unavailable: true,
        size: 0,
        track_total_hits: false,
        query: {
          range: {
            '@timestamp': {
              gte: start,
              lte: end,
              format: 'epoch_millis',
            },
          },
        },
        aggs: {
          per_index: {
            filters: {
              filters,
            },
          },
        },
      });

      const buckets = response.aggregations?.per_index?.buckets ?? {};

      return { indices: indicesInChunk, buckets };
    },
  });

  const countsByStream = new Map<string, number>();

  for (const { indices, buckets } of chunkResponses) {
    for (const index of indices) {
      const docCount = buckets[index]?.doc_count ?? 0;

      if (docCount <= 0) {
        continue;
      }

      const stream = indexToStream.get(index);
      if (stream) {
        countsByStream.set(stream, (countsByStream.get(stream) ?? 0) + docCount);
      }
    }
  }

  return Array.from(countsByStream.entries()).map(
    ([stream, count]): StreamDocsStat => ({
      stream,
      count,
    })
  );
}

/**
 * Fetches failed document counts for one or all streams.
 *
 * The implementation:
 * 1) resolves failure store data streams and their backing indices via indices.getDataStream
 * 2) runs an ES|QL query over the failure store streams to get failed doc counts per backing index
 * 3) aggregates failed doc counts across backing indices for each original stream
 */
export async function getFailedDocCountsForStreams(options: {
  esClient: ElasticsearchClient;
  start: number;
  end: number;
  /**
   * When provided, limits the computation to a single stream name.
   * When omitted, failed counts are returned for all streams.
   */
  streamName?: string;
}): Promise<StreamDocsStat[]> {
  const { esClient, start, end, streamName } = options;

  const { data_streams: streams } = streamName
    ? await esClient.indices.getDataStream({ name: streamName }).catch((error) => {
        if (isNotFoundError(error)) {
          return { data_streams: [] };
        }
        throw error;
      })
    : await esClient.indices.getDataStream();

  if (!streams.length) {
    return [];
  }

  // Map each fs backing index of the streams to its base stream name.
  const backingIndexToStream = new Map<string, string>();

  for (const stream of streams) {
    for (const index of stream.failure_store?.indices ?? []) {
      backingIndexToStream.set(index.index_name, stream.name);
    }
  }

  if (!backingIndexToStream.size) {
    return [];
  }

  const startIso = new Date(start).toISOString();
  const endIso = new Date(end).toISOString();

  const esqlQuery = `
FROM *::failures METADATA _index
| WHERE @timestamp >= "${startIso}" AND @timestamp <= "${endIso}"
| STATS failed_count = COUNT(*) BY backing_index = _index
`.trim();

  const response = (await esClient.esql.query({
    query: esqlQuery,
    drop_null_columns: true,
  })) as ESQLSearchResponse;

  const backingIndexCol = response.columns.findIndex((col) => col.name === 'backing_index');
  const failedCountCol = response.columns.findIndex((col) => col.name === 'failed_count');

  if (backingIndexCol === -1 || failedCountCol === -1) {
    return [];
  }

  const countsByStream = new Map<string, number>();

  for (const row of response.values) {
    const backingIndex = row[backingIndexCol] as string | undefined;
    const failedCount = Number(row[failedCountCol] ?? 0);

    if (!backingIndex || !Number.isFinite(failedCount)) {
      continue;
    }

    const stream = backingIndexToStream.get(backingIndex);
    if (!stream) {
      continue;
    }

    countsByStream.set(stream, (countsByStream.get(stream) ?? 0) + failedCount);
  }

  return Array.from(countsByStream.entries()).map(
    ([stream, count]): StreamDocsStat => ({
      stream,
      count,
    })
  );
}
