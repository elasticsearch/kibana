/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { ALERT_EPISODE_STATUS, type AlertEpisodeStatus } from '@kbn/alerting-v2-schemas';
import type {
  AlertTimelineData,
  AlertTimelineGroupingValues,
  AlertTimelinePhaseRow,
  AlertTimelineSegment,
  AlertTimelineSeries,
  AlertTimelineSortPolicy,
  AlertTimelineSummary,
  AlertTimelineTransition,
} from './types';

const EMPTY_GROUPING_VALUES: Record<string, string | null> = {};

const isOpenStatus = (status: AlertEpisodeStatus): boolean =>
  status !== ALERT_EPISODE_STATUS.INACTIVE;

const compareSeries = (
  a: AlertTimelineSeries,
  b: AlertTimelineSeries,
  sort: AlertTimelineSortPolicy
): number => {
  switch (sort) {
    case 'started_asc':
      return a.firstEventMs - b.firstEventMs;
    case 'started_desc':
      return b.firstEventMs - a.firstEventMs;
    case 'longest_open':
      return b.longestOpenDurationMs - a.longestOpenDurationMs;
    case 'recently_active':
      return b.lastEventMs - a.lastEventMs;
  }
};

interface ParsedPhase {
  episodeId: string;
  status: AlertEpisodeStatus;
  startMs: number;
  endMs: number;
  groupHash: string;
}

/**
 * Builds timeline lanes from per-status episode phase rows (`buildEpisodePhasesQuery`):
 * order each episode's phases by start and link each to the next (Gantt bar = phases
 * end to end). An open episode's last phase tails to `windowEndMs`; a terminal INACTIVE phase
 * just marks recovery (no bar). Summary/total are supplied externally. Segments are
 * clipped to `[windowStartMs, windowEndMs]` for drawing; each segment keeps its `trueStartMs`
 * (the window-independent start overlaid by `applyEpisodeStarts`) so the tooltip
 * reports the real start even when the rendered left edge is clamped to `windowStartMs`.
 */
export const deriveAlertTimelineData = (
  phaseRows: AlertTimelinePhaseRow[],
  groupingValuesByHash: AlertTimelineGroupingValues,
  sort: AlertTimelineSortPolicy,
  windowStartMs: number,
  windowEndMs: number,
  summary: AlertTimelineSummary
): AlertTimelineData => {
  const phasesBySeries = new Map<string, ParsedPhase[]>();

  for (const row of phaseRows) {
    const startMs = Date.parse(row.seg_start);
    const endMs = Date.parse(row.seg_end);
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) continue;
    const phase: ParsedPhase = {
      episodeId: row['episode.id'],
      status: row['episode.status'],
      startMs,
      endMs,
      groupHash: row.group_hash,
    };
    const list = phasesBySeries.get(row.group_hash);
    if (list) {
      list.push(phase);
    } else {
      phasesBySeries.set(row.group_hash, [phase]);
    }
  }

  const seriesByHash = new Map<string, AlertTimelineSeries>();

  for (const [groupHash, phases] of phasesBySeries) {
    const phasesByEpisode = new Map<string, ParsedPhase[]>();
    for (const phase of phases) {
      const list = phasesByEpisode.get(phase.episodeId);
      if (list) list.push(phase);
      else phasesByEpisode.set(phase.episodeId, [phase]);
    }

    const segments: AlertTimelineSegment[] = [];
    const transitions: AlertTimelineTransition[] = [];
    let hasOpenEpisode = false;
    let longestOpenDurationMs = 0;
    let seriesFirstMs = Infinity;
    let seriesLastMs = -Infinity;

    for (const [episodeId, episodePhases] of phasesByEpisode) {
      episodePhases.sort((a, b) => a.startMs - b.startMs);

      const earliestStartMs = episodePhases[0].startMs;

      for (let i = 0; i < episodePhases.length; i++) {
        const phase = episodePhases[i];
        const next = episodePhases[i + 1];

        // A dot at the entry into each status (start, transitions, recovery).
        transitions.push({ episodeId, status: phase.status, tsMs: phase.startMs });

        if (next) {
          // This phase runs until the next one begins.
          if (next.startMs > phase.startMs) {
            segments.push({
              episodeId,
              status: phase.status,
              x0Ms: phase.startMs,
              x1Ms: next.startMs,
              trueStartMs: phase.startMs,
            });
          }
        } else if (isOpenStatus(phase.status)) {
          // Last phase, still open: tail to the window edge. (Could cap at `endMs`
          // to avoid overstating a stopped rule — follow-up.)
          if (windowEndMs > phase.startMs) {
            segments.push({
              episodeId,
              status: phase.status,
              x0Ms: phase.startMs,
              x1Ms: windowEndMs,
              trueStartMs: phase.startMs,
            });
          }
          hasOpenEpisode = true;
          const openDuration = Math.max(0, windowEndMs - earliestStartMs);
          if (openDuration > longestOpenDurationMs) longestOpenDurationMs = openDuration;
        }
        // A terminal INACTIVE last phase draws nothing (recovery marker only).

        if (phase.startMs < seriesFirstMs) seriesFirstMs = phase.startMs;
        if (phase.endMs > seriesLastMs) seriesLastMs = phase.endMs;
      }
    }

    // Clip the *rendered* edge to the visible window (phases may start before
    // `windowStartMs`). `trueStartMs` is left untouched so the tooltip can still report
    // the real start of a clipped bar.
    const clippedSegments: AlertTimelineSegment[] = [];
    for (const s of segments) {
      if (s.x1Ms <= windowStartMs) continue;
      clippedSegments.push(s.x0Ms < windowStartMs ? { ...s, x0Ms: windowStartMs } : s);
    }
    const clippedTransitions = transitions.filter((t) => t.tsMs >= windowStartMs);

    seriesByHash.set(groupHash, {
      groupHash,
      groupingValues: groupingValuesByHash[groupHash] ?? EMPTY_GROUPING_VALUES,
      segments: clippedSegments,
      transitions: clippedTransitions,
      firstEventMs: seriesFirstMs,
      lastEventMs: seriesLastMs,
      hasOpenEpisode,
      longestOpenDurationMs,
      episodeCount: phasesByEpisode.size,
    });
  }

  const rows = [...seriesByHash.values()].sort((a, b) => compareSeries(a, b, sort));

  return {
    rows,
    summary,
  };
};
