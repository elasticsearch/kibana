/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { esql } from '@elastic/esql';
import { ALERT_ACTIONS_DATA_STREAM } from '../constants';

export interface EpisodeActionHistoryEntry {
  '@timestamp': string;
  action_type: string;
  actor: string | null;
  episode_id: string | null;
  group_hash: string | null;
  tags: string[] | null;
  assignee_uid: string | null;
  expiry: string | null;
  reason: string | null;
}

/**
 * Returns all individual action records for an episode (both episode-level and group-level),
 * sorted newest-first. Non-aggregating counterpart to buildEpisodeActionsQuery.
 */
export const buildEpisodeActionsHistoryQuery = (
  spaceId: string,
  episodeId: string,
  groupHash: string
) => {
  // prettier-ignore
  return esql
    .from(ALERT_ACTIONS_DATA_STREAM)
    .where`space_id == ${spaceId}`
    .where`episode_id == ${episodeId} OR (group_hash == ${groupHash} AND episode_id IS NULL)`
    .where`action_type IN ("ack", "unack", "snooze", "unsnooze", "deactivate", "activate", "tag", "assign")`
    .sort(['@timestamp', 'DESC'])
    .pipe`LIMIT 200`
    .keep(
      '@timestamp',
      'action_type',
      'actor',
      'episode_id',
      'group_hash',
      'tags',
      'assignee_uid',
      'expiry',
      'reason'
    );
};
