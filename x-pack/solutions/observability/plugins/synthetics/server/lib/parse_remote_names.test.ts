/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { parseRemoteNames, MAX_REMOTE_NAMES } from './parse_remote_names';

describe('parseRemoteNames', () => {
  it('returns undefined when raw is missing or empty', () => {
    expect(parseRemoteNames(undefined)).toEqual({ ok: true, value: undefined });
    expect(parseRemoteNames('')).toEqual({ ok: true, value: undefined });
    expect(parseRemoteNames(',,')).toEqual({ ok: true, value: undefined });
    expect(parseRemoteNames('   ,  ,')).toEqual({ ok: true, value: undefined });
  });

  it('splits comma-separated entries and trims surrounding whitespace', () => {
    expect(parseRemoteNames('cluster1, cluster2 ,cluster3')).toEqual({
      ok: true,
      value: ['cluster1', 'cluster2', 'cluster3'],
    });
  });

  it('drops empty tokens left behind by adjacent or trailing commas', () => {
    expect(parseRemoteNames('cluster1,,cluster2,')).toEqual({
      ok: true,
      value: ['cluster1', 'cluster2'],
    });
  });

  it('deduplicates while preserving first-occurrence order', () => {
    expect(parseRemoteNames('cluster1, cluster2, cluster1, cluster3, cluster2')).toEqual({
      ok: true,
      value: ['cluster1', 'cluster2', 'cluster3'],
    });
  });

  it('returns too_many when the deduplicated list exceeds maxCount', () => {
    const aliases = Array.from({ length: MAX_REMOTE_NAMES + 1 }, (_, i) => `c${i}`).join(',');
    expect(parseRemoteNames(aliases)).toEqual({
      ok: false,
      reason: 'too_many',
      received: MAX_REMOTE_NAMES + 1,
      max: MAX_REMOTE_NAMES,
    });
  });

  it('counts the deduplicated length against the cap, not the raw token count', () => {
    const raw = Array.from({ length: 60 }, () => 'cluster1').join(',');
    expect(parseRemoteNames(raw, { maxCount: 50 })).toEqual({
      ok: true,
      value: ['cluster1'],
    });
  });

  it('honours an explicit maxCount override', () => {
    expect(parseRemoteNames('a,b,c', { maxCount: 2 })).toEqual({
      ok: false,
      reason: 'too_many',
      received: 3,
      max: 2,
    });
  });
});
