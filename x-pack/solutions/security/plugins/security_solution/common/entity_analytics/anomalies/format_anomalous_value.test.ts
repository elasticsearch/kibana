/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { formatAnomalousValue } from './format_anomalous_value';

const call = (
  detectorFunction: string,
  actual: number[] | undefined,
  { fieldName, byFieldValue }: { fieldName?: string | null; byFieldValue?: string } = {}
) =>
  formatAnomalousValue({
    detectorFunction,
    fieldName,
    actual,
    byFieldValue,
  });

describe('formatAnomalousValue', () => {
  describe('rare detector', () => {
    it('returns the by_field_value as-is', () => {
      expect(call('rare', undefined, { byFieldValue: 'Iran' })).toBe('Iran');
    });

    it('falls back to "-" when byFieldValue is absent', () => {
      expect(call('rare', undefined)).toBe('-');
    });
  });

  describe('time_of_day detector', () => {
    it('formats seconds since midnight as HH:mm', () => {
      // 7200s = 02:00
      expect(call('time_of_day', [7200])).toBe('02:00');
    });

    it('pads hours and minutes with leading zeros', () => {
      // 3660s = 01:01
      expect(call('time_of_day', [3660])).toBe('01:01');
    });

    it('falls back to "-" when actual is empty', () => {
      expect(call('time_of_day', [])).toBe('-');
    });

    it('falls back to "-" when actual is undefined', () => {
      expect(call('time_of_day', undefined)).toBe('-');
    });
  });

  describe('time_of_week detector', () => {
    it('formats seconds since Sunday midnight as "Day HH:mm"', () => {
      // 0s = Sun 00:00
      expect(call('time_of_week', [0])).toBe('Sun 00:00');
    });

    it('calculates the correct day and time', () => {
      // 1*86400 + 7200 = Mon 02:00
      expect(call('time_of_week', [93600])).toBe('Mon 02:00');
    });

    it('handles mid-week values', () => {
      // 3*86400 + 32400 = Wed 09:00
      expect(call('time_of_week', [291600])).toBe('Wed 09:00');
    });

    it('falls back to "-" when actual is undefined', () => {
      expect(call('time_of_week', undefined)).toBe('-');
    });
  });

  describe('metric detectors', () => {
    it('appends "events" for high_count with no field name', () => {
      expect(call('high_count', [1000])).toBe('1000 events');
    });

    it('appends "events" for low_count with no field name', () => {
      expect(call('low_count', [5])).toBe('5 events');
    });

    it('formats source.bytes using human-readable byte sizes (GB)', () => {
      // 5368709120 bytes ≈ 5.4 GB
      expect(call('high_sum', [5368709120], { fieldName: 'source.bytes' })).toBe('5.4 GB');
    });

    it('formats source.bytes in MB range', () => {
      // 104857600 bytes ≈ 104.9 MB
      expect(call('high_sum', [104857600], { fieldName: 'source.bytes' })).toBe('104.9 MB');
    });

    it('formats source.bytes in KB range', () => {
      // 2048 bytes = 2 KB
      expect(call('high_sum', [2048], { fieldName: 'source.bytes' })).toBe('2 KB');
    });

    it('formats source.bytes under 1 KB as bytes', () => {
      expect(call('high_sum', [512], { fieldName: 'source.bytes' })).toBe('512 B');
    });

    it('formats session.duration milliseconds as hours', () => {
      // 14400000 ms = 4 h
      expect(call('high_mean', [14400000], { fieldName: 'session.duration' })).toBe('4.0 h');
    });

    it('formats session.duration milliseconds as minutes', () => {
      // 900000 ms = 15 min
      expect(call('high_mean', [900000], { fieldName: 'session.duration' })).toBe('15 min');
    });

    it('formats session.duration milliseconds as seconds', () => {
      // 2500 ms = 2.5 s
      expect(call('high_mean', [2500], { fieldName: 'session.duration' })).toBe('2.5 s');
    });

    it('formats session.duration sub-second as ms', () => {
      expect(call('high_mean', [800], { fieldName: 'session.duration' })).toBe('800 ms');
    });

    it('formats entropy fields with "bits" suffix', () => {
      expect(call('high_info_content', [4.2], { fieldName: 'dns.question.name' })).toBe('4.2 bits');
    });

    it('formats total_length_process_args with "chars" suffix', () => {
      expect(call('high_mean', [350], { fieldName: 'total_length_process_args' })).toBe(
        '350 chars'
      );
    });

    it('appends the human-readable field name for destination.ip', () => {
      expect(call('high_distinct_count', [12], { fieldName: 'destination.ip' })).toBe(
        '12 destination IPs'
      );
    });

    it('falls back to "-" when actual is undefined', () => {
      expect(call('high_count', undefined)).toBe('-');
    });

    it('falls back to "-" when actual is an empty array', () => {
      expect(call('high_count', [])).toBe('-');
    });
  });
});
