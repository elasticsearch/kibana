/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { buildEpisodeSelectionQuery, MAX_EPISODES_PER_LANE } from './episode_selection_query';

const RULE_ID = 'rule-abc';
const WINDOW_START_MS = Date.parse('2026-04-01T00:00:00Z');
const WINDOW_END_MS = Date.parse('2026-04-08T00:00:00Z');

describe('buildEpisodeSelectionQuery', () => {
  const queryString = buildEpisodeSelectionQuery({
    ruleId: RULE_ID,
    windowStartMs: WINDOW_START_MS,
    windowEndMs: WINDOW_END_MS,
    groupHashes: ['hash-1', 'hash-2'],
  }).print('basic');

  it('scopes to alert type, rule, window and the given series', () => {
    expect(queryString).toContain('type == "alert"');
    expect(queryString).toContain(RULE_ID);
    expect(queryString).toContain('2026-04-01T00:00:00.000Z');
    expect(queryString).toContain('2026-04-08T00:00:00.000Z');
    expect(queryString).toContain('group_hash IN');
    expect(queryString).toContain('hash-1');
    expect(queryString).toContain('hash-2');
  });

  it('ranks episodes by most recent activity per series', () => {
    expect(queryString).toContain('last_ts = MAX(@timestamp)');
    expect(queryString).toContain('BY episode.id, group_hash');
    expect(queryString).toContain('SORT last_ts DESC');
  });

  it('caps episodes per lane before the global ceiling', () => {
    expect(queryString).toContain(`LIMIT ${MAX_EPISODES_PER_LANE} BY group_hash`);
    // Per-lane cap precedes the global limit.
    expect(queryString.indexOf(`LIMIT ${MAX_EPISODES_PER_LANE} BY group_hash`)).toBeLessThan(
      queryString.lastIndexOf('LIMIT')
    );
  });

  it('honours an explicit per-lane limit', () => {
    const q = buildEpisodeSelectionQuery({
      ruleId: RULE_ID,
      windowStartMs: WINDOW_START_MS,
      windowEndMs: WINDOW_END_MS,
      groupHashes: ['hash-1'],
      perLaneLimit: 5,
    }).print('basic');

    expect(q).toContain('LIMIT 5 BY group_hash');
  });

  it('keeps episode.id, group_hash and last_ts', () => {
    expect(queryString).toContain('KEEP `episode.id`, group_hash, last_ts');
  });
});
