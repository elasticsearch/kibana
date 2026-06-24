/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { esql } from '@elastic/esql';
import type { AlertEpisodeStatus } from '@kbn/alerting-v2-schemas';
import { ALERT_EVENTS_DATA_STREAM, TIME_FIELD } from '../constants';

export interface EpisodeEventRow {
  '@timestamp': string;
  'episode.id': string;
  'episode.status': AlertEpisodeStatus;
  'rule.id': string;
  group_hash: string;
  severity?: string | null;
  data?: string | Record<string, unknown> | null;
}

const ALERT_EPISODE_EVENT_FIELDS = [
  '@timestamp',
  'episode.id',
  'episode.status',
  'rule.id',
  'group_hash',
  'severity',
  'data',
] as const;

/**
 * ES|QL query returning all events for a single alert episode, oldest first.
 */
export const buildEpisodeEventsEsqlQuery = (spaceId: string, episodeId: string) => {
  // prettier-ignore
  return esql.from([ALERT_EVENTS_DATA_STREAM], ['_source'])
    .where`space_id == ${spaceId}`
    .where`type == "alert"`
    .where`episode.id == ${episodeId}`
    .pipe`EVAL data = JSON_EXTRACT(_source, "$.data")`
    .sort([TIME_FIELD, 'ASC'])
    .keep(...ALERT_EPISODE_EVENT_FIELDS);
};
