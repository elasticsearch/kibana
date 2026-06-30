/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useEffect, useRef } from 'react';
import { UI_SETTINGS } from '@kbn/data-plugin/public';
import type { StreamDocsStat } from '@kbn/streams-plugin/common';
import type { UnparsedEsqlResponse } from '@kbn/traced-es-client';
import { useKibana } from './use_kibana';
import { useTimefilter } from './use_timefilter';
import {
  buildStreamIngestHistogramEsql,
  getMeaningfulBucketMs,
} from '../util/stream_overview_esql';
import { executeEsqlQuery } from './use_execute_esql_query';

/**
 * Default bucket count for ES|QL time histograms (`BUCKET(@timestamp, …)`). Use the same value
 * for the streams list and stream overview so doc counts stay comparable for the time range.
 */
export const STREAMS_HISTOGRAM_NUM_DATA_POINTS = 25;

/**
 * Returns true if the error is an ES|QL "Unknown index" error.
 * This happens when a failure-store backing index does not yet exist — it is created lazily
 * on the first failed document, so an enabled failure store with no failures is normal.
 */
function isUnknownIndexError(error: unknown): boolean {
  if (error instanceof Error) {
    return (
      error.message.includes('Unknown index') || error.message.includes('index_not_found_exception')
    );
  }
  return false;
}

export interface StreamDocCountsFetch {
  docCount: Promise<StreamDocsStat[]>;
  failedDocCount: Promise<StreamDocsStat[]>;
  degradedDocCount: Promise<StreamDocsStat[]>;
  ingestionDocCount: Promise<StreamDocsStat[]>;
}

interface UseDocCountFetchProps {
  groupTotalCountByTimestamp: boolean;
  /** When `streamName` is omitted (streams listing), this decides whether to fetch failed-doc counts for all streams. */
  getCanReadFailureStore: (streamName?: string) => boolean;
  numDataPoints: number;
  fetchIngestionDocCounts: boolean;
}

export function useStreamDocCountsFetch({
  groupTotalCountByTimestamp: _groupTotalCountByTimestamp,
  getCanReadFailureStore,
  numDataPoints,
  fetchIngestionDocCounts,
}: UseDocCountFetchProps): {
  getStreamDocCounts(streamName?: string): StreamDocCountsFetch;
  getStreamHistogram(streamName: string): Promise<UnparsedEsqlResponse>;
} {
  const { timeState, timeState$ } = useTimefilter();
  const {
    dependencies: {
      start: {
        data,
        streams: { streamsRepositoryClient },
      },
    },
    core: { uiSettings },
  } = useKibana();

  const docCountsPromiseCache = useRef<StreamDocCountsFetch | null>(null);
  const histogramPromiseCache = useRef<Partial<Record<string, Promise<UnparsedEsqlResponse>>>>({});
  const abortControllerRef = useRef<AbortController>();

  if (!abortControllerRef.current) {
    abortControllerRef.current = new AbortController();
  }

  // No longer need to clear cache based on global canReadFailureStore
  // since we now check per-stream privileges

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    const subscription = timeState$.subscribe({
      next: ({ kind }) => {
        const shouldRefresh = kind !== 'initial';

        if (shouldRefresh) {
          docCountsPromiseCache.current = null;
          histogramPromiseCache.current = {};
          abortControllerRef.current?.abort();
          abortControllerRef.current = new AbortController();
        }
      },
    });
    return () => {
      subscription.unsubscribe();
    };
  }, [timeState$]);

  return {
    getStreamDocCounts(streamName?: string) {
      if (docCountsPromiseCache.current) {
        return docCountsPromiseCache.current;
      }

      const abortController = abortControllerRef.current;

      if (!abortController) {
        throw new Error('Abort controller not set');
      }

      const countPromise = streamsRepositoryClient.fetch('GET /internal/streams/doc_counts/total', {
        signal: abortController.signal,
        ...(streamName
          ? {
              params: {
                query: {
                  stream: streamName,
                },
              },
            }
          : {}),
      });

      const canReadFailureStore = getCanReadFailureStore(streamName);

      const failedCountPromise = canReadFailureStore
        ? streamsRepositoryClient.fetch('GET /internal/streams/doc_counts/failed', {
            signal: abortController.signal,
            params: {
              query: {
                start: timeState.start,
                end: timeState.end,
                ...(streamName ? { stream: streamName } : {}),
              },
            },
          })
        : Promise.reject(new Error('Cannot read failed doc count, insufficient privileges'));

      const degradedCountPromise = streamsRepositoryClient.fetch(
        'GET /internal/streams/doc_counts/degraded',
        {
          signal: abortController.signal,
          ...(streamName
            ? {
                params: {
                  query: {
                    stream: streamName,
                  },
                },
              }
            : {}),
        }
      );

      const ingestionCountPromise = fetchIngestionDocCounts
        ? streamsRepositoryClient.fetch('GET /internal/streams/doc_counts/ingestion', {
            signal: abortController.signal,
            params: {
              query: {
                start: timeState.start,
                end: timeState.end,
                ...(streamName ? { stream: streamName } : {}),
              },
            },
          })
        : Promise.reject(new Error('Ingestion doc counts not requested'));

      void ingestionCountPromise.catch(() => {});

      const docCountsFetch: StreamDocCountsFetch = {
        docCount: countPromise,
        failedDocCount: failedCountPromise,
        degradedDocCount: degradedCountPromise,
        ingestionDocCount: ingestionCountPromise,
      };

      docCountsPromiseCache.current = docCountsFetch;

      return docCountsFetch;
    },
    getStreamHistogram(streamName: string): Promise<UnparsedEsqlResponse> {
      const cacheKey = `${streamName}::${timeState.start}::${timeState.end}`;
      const cachedPromise = histogramPromiseCache.current[cacheKey];
      if (cachedPromise) {
        return cachedPromise;
      }

      const abortController = abortControllerRef.current;
      if (!abortController) {
        throw new Error('Abort controller not set');
      }

      const minInterval = getMeaningfulBucketMs(timeState.end - timeState.start, numDataPoints);
      // Check per-stream privilege
      const canReadFailureStore = getCanReadFailureStore(streamName);
      const source = canReadFailureStore ? `${streamName},${streamName}::failures` : streamName;
      const timezone = uiSettings?.get<'Browser' | string>(UI_SETTINGS.DATEFORMAT_TZ);

      const histogramPromise = executeEsqlQuery({
        query: buildStreamIngestHistogramEsql(source, minInterval),
        search: data.search.search,
        timezone,
        signal: abortController.signal,
        start: timeState.start,
        end: timeState.end,
        uiSettings,
      }).catch((error: unknown) => {
        // The ::failures backing index is created lazily (only when a document first fails).
        // An enabled failure store with no data yet returns "Unknown index" — treat it as empty.
        if (isUnknownIndexError(error)) {
          return { columns: [], values: [] };
        }
        throw error;
      }) as Promise<UnparsedEsqlResponse>;

      histogramPromiseCache.current[cacheKey] = histogramPromise;

      return histogramPromise;
    },
  };
}
