/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { DataPublicPluginStart } from '@kbn/data-plugin/public';
import { useQuery } from '@kbn/react-query';
import type { SpacesPluginStart } from '@kbn/spaces-plugin/public';
import { QUERY_STALE_TIME } from '../constants';
import { esqlResponseToObjectRows } from '../utils/esql_response_to_rows';
import { runEsqlAsyncSearch } from '../utils/run_esql_async_search';
import { buildEpisodeTrendQuery, parseEpisodeTrendRows } from '../queries/episode_trend_query';
import { queryKeys } from '../query_keys';
import { useSpaceId } from './use_space_id';

export interface UseFetchEpisodeTrendQueryOptions {
  episodeId: string | undefined;
  /** Metric labels to project from each event's `data`; one series per label. */
  metricLabels: string[];
  services: { data: DataPublicPluginStart; spaces: SpacesPluginStart };
}

/**
 * Loads an episode's `.rule-events` rows (oldest first) carrying the lifecycle
 * status and, for each requested metric label, the value the rule evaluated for that
 * execution — the source for both the trend lines and the state-transition annotations.
 */
export const useFetchEpisodeTrendQuery = ({
  episodeId,
  metricLabels,
  services,
}: UseFetchEpisodeTrendQueryOptions) => {
  const { data } = services;
  const spaceId = useSpaceId(services.spaces);

  return useQuery({
    queryKey: queryKeys.episodeTrend(spaceId, episodeId ?? '', metricLabels),
    queryFn: ({ signal }) =>
      runEsqlAsyncSearch({
        data,
        params: {
          query: buildEpisodeTrendQuery(spaceId, episodeId!, metricLabels).print('basic'),
          time_zone: 'UTC',
        },
        abortSignal: signal,
      }),
    select: (raw) => parseEpisodeTrendRows(esqlResponseToObjectRows(raw), metricLabels),
    enabled: Boolean(episodeId),
    staleTime: QUERY_STALE_TIME,
  });
};
