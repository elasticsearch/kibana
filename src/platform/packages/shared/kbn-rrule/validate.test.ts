/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { validateOptions } from './validate';
import { Weekday, Frequency, type ConstructorOptions } from './types';

describe('validateOptions', () => {
  const options: ConstructorOptions = {
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
    expect(() => validateOptions(options)).not.toThrow();
  });

  describe('dtstart', () => {
    it('throws an error when dtstart is missing', () => {
      expect(() =>
        // @ts-expect-error
        validateOptions({ ...options, dtstart: null })
      ).toThrowErrorMatchingInlineSnapshot(`"dtstart is required"`);
    });

    it('throws an error when dtstart is not a valid date', () => {
      expect(() =>
        validateOptions({ ...options, dtstart: new Date('invalid') })
      ).toThrowErrorMatchingInlineSnapshot(`"dtstart is an invalid date"`);
    });
  });

  describe('tzid', () => {
    it('throws an error when tzid is missing', () => {
      // @ts-expect-error
      expect(() => validateOptions({ ...options, tzid: null })).toThrowErrorMatchingInlineSnapshot(
        `"tzid is required"`
      );
    });

    it('throws an error when tzid is invalid', () => {
      expect(() =>
        validateOptions({ ...options, tzid: 'invalid' })
      ).toThrowErrorMatchingInlineSnapshot(`"tzid is an invalid timezone"`);
    });
  });

  describe('interval', () => {
    it('throws an error when count is not a number', () => {
      expect(() =>
        // @ts-expect-error
        validateOptions({ ...options, interval: 'invalid' })
      ).toThrowErrorMatchingInlineSnapshot(`"interval must be an integer greater than 0"`);
    });

    it('throws an error when interval is not an integer', () => {
      expect(() =>
        validateOptions({ ...options, interval: 1.5 })
      ).toThrowErrorMatchingInlineSnapshot(`"interval must be an integer greater than 0"`);
    });

    it('throws an error when interval is <= 0', () => {
      expect(() => validateOptions({ ...options, interval: 0 })).toThrowErrorMatchingInlineSnapshot(
        `"interval must be an integer greater than 0"`
      );
    });
  });

  describe('until', () => {
    it('throws an error when until field is an invalid date', () => {
      expect(() =>
        validateOptions({
          ...options,
          until: new Date('invalid'),
        })
      ).toThrowErrorMatchingInlineSnapshot(`"until is an invalid date"`);
    });
  });

  describe('count', () => {
    it('throws an error when count is not a number', () => {
      expect(() =>
        // @ts-expect-error
        validateOptions({ ...options, count: 'invalid' })
      ).toThrowErrorMatchingInlineSnapshot(`"count must be an integer greater than 0"`);
    });

    it('throws an error when count is not an integer', () => {
      expect(() => validateOptions({ ...options, count: 1.5 })).toThrowErrorMatchingInlineSnapshot(
        `"count must be an integer greater than 0"`
      );
    });

    it('throws an error when count is <= 0', () => {
      expect(() => validateOptions({ ...options, count: 0 })).toThrowErrorMatchingInlineSnapshot(
        `"count must be an integer greater than 0"`
      );
    });
  });

  describe('bymonth', () => {
    it('throws an error with out of range values', () => {
      expect(() =>
        validateOptions({ ...options, bymonth: [0, 6, 13] })
      ).toThrowErrorMatchingInlineSnapshot(
        `"bymonth must be an array of numbers between 1 and 12"`
      );
    });

    it('throws an error with string values', () => {
      expect(() =>
        // @ts-expect-error
        validateOptions({ ...options, bymonth: ['invalid'] })
      ).toThrowErrorMatchingInlineSnapshot(
        `"bymonth must be an array of numbers between 1 and 12"`
      );
    });

    it('throws an error when is empty', () => {
      expect(() => validateOptions({ ...options, bymonth: [] })).toThrowErrorMatchingInlineSnapshot(
        `"bymonth must be an array of numbers between 1 and 12"`
      );
    });
  });

  describe('bymonthday', () => {
    it('throws an error with out of range values', () => {
      expect(() =>
        validateOptions({ ...options, bymonthday: [0, 15, 32] })
      ).toThrowErrorMatchingInlineSnapshot(
        `"bymonthday must be an array of numbers between 1 and 31, or between -31 and -1"`
      );
    });

    it('throws an error with out of range negative values', () => {
      expect(() =>
        validateOptions({ ...options, bymonthday: [-32] })
      ).toThrowErrorMatchingInlineSnapshot(
        `"bymonthday must be an array of numbers between 1 and 31, or between -31 and -1"`
      );
    });

    it('does not throw for negative values counting back from the end of the month', () => {
      expect(() => validateOptions({ ...options, bymonthday: [-1] })).not.toThrow();
      expect(() => validateOptions({ ...options, bymonthday: [-31, -1, 1, 31] })).not.toThrow();
    });

    it('throws an error with string values', () => {
      expect(() =>
        // @ts-expect-error
        validateOptions({ ...options, bymonthday: ['invalid'] })
      ).toThrowErrorMatchingInlineSnapshot(
        `"bymonthday must be an array of numbers between 1 and 31, or between -31 and -1"`
      );
    });

    it('throws an error when is empty', () => {
      expect(() =>
        validateOptions({ ...options, bymonthday: [] })
      ).toThrowErrorMatchingInlineSnapshot(
        `"bymonthday must be an array of numbers between 1 and 31, or between -31 and -1"`
      );
    });
  });

  describe('byweekday', () => {
    it('throws an error with out of range values when it contains only numbers', () => {
      expect(() =>
        validateOptions({ ...options, byweekday: [0, 4, 8] })
      ).toThrowErrorMatchingInlineSnapshot(`"byweekday numbers must been between 1 and 7"`);
    });

    it('throws an error with invalid values when it contains only string', () => {
      expect(() =>
        validateOptions({ ...options, byweekday: ['+1MO', 'FOO', '+3WE', 'BAR', '-4FR'] })
      ).toThrowErrorMatchingInlineSnapshot(`"byweekday strings must be valid weekday strings"`);
    });

    it('throws an error when is empty', () => {
      expect(() =>
        validateOptions({ ...options, byweekday: [] })
      ).toThrowErrorMatchingInlineSnapshot(
        `"byweekday must be an array of at least one string or number"`
      );
    });

    it('throws an error with mixed values', () => {
      expect(() =>
        validateOptions({ ...options, byweekday: [2, 'MO'] })
      ).toThrowErrorMatchingInlineSnapshot(
        `"byweekday values can be either numbers or strings, not both"`
      );
    });

    it('does not throw with properly formed byweekday strings', () => {
      expect(() =>
        validateOptions({
          ...options,
          byweekday: ['+1MO', '+2TU', '+3WE', '+4TH', '-4FR', '-3SA', '-2SU', '-1MO'],
        })
      ).not.toThrow(`"byweekday numbers must been between 1 and 7"`);
    });

    it('does not throw with non recurrence values', () => {
      expect(() =>
        validateOptions({ ...options, byweekday: ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'] })
      ).not.toThrow(`"byweekday numbers must been between 1 and 7"`);
    });
  });
});
