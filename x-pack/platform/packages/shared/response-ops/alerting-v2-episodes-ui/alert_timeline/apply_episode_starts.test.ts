/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { ALERT_EPISODE_STATUS } from '@kbn/alerting-v2-schemas';
import type { AlertTimelinePhaseRow } from './types';
import { applyEpisodeStarts, makeEpisodeStartKey } from './apply_episode_starts';

const iso = (s: string) => new Date(Date.parse(s)).toISOString();

const phase = (overrides: Partial<AlertTimelinePhaseRow> = {}): AlertTimelinePhaseRow => ({
  'episode.id': 'ep-1',
  'episode.status': ALERT_EPISODE_STATUS.ACTIVE,
  group_hash: 'gh-1',
  seg_start: iso('2026-04-05T00:00:00Z'),
  seg_end: iso('2026-04-06T00:00:00Z'),
  ...overrides,
});

describe('applyEpisodeStarts', () => {
  it('overrides seg_start with an earlier true start', () => {
    const rows = [phase()];
    const trueStart = Date.parse('2026-04-01T00:00:00Z');
    const starts = new Map([[makeEpisodeStartKey('ep-1', ALERT_EPISODE_STATUS.ACTIVE), trueStart]]);

    const [out] = applyEpisodeStarts(rows, starts);
    expect(out.seg_start).toBe(iso('2026-04-01T00:00:00Z'));
    // seg_end is untouched.
    expect(out.seg_end).toBe(iso('2026-04-06T00:00:00Z'));
  });

  it('leaves the row unchanged when no start is known (graceful degrade)', () => {
    const rows = [phase()];
    const out = applyEpisodeStarts(rows, new Map());
    expect(out[0]).toBe(rows[0]);
  });

  it('leaves the row unchanged when the true start equals the windowed start', () => {
    const rows = [phase()];
    const starts = new Map([
      [
        makeEpisodeStartKey('ep-1', ALERT_EPISODE_STATUS.ACTIVE),
        Date.parse('2026-04-05T00:00:00Z'),
      ],
    ]);
    const out = applyEpisodeStarts(rows, starts);
    expect(out[0]).toBe(rows[0]);
  });

  it('never moves a start later than the windowed start (earlier-only guard)', () => {
    const rows = [phase()];
    const later = Date.parse('2026-04-05T06:00:00Z');
    const starts = new Map([[makeEpisodeStartKey('ep-1', ALERT_EPISODE_STATUS.ACTIVE), later]]);
    const out = applyEpisodeStarts(rows, starts);
    expect(out[0]).toBe(rows[0]);
  });

  it('joins per (episode.id, episode.status), not per episode', () => {
    const rows = [
      phase({
        'episode.status': ALERT_EPISODE_STATUS.PENDING,
        seg_start: iso('2026-04-05T00:00:00Z'),
      }),
      phase({
        'episode.status': ALERT_EPISODE_STATUS.ACTIVE,
        seg_start: iso('2026-04-05T01:00:00Z'),
      }),
    ];
    const starts = new Map([
      [
        makeEpisodeStartKey('ep-1', ALERT_EPISODE_STATUS.PENDING),
        Date.parse('2026-04-02T00:00:00Z'),
      ],
      [
        makeEpisodeStartKey('ep-1', ALERT_EPISODE_STATUS.ACTIVE),
        Date.parse('2026-04-03T00:00:00Z'),
      ],
    ]);

    const [pending, active] = applyEpisodeStarts(rows, starts);
    expect(pending.seg_start).toBe(iso('2026-04-02T00:00:00Z'));
    expect(active.seg_start).toBe(iso('2026-04-03T00:00:00Z'));
  });
});
