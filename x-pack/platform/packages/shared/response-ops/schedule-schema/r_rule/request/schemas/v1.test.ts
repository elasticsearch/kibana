/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { getRRuleRequestSchema, rRuleRequestSchema } from './v1';

describe('rRuleRequestSchema', () => {
  const basicRequest = {
    dtstart: '2021-01-01T00:00:00Z',
    tzid: 'UTC',
    freq: 0,
    byweekday: ['MO'],
    bymonthday: [1],
    bymonth: [2],
    interval: 2,
    until: '2021-02-01T00:00:00Z',
    count: 2,
  };

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2021-01-01T00:00:00Z'));
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  test('no errors on proper request', () => {
    expect(rRuleRequestSchema.validate(basicRequest)).toEqual(basicRequest);
  });

  describe('frequency', () => {
    test('no errors on freq 4', () => {
      expect(rRuleRequestSchema.validate({ ...basicRequest, freq: 4 })).toEqual({
        ...basicRequest,
        freq: 4,
      });
    });
    test('returns an error with invalid values', () => {
      expect(() => rRuleRequestSchema.validate({ ...basicRequest, freq: 5 })).toThrow();
    });
  });

  describe('tzid', () => {
    test('returns an error with invalid values', () => {
      expect(() => rRuleRequestSchema.validate({ ...basicRequest, tzid: 'invalid' })).toThrow();
    });
  });

  describe('interval', () => {
    test('returns an error with invalid values', () => {
      expect(() => rRuleRequestSchema.validate({ ...basicRequest, interval: 'invalid' })).toThrow();
    });

    test('returns an error when it is a number but not an integer', () => {
      expect(() => rRuleRequestSchema.validate({ ...basicRequest, interval: 1.5 })).toThrow();
    });

    test('returns an error when is set to less than one', () => {
      expect(() => rRuleRequestSchema.validate({ ...basicRequest, interval: 0 })).toThrow();
    });
  });

  describe('until', () => {
    test('returns an error with invalid values', () => {
      expect(() => rRuleRequestSchema.validate({ ...basicRequest, until: 'invalid' })).toThrow();
    });

    test('returns an error if the date is in the past', () => {
      expect(() =>
        // one year ago
        rRuleRequestSchema.validate({ ...basicRequest, until: '2020-01-01T00:00:00Z' })
      ).toThrow();
    });
  });

  describe('count', () => {
    test('returns an error with invalid values', () => {
      expect(() => rRuleRequestSchema.validate({ ...basicRequest, count: 'invalid' })).toThrow();
    });

    test('returns an error when it is a number but not an integer', () => {
      expect(() => rRuleRequestSchema.validate({ ...basicRequest, count: 1.5 })).toThrow();
    });

    test('returns an error when is set to less than one', () => {
      expect(() => rRuleRequestSchema.validate({ ...basicRequest, count: 0 })).toThrow();
    });
  });

  describe('byweekday', () => {
    test('returns an error if the are no values', () => {
      expect(() => rRuleRequestSchema.validate({ ...basicRequest, byweekday: [] })).toThrow();
    });

    test('returns an error with invalid values', () => {
      expect(() =>
        rRuleRequestSchema.validate({ ...basicRequest, byweekday: ['invalid'] })
      ).toThrow();
    });
  });

  describe('bymonthday', () => {
    test('returns an error if the are no values', () => {
      expect(() => rRuleRequestSchema.validate({ ...basicRequest, bymonthday: [] })).toThrow();
    });

    test('returns an error with invalid values', () => {
      expect(() =>
        rRuleRequestSchema.validate({ ...basicRequest, bymonthday: ['invalid'] })
      ).toThrow();
    });

    test('returns an error if the values are less than one', () => {
      expect(() => rRuleRequestSchema.validate({ ...basicRequest, bymonthday: [0] })).toThrow();
    });

    test('returns an error if the values are bigger than 31', () => {
      expect(() => rRuleRequestSchema.validate({ ...basicRequest, bymonthday: [32] })).toThrow();
    });

    test('returns an error for -1 unless the last day of the month is allowed', () => {
      expect(() => rRuleRequestSchema.validate({ ...basicRequest, bymonthday: [-1] })).toThrow();
    });
  });

  describe('bymonthday with allowLastDayOfMonth', () => {
    const lastDayOfMonthSchema = getRRuleRequestSchema({ allowLastDayOfMonth: true });

    test('accepts -1 for the last day of the month', () => {
      expect(
        lastDayOfMonthSchema.validate({ ...basicRequest, bymonthday: [-1] }).bymonthday
      ).toEqual([-1]);
      expect(
        lastDayOfMonthSchema.validate({ ...basicRequest, bymonthday: [1, -1] }).bymonthday
      ).toEqual([1, -1]);
    });

    test('returns an error if the values are zero', () => {
      expect(() => lastDayOfMonthSchema.validate({ ...basicRequest, bymonthday: [0] })).toThrow();
    });

    test('returns an error for negative values other than -1', () => {
      // The recurring schedule form cannot express -31 to -2, so the API does not accept them.
      expect(() => lastDayOfMonthSchema.validate({ ...basicRequest, bymonthday: [-2] })).toThrow();
      expect(() => lastDayOfMonthSchema.validate({ ...basicRequest, bymonthday: [-31] })).toThrow();
    });

    test('returns an error if the values are outside -1 to 31', () => {
      expect(() => lastDayOfMonthSchema.validate({ ...basicRequest, bymonthday: [32] })).toThrow();
    });

    test('returns an error if the values are not integers', () => {
      expect(() =>
        lastDayOfMonthSchema.validate({ ...basicRequest, bymonthday: [25.5] })
      ).toThrow();
    });
  });

  describe('bymonth', () => {
    test('returns an error if the are no values', () => {
      expect(() => rRuleRequestSchema.validate({ ...basicRequest, bymonth: [] })).toThrow();
    });

    test('returns an error with invalid values', () => {
      expect(() =>
        rRuleRequestSchema.validate({ ...basicRequest, bymonth: ['invalid'] })
      ).toThrow();
    });

    test('returns an error if the values are less than one', () => {
      expect(() => rRuleRequestSchema.validate({ ...basicRequest, bymonth: [0] })).toThrow();
    });

    test('returns an error if the values are bigger than 12', () => {
      expect(() => rRuleRequestSchema.validate({ ...basicRequest, bymonth: [13] })).toThrow();
    });
  });
});
