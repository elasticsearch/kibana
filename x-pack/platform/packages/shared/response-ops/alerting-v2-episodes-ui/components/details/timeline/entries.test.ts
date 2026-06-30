/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { ALERT_EPISODE_STATUS } from '@kbn/alerting-v2-schemas';
import type { EpisodeEventRow } from '../../../queries/episode_events_query';
import type { EpisodeActionHistoryEntry } from '../../../queries/episode_actions_history_query';
import { deriveStateChangeEntries, mergeTimelineEntries } from './entries';

const makeRow = (status: string, ts: string): EpisodeEventRow => ({
  '@timestamp': ts,
  'episode.id': 'ep-1',
  'episode.status': status as EpisodeEventRow['episode.status'],
  'rule.id': 'rule-1',
  group_hash: 'hash-1',
});

const makeAction = (ts: string): EpisodeActionHistoryEntry => ({
  '@timestamp': ts,
  action_type: 'ack',
  actor: 'user-uid-1',
  episode_id: 'ep-1',
  group_hash: 'hash-1',
  tags: null,
  assignee_uid: null,
  expiry: null,
  reason: null,
});

describe('deriveStateChangeEntries', () => {
  it('returns empty array for empty input', () => {
    expect(deriveStateChangeEntries([])).toHaveLength(0);
  });

  it('returns a single initial entry with no prevStatus for a one-row input', () => {
    const entries = deriveStateChangeEntries([
      makeRow(ALERT_EPISODE_STATUS.PENDING, '2024-01-01T00:00:00.000Z'),
    ]);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toEqual({
      kind: 'state_change',
      timestamp: '2024-01-01T00:00:00.000Z',
      newStatus: ALERT_EPISODE_STATUS.PENDING,
      prevStatus: undefined,
      prevEventCount: 0,
    });
  });

  it('does not emit an entry when the status does not change', () => {
    const rows = [
      makeRow(ALERT_EPISODE_STATUS.PENDING, '2024-01-01T00:00:00.000Z'),
      makeRow(ALERT_EPISODE_STATUS.PENDING, '2024-01-01T00:01:00.000Z'),
      makeRow(ALERT_EPISODE_STATUS.PENDING, '2024-01-01T00:02:00.000Z'),
    ];
    expect(deriveStateChangeEntries(rows)).toHaveLength(1);
  });

  it('emits a transition entry with correct prevEventCount', () => {
    const rows = [
      makeRow(ALERT_EPISODE_STATUS.PENDING, '2024-01-01T00:00:00.000Z'),
      makeRow(ALERT_EPISODE_STATUS.PENDING, '2024-01-01T00:01:00.000Z'),
      makeRow(ALERT_EPISODE_STATUS.ACTIVE, '2024-01-01T00:02:00.000Z'),
    ];
    const entries = deriveStateChangeEntries(rows);
    expect(entries).toHaveLength(2);
    expect(entries[1]).toEqual({
      kind: 'state_change',
      timestamp: '2024-01-01T00:02:00.000Z',
      newStatus: ALERT_EPISODE_STATUS.ACTIVE,
      prevStatus: ALERT_EPISODE_STATUS.PENDING,
      prevEventCount: 2,
    });
  });

  it('handles multiple sequential transitions', () => {
    const rows = [
      makeRow(ALERT_EPISODE_STATUS.PENDING, '2024-01-01T00:00:00.000Z'),
      makeRow(ALERT_EPISODE_STATUS.ACTIVE, '2024-01-01T00:01:00.000Z'),
      makeRow(ALERT_EPISODE_STATUS.RECOVERING, '2024-01-01T00:02:00.000Z'),
      makeRow(ALERT_EPISODE_STATUS.INACTIVE, '2024-01-01T00:03:00.000Z'),
    ];
    const entries = deriveStateChangeEntries(rows);
    expect(entries).toHaveLength(4);
    expect(entries[0].prevStatus).toBeUndefined();
    expect(entries[1]).toMatchObject({
      newStatus: ALERT_EPISODE_STATUS.ACTIVE,
      prevStatus: ALERT_EPISODE_STATUS.PENDING,
      prevEventCount: 1,
    });
    expect(entries[2]).toMatchObject({
      newStatus: ALERT_EPISODE_STATUS.RECOVERING,
      prevStatus: ALERT_EPISODE_STATUS.ACTIVE,
      prevEventCount: 1,
    });
    expect(entries[3]).toMatchObject({
      newStatus: ALERT_EPISODE_STATUS.INACTIVE,
      prevStatus: ALERT_EPISODE_STATUS.RECOVERING,
      prevEventCount: 1,
    });
  });
});

describe('mergeTimelineEntries', () => {
  it('returns an empty array when there are no entries', () => {
    expect(mergeTimelineEntries([], [])).toHaveLength(0);
  });

  it('merges state changes and actions sorted newest-first', () => {
    const stateChanges = deriveStateChangeEntries([
      makeRow(ALERT_EPISODE_STATUS.PENDING, '2024-01-01T00:00:00.000Z'),
      makeRow(ALERT_EPISODE_STATUS.ACTIVE, '2024-01-01T00:02:00.000Z'),
    ]);
    const actions = [makeAction('2024-01-01T00:01:00.000Z')];

    const merged = mergeTimelineEntries(stateChanges, actions);

    expect(
      merged.map((e) => (e.kind === 'state_change' ? e.timestamp : e.entry['@timestamp']))
    ).toEqual(['2024-01-01T00:02:00.000Z', '2024-01-01T00:01:00.000Z', '2024-01-01T00:00:00.000Z']);
    expect(merged[1].kind).toBe('action');
  });
});
