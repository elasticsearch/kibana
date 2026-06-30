/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { esql, type ComposerQuery } from '@elastic/esql';
import type {
  AlertEventStatus,
  AlertEpisodeStatus,
} from '../../resources/datastreams/alert_events';
import { ALERT_EVENTS_DATA_STREAM } from '../../resources/datastreams/alert_events';

interface GetLatestAlertEventStateQueryParams {
  ruleId: string;
  groupHashes: string[];
}

export interface LatestAlertEventState {
  last_status: AlertEventStatus;
  last_episode_id: string | null;
  last_episode_status: AlertEpisodeStatus | null;
  last_episode_status_count: number | null;
  last_episode_status_started_at: string | null;
  last_episode_timestamp: string | null;
  group_hash: string;
}

export const getLatestAlertEventStateQuery = ({
  ruleId,
  groupHashes,
}: GetLatestAlertEventStateQueryParams): ComposerQuery => {
  let query = esql.from(ALERT_EVENTS_DATA_STREAM);

  // Only consider director-processed events (type "alert" with episode state).
  // Without this, docs without episode or with null episode.status can be included
  // in STATS and LAST(episode.status, @timestamp) may yield null, so the next
  // run would see no previous state and keep outputting pending.
  const groupHashValues = groupHashes.map((hash) => esql.str(hash));
  query = query.where`rule.id == ${{
    ruleId,
  }} AND group_hash IN (${groupHashValues}) AND type == "alert" AND episode.status IS NOT NULL`;

  query = query.pipe`STATS
      last_status = LAST(status, @timestamp),
      last_episode_id = LAST(episode.id, @timestamp),
      last_episode_status = LAST(episode.status, @timestamp),
      last_episode_status_count = LAST(episode.status_count, @timestamp),
      last_episode_status_started_at = LAST(episode.status_started_at, @timestamp),
      last_episode_timestamp = MAX(@timestamp)
    BY group_hash`;

  query = query.keep(
    'last_status',
    'last_episode_id',
    'last_episode_status',
    'last_episode_status_count',
    'last_episode_status_started_at',
    'last_episode_timestamp',
    'group_hash'
  );

  return query;
};
