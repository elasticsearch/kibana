/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { buildEpisodeStartsQuery } from './episode_starts_query';

const RULE_ID = 'rule-abc';

describe('buildEpisodeStartsQuery', () => {
  const queryString = buildEpisodeStartsQuery({
    ruleId: RULE_ID,
    episodeIds: ['ep-1', 'ep-2'],
  }).print('basic');

  it('scopes to alert type, rule and the given episodes', () => {
    expect(queryString).toContain('type == "alert"');
    expect(queryString).toContain(RULE_ID);
    expect(queryString).toContain('episode.id IN');
    expect(queryString).toContain('ep-1');
    expect(queryString).toContain('ep-2');
  });

  it('is untimed — no @timestamp range filter', () => {
    expect(queryString).not.toContain('@timestamp >=');
    expect(queryString).not.toContain('@timestamp <=');
  });

  it('aggregates the earliest timestamp per episode status phase', () => {
    expect(queryString).toContain('episode_start = MIN(@timestamp)');
    expect(queryString).toContain('BY episode.id, episode.status');
  });

  it('applies an explicit ceiling sized to phases × episodes', () => {
    // 2 episodes × 4 statuses.
    expect(queryString).toContain('LIMIT 8');
  });

  it('keeps the start columns', () => {
    expect(queryString).toContain('KEEP `episode.id`, `episode.status`, episode_start');
  });
});
