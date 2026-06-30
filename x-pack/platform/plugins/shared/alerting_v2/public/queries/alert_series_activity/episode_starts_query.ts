/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { esql } from '@elastic/esql';
import type { AlertEpisodeStatus } from '@kbn/alerting-v2-schemas';
import { ALERT_EVENTS_DATA_STREAM } from '@kbn/alerting-v2-episodes-ui/constants';

/**
 * Upper bound on phase rows per episode. A flapping episode can re-enter `active`
 * and `recovering` many times, so we budget several runs per status rather than
 * the four distinct statuses.
 */
const MAX_PHASES_PER_EPISODE = 32;

export interface BuildEpisodeStartsQueryOptions {
  ruleId: string;
  /** The exact episodes being drawn (from {@link buildEpisodeSelectionQuery}). */
  episodeIds: string[];
}

/**
 * Raw ES|QL row: the earliest `@timestamp` per contiguous run
 * `(episode.id, episode.status, episode.status_started_at)`.
 */
export interface EpisodeStartRow {
  'episode.id': string;
  'episode.status': AlertEpisodeStatus;
  /** Contiguous-run discriminator — null for events written before this field existed. */
  'episode.status_started_at': string | null;
  /** ISO timestamp — MIN(@timestamp) for this contiguous run, across all time. */
  episode_start: string;
}

/**
 * Resolves each episode's true phase start, `MIN(@timestamp) BY episode.id,
 * episode.status, episode.status_started_at`, scoped only by `rule.id` and the
 * selected `episode.id`s. Grouping by the contiguous-run discriminator keeps the
 * repeated runs of a flapping series distinct.
 */
export const buildEpisodeStartsQuery = ({ ruleId, episodeIds }: BuildEpisodeStartsQueryOptions) => {
  const episodeLiterals = episodeIds.map((id) => esql.str(id));

  return (
    esql.from(ALERT_EVENTS_DATA_STREAM).where`type == "alert"`.where`rule.id == ${ruleId}`
      .where`episode.id IN (${episodeLiterals})`
      .pipe`STATS episode_start = MIN(@timestamp) BY episode.id, episode.status, episode.status_started_at`
      // Explicit ceiling (phases × episodes) so the implicit result cap can't clip a phase.
      .limit(Math.max(episodeIds.length * MAX_PHASES_PER_EPISODE, 1))
      .keep('episode.id', 'episode.status', 'episode.status_started_at', 'episode_start')
  );
};
