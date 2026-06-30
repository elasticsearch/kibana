/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { ALERT_EPISODE_STATUS, type AlertEpisodeStatus } from '@kbn/alerting-v2-schemas';
import {
  deriveAlertTimelineData,
  type AlertTimelineSummary,
  type AlertTimelinePhaseRow,
} from '@kbn/alerting-v2-episodes-ui/alert_timeline';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const T0 = Date.UTC(2026, 3, 1, 0, 0, 0); // 2026-04-01
const NOW = T0 + 7 * DAY_MS;

const STUB_SUMMARY: AlertTimelineSummary = {
  episodesStarted: 0,
  recovered: 0,
  stillOpen: 0,
  medianDurationMs: 0,
};

interface PhaseSpec {
  episodeId: string;
  groupHash?: string;
  status: AlertEpisodeStatus;
  /** Phase start (MIN @timestamp). Drives the segment's left edge. */
  startMs: number;
  /** Phase end (MAX @timestamp). Defaults to `startMs`; drives series lastEventMs only. */
  endMs?: number;
}

const phase = ({
  episodeId,
  groupHash = 'gh-A',
  status,
  startMs,
  endMs,
}: PhaseSpec): AlertTimelinePhaseRow => ({
  'episode.id': episodeId,
  'episode.status': status,
  group_hash: groupHash,
  seg_start: new Date(startMs).toISOString(),
  seg_end: new Date(endMs ?? startMs).toISOString(),
});

