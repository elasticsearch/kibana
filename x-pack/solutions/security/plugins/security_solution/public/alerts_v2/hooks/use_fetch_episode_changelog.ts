/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { DataPublicPluginStart } from '@kbn/data-plugin/public';
import { useQuery } from '@kbn/react-query';
import { esql } from '@elastic/esql';
import { esqlResponseToObjectRows } from '@kbn/alerting-v2-episodes-ui/utils/esql_response_to_rows';
import { runEsqlAsyncSearch } from '@kbn/alerting-v2-episodes-ui/utils/run_esql_async_search';

const ALERT_ACTIONS_DATA_STREAM = '.alert-actions';

export interface EpisodeChangelogEntry {
  '@timestamp': string;
  action_type: string;
  actor: string | null;
  reason: string | null;
  episode_id: string | null;
  group_hash: string;
  tags: string[] | null;
  assignee_uid: string | null;
  expiry: string | null;
}

const buildEpisodeChangelogQuery = (episodeId: string, groupHash: string) => {
  return esql.from(ALERT_ACTIONS_DATA_STREAM)
    .where`episode_id == ${episodeId} OR (group_hash == ${groupHash} AND episode_id IS NULL)`
    .where`action_type IN ("ack", "unack", "snooze", "unsnooze", "deactivate", "activate", "tag", "assign", "closed", "open")`.sort(
    ['@timestamp', 'DESC']
  ).pipe`LIMIT 200`.keep(
    '@timestamp',
    'action_type',
    'actor',
    'reason',
    'episode_id',
    'group_hash',
    'tags',
    'assignee_uid',
    'expiry'
  );
};

export interface UseFetchEpisodeChangelogOptions {
  episodeId: string | undefined;
  groupHash: string | undefined;
  data: DataPublicPluginStart;
}

export const useFetchEpisodeChangelog = ({
  episodeId,
  groupHash,
  data,
}: UseFetchEpisodeChangelogOptions) => {
  return useQuery({
    queryKey: ['alert-episodes', 'episode-changelog', episodeId, groupHash],
    queryFn: ({ signal }) =>
      runEsqlAsyncSearch({
        data,
        params: {
          query: buildEpisodeChangelogQuery(episodeId!, groupHash!).print('basic'),
          time_zone: 'UTC',
        },
        abortSignal: signal,
      }),
    select: (raw) => esqlResponseToObjectRows<EpisodeChangelogEntry>(raw),
    enabled: Boolean(episodeId) && Boolean(groupHash),
  });
};
