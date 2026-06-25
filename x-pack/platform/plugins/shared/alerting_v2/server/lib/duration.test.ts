/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { convertEveryToSchedulesPerMinute, parseDurationToMs } from './duration';

describe('parseDurationToMs', () => {
  it.each([
    ['250ms', 250],
    ['30s', 30_000],
    ['1m', 60_000],
    ['2h', 7_200_000],
    ['1d', 86_400_000],
    ['1w', 604_800_000],
  ])('parses %s', (input, expected) => {
    expect(parseDurationToMs(input)).toBe(expected);
  });

  it('throws on invalid duration', () => {
    expect(() => parseDurationToMs('nonsense')).toThrow('Invalid duration "nonsense"');
  });
});

describe('convertEveryToSchedulesPerMinute', () => {
  it('returns 1 run per minute for a 1m interval', () => {
    expect(convertEveryToSchedulesPerMinute('1m')).toBe(1);
  });

  it('returns 2 runs per minute for a 30s interval', () => {
    expect(convertEveryToSchedulesPerMinute('30s')).toBe(2);
  });

  it('returns a fractional value for intervals longer than a minute', () => {
    expect(convertEveryToSchedulesPerMinute('5m')).toBeCloseTo(0.2);
  });

  it('returns 0 for an invalid duration', () => {
    expect(convertEveryToSchedulesPerMinute('nonsense')).toBe(0);
  });
});
