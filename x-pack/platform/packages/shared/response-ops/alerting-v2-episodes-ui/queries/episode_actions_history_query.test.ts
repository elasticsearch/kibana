/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { buildEpisodeActionsHistoryQuery } from './episode_actions_history_query';

describe('buildEpisodeActionsHistoryQuery', () => {
  it('filters by episode id and group hash, covers all action types, sorts newest-first, and limits to 200', () => {
    const queryString = buildEpisodeActionsHistoryQuery('default', 'ep-1', 'hash-1').print('basic');
    expect(queryString).toContain('"ep-1"');
    expect(queryString).toContain('"hash-1"');
    expect(queryString).toContain(
      'action_type IN ("ack", "unack", "snooze", "unsnooze", "deactivate", "activate", "tag", "assign")'
    );
    expect(queryString).toContain('@timestamp');
    expect(queryString).toContain('DESC');
    expect(queryString).toContain('LIMIT 200');
  });

  it('uses a different space id when provided', () => {
    const queryString = buildEpisodeActionsHistoryQuery('my-space', 'ep-1', 'hash-1').print(
      'basic'
    );
    expect(queryString).toContain('"my-space"');
  });
});
