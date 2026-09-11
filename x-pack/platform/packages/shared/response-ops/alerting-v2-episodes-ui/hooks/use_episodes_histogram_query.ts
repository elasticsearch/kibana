/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useMemo } from 'react';
import dateMath from '@kbn/datemath';
import { useQuery } from '@kbn/react-query';
import type { TimeRange } from '@kbn/es-query';
import type { SpacesPluginStart } from '@kbn/spaces-plugin/public';
import type { ExpressionsStart } from '@kbn/expressions-plugin/public';
import type { HttpStart } from '@kbn/core-http-browser';
import type { Datatable } from '@kbn/expressions-plugin/common';
import type { EpisodesFilterState } from '@kbn/alerting-v2-common-queries';
import { useSpaceId } from './use_space_id';
import { queryKeys } from '../query_keys';
import { buildEpisodesHistogramQuery } from '../queries/episodes_query';
import { executeEsqlQuery } from '../utils/execute_esql_query';
import { buildAlertEventsTimeRangeFilter } from '../utils/build_alert_events_time_range_filter';
import { fetchFromSource } from '../utils/fetch_from_sources';
import { useAdditionalEpisodesDataSource } from '../context/episode_data_source_context';
import {
  generateTimeBuckets,
  computeOverlapCounts,
  formatHistogramDatatable,
  type HistogramEpisodeRow,
} from '../utils/histogram_utils';
import { HISTOGRAM_EPISODE_LIMIT } from '../constants';

interface HistogramQueryData {
  rows: HistogramEpisodeRow[];
  isCapHit: boolean;
}

export interface UseEpisodesHistogramQueryOptions {
  services: {
    expressions: ExpressionsStart;
    spaces: SpacesPluginStart;
    http: HttpStart;
  };
  filterState: EpisodesFilterState;
  timeRange?: TimeRange;
  bucketInterval: string;
  breakdownField?: string;
}

export interface UseEpisodesHistogramQueryResult {
  table: Datatable | undefined;
  isLoading: boolean;
  error: Error | undefined;
  isCapHit: boolean;
  refetch: () => void;
}

export const useEpisodesHistogramQuery = ({
  services,
  filterState,
  timeRange,
  bucketInterval,
  breakdownField,
}: UseEpisodesHistogramQueryOptions): UseEpisodesHistogramQueryResult => {
  const additionalEpisodesDataSource = useAdditionalEpisodesDataSource();
  const spaceId = useSpaceId(services.spaces);

  const {
    data: queryResult,
    isLoading,
    error,
    refetch,
  } = useQuery<HistogramQueryData, Error>({
    // bucketInterval is used for client-side bucketing only — omitted from queryKey intentionally
    queryKey: queryKeys.histogram(
      spaceId,
      filterState,
      timeRange,
      breakdownField,
      additionalEpisodesDataSource?.id
    ),
    queryFn: async ({ signal }) => {
      const timeRangeFilter = buildAlertEventsTimeRangeFilter(timeRange);
      const [v2Rows, sourceHistograms] = await Promise.all([
        executeEsqlQuery<HistogramEpisodeRow>({
          expressions: services.expressions,
          query: buildEpisodesHistogramQuery(spaceId, filterState, breakdownField).print('basic'),
          input: {
            type: 'kibana_context' as const,
            esqlVariables: [],
            ...(timeRangeFilter ? { filters: [timeRangeFilter] } : {}),
          },
          abortSignal: signal,
        }),
        fetchFromSource(additionalEpisodesDataSource, (source) =>
          source.fetchHistogram?.({
            services,
            filterState,
            timeRange,
            breakdownField,
            abortSignal: signal,
          })
        ),
      ]);

      return {
        rows: [...v2Rows, ...sourceHistograms.results.flatMap(({ rows }) => rows)],
        isCapHit:
          v2Rows.length >= HISTOGRAM_EPISODE_LIMIT ||
          sourceHistograms.results.some(({ isCapHit }) => isCapHit),
      };
    },
  });

  const isCapHit = queryResult?.isCapHit ?? false;
  const rawEpisodes = queryResult?.rows;

  const table = useMemo<Datatable | undefined>(() => {
    if (!rawEpisodes) return undefined;
    const startMs =
      dateMath.parse(timeRange?.from ?? 'now-24h')?.valueOf() ?? Date.now() - 86_400_000;
    const endMs =
      dateMath.parse(timeRange?.to ?? 'now', { roundUp: true })?.valueOf() ?? Date.now();
    const buckets = generateTimeBuckets(startMs, endMs, bucketInterval);
    const counts = computeOverlapCounts(rawEpisodes, buckets, breakdownField);

    // When a breakdown is active, future buckets (no overlapping episodes) produce no rows.
    // Fill those gaps with zero-count entries for each category that appears in other buckets
    // so the chart x-axis always covers the full selected time range.
    if (breakdownField && counts.length > 0) {
      const knownCategories = [...new Set(counts.map((c) => c.breakdown!))];
      const coveredBuckets = new Set(counts.map((c) => c.bucketStart));
      for (const { start } of buckets) {
        if (!coveredBuckets.has(start)) {
          for (const breakdown of knownCategories) {
            counts.push({ bucketStart: start, count: 0, breakdown });
          }
        }
      }
    }

    return formatHistogramDatatable(counts, breakdownField);
  }, [rawEpisodes, timeRange, bucketInterval, breakdownField]);

  return {
    table,
    isLoading,
    error: error ?? undefined,
    isCapHit,
    refetch,
  };
};
