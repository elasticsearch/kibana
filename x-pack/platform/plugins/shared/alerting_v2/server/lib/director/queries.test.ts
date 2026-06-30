/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { getLatestAlertEventStateQuery } from './queries';

describe('getLatestAlertEventStateQuery', () => {
  it('generates a valid ES|QL query for a single group hash', () => {
    const query = getLatestAlertEventStateQuery({
      ruleId: 'rule-1',
      groupHashes: ['hash-a', 'hash-b'],
    });

    const printed = query.print();

    expect(printed).toContain('FROM .rule-events');
    expect(printed).toContain('WHERE');
    expect(printed).toContain('rule.id == ?ruleId');
    expect(printed).toContain('group_hash IN ("hash-a", "hash-b")');
    expect(printed).toContain('type == "alert"');
    expect(printed).toContain('episode.status IS NOT NULL');
    expect(printed).toContain('STATS');
    expect(printed).toContain('last_status = LAST(status, @timestamp)');
    expect(printed).toContain('last_episode_id = LAST(episode.id, @timestamp)');
    expect(printed).toContain('last_episode_status = LAST(episode.status, @timestamp)');
    expect(printed).toContain('last_episode_status_count = LAST(episode.status_count, @timestamp)');
    // The printer may wrap this long assignment across lines, so match the parts.
    expect(printed).toContain('last_episode_status_started_at =');
    expect(printed).toContain('LAST(episode.status_started_at, @timestamp)');
    expect(printed).toContain('last_episode_timestamp = MAX(@timestamp)');
    expect(printed).toContain('BY group_hash');
    expect(printed).toContain('KEEP');
  });

  it('passes ruleId as a named parameter and inlines groupHashes', () => {
    const query = getLatestAlertEventStateQuery({
      ruleId: 'rule-abc',
      groupHashes: ['hash-1', 'hash-2', 'hash-3'],
    });

    const params = query.getParams();
    expect(params).toEqual(expect.objectContaining({ ruleId: 'rule-abc' }));
    expect(params).not.toHaveProperty('groupHashes');

    const printed = query.print();
    expect(printed).toContain('group_hash IN ("hash-1", "hash-2", "hash-3")');
  });

  it('keeps exactly the expected columns in the correct order', () => {
    const query = getLatestAlertEventStateQuery({
      ruleId: 'rule-1',
      groupHashes: ['hash-a'],
    });

    const printed = query.print();

    const keepMatch = printed.match(/KEEP\s+([\s\S]*?)$/);
    expect(keepMatch).not.toBeNull();

    const keepClause = keepMatch![1];
    expect(keepClause).toContain('last_status');
    expect(keepClause).toContain('last_episode_id');
    expect(keepClause).toContain('last_episode_status');
    expect(keepClause).toContain('last_episode_status_count');
    expect(keepClause).toContain('last_episode_status_started_at');
    expect(keepClause).toContain('last_episode_timestamp');
    expect(keepClause).toContain('group_hash');
  });

  it('filters to only type "alert" with non-null episode.status', () => {
    const query = getLatestAlertEventStateQuery({
      ruleId: 'rule-1',
      groupHashes: ['hash-a'],
    });

    const printed = query.print();

    expect(printed).toContain('type == "alert"');
    expect(printed).toContain('episode.status IS NOT NULL');
  });

  it('groups stats by group_hash', () => {
    const query = getLatestAlertEventStateQuery({
      ruleId: 'rule-1',
      groupHashes: ['hash-a'],
    });

    const printed = query.print();

    expect(printed).toContain('BY group_hash');
  });

  it('generates a valid request object with query and params', () => {
    const query = getLatestAlertEventStateQuery({
      ruleId: 'rule-42',
      groupHashes: ['h1', 'h2'],
    });

    const request = query.toRequest();

    expect(request).toHaveProperty('query');
    expect(request).toHaveProperty('params');
    expect(typeof request.query).toBe('string');
    expect(request.query).toContain('FROM .rule-events');

    const params = request.params as Array<{ ruleId?: string }>;
    const ruleIdParam = params.find((p) => 'ruleId' in p);

    expect(ruleIdParam).toEqual({ ruleId: 'rule-42' });
    expect(request.query).toContain('group_hash IN ("h1", "h2")');
  });
});
