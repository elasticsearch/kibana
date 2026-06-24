/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  eventDataToFieldValueRows,
  formatEpisodeEventFieldValue,
  normalizeEpisodeEventDataPayload,
  resolveEpisodeEventData,
} from './resolve_episode_event_data';
import type { EpisodeEventRow } from '../queries/episode_events_query';

describe('normalizeEpisodeEventDataPayload', () => {
  it('returns null for missing or empty payloads', () => {
    expect(normalizeEpisodeEventDataPayload(null)).toBeNull();
    expect(normalizeEpisodeEventDataPayload(undefined)).toBeNull();
    expect(normalizeEpisodeEventDataPayload('')).toBeNull();
    expect(normalizeEpisodeEventDataPayload('{}')).toBeNull();
    expect(normalizeEpisodeEventDataPayload({})).toBeNull();
  });

  it('parses a JSON object string', () => {
    expect(normalizeEpisodeEventDataPayload('{"host.name":"h1","severity":"high"}')).toEqual({
      'host.name': 'h1',
      severity: 'high',
    });
  });

  it('accepts a parsed object payload', () => {
    expect(normalizeEpisodeEventDataPayload({ 'host.name': 'h1', severity: 'high' })).toEqual({
      'host.name': 'h1',
      severity: 'high',
    });
  });

  it('returns null for invalid JSON', () => {
    expect(normalizeEpisodeEventDataPayload('not-json')).toBeNull();
  });
});

describe('resolveEpisodeEventData', () => {
  it('returns parsed data for the event row', () => {
    const row = {
      data: { 'host.name': 'h1' },
    } as Pick<EpisodeEventRow, 'data'>;

    expect(resolveEpisodeEventData(row)).toEqual({ 'host.name': 'h1' });
  });

  it('returns null when data is missing or empty', () => {
    expect(resolveEpisodeEventData({ data: null } as Pick<EpisodeEventRow, 'data'>)).toBeNull();
    expect(resolveEpisodeEventData({ data: '{}' } as Pick<EpisodeEventRow, 'data'>)).toBeNull();
  });
});

describe('eventDataToFieldValueRows', () => {
  it('maps event data to sorted field/value rows', () => {
    expect(
      eventDataToFieldValueRows({
        severity: 'high',
        'host.name': 'h1',
      })
    ).toEqual([
      { field: 'host.name', value: 'h1' },
      { field: 'severity', value: 'high' },
    ]);
  });

  it('serializes nested object values as JSON', () => {
    expect(eventDataToFieldValueRows({ host: { name: 'h1' } })).toEqual([
      { field: 'host', value: '{"name":"h1"}' },
    ]);
  });

  it('returns an empty list when data is missing', () => {
    expect(eventDataToFieldValueRows(null)).toEqual([]);
  });
});

describe('formatEpisodeEventFieldValue', () => {
  it('stringifies object values', () => {
    expect(formatEpisodeEventFieldValue({ count: 1 })).toBe('{"count":1}');
  });
});
