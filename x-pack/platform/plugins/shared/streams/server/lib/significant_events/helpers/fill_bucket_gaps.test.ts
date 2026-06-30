/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { BUCKET_SIZE_PATTERN, ESQL_UNITS, parseBucketSize } from './fill_bucket_gaps';

describe('parseBucketSize', () => {
  it('parses seconds', () => {
    expect(parseBucketSize('30s')).toEqual({ value: 30, unit: 's' });
  });

  it('parses minutes', () => {
    expect(parseBucketSize('1m')).toEqual({ value: 1, unit: 'm' });
    expect(parseBucketSize('5m')).toEqual({ value: 5, unit: 'm' });
  });

  it('parses hours', () => {
    expect(parseBucketSize('2h')).toEqual({ value: 2, unit: 'h' });
  });

  it('parses days', () => {
    expect(parseBucketSize('1d')).toEqual({ value: 1, unit: 'd' });
  });

  it('falls back to 60s for unrecognised input', () => {
    expect(parseBucketSize('invalid')).toEqual({ value: 60, unit: 's' });
    expect(parseBucketSize('')).toEqual({ value: 60, unit: 's' });
    expect(parseBucketSize('1x')).toEqual({ value: 60, unit: 's' });
  });

  it('falls back to 60s when value is zero', () => {
    expect(parseBucketSize('0m')).toEqual({ value: 60, unit: 's' });
  });
});

describe('BUCKET_SIZE_PATTERN', () => {
  it.each(['1s', '30s', '1m', '5m', '2h', '1d', '24h', '1440m'])('accepts %s', (input) => {
    expect(BUCKET_SIZE_PATTERN.test(input)).toBe(true);
  });

  it.each(['', '1', 'm', '1ms', '5min', '1minute', '1.5m', '1 m', ' 1m', '1m ', '1x', 'abc'])(
    'rejects %j',
    (input) => {
      expect(BUCKET_SIZE_PATTERN.test(input)).toBe(false);
    }
  );
});

describe('ESQL_UNITS', () => {
  it('maps all four unit characters to ES|QL time-duration names', () => {
    expect(ESQL_UNITS.s).toBe('seconds');
    expect(ESQL_UNITS.m).toBe('minutes');
    expect(ESQL_UNITS.h).toBe('hours');
    expect(ESQL_UNITS.d).toBe('days');
  });
});
