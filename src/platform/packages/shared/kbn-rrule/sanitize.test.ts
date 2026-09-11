/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { sanitizeOptions } from './sanitize';
import { Weekday, Frequency, type Options } from './types';

describe('sanitizeOptions', () => {
  const options: Options = {
    wkst: Weekday.MO,
    byyearday: [1, 2, 3],
    bymonth: [1],
    bysetpos: [1],
    bymonthday: [1],
    byweekday: [Weekday.MO],
    byhour: [1],
    byminute: [1],
    bysecond: [1],
    dtstart: new Date('September 3, 1998 03:24:00'),
    freq: Frequency.YEARLY,
    interval: 1,
    until: new Date('February 25, 2022 03:24:00'),
    count: 3,
    tzid: 'UTC',
  };

  it('happy path', () => {
    expect(sanitizeOptions(options)).toEqual(options);
  });

  it('throws an error when dtstart is missing', () => {
    // @ts-expect-error
    expect(() => sanitizeOptions({ ...options, dtstart: null })).toThrow(
      'Cannot create RRule: dtstart is required'
    );
  });

  it('throws an error when tzid is missing', () => {
    // @ts-expect-error
    expect(() => sanitizeOptions({ ...options, tzid: null })).toThrow(
      'Cannot create RRule: tzid is required'
    );
  });

  it('throws an error when tzid is invalid', () => {
    expect(() => sanitizeOptions({ ...options, tzid: 'invalid' })).toThrow(
      'Cannot create RRule: tzid is invalid'
    );
  });

  it('throws an error when until field is invalid', () => {
    expect(() =>
      sanitizeOptions({
        ...options,
        // @ts-expect-error
        until: {
          getTime: () => NaN,
        },
      })
    ).toThrow('Cannot create RRule: until is an invalid date');
  });

  it('throws an error when interval is less than 0', () => {
    expect(() => sanitizeOptions({ ...options, interval: -3 })).toThrow(
      'Cannot create RRule: interval must be greater than 0'
    );
  });

  it('throws an error when interval is not a number', () => {
    // @ts-expect-error
    expect(() => sanitizeOptions({ ...options, interval: 'foobar' })).toThrow(
      'Cannot create RRule: interval must be a number'
    );
  });

  it('filters out invalid bymonth values', () => {
    expect(sanitizeOptions({ ...options, bymonth: [0, 6, 13] })).toEqual({
      ...options,
      bymonth: [6],
    });
  });

  it('removes bymonth when it is empty', () => {
    expect(sanitizeOptions({ ...options, bymonth: [0] })).toEqual({
      ...options,
      bymonth: undefined,
    });
  });

  it('filters out invalid bymonthday values', () => {
    expect(sanitizeOptions({ ...options, bymonthday: [0, 15, 32, -32] })).toEqual({
      ...options,
      bymonthday: [15],
    });
  });

  it('keeps negative bymonthday values counting back from the end of the month', () => {
    expect(sanitizeOptions({ ...options, bymonthday: [-31, -1] })).toEqual({
      ...options,
      bymonthday: [-31, -1],
    });
  });

  it('removes bymonthday when it is empty', () => {
    expect(sanitizeOptions({ ...options, bymonthday: [0] })).toEqual({
      ...options,
      bymonthday: undefined,
    });
  });

  it('filters out invalid byweekday values', () => {
    // @ts-expect-error
    expect(sanitizeOptions({ ...options, byweekday: [0, 4, 8] })).toEqual({
      ...options,
      byweekday: [4],
    });
  });

  it('removes byweekday when it is empty', () => {
    // @ts-expect-error
    expect(sanitizeOptions({ ...options, byweekday: [0] })).toEqual({
      ...options,
      byweekday: undefined,
    });
  });

  it('filters out invalid byyearday values', () => {
    expect(sanitizeOptions({ ...options, byyearday: [0, 150, 367] })).toEqual({
      ...options,
      byyearday: [150],
    });
  });

  it('removes byyearday when it is empty', () => {
    expect(sanitizeOptions({ ...options, byyearday: [0] })).toEqual({
      ...options,
      byyearday: undefined,
    });
  });
});
