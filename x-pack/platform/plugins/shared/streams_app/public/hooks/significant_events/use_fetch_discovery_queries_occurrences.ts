/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { calculateAuto } from '@kbn/calculate-auto';
import { type QueryFunctionContext, useQuery } from '@kbn/react-query';
import type { QueriesOccurrencesGetResponse } from '@kbn/streams-schema';
import moment from 'moment';
import { useKibana } from '../use_kibana';
import { useTimefilter } from '../use_timefilter';
import { useFetchErrorToast } from '../use_fetch_error_toast';

export interface DiscoveryQueriesOccurrencesFetchResult {
  occurrences_histogram: Array<{ x: number; y: number }>;
  total_occurrences: number;
}

export const DISCOVERY_QUERIES_OCCURRENCES_QUERY_KEY = ['discoveryQueriesOccurrences'] as const;

export const useFetchDiscoveryQueriesOccurrences = (
  options: { name?: string; query?: string } | undefined = {},
  deps: unknown[] = []
) => {
  const { name, query } = options ?? {};
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

  const fetchDiscoveryQueriesOccurrences = async ({
    signal,
  }: QueryFunctionContext): Promise<DiscoveryQueriesOccurrencesFetchResult | undefined> => {
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

    const response: QueriesOccurrencesGetResponse = await streamsRepositoryClient.fetch(
      'GET /internal/streams/_queries/_occurrences',
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

    return {
      occurrences_histogram: response.occurrences_histogram.map(
        (bucket: { x: string; y: number }) => ({
          x: new Date(bucket.x).getTime(),
          y: bucket.y,
        })
      ),
      total_occurrences: response.total_occurrences,
    };
  };

  return useQuery<DiscoveryQueriesOccurrencesFetchResult | undefined, Error>({
    queryKey: [
      ...DISCOVERY_QUERIES_OCCURRENCES_QUERY_KEY,
      name,
      timeState.start,
      timeState.end,
      query,
      ...deps,
    ],
    queryFn: fetchDiscoveryQueriesOccurrences,
    onError: showFetchErrorToast,
    keepPreviousData: true,
  });
};
