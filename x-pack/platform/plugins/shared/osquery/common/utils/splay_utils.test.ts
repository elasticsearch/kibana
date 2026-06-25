/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { MAX_SPLAY_SECONDS } from '../schedule';
import {
  isSplayWithinHalfRecurrence,
  isSplayWithinMax,
  parseSplay,
  parseSplayPermissive,
  serializeSplay,
  splayInSeconds,
  sumCompoundSeconds,
} from './splay_utils';

describe('splayInSeconds', () => {
  it('converts seconds, minutes, and hours', () => {
    expect(splayInSeconds({ value: 30, unit: 'seconds' })).toBe(30);
    expect(splayInSeconds({ value: 5, unit: 'minutes' })).toBe(300);
    expect(splayInSeconds({ value: 1, unit: 'hours' })).toBe(3600);
  });
});

describe('isSplayWithinMax', () => {
  it('accepts values up to the 12-hour cap', () => {
    expect(isSplayWithinMax({ value: 1, unit: 'seconds' })).toBe(true);
    expect(isSplayWithinMax({ value: MAX_SPLAY_SECONDS, unit: 'seconds' })).toBe(true);
    expect(isSplayWithinMax({ value: 720, unit: 'minutes' })).toBe(true);
    expect(isSplayWithinMax({ value: 2, unit: 'hours' })).toBe(true);
    expect(isSplayWithinMax({ value: 12, unit: 'hours' })).toBe(true);
  });

  it('rejects values above the 12-hour cap', () => {
    expect(isSplayWithinMax({ value: MAX_SPLAY_SECONDS + 1, unit: 'seconds' })).toBe(false);
    expect(isSplayWithinMax({ value: 721, unit: 'minutes' })).toBe(false);
    expect(isSplayWithinMax({ value: 13, unit: 'hours' })).toBe(false);
  });

  it('rejects non-positive or non-integer values', () => {
    expect(isSplayWithinMax({ value: 0, unit: 'seconds' })).toBe(false);
    expect(isSplayWithinMax({ value: -5, unit: 'minutes' })).toBe(false);
    expect(isSplayWithinMax({ value: 1.5, unit: 'minutes' })).toBe(false);
  });

  it('rejects unknown units', () => {
    expect(
      isSplayWithinMax({
        value: 5,
        unit: 'days' as unknown as 'seconds',
      })
    ).toBe(false);
  });
});

describe('isSplayWithinHalfRecurrence', () => {
  it('accepts splay at exactly half the recurrence', () => {
    expect(isSplayWithinHalfRecurrence(300, 600)).toBe(true);
  });

  it('accepts splay below half the recurrence', () => {
    expect(isSplayWithinHalfRecurrence(60, 600)).toBe(true);
  });

  it('rejects splay above half the recurrence', () => {
    expect(isSplayWithinHalfRecurrence(301, 600)).toBe(false);
  });

  it('rejects non-positive splay', () => {
    expect(isSplayWithinHalfRecurrence(0, 600)).toBe(false);
    expect(isSplayWithinHalfRecurrence(-1, 600)).toBe(false);
  });

  it('rejects non-positive recurrence', () => {
    expect(isSplayWithinHalfRecurrence(300, 0)).toBe(false);
    expect(isSplayWithinHalfRecurrence(300, -1)).toBe(false);
  });

  it('rejects non-finite inputs', () => {
    expect(isSplayWithinHalfRecurrence(NaN, 600)).toBe(false);
    expect(isSplayWithinHalfRecurrence(300, NaN)).toBe(false);
    expect(isSplayWithinHalfRecurrence(Infinity, 600)).toBe(false);
    expect(isSplayWithinHalfRecurrence(300, Infinity)).toBe(false);
  });
});

describe('serializeSplay', () => {
  it('emits Go duration strings for each unit', () => {
    expect(serializeSplay({ value: 30, unit: 'seconds' })).toBe('30s');
    expect(serializeSplay({ value: 5, unit: 'minutes' })).toBe('5m');
    expect(serializeSplay({ value: 1, unit: 'hours' })).toBe('1h');
  });

  it('throws on non-positive values', () => {
    expect(() => serializeSplay({ value: 0, unit: 'seconds' })).toThrowError(/positive integer/);
    expect(() => serializeSplay({ value: -1, unit: 'minutes' })).toThrowError(/positive integer/);
  });

  it('throws on non-integer values', () => {
    expect(() => serializeSplay({ value: 1.5, unit: 'minutes' })).toThrowError(/positive integer/);
  });

  it('throws on unknown units', () => {
    expect(() => serializeSplay({ value: 5, unit: 'days' as unknown as 'seconds' })).toThrowError(
      /Invalid splay unit/
    );
  });

  it('throws when the duration exceeds the 12-hour cap', () => {
    expect(() => serializeSplay({ value: MAX_SPLAY_SECONDS + 1, unit: 'seconds' })).toThrowError(
      /must not exceed 43200 seconds/
    );
    expect(() => serializeSplay({ value: 13, unit: 'hours' })).toThrowError(
      /must not exceed 43200 seconds/
    );
  });

  it('accepts boundary values (2h and 12h pass; 13h fails)', () => {
    expect(serializeSplay({ value: 2, unit: 'hours' })).toBe('2h');
    expect(serializeSplay({ value: 12, unit: 'hours' })).toBe('12h');
    expect(() => serializeSplay({ value: 13, unit: 'hours' })).toThrowError(
      /must not exceed 43200 seconds/
    );
  });
});