describe('deriveAlertTimelineData', () => {
  it('lays an episode out as one segment per status phase, linking each phase to the next', () => {
    const phases: AlertTimelinePhaseRow[] = [
      phase({ episodeId: 'ep-1', status: ALERT_EPISODE_STATUS.PENDING, startMs: T0 }),
      phase({ episodeId: 'ep-1', status: ALERT_EPISODE_STATUS.ACTIVE, startMs: T0 + HOUR_MS }),
      phase({
        episodeId: 'ep-1',
        status: ALERT_EPISODE_STATUS.RECOVERING,
        startMs: T0 + 2 * HOUR_MS,
      }),
      phase({
        episodeId: 'ep-1',
        status: ALERT_EPISODE_STATUS.INACTIVE,
        startMs: T0 + 3 * HOUR_MS,
      }),
    ];

    const result = deriveAlertTimelineData(phases, {}, 'started_asc', T0, NOW, STUB_SUMMARY);
    const row = result.rows[0];

    // The terminal INACTIVE phase is the recovery marker — no bar drawn for it.
    expect(row.segments).toEqual([
      {
        episodeId: 'ep-1',
        status: ALERT_EPISODE_STATUS.PENDING,
        x0Ms: T0,
        x1Ms: T0 + HOUR_MS,
        trueStartMs: T0,
      },
      {
        episodeId: 'ep-1',
        status: ALERT_EPISODE_STATUS.ACTIVE,
        x0Ms: T0 + HOUR_MS,
        x1Ms: T0 + 2 * HOUR_MS,
        trueStartMs: T0 + HOUR_MS,
      },
      {
        episodeId: 'ep-1',
        status: ALERT_EPISODE_STATUS.RECOVERING,
        x0Ms: T0 + 2 * HOUR_MS,
        x1Ms: T0 + 3 * HOUR_MS,
        trueStartMs: T0 + 2 * HOUR_MS,
      },
    ]);
    // A dot at the entry into each status, including start and recovery.
    expect(row.transitions.map((t) => t.status)).toEqual([
      ALERT_EPISODE_STATUS.PENDING,
      ALERT_EPISODE_STATUS.ACTIVE,
      ALERT_EPISODE_STATUS.RECOVERING,
      ALERT_EPISODE_STATUS.INACTIVE,
    ]);
    expect(row.hasOpenEpisode).toBe(false);
  });

  it('extends the tail segment to windowEndMs for open episodes and tracks longest open', () => {
    const phases: AlertTimelinePhaseRow[] = [
      phase({ episodeId: 'open-long', status: ALERT_EPISODE_STATUS.ACTIVE, startMs: T0 }),
      phase({
        episodeId: 'open-short',
        status: ALERT_EPISODE_STATUS.PENDING,
        startMs: T0 + 6 * HOUR_MS,
      }),
    ];

    const summary: AlertTimelineSummary = {
      episodesStarted: 2,
      recovered: 0,
      stillOpen: 2,
      medianDurationMs: 0,
    };
    const result = deriveAlertTimelineData(phases, {}, 'started_asc', T0, NOW, summary);
    const row = result.rows[0];

    expect(row.hasOpenEpisode).toBe(true);
    expect(row.longestOpenDurationMs).toBe(NOW - T0);
    expect(row.segments.find((s) => s.episodeId === 'open-long')).toEqual({
      episodeId: 'open-long',
      status: ALERT_EPISODE_STATUS.ACTIVE,
      x0Ms: T0,
      x1Ms: NOW,
      trueStartMs: T0,
    });
    expect(result.summary.stillOpen).toBe(2);
  });

  it('groups phases by group_hash into separate lanes', () => {
    const phases: AlertTimelinePhaseRow[] = [
      phase({
        episodeId: 'ep-1',
        groupHash: 'gh-A',
        status: ALERT_EPISODE_STATUS.ACTIVE,
        startMs: T0,
      }),
      phase({
        episodeId: 'ep-1',
        groupHash: 'gh-A',
        status: ALERT_EPISODE_STATUS.INACTIVE,
        startMs: T0 + HOUR_MS,
      }),
      phase({
        episodeId: 'ep-2',
        groupHash: 'gh-B',
        status: ALERT_EPISODE_STATUS.ACTIVE,
        startMs: T0 + 2 * HOUR_MS,
      }),
      phase({
        episodeId: 'ep-2',
        groupHash: 'gh-B',
        status: ALERT_EPISODE_STATUS.INACTIVE,
        startMs: T0 + 3 * HOUR_MS,
      }),
    ];

    const result = deriveAlertTimelineData(phases, {}, 'started_asc', T0, NOW, STUB_SUMMARY);

    expect(result.rows).toHaveLength(2);
    expect(result.rows.map((r) => r.groupHash)).toEqual(['gh-A', 'gh-B']);
  });

  it('renders multiple episodes in one lane independently, each with its true start', () => {
    const phases: AlertTimelinePhaseRow[] = [
      // Older completed episode.
      phase({ episodeId: 'ep-old', status: ALERT_EPISODE_STATUS.ACTIVE, startMs: T0 + HOUR_MS }),
      phase({
        episodeId: 'ep-old',
        status: ALERT_EPISODE_STATUS.INACTIVE,
        startMs: T0 + 3 * HOUR_MS,
      }),
      // Long-running open episode whose start is far earlier — no anchor needed.
      phase({
        episodeId: 'ep-new',
        status: ALERT_EPISODE_STATUS.ACTIVE,
        startMs: T0 + 10 * HOUR_MS,
      }),
    ];

    const result = deriveAlertTimelineData(phases, {}, 'started_asc', T0, NOW, STUB_SUMMARY);
    const row = result.rows[0];

    expect(new Set(row.segments.map((s) => s.episodeId))).toEqual(new Set(['ep-old', 'ep-new']));
    expect(row.segments.find((s) => s.episodeId === 'ep-old')).toEqual({
      episodeId: 'ep-old',
      status: ALERT_EPISODE_STATUS.ACTIVE,
      x0Ms: T0 + HOUR_MS,
      x1Ms: T0 + 3 * HOUR_MS,
      trueStartMs: T0 + HOUR_MS,
    });
    expect(row.segments.find((s) => s.episodeId === 'ep-new')).toEqual({
      episodeId: 'ep-new',
      status: ALERT_EPISODE_STATUS.ACTIVE,
      x0Ms: T0 + 10 * HOUR_MS,
      x1Ms: NOW,
      trueStartMs: T0 + 10 * HOUR_MS,
    });
  });

  it('passes through externally-supplied summary unchanged', () => {
    const phases: AlertTimelinePhaseRow[] = [
      phase({
        episodeId: 'r1',
        groupHash: 'gh-1',
        status: ALERT_EPISODE_STATUS.ACTIVE,
        startMs: T0,
      }),
      phase({
        episodeId: 'r1',
        groupHash: 'gh-1',
        status: ALERT_EPISODE_STATUS.INACTIVE,
        startMs: T0 + HOUR_MS,
      }),
    ];

    const summary: AlertTimelineSummary = {
      episodesStarted: 3,
      recovered: 2,
      stillOpen: 1,
      medianDurationMs: 2 * HOUR_MS,
    };

    const result = deriveAlertTimelineData(phases, {}, 'started_asc', T0, NOW, summary);

    expect(result.summary).toBe(summary);
  });

  it('attaches groupingValues from the lookup map', () => {
    const phases: AlertTimelinePhaseRow[] = [
      phase({
        episodeId: 'ep-1',
        groupHash: 'gh-A',
        status: ALERT_EPISODE_STATUS.ACTIVE,
        startMs: T0,
      }),
      phase({
        episodeId: 'ep-1',
        groupHash: 'gh-A',
        status: ALERT_EPISODE_STATUS.INACTIVE,
        startMs: T0 + HOUR_MS,
      }),
    ];

    const result = deriveAlertTimelineData(
      phases,
      { 'gh-A': { 'host.name': 'web-01' } },
      'started_asc',
      T0,
      NOW,
      STUB_SUMMARY
    );

    expect(result.rows[0].groupingValues).toEqual({ 'host.name': 'web-01' });
  });

  it('sorts by recently_active and longest_open as expected', () => {
    const phases: AlertTimelinePhaseRow[] = [
      phase({
        episodeId: 'old',
        groupHash: 'gh-old',
        status: ALERT_EPISODE_STATUS.ACTIVE,
        startMs: T0,
      }),
      phase({
        episodeId: 'old',
        groupHash: 'gh-old',
        status: ALERT_EPISODE_STATUS.INACTIVE,
        startMs: T0 + HOUR_MS,
        endMs: T0 + HOUR_MS,
      }),
      phase({
        episodeId: 'recent',
        groupHash: 'gh-recent',
        status: ALERT_EPISODE_STATUS.ACTIVE,
        startMs: T0 + 2 * DAY_MS,
      }),
      phase({
        episodeId: 'recent',
        groupHash: 'gh-recent',
        status: ALERT_EPISODE_STATUS.INACTIVE,
        startMs: T0 + 2 * DAY_MS + HOUR_MS,
        endMs: T0 + 2 * DAY_MS + HOUR_MS,
      }),
      // One open active phase spanning T0 → T0+3d (merged heartbeats).
      phase({
        episodeId: 'long-open',
        groupHash: 'gh-long-open',
        status: ALERT_EPISODE_STATUS.ACTIVE,
        startMs: T0,
        endMs: T0 + 3 * DAY_MS,
      }),
    ];

    expect(
      deriveAlertTimelineData(phases, {}, 'recently_active', T0, NOW, STUB_SUMMARY).rows.map(
        (r) => r.groupHash
      )
    ).toEqual(['gh-long-open', 'gh-recent', 'gh-old']);
    expect(
      deriveAlertTimelineData(phases, {}, 'longest_open', T0, NOW, STUB_SUMMARY).rows.map(
        (r) => r.groupHash
      )[0]
    ).toBe('gh-long-open');
  });

  it('clips segments to windowStartMs and suppresses pre-window transitions', () => {
    const WINDOW_START_MS = T0 + 4 * HOUR_MS;
    const WINDOW_END_MS = T0 + 8 * HOUR_MS;

    // The active phase began before the visible window (a wider lookback found it).
    const phases: AlertTimelinePhaseRow[] = [
      phase({
        episodeId: 'ep-1',
        status: ALERT_EPISODE_STATUS.ACTIVE,
        startMs: T0 + 2 * HOUR_MS,
        endMs: T0 + 5 * HOUR_MS,
      }),
      phase({
        episodeId: 'ep-1',
        status: ALERT_EPISODE_STATUS.RECOVERING,
        startMs: T0 + 6 * HOUR_MS,
      }),
      phase({
        episodeId: 'ep-1',
        status: ALERT_EPISODE_STATUS.INACTIVE,
        startMs: T0 + 7 * HOUR_MS,
      }),
    ];

    const result = deriveAlertTimelineData(
      phases,
      {},
      'started_asc',
      WINDOW_START_MS,
      WINDOW_END_MS,
      STUB_SUMMARY
    );
    const row = result.rows[0];

    expect(row.segments).toEqual([
      {
        episodeId: 'ep-1',
        status: ALERT_EPISODE_STATUS.ACTIVE,
        // Rendered edge is clamped to the window, but the true start is preserved
        // so the tooltip can report the real (pre-window) start.
        x0Ms: WINDOW_START_MS,
        x1Ms: T0 + 6 * HOUR_MS,
        trueStartMs: T0 + 2 * HOUR_MS,
      },
      {
        episodeId: 'ep-1',
        status: ALERT_EPISODE_STATUS.RECOVERING,
        x0Ms: T0 + 6 * HOUR_MS,
        x1Ms: T0 + 7 * HOUR_MS,
        trueStartMs: T0 + 6 * HOUR_MS,
      },
    ]);
    expect(row.transitions.map((t) => ({ status: t.status, tsMs: t.tsMs }))).toEqual([
      { status: ALERT_EPISODE_STATUS.RECOVERING, tsMs: T0 + 6 * HOUR_MS },
      { status: ALERT_EPISODE_STATUS.INACTIVE, tsMs: T0 + 7 * HOUR_MS },
    ]);
  });

  describe('flapping (accepted limitation)', () => {
    it('merges non-contiguous same-status runs into one span', () => {
      // active → recovering → active again. The aggregation merges the two active
      // runs into one [start, end]; the re-breach after recovering is smoothed over.
      const phases: AlertTimelinePhaseRow[] = [
        phase({
          episodeId: 'ep-1',
          status: ALERT_EPISODE_STATUS.ACTIVE,
          startMs: T0,
          endMs: T0 + 5 * HOUR_MS,
        }),
        phase({
          episodeId: 'ep-1',
          status: ALERT_EPISODE_STATUS.RECOVERING,
          startMs: T0 + 2 * HOUR_MS,
        }),
      ];

      const result = deriveAlertTimelineData(phases, {}, 'started_asc', T0, NOW, STUB_SUMMARY);
      const row = result.rows[0];

      expect(row.segments).toEqual([
        {
          episodeId: 'ep-1',
          status: ALERT_EPISODE_STATUS.ACTIVE,
          x0Ms: T0,
          x1Ms: T0 + 2 * HOUR_MS,
          trueStartMs: T0,
        },
        {
          episodeId: 'ep-1',
          status: ALERT_EPISODE_STATUS.RECOVERING,
          x0Ms: T0 + 2 * HOUR_MS,
          x1Ms: NOW,
          trueStartMs: T0 + 2 * HOUR_MS,
        },
      ]);
      expect(row.hasOpenEpisode).toBe(true);
    });
  });
});
