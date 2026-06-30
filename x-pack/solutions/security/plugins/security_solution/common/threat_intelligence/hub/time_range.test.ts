/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  DEFAULT_TIME_RANGE_PRESET,
  isTimeRangePresetId,
  resolveTimeRangeFromPreset,
} from './time_range';

describe('time_range', () => {
  const now = Date.parse('2026-05-17T12:00:00.000Z');

  it('defaults to 7d', () => {
    expect(DEFAULT_TIME_RANGE_PRESET).toBe('7d');
  });

  it('resolves preset windows relative to now', () => {
    const { from, to } = resolveTimeRangeFromPreset('24h', now);
    expect(to).toBe('2026-05-17T12:00:00.000Z');
    expect(from).toBe('2026-05-16T12:00:00.000Z');
  });

  it('resolves 90d', () => {
    const { from } = resolveTimeRangeFromPreset('90d', now);
    expect(from).toBe('2026-02-16T12:00:00.000Z');
  });

  it('validates preset ids', () => {
    expect(isTimeRangePresetId('7d')).toBe(true);
    expect(isTimeRangePresetId('custom')).toBe(false);
  });
});
