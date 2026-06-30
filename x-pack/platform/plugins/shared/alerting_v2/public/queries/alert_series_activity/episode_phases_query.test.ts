/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { buildEpisodePhasesQuery } from './episode_phases_query';

const RULE_ID = 'rule-abc';
const WINDOW_START_MS = Date.parse('2026-04-01T00:00:00Z');
const WINDOW_END_MS = Date.parse('2026-04-08T00:00:00Z');

describe('buildEpisodePhasesQuery', () => {
  const queryString = buildEpisodePhasesQuery({
    ruleId: RULE_ID,
    windowStartMs: WINDOW_START_MS,
    windowEndMs: WINDOW_END_MS,
    episodeIds: ['ep-1', 'ep-2'],
  }).print('basic');

  it('scopes to alert type, rule, lookback window and the given episodes', () => {
    expect(queryString).toContain('type == "alert"');
    expect(queryString).toContain(RULE_ID);
    expect(queryString).toContain('2026-04-01T00:00:00.000Z');
    expect(queryString).toContain('2026-04-08T00:00:00.000Z');
    expect(queryString).toContain('episode.id IN');
    expect(queryString).toContain('ep-1');
    expect(queryString).toContain('ep-2');
  });

  it('aggregates start/end per episode status phase', () => {
    expect(queryString).toContain('seg_start = MIN(@timestamp)');
    expect(queryString).toContain('seg_end = MAX(@timestamp)');
    expect(queryString).toContain('BY episode.id, episode.status, group_hash');
  });

  it('applies an explicit ceiling sized to phases × episodes', () => {
    // 2 episodes × 4 statuses.
    expect(queryString).toContain('LIMIT 8');
  });

  it('keeps the phase columns', () => {
    expect(queryString).toContain(
      'KEEP `episode.id`, `episode.status`, group_hash, seg_start, seg_end'
    );
  });
});
