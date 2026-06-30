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
 * `[seg_start, seg_end]` row per contiguous `episode.status` run (≤4 per episode).
 * Scoped by the selected `episode.id`s and bounded to the display window — this
 * query supplies the segment *geometry* drawn in view. The bar's true start is
 * resolved separately by the untimed `buildEpisodeStartsQuery` (window-independent)
 * and overlaid via `applyEpisodeStarts`. Result shape is the package's
 * `AlertTimelinePhaseRow`.
 *
 * Caveat — flapping: `BY episode.id, episode.status` merges non-contiguous runs of
 * the same status (active → recovering → active collapses to one active span).
 */

/** The four `episode.status` values — upper bound on phase rows per episode. */
const MAX_PHASES_PER_EPISODE = 4;

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
      .pipe`STATS seg_start = MIN(@timestamp), seg_end = MAX(@timestamp) BY episode.id, episode.status, group_hash`
      // Explicit ceiling (≤4 phases × episodes) so the implicit result cap can't clip a phase.
      .limit(Math.max(episodeIds.length * MAX_PHASES_PER_EPISODE, 1))
      .keep('episode.id', 'episode.status', 'group_hash', 'seg_start', 'seg_end')
  );
};
