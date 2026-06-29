/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { calculateAuto } from '@kbn/calculate-auto';
import { type QueryFunctionContext, useQuery } from '@kbn/react-query';
import type {
  QueriesGetResponse,
  SignificantEventsResponse,
  StreamQuery,
} from '@kbn/streams-schema';
import type { QueryStatus } from '@kbn/streams-plugin/common';
import moment from 'moment';
import { useKibana } from '../use_kibana';
import { useTimefilter } from '../use_timefilter';
import { useFetchErrorToast } from '../use_fetch_error_toast';

export interface SignificantEventQueryRow {
  query: StreamQuery;
  stream_name: string;
  occurrences: Array<{ x: number; y: number }>;
  change_points: SignificantEventsResponse['change_points'];
  rule_backed: boolean;
}

export interface QueriesTableFetchResult {
  queries: SignificantEventQueryRow[];
  page: number;
  perPage: number;
  total: number;
}

export const DISCOVERY_QUERIES_QUERY_KEY = ['discoveryQueries'] as const;

export const useFetchDiscoveryQueries = (
  options: {
    name?: string;
    query?: string;
    page: number;
    perPage: number;
    status?: QueryStatus[];
    enabled?: boolean;
  },
  deps: unknown[] = []
) => {
  const { name, query, page, perPage, status, enabled = true } = options;
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

  const fetchDiscoveryQueries = async ({
    signal,
  }: QueryFunctionContext): Promise<QueriesTableFetchResult | undefined> => {
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

    const response: QueriesGetResponse = await streamsRepositoryClient.fetch(
      'GET /internal/streams/_queries',
      {
        params: {
          query: {
            from: isoFrom,
            to: isoTo,
            bucketSize: intervalString,
            query: query?.trim() ?? '',
            streamNames: name ? [name] : undefined,
            page,
            perPage,
            status,
          },
        },
        signal: signal ?? null,
      }
    );

    return {
      page: response.page,
      perPage: response.perPage,
      total: response.total,
      queries: response.queries.map((series: SignificantEventsResponse) => {
        const { occurrences, change_points, stream_name, rule_backed, ...rest } = series;
        return {
          query: rest,
          stream_name,
          change_points,
          occurrences: occurrences.map(
            (occurrence: SignificantEventsResponse['occurrences'][number]) => ({
              x: new Date(occurrence.date).getTime(),
              y: occurrence.count,
            })
          ),
          rule_backed,
        };
      }),
    };
  };

  return useQuery<QueriesTableFetchResult | undefined, Error>({
    queryKey: [
      ...DISCOVERY_QUERIES_QUERY_KEY,
      name,
      timeState.start,
      timeState.end,
      query,
      page,
      perPage,
      status?.join(','),
      ...deps,
    ],
    queryFn: fetchDiscoveryQueries,
    onError: showFetchErrorToast,
    keepPreviousData: true,
    enabled,
  });
};
