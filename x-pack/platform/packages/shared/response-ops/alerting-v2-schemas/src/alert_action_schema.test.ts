/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  ALERT_EPISODE_ACTION_TYPE,
  bulkActivateEpisodeActionBodySchema,
  bulkAssignEpisodeActionBodySchema,
  bulkSnoozeSeriesActionBodySchema,
  bulkTagSeriesActionBodySchema,
  createAckEpisodeActionBodySchema,
  createEpisodeAlertActionBodySchema,
  createSeriesAlertActionBodySchema,
  episodeAlertActionParamsSchema,
  seriesAlertActionParamsSchema,
} from './alert_action_schema';

describe('createSeriesAlertActionBodySchema', () => {
  it('accepts every series-level action variant', () => {
    const variants = [
      { action_type: ALERT_EPISODE_ACTION_TYPE.TAG, tags: ['p1'] },
      { action_type: ALERT_EPISODE_ACTION_TYPE.SNOOZE, expiry: '2026-08-12T00:00:00.000Z' },
      { action_type: ALERT_EPISODE_ACTION_TYPE.SNOOZE },
      { action_type: ALERT_EPISODE_ACTION_TYPE.UNSNOOZE },
    ];

    for (const variant of variants) {
      expect(() => createSeriesAlertActionBodySchema.parse(variant)).not.toThrow();
    }
  });

  it('rejects episode-level action types', () => {
    expect(() =>
      createSeriesAlertActionBodySchema.parse({
        action_type: ALERT_EPISODE_ACTION_TYPE.ACK,
      })
    ).toThrow();
    expect(() =>
      createSeriesAlertActionBodySchema.parse({
        action_type: ALERT_EPISODE_ACTION_TYPE.DEACTIVATE,
        reason: 'reason',
      })
    ).toThrow();
  });
});

describe('createEpisodeAlertActionBodySchema', () => {
  it('accepts every episode-level action variant', () => {
    const variants = [
      { action_type: ALERT_EPISODE_ACTION_TYPE.ACK },
      { action_type: ALERT_EPISODE_ACTION_TYPE.UNACK },
      { action_type: ALERT_EPISODE_ACTION_TYPE.ASSIGN, assignee_uid: 'u1' },
      { action_type: ALERT_EPISODE_ACTION_TYPE.ASSIGN, assignee_uid: null },
      { action_type: ALERT_EPISODE_ACTION_TYPE.ACTIVATE, reason: 'reason' },
      { action_type: ALERT_EPISODE_ACTION_TYPE.DEACTIVATE, reason: 'reason' },
    ];

    for (const variant of variants) {
      expect(() => createEpisodeAlertActionBodySchema.parse(variant)).not.toThrow();
    }
  });

  it('rejects series-level action types', () => {
    expect(() =>
      createEpisodeAlertActionBodySchema.parse({
        action_type: ALERT_EPISODE_ACTION_TYPE.TAG,
        tags: ['p1'],
      })
    ).toThrow();
  });

  it('rejects episode_id in the body (strict, the episode is addressed by the path)', () => {
    expect(() =>
      createEpisodeAlertActionBodySchema.parse({
        action_type: ALERT_EPISODE_ACTION_TYPE.ACK,
        episode_id: 'episode-1',
      })
    ).toThrow();
  });
});

describe('createAckEpisodeActionBodySchema', () => {
  it('accepts an empty body', () => {
    expect(() => createAckEpisodeActionBodySchema.parse({})).not.toThrow();
  });

  it('rejects episode_id in the body (strict)', () => {
    expect(() => createAckEpisodeActionBodySchema.parse({ episode_id: 'episode-1' })).toThrow();
  });
});

describe('seriesAlertActionParamsSchema', () => {
  it('accepts a group_hash and rejects an empty one', () => {
    expect(() => seriesAlertActionParamsSchema.parse({ group_hash: 'group-1' })).not.toThrow();
    expect(() => seriesAlertActionParamsSchema.parse({ group_hash: '' })).toThrow();
  });
});

describe('episodeAlertActionParamsSchema', () => {
  it('accepts an episode_id and rejects an empty one', () => {
    expect(() => episodeAlertActionParamsSchema.parse({ episode_id: 'episode-1' })).not.toThrow();
    expect(() => episodeAlertActionParamsSchema.parse({ episode_id: '' })).toThrow();
  });
});

describe('verb-specific bulk action body schemas', () => {
  it('accepts an items envelope with valid items', () => {
    expect(() =>
      bulkTagSeriesActionBodySchema.parse({ items: [{ group_hash: 'g1', tags: ['p1'] }] })
    ).not.toThrow();
    expect(() =>
      bulkSnoozeSeriesActionBodySchema.parse({
        items: [{ group_hash: 'g1', expiry: '2026-08-12T00:00:00.000Z' }, { group_hash: 'g2' }],
      })
    ).not.toThrow();
    expect(() =>
      bulkAssignEpisodeActionBodySchema.parse({
        items: [{ episode_id: 'e1', assignee_uid: null }],
      })
    ).not.toThrow();
    expect(() =>
      bulkActivateEpisodeActionBodySchema.parse({
        items: [{ episode_id: 'e1', reason: 'reopen' }],
      })
    ).not.toThrow();
  });

  it('rejects a bare array body (items envelope is required)', () => {
    expect(() =>
      bulkTagSeriesActionBodySchema.parse([{ group_hash: 'g1', tags: ['p1'] }])
    ).toThrow();
  });

  it('rejects an empty items list', () => {
    expect(() => bulkTagSeriesActionBodySchema.parse({ items: [] })).toThrow();
  });

  it('rejects unknown envelope and item fields (strict mode)', () => {
    expect(() =>
      bulkTagSeriesActionBodySchema.parse({
        items: [{ group_hash: 'g1', tags: ['p1'] }],
        force: true,
      })
    ).toThrow();
    expect(() =>
      bulkTagSeriesActionBodySchema.parse({
        items: [{ group_hash: 'g1', tags: ['p1'], action_type: ALERT_EPISODE_ACTION_TYPE.TAG }],
      })
    ).toThrow();
  });

  it('rejects items keyed by the wrong identifier for the scope', () => {
    expect(() =>
      bulkTagSeriesActionBodySchema.parse({ items: [{ episode_id: 'e1', tags: ['p1'] }] })
    ).toThrow();
    expect(() =>
      bulkAssignEpisodeActionBodySchema.parse({
        items: [{ group_hash: 'g1', assignee_uid: null }],
      })
    ).toThrow();
  });
});