describe('parseSplay', () => {
  it('parses single-unit Go duration strings', () => {
    expect(parseSplay('30s')).toEqual({ value: 30, unit: 'seconds' });
    expect(parseSplay('5m')).toEqual({ value: 5, unit: 'minutes' });
    expect(parseSplay('1h')).toEqual({ value: 1, unit: 'hours' });
  });

  it('tolerates surrounding whitespace and uppercase suffixes', () => {
    expect(parseSplay('  10S ')).toEqual({ value: 10, unit: 'seconds' });
    expect(parseSplay('2H')).toEqual({ value: 2, unit: 'hours' });
  });

  it('rejects compound durations (single-unit only)', () => {
    expect(() => parseSplay('1h30m')).toThrowError(/single-unit Go duration/);
  });

  it('rejects unsupported unit suffixes', () => {
    expect(() => parseSplay('5d')).toThrowError(/single-unit Go duration/);
    expect(() => parseSplay('100ms')).toThrowError(/single-unit Go duration/);
  });

  it('rejects missing or non-positive values', () => {
    expect(() => parseSplay('s')).toThrowError(/single-unit Go duration/);
    expect(() => parseSplay('-1s')).toThrowError(/single-unit Go duration/);
    expect(() => parseSplay('0s')).toThrowError(/positive integer/);
  });

  it('rejects non-string input', () => {
    // @ts-expect-error -- exercising runtime guard
    expect(() => parseSplay(undefined)).toThrowError(/must be a string/);
  });

  it('round-trips with serializeSplay', () => {
    const cases = [
      { value: 30, unit: 'seconds' as const },
      { value: 5, unit: 'minutes' as const },
      { value: 1, unit: 'hours' as const },
    ];
    for (const state of cases) {
      expect(parseSplay(serializeSplay(state))).toEqual(state);
    }
  });
});

describe('parseSplayPermissive', () => {
  it('returns simple kind for single-unit durations', () => {
    expect(parseSplayPermissive('30s')).toEqual({ kind: 'simple', value: 30, unit: 'seconds' });
    expect(parseSplayPermissive('5m')).toEqual({ kind: 'simple', value: 5, unit: 'minutes' });
    expect(parseSplayPermissive('1h')).toEqual({ kind: 'simple', value: 1, unit: 'hours' });
  });

  it('returns compound kind for multi-segment durations', () => {
    expect(parseSplayPermissive('1h30m')).toEqual({ kind: 'compound', raw: '1h30m' });
    expect(parseSplayPermissive('45m30s')).toEqual({ kind: 'compound', raw: '45m30s' });
    expect(parseSplayPermissive('1h30m45s')).toEqual({ kind: 'compound', raw: '1h30m45s' });
  });

  it('rejects unsupported strings', () => {
    expect(() => parseSplayPermissive('5d')).toThrowError(/expected a Go duration/);
    expect(() => parseSplayPermissive('')).toThrowError(/expected a Go duration/);
    expect(() => parseSplayPermissive('garbage')).toThrowError(/expected a Go duration/);
  });

  it('rejects non-string input', () => {
    // @ts-expect-error -- exercising runtime guard
    expect(() => parseSplayPermissive(undefined)).toThrowError(/must be a string/);
  });
});

describe('sumCompoundSeconds', () => {
  it('sums hours, minutes, and seconds segments', () => {
    expect(sumCompoundSeconds('1h30m')).toBe(5400);
    expect(sumCompoundSeconds('45m30s')).toBe(2730);
    expect(sumCompoundSeconds('1h30m45s')).toBe(5445);
  });

  it('folds sub-second segments into the total as fractional seconds', () => {
    expect(sumCompoundSeconds('1s500ms')).toBe(1.5);
    expect(sumCompoundSeconds('2us')).toBeCloseTo(0.000002, 9);
    expect(sumCompoundSeconds('1µs')).toBeCloseTo(0.000001, 9);
    expect(sumCompoundSeconds('1ns')).toBeCloseTo(0.000000001, 12);
  });

  it('totals a single-segment duration', () => {
    expect(sumCompoundSeconds('13h')).toBe(46800);
    expect(sumCompoundSeconds('30s')).toBe(30);
  });

  it('returns 0 for input with no recognizable segments', () => {
    expect(sumCompoundSeconds('')).toBe(0);
    expect(sumCompoundSeconds('abc')).toBe(0);
  });

  it('decides the 12h cap from the summed total', () => {
    expect(sumCompoundSeconds('12h') <= MAX_SPLAY_SECONDS).toBe(true);
    expect(sumCompoundSeconds('11h59m59s') <= MAX_SPLAY_SECONDS).toBe(true);
    expect(sumCompoundSeconds('12h0m1s') > MAX_SPLAY_SECONDS).toBe(true);
    expect(sumCompoundSeconds('13h0m') > MAX_SPLAY_SECONDS).toBe(true);
  });
});
