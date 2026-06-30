/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { esql } from '@elastic/esql';
import { ALERT_EVENTS_DATA_STREAM } from '@kbn/alerting-v2-episodes-ui/constants';

/**
 * Collapses each episode's per-execution events into status *phases*: one
 * `[seg_start, seg_end]` row per contiguous `episode.status` run.
 * Scoped by the selected `episode.id`s and bounded to the display window — this
 * query supplies the segment *geometry* drawn in view. The bar's true start is
 * resolved separately by the untimed `buildEpisodeStartsQuery` (window-independent)
 * and overlaid via `applyEpisodeStarts`. Result shape is the package's
 * `AlertTimelinePhaseRow`.
 *
 * Flapping: grouping additionally `BY episode.status_started_at` (the Director
 * stamps every event in a contiguous run with the same value) keeps non-contiguous
 * runs of the same status separate — active → recovering → active yields three
 * rows instead of collapsing the two active runs into one span.
 */

/**
 * Upper bound on phase rows per episode. A flapping episode can re-enter `active`
 * and `recovering` many times, so we budget several runs per status rather than
 * the four distinct statuses.
 */
const MAX_PHASES_PER_EPISODE = 32;

export interface BuildEpisodePhasesQueryOptions {
  ruleId: string;
  /** Display window lower bound (epoch ms) — segments are drawn within this window. */
  windowStartMs: number;
  windowEndMs: number;
  /** The exact episodes being drawn (from {@link buildEpisodeSelectionQuery}). */
  episodeIds: string[];
}

const toIsoUtc = (ms: number) => new Date(ms).toISOString();

export const buildEpisodePhasesQuery = ({
  ruleId,
  windowStartMs,
  windowEndMs,
  episodeIds,
}: BuildEpisodePhasesQueryOptions) => {
  const fromIso = toIsoUtc(windowStartMs);
  const toIso = toIsoUtc(windowEndMs);
  const episodeLiterals = episodeIds.map((id) => esql.str(id));

  return (
    esql.from(ALERT_EVENTS_DATA_STREAM).where`type == "alert"`.where`rule.id == ${ruleId}`
      .where`@timestamp >= ${fromIso}::DATETIME AND @timestamp <= ${toIso}::DATETIME`
      .where`episode.id IN (${episodeLiterals})`
      .pipe`STATS seg_start = MIN(@timestamp), seg_end = MAX(@timestamp) BY episode.id, episode.status, episode.status_started_at, group_hash`
      // Explicit ceiling (phases × episodes) so the implicit result cap can't clip a phase.
      .limit(Math.max(episodeIds.length * MAX_PHASES_PER_EPISODE, 1))
      .keep(
        'episode.id',
        'episode.status',
        'episode.status_started_at',
        'group_hash',
        'seg_start',
        'seg_end'
      )
  );
};
