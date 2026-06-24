/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { esql } from '@elastic/esql';
import type { ComposerQuery } from '@elastic/esql';
import { ALERT_EVENTS_DATA_STREAM, TIME_FIELD } from '../constants';
import { addEpisodeAggregation } from './episodes_query';

// Subset of `ALERT_EPISODE_FIELDS` actually populated by this query. The action
// `last_*` columns are excluded because we only read from `.rule-events` here
// and don't run the action INLINE STATS — keeping them caused a runtime error.
export const RELATED_EPISODE_FIELDS = [
  '@timestamp',
  'episode.id',
  'episode.status',
  'rule.id',
  'group_hash',
  'first_timestamp',
  'last_timestamp',
  'duration',
  'episode_data',
  'severity',
] as const;

const RELATED_EPISODE_LIMIT = 5;

export const finishRelatedEpisodesQuery = (query: ComposerQuery) => {
  addEpisodeAggregation(query);

  return query
    .sort([TIME_FIELD, 'DESC'])
    .limit(RELATED_EPISODE_LIMIT)
    .keep(...RELATED_EPISODE_FIELDS);
};

export const buildRelatedBaseQuery = (
  spaceId: string,
  ruleId: string,
  excludeEpisodeId: string
) => {
  // Because addEpisodeAggregation uses JSON_EXTRACT(_source, "data"),
  // _source must be included here.
  return esql.from([ALERT_EVENTS_DATA_STREAM], ['_source']).where`space_id == ${spaceId}`
    .where`type == "alert"`.where`rule.id == ${ruleId} AND episode.id != ${excludeEpisodeId}`;
};
