/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { DataPublicPluginStart } from '@kbn/data-plugin/public';
import { useQuery } from '@kbn/react-query';
import type { SpacesPluginStart } from '@kbn/spaces-plugin/public';
import {
  buildEpisodeActionsHistoryQuery,
  type EpisodeActionHistoryEntry,
} from '../queries/episode_actions_history_query';
import { esqlResponseToObjectRows } from '../utils/esql_response_to_rows';
import { runEsqlAsyncSearch } from '../utils/run_esql_async_search';
import { queryKeys } from '../query_keys';
import { useSpaceId } from './use_space_id';

export interface UseFetchEpisodeActionsHistoryQueryOptions {
  episodeId: string | undefined;
  groupHash: string | undefined;
  services: { data: DataPublicPluginStart; spaces: SpacesPluginStart };
}

export const useFetchEpisodeActionsHistoryQuery = ({
  episodeId,
  groupHash,
  services,
}: UseFetchEpisodeActionsHistoryQueryOptions) => {
  const { data } = services;
  const spaceId = useSpaceId(services.spaces);

  return useQuery({
    queryKey: queryKeys.actionsHistory(spaceId, episodeId ?? '', groupHash ?? ''),
    queryFn: ({ signal }) =>
      runEsqlAsyncSearch({
        data,
        params: {
          query: buildEpisodeActionsHistoryQuery(spaceId, episodeId!, groupHash!).print('basic'),
          time_zone: 'UTC',
        },
        abortSignal: signal,
      }),
    select: (raw) => esqlResponseToObjectRows<EpisodeActionHistoryEntry>(raw),
    enabled: Boolean(episodeId) && Boolean(groupHash),
  });
};
