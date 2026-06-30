/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { calculateAuto } from '@kbn/calculate-auto';
import { type QueryFunctionContext, useQuery } from '@kbn/react-query';
import type { QueryOccurrenceSeries, StreamQuery } from '@kbn/streams-schema';
import moment from 'moment';
import { useKibana } from '../use_kibana';
import { useTimefilter } from '../use_timefilter';
import { useFetchErrorToast } from '../use_fetch_error_toast';

export interface StreamQueryStats {
  query: StreamQuery;
  stream_name: string;
  occurrences: Array<{ x: number; y: number }>;
  change_points: QueryOccurrenceSeries['change_points'];
  rule_backed: boolean;
}

type SignificantEventsStatsFetchResult =
  | undefined
  | {
      queries: StreamQueryStats[];
      aggregated_occurrences: { x: number; y: number }[];
      total_occurrences: number;
    };

export const useFetchQueryOccurrenceStats = (
  options: { name?: string; query?: string } | undefined = {},
  deps: unknown[] = []
) => {
  const { name, query } = options;
  const {
    dependencies: {
      start: {
        streams: { streamsRepositoryClient },
        data,
      },
    },
  } = useKibana();
  const showFetchErrorToast = useFetchErrorToast();

  const { timeState } = useTimefilter();

  const fetchQueryOccurrenceStats = async ({
    signal,
  }: QueryFunctionContext): Promise<SignificantEventsStatsFetchResult> => {
    const isoFrom = new Date(timeState.start).toISOString();
    const isoTo = new Date(timeState.end).toISOString();

    const { min, max } = data.query.timefilter.timefilter.calculateBounds({
      from: isoFrom,
      to: isoTo,
    });

    if (!min || !max) {
      return undefined;
    }

    const bucketSize = calculateAuto.near(50, moment.duration(max.diff(min)));
    if (!bucketSize) {
      return undefined;
    }

    const intervalString = `${bucketSize.asSeconds()}s`;

    const requestPromise = streamsRepositoryClient.fetch(
      'GET /internal/streams/_query_occurrence_stats',
      {
        params: {
          query: {
            from: isoFrom,
            to: isoTo,
            bucketSize: intervalString,
            query: query?.trim() ?? '',
            streamNames: name ? [name] : undefined,
          },
        },
        signal: signal ?? null,
      }
    );

    return await requestPromise.then(
      ({ queries: queryOccurrenceSeries, aggregated_occurrences: aggregatedOccurrences }) => {
        return {
          queries: queryOccurrenceSeries.map((series) => {
            const { occurrences, change_points, stream_name, rule_backed, ...rest } = series;
            return {
              query: rest,
              stream_name,
              change_points,
              occurrences: occurrences.map((occurrence) => ({
                x: new Date(occurrence.date).getTime(),
                y: occurrence.count,
              })),
              rule_backed,
            };
          }),
          aggregated_occurrences: aggregatedOccurrences.map((occurrence) => ({
            x: new Date(occurrence.date).getTime(),
            y: occurrence.count,
          })),
          total_occurrences: aggregatedOccurrences.reduce(
            (sum, occurrence) => sum + occurrence.count,
            0
          ),
        };
      }
    );
  };

  return useQuery<SignificantEventsStatsFetchResult, Error>({
    queryKey: ['queryOccurrenceStats', name, timeState.start, timeState.end, query, ...deps],
    queryFn: fetchQueryOccurrenceStats,
    onError: showFetchErrorToast,
  });
};
