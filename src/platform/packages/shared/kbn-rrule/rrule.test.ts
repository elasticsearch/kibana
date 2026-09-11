/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import sinon from 'sinon';
import { RRule } from './rrule';
import { Frequency, Weekday } from './types';

const DATE_2019 = '2019-01-01T00:00:00.000Z';
const DATE_2019_DECEMBER_19 = '2019-12-19T00:00:00.000Z';
const DATE_2019_FEB_28 = '2019-02-28T00:00:00.000Z';
const DATE_2020 = '2020-01-01T00:00:00.000Z';
const DATE_2020_MINUS_1_MONTH = '2019-12-01T00:00:00.000Z';
const DATE_2020_FEB_28 = '2020-02-28T00:00:00.000Z';
const DATE_2023 = '2023-01-01T00:00:00.000Z';
const DATE_2023_JAN_6_11PM = '2023-01-06T23:00:00Z';

const INVALID_DATE = '2020-01-01-01-01T:00:00:00Z';

const NOW = DATE_2020;

let fakeTimer: sinon.SinonFakeTimers;

describe('RRule', () => {
  beforeAll(() => {
    fakeTimer = sinon.useFakeTimers(new Date(NOW));
  });

  afterAll(() => fakeTimer.restore());

  describe('frequency', () => {
    it('works with yearly', () => {
      const rule = new RRule({
        dtstart: new Date(DATE_2019),
        freq: Frequency.YEARLY,
        interval: 1,
        tzid: 'UTC',
      });

      expect(rule.all(10)).toMatchInlineSnapshot(`
        Array [
          2019-01-01T00:00:00.000Z,
          2020-01-01T00:00:00.000Z,
          2021-01-01T00:00:00.000Z,
          2022-01-01T00:00:00.000Z,
          2023-01-01T00:00:00.000Z,
          2024-01-01T00:00:00.000Z,
          2025-01-01T00:00:00.000Z,
          2026-01-01T00:00:00.000Z,
          2027-01-01T00:00:00.000Z,
          2028-01-01T00:00:00.000Z,
        ]
      `);

      const rule2 = new RRule({
        dtstart: new Date(DATE_2020),
        freq: Frequency.YEARLY,
        interval: 3,
        tzid: 'UTC',
      });

      expect(rule2.all(10)).toMatchInlineSnapshot(`
        Array [
          2020-01-01T00:00:00.000Z,
          2023-01-01T00:00:00.000Z,
          2026-01-01T00:00:00.000Z,
          2029-01-01T00:00:00.000Z,
          2032-01-01T00:00:00.000Z,
          2035-01-01T00:00:00.000Z,
          2038-01-01T00:00:00.000Z,
          2041-01-01T00:00:00.000Z,
          2044-01-01T00:00:00.000Z,
          2047-01-01T00:00:00.000Z,
        ]
      `);
    });

    it('works with monthly', () => {
      const rule = new RRule({
        dtstart: new Date(DATE_2019),
        freq: Frequency.MONTHLY,
        interval: 1,
        tzid: 'UTC',
      });

      expect(rule.all(15)).toMatchInlineSnapshot(`
        Array [
          2019-01-01T00:00:00.000Z,
          2019-02-01T00:00:00.000Z,
          2019-03-01T00:00:00.000Z,
          2019-04-01T00:00:00.000Z,
          2019-05-01T00:00:00.000Z,
          2019-06-01T00:00:00.000Z,
          2019-07-01T00:00:00.000Z,
          2019-08-01T00:00:00.000Z,
          2019-09-01T00:00:00.000Z,
          2019-10-01T00:00:00.000Z,
          2019-11-01T00:00:00.000Z,
          2019-12-01T00:00:00.000Z,
          2020-01-01T00:00:00.000Z,
          2020-02-01T00:00:00.000Z,
          2020-03-01T00:00:00.000Z,
        ]
      `);

      const rule2 = new RRule({
        dtstart: new Date(DATE_2019),
        freq: Frequency.MONTHLY,
        interval: 6,
        tzid: 'UTC',
      });

      expect(rule2.all(6)).toMatchInlineSnapshot(`
        Array [
          2019-01-01T00:00:00.000Z,
          2019-07-01T00:00:00.000Z,
          2020-01-01T00:00:00.000Z,
          2020-07-01T00:00:00.000Z,
          2021-01-01T00:00:00.000Z,
          2021-07-01T00:00:00.000Z,
        ]
      `);

      const rule3 = new RRule({
        dtstart: new Date(DATE_2019),
        bymonthday: [10, 20],
        freq: Frequency.MONTHLY,
        interval: 6,
        tzid: 'UTC',
      });

      expect(rule3.all(6)).toMatchInlineSnapshot(`
        Array [
          2019-01-10T00:00:00.000Z,
          2019-01-20T00:00:00.000Z,
          2019-07-10T00:00:00.000Z,
          2019-07-20T00:00:00.000Z,
          2020-01-10T00:00:00.000Z,
          2020-01-20T00:00:00.000Z,
        ]
      `);
    });

    it('works with weekly', () => {
      const rule = new RRule({
        dtstart: new Date(DATE_2019_DECEMBER_19),
        freq: Frequency.WEEKLY,
        interval: 1,
        tzid: 'UTC',
      });

      expect(rule.all(14)).toMatchInlineSnapshot(`
        Array [
          2019-12-19T00:00:00.000Z,
          2019-12-26T00:00:00.000Z,
          2020-01-02T00:00:00.000Z,
          2020-01-09T00:00:00.000Z,
          2020-01-16T00:00:00.000Z,
          2020-01-23T00:00:00.000Z,
          2020-01-30T00:00:00.000Z,
          2020-02-06T00:00:00.000Z,
          2020-02-13T00:00:00.000Z,
          2020-02-20T00:00:00.000Z,
          2020-02-27T00:00:00.000Z,
          2020-03-05T00:00:00.000Z,
          2020-03-12T00:00:00.000Z,
          2020-03-19T00:00:00.000Z,
        ]
      `);

      const rule2 = new RRule({
        dtstart: new Date(DATE_2019_DECEMBER_19),
        freq: Frequency.WEEKLY,
        interval: 2,
        tzid: 'UTC',
      });

      expect(rule2.all(14)).toMatchInlineSnapshot(`
        Array [
          2019-12-19T00:00:00.000Z,
          2020-01-02T00:00:00.000Z,
          2020-01-16T00:00:00.000Z,
          2020-01-30T00:00:00.000Z,
          2020-02-13T00:00:00.000Z,
          2020-02-27T00:00:00.000Z,
          2020-03-12T00:00:00.000Z,
          2020-03-26T00:00:00.000Z,
          2020-04-09T00:00:00.000Z,
          2020-04-23T00:00:00.000Z,
          2020-05-07T00:00:00.000Z,
          2020-05-21T00:00:00.000Z,
          2020-06-04T00:00:00.000Z,
          2020-06-18T00:00:00.000Z,
        ]
      `);
    });

    it('works with daily', () => {
      const rule = new RRule({
        dtstart: new Date(DATE_2019_DECEMBER_19),
        freq: Frequency.DAILY,
        interval: 1,
        tzid: 'UTC',
      });

      expect(rule.all(30)).toMatchInlineSnapshot(`
        Array [
          2019-12-19T00:00:00.000Z,
          2019-12-20T00:00:00.000Z,
          2019-12-21T00:00:00.000Z,
          2019-12-22T00:00:00.000Z,
          2019-12-23T00:00:00.000Z,
          2019-12-24T00:00:00.000Z,
          2019-12-25T00:00:00.000Z,
          2019-12-26T00:00:00.000Z,
          2019-12-27T00:00:00.000Z,
          2019-12-28T00:00:00.000Z,
          2019-12-29T00:00:00.000Z,
          2019-12-30T00:00:00.000Z,
          2019-12-31T00:00:00.000Z,
          2020-01-01T00:00:00.000Z,
          2020-01-02T00:00:00.000Z,
          2020-01-03T00:00:00.000Z,
          2020-01-04T00:00:00.000Z,
          2020-01-05T00:00:00.000Z,
          2020-01-06T00:00:00.000Z,
          2020-01-07T00:00:00.000Z,
          2020-01-08T00:00:00.000Z,
          2020-01-09T00:00:00.000Z,
          2020-01-10T00:00:00.000Z,
          2020-01-11T00:00:00.000Z,
          2020-01-12T00:00:00.000Z,
          2020-01-13T00:00:00.000Z,
          2020-01-14T00:00:00.000Z,
          2020-01-15T00:00:00.000Z,
          2020-01-16T00:00:00.000Z,
          2020-01-17T00:00:00.000Z,
        ]
      `);

      const rule2 = new RRule({
        dtstart: new Date(DATE_2019_DECEMBER_19),
        freq: Frequency.DAILY,
        interval: 48,
        tzid: 'UTC',
      });

      expect(rule2.all(12)).toMatchInlineSnapshot(`
        Array [
          2019-12-19T00:00:00.000Z,
          2020-02-05T00:00:00.000Z,
          2020-03-24T00:00:00.000Z,
          2020-05-11T00:00:00.000Z,
          2020-06-28T00:00:00.000Z,
          2020-08-15T00:00:00.000Z,
          2020-10-02T00:00:00.000Z,
          2020-11-19T00:00:00.000Z,
          2021-01-06T00:00:00.000Z,
          2021-02-23T00:00:00.000Z,
          2021-04-12T00:00:00.000Z,
          2021-05-30T00:00:00.000Z,
        ]
      `);

      const rule3 = new RRule({
        dtstart: new Date(DATE_2019_FEB_28),
        freq: Frequency.DAILY,
        interval: 1,
        tzid: 'UTC',
      });

      expect(rule3.all(6)).toMatchInlineSnapshot(`
        Array [
          2019-02-28T00:00:00.000Z,
          2019-03-01T00:00:00.000Z,
          2019-03-02T00:00:00.000Z,
          2019-03-03T00:00:00.000Z,
          2019-03-04T00:00:00.000Z,
          2019-03-05T00:00:00.000Z,
        ]
      `);

      const rule4 = new RRule({
        dtstart: new Date(DATE_2020_FEB_28),
        freq: Frequency.DAILY,
        interval: 1,
        tzid: 'UTC',
      });

      expect(rule4.all(6)).toMatchInlineSnapshot(`
        Array [
          2020-02-28T00:00:00.000Z,
          2020-02-29T00:00:00.000Z,
          2020-03-01T00:00:00.000Z,
          2020-03-02T00:00:00.000Z,
          2020-03-03T00:00:00.000Z,
          2020-03-04T00:00:00.000Z,
        ]
      `);
    });

    it('works with hourly', () => {
      const rule = new RRule({
        dtstart: new Date(DATE_2019),
        freq: Frequency.HOURLY,
        interval: 1,
        tzid: 'UTC',
      });

      expect(rule.all(30)).toMatchInlineSnapshot(`
        Array [
          2019-01-01T00:00:00.000Z,
          2019-01-01T01:00:00.000Z,
          2019-01-01T02:00:00.000Z,
          2019-01-01T03:00:00.000Z,
          2019-01-01T04:00:00.000Z,
          2019-01-01T05:00:00.000Z,
          2019-01-01T06:00:00.000Z,
          2019-01-01T07:00:00.000Z,
          2019-01-01T08:00:00.000Z,
          2019-01-01T09:00:00.000Z,
          2019-01-01T10:00:00.000Z,
          2019-01-01T11:00:00.000Z,
          2019-01-01T12:00:00.000Z,
          2019-01-01T13:00:00.000Z,
          2019-01-01T14:00:00.000Z,
          2019-01-01T15:00:00.000Z,
          2019-01-01T16:00:00.000Z,
          2019-01-01T17:00:00.000Z,
          2019-01-01T18:00:00.000Z,
          2019-01-01T19:00:00.000Z,
          2019-01-01T20:00:00.000Z,
          2019-01-01T21:00:00.000Z,
          2019-01-01T22:00:00.000Z,
          2019-01-01T23:00:00.000Z,
          2019-01-02T00:00:00.000Z,
          2019-01-02T01:00:00.000Z,
          2019-01-02T02:00:00.000Z,
          2019-01-02T03:00:00.000Z,
          2019-01-02T04:00:00.000Z,
          2019-01-02T05:00:00.000Z,
        ]
      `);

      const rule2 = new RRule({
        dtstart: new Date(DATE_2019),
        freq: Frequency.HOURLY,
        interval: 36,
        tzid: 'UTC',
      });

      expect(rule2.all(30)).toMatchInlineSnapshot(`
        Array [
          2019-01-01T00:00:00.000Z,
          2019-01-02T12:00:00.000Z,
          2019-01-04T00:00:00.000Z,
          2019-01-05T12:00:00.000Z,
          2019-01-07T00:00:00.000Z,
          2019-01-08T12:00:00.000Z,
          2019-01-10T00:00:00.000Z,
          2019-01-11T12:00:00.000Z,
          2019-01-13T00:00:00.000Z,
          2019-01-14T12:00:00.000Z,
          2019-01-16T00:00:00.000Z,
          2019-01-17T12:00:00.000Z,
          2019-01-19T00:00:00.000Z,
          2019-01-20T12:00:00.000Z,
          2019-01-22T00:00:00.000Z,
          2019-01-23T12:00:00.000Z,
          2019-01-25T00:00:00.000Z,
          2019-01-26T12:00:00.000Z,
          2019-01-28T00:00:00.000Z,
          2019-01-29T12:00:00.000Z,
          2019-01-31T00:00:00.000Z,
          2019-02-01T12:00:00.000Z,
          2019-02-03T00:00:00.000Z,
          2019-02-04T12:00:00.000Z,
          2019-02-06T00:00:00.000Z,
          2019-02-07T12:00:00.000Z,
          2019-02-09T00:00:00.000Z,
          2019-02-10T12:00:00.000Z,
          2019-02-12T00:00:00.000Z,
          2019-02-13T12:00:00.000Z,
        ]
      `);
    });

    it('works with minutely', () => {
      const rule = new RRule({
        dtstart: new Date(DATE_2019),
        freq: Frequency.MINUTELY,
        interval: 15,
        tzid: 'UTC',
      });

      expect(rule.all(10)).toMatchInlineSnapshot(`
        Array [
          2019-01-01T00:00:00.000Z,
          2019-01-01T00:15:00.000Z,
          2019-01-01T00:30:00.000Z,
          2019-01-01T00:45:00.000Z,
          2019-01-01T01:00:00.000Z,
          2019-01-01T01:15:00.000Z,
          2019-01-01T01:30:00.000Z,
          2019-01-01T01:45:00.000Z,
          2019-01-01T02:00:00.000Z,
          2019-01-01T02:15:00.000Z,
        ]
      `);

      const rule2 = new RRule({
        dtstart: new Date(DATE_2019),
        freq: Frequency.MINUTELY,
        interval: 36,
        tzid: 'UTC',
      });

      expect(rule2.all(30)).toMatchInlineSnapshot(`
        Array [
          2019-01-01T00:00:00.000Z,
          2019-01-01T00:36:00.000Z,
          2019-01-01T01:12:00.000Z,
          2019-01-01T01:48:00.000Z,
          2019-01-01T02:24:00.000Z,
          2019-01-01T03:00:00.000Z,
          2019-01-01T03:36:00.000Z,
          2019-01-01T04:12:00.000Z,
          2019-01-01T04:48:00.000Z,
          2019-01-01T05:24:00.000Z,
          2019-01-01T06:00:00.000Z,
          2019-01-01T06:36:00.000Z,
          2019-01-01T07:12:00.000Z,
          2019-01-01T07:48:00.000Z,
          2019-01-01T08:24:00.000Z,
          2019-01-01T09:00:00.000Z,
          2019-01-01T09:36:00.000Z,
          2019-01-01T10:12:00.000Z,
          2019-01-01T10:48:00.000Z,
          2019-01-01T11:24:00.000Z,
          2019-01-01T12:00:00.000Z,
          2019-01-01T12:36:00.000Z,
          2019-01-01T13:12:00.000Z,
          2019-01-01T13:48:00.000Z,
          2019-01-01T14:24:00.000Z,
          2019-01-01T15:00:00.000Z,
          2019-01-01T15:36:00.000Z,
          2019-01-01T16:12:00.000Z,
          2019-01-01T16:48:00.000Z,
          2019-01-01T17:24:00.000Z,
        ]
      `);
    });
  });

  it('works with until', () => {
    const rule = new RRule({
      dtstart: new Date(DATE_2019),
      freq: Frequency.MONTHLY,
      interval: 1,
      tzid: 'UTC',
      until: new Date(DATE_2020_MINUS_1_MONTH),
    });

    const result = rule.all();

    expect(result.length).toBe(11);
    expect(rule.all()).toMatchInlineSnapshot(`
      Array [
        2019-01-01T00:00:00.000Z,
        2019-02-01T00:00:00.000Z,
        2019-03-01T00:00:00.000Z,
        2019-04-01T00:00:00.000Z,
        2019-05-01T00:00:00.000Z,
        2019-06-01T00:00:00.000Z,
        2019-07-01T00:00:00.000Z,
        2019-08-01T00:00:00.000Z,
        2019-09-01T00:00:00.000Z,
        2019-10-01T00:00:00.000Z,
        2019-11-01T00:00:00.000Z,
      ]
    `);
  });

  it('works with count', () => {
    const rule = new RRule({
      dtstart: new Date(DATE_2019),
      freq: Frequency.MONTHLY,
      interval: 1,
      tzid: 'UTC',
      count: 20,
    });
    expect(rule.all()).toMatchInlineSnapshot(`
      Array [
        2019-01-01T00:00:00.000Z,
        2019-02-01T00:00:00.000Z,
        2019-03-01T00:00:00.000Z,
        2019-04-01T00:00:00.000Z,
        2019-05-01T00:00:00.000Z,
        2019-06-01T00:00:00.000Z,
        2019-07-01T00:00:00.000Z,
        2019-08-01T00:00:00.000Z,
        2019-09-01T00:00:00.000Z,
        2019-10-01T00:00:00.000Z,
        2019-11-01T00:00:00.000Z,
        2019-12-01T00:00:00.000Z,
        2020-01-01T00:00:00.000Z,
        2020-02-01T00:00:00.000Z,
        2020-03-01T00:00:00.000Z,
        2020-04-01T00:00:00.000Z,
        2020-05-01T00:00:00.000Z,
        2020-06-01T00:00:00.000Z,
        2020-07-01T00:00:00.000Z,
        2020-08-01T00:00:00.000Z,
      ]
    `);
  });

  describe('byweekday', () => {
    it('works with weekly frequency', () => {
      const rule = new RRule({
        dtstart: new Date(DATE_2019_DECEMBER_19),
        freq: Frequency.WEEKLY,
        interval: 1,
        tzid: 'UTC',
        byweekday: [Weekday.TH],
      });
      expect(rule.all(14)).toMatchInlineSnapshot(`
        Array [
          2019-12-19T00:00:00.000Z,
          2019-12-26T00:00:00.000Z,
          2020-01-02T00:00:00.000Z,
          2020-01-09T00:00:00.000Z,
          2020-01-16T00:00:00.000Z,
          2020-01-23T00:00:00.000Z,
          2020-01-30T00:00:00.000Z,
          2020-02-06T00:00:00.000Z,
          2020-02-13T00:00:00.000Z,
          2020-02-20T00:00:00.000Z,
          2020-02-27T00:00:00.000Z,
          2020-03-05T00:00:00.000Z,
          2020-03-12T00:00:00.000Z,
          2020-03-19T00:00:00.000Z,
        ]
      `);

      const rule2 = new RRule({
        dtstart: new Date(DATE_2019),
        freq: Frequency.WEEKLY,
        interval: 1,
        tzid: 'UTC',
        byweekday: [Weekday.SA, Weekday.SU, Weekday.MO],
      });

      expect(rule2.all(9)).toMatchInlineSnapshot(`
        Array [
          2019-01-05T00:00:00.000Z,
          2019-01-06T00:00:00.000Z,
          2019-01-07T00:00:00.000Z,
          2019-01-12T00:00:00.000Z,
          2019-01-13T00:00:00.000Z,
          2019-01-14T00:00:00.000Z,
          2019-01-19T00:00:00.000Z,
          2019-01-20T00:00:00.000Z,
          2019-01-21T00:00:00.000Z,
        ]
      `);
    });

    it('works with daily frequency by behaving like weekly frequency', () => {
      const rule = new RRule({
        dtstart: new Date(DATE_2019_DECEMBER_19),
        freq: Frequency.DAILY,
        interval: 1,
        tzid: 'UTC',
        byweekday: [Weekday.TH],
      });
      expect(rule.all(14)).toMatchInlineSnapshot(`
        Array [
          2019-12-19T00:00:00.000Z,
          2019-12-26T00:00:00.000Z,
          2020-01-02T00:00:00.000Z,
          2020-01-09T00:00:00.000Z,
          2020-01-16T00:00:00.000Z,
          2020-01-23T00:00:00.000Z,
          2020-01-30T00:00:00.000Z,
          2020-02-06T00:00:00.000Z,
          2020-02-13T00:00:00.000Z,
          2020-02-20T00:00:00.000Z,
          2020-02-27T00:00:00.000Z,
          2020-03-05T00:00:00.000Z,
          2020-03-12T00:00:00.000Z,
          2020-03-19T00:00:00.000Z,
        ]
      `);

      const rule2 = new RRule({
        dtstart: new Date(DATE_2019),
        freq: Frequency.WEEKLY,
        interval: 1,
        tzid: 'UTC',
        byweekday: [Weekday.SA, Weekday.SU, Weekday.MO],
      });

      expect(rule2.all(9)).toMatchInlineSnapshot(`
        Array [
          2019-01-05T00:00:00.000Z,
          2019-01-06T00:00:00.000Z,
          2019-01-07T00:00:00.000Z,
          2019-01-12T00:00:00.000Z,
          2019-01-13T00:00:00.000Z,
          2019-01-14T00:00:00.000Z,
          2019-01-19T00:00:00.000Z,
          2019-01-20T00:00:00.000Z,
          2019-01-21T00:00:00.000Z,
        ]
      `);
    });

    it('works with monthly frequency with non-setpos syntax by behaving like weekly frequency', () => {
      const rule = new RRule({
        dtstart: new Date(DATE_2019_DECEMBER_19),
        freq: Frequency.DAILY,
        interval: 1,
        tzid: 'UTC',
        byweekday: [Weekday.TH],
      });
      expect(rule.all(14)).toMatchInlineSnapshot(`
        Array [
          2019-12-19T00:00:00.000Z,
          2019-12-26T00:00:00.000Z,
          2020-01-02T00:00:00.000Z,
          2020-01-09T00:00:00.000Z,
          2020-01-16T00:00:00.000Z,
          2020-01-23T00:00:00.000Z,
          2020-01-30T00:00:00.000Z,
          2020-02-06T00:00:00.000Z,
          2020-02-13T00:00:00.000Z,
          2020-02-20T00:00:00.000Z,
          2020-02-27T00:00:00.000Z,
          2020-03-05T00:00:00.000Z,
          2020-03-12T00:00:00.000Z,
          2020-03-19T00:00:00.000Z,
        ]
      `);

      const rule2 = new RRule({
        dtstart: new Date(DATE_2019),
        freq: Frequency.WEEKLY,
        interval: 1,
        tzid: 'UTC',
        byweekday: [Weekday.SA, Weekday.SU, Weekday.MO],
      });

      expect(rule2.all(9)).toMatchInlineSnapshot(`
        Array [
          2019-01-05T00:00:00.000Z,
          2019-01-06T00:00:00.000Z,
          2019-01-07T00:00:00.000Z,
          2019-01-12T00:00:00.000Z,
          2019-01-13T00:00:00.000Z,
          2019-01-14T00:00:00.000Z,
          2019-01-19T00:00:00.000Z,
          2019-01-20T00:00:00.000Z,
          2019-01-21T00:00:00.000Z,
        ]
      `);
    });

    it('works with monthly frequency using setpos syntax', () => {
      const rule = new RRule({
        dtstart: new Date(DATE_2023),
        freq: Frequency.MONTHLY,
        interval: 1,
        tzid: 'UTC',
        byweekday: ['+1TU', '+2TU', '-1FR', '-2FR'],
      });
      const result = rule.all(12);

      expect(result).toMatchInlineSnapshot(`
        Array [
          2023-01-03T00:00:00.000Z,
          2023-01-10T00:00:00.000Z,
          2023-01-20T00:00:00.000Z,
          2023-01-27T00:00:00.000Z,
          2023-02-07T00:00:00.000Z,
          2023-02-14T00:00:00.000Z,
          2023-02-17T00:00:00.000Z,
          2023-02-24T00:00:00.000Z,
          2023-03-07T00:00:00.000Z,
          2023-03-14T00:00:00.000Z,
          2023-03-24T00:00:00.000Z,
          2023-03-31T00:00:00.000Z,
        ]
      `);
    });

    it('works with timezones', () => {
      const rule = new RRule({
        dtstart: new Date(DATE_2023_JAN_6_11PM),
        freq: Frequency.WEEKLY,
        interval: 1,
        tzid: 'Europe/Madrid',
        byweekday: [Weekday.SA],
      });
      expect(rule.all(12)).toMatchInlineSnapshot(`
        Array [
          2023-01-06T23:00:00.000Z,
          2023-01-13T23:00:00.000Z,
          2023-01-20T23:00:00.000Z,
          2023-01-27T23:00:00.000Z,
          2023-02-03T23:00:00.000Z,
          2023-02-10T23:00:00.000Z,
          2023-02-17T23:00:00.000Z,
          2023-02-24T23:00:00.000Z,
          2023-03-03T23:00:00.000Z,
          2023-03-10T23:00:00.000Z,
          2023-03-17T23:00:00.000Z,
          2023-03-24T23:00:00.000Z,
        ]
      `);

      const rule2 = new RRule({
        dtstart: new Date(DATE_2023_JAN_6_11PM),
        freq: Frequency.WEEKLY,
        interval: 1,
        tzid: 'UTC',
        byweekday: [Weekday.SA],
      });

      expect(rule2.all(12)).toMatchInlineSnapshot(`
        Array [
          2023-01-07T23:00:00.000Z,
          2023-01-14T23:00:00.000Z,
          2023-01-21T23:00:00.000Z,
          2023-01-28T23:00:00.000Z,
          2023-02-04T23:00:00.000Z,
          2023-02-11T23:00:00.000Z,
          2023-02-18T23:00:00.000Z,
          2023-02-25T23:00:00.000Z,
          2023-03-04T23:00:00.000Z,
          2023-03-11T23:00:00.000Z,
          2023-03-18T23:00:00.000Z,
          2023-03-25T23:00:00.000Z,
        ]
      `);
    });
    it('ignores invalid byweekday values', () => {
      const rule = new RRule({
        dtstart: new Date(DATE_2019_DECEMBER_19),
        freq: Frequency.WEEKLY,
        interval: 1,
        tzid: 'UTC',
        byweekday: [Weekday.TH, 0, -2],
      });
      expect(rule.all(14)).toMatchInlineSnapshot(`
        Array [
          2019-12-19T00:00:00.000Z,
          2019-12-26T00:00:00.000Z,
          2020-01-02T00:00:00.000Z,
          2020-01-09T00:00:00.000Z,
          2020-01-16T00:00:00.000Z,
          2020-01-23T00:00:00.000Z,
          2020-01-30T00:00:00.000Z,
          2020-02-06T00:00:00.000Z,
          2020-02-13T00:00:00.000Z,
          2020-02-20T00:00:00.000Z,
          2020-02-27T00:00:00.000Z,
          2020-03-05T00:00:00.000Z,
          2020-03-12T00:00:00.000Z,
          2020-03-19T00:00:00.000Z,
        ]
      `);

      const rule2 = new RRule({
        dtstart: new Date(DATE_2019),
        freq: Frequency.WEEKLY,
        interval: 1,
        tzid: 'UTC',
        byweekday: [Weekday.SA, Weekday.SU, Weekday.MO, 0],
      });

      expect(rule2.all(9)).toMatchInlineSnapshot(`
        Array [
          2019-01-05T00:00:00.000Z,
          2019-01-06T00:00:00.000Z,
          2019-01-07T00:00:00.000Z,
          2019-01-12T00:00:00.000Z,
          2019-01-13T00:00:00.000Z,
          2019-01-14T00:00:00.000Z,
          2019-01-19T00:00:00.000Z,
          2019-01-20T00:00:00.000Z,
          2019-01-21T00:00:00.000Z,
        ]
      `);
    });
  });

  describe('bymonth', () => {
    it('works with yearly frequency', () => {
      const rule = new RRule({
        dtstart: new Date(DATE_2019_DECEMBER_19),
        freq: Frequency.YEARLY,
        interval: 1,
        tzid: 'UTC',
        bymonth: [2, 5],
      });
      expect(rule.all(14)).toMatchInlineSnapshot(`
        Array [
          2020-02-19T00:00:00.000Z,
          2020-05-19T00:00:00.000Z,
          2021-02-19T00:00:00.000Z,
          2021-05-19T00:00:00.000Z,
          2022-02-19T00:00:00.000Z,
          2022-05-19T00:00:00.000Z,
          2023-02-19T00:00:00.000Z,
          2023-05-19T00:00:00.000Z,
          2024-02-19T00:00:00.000Z,
          2024-05-19T00:00:00.000Z,
          2025-02-19T00:00:00.000Z,
          2025-05-19T00:00:00.000Z,
          2026-02-19T00:00:00.000Z,
          2026-05-19T00:00:00.000Z,
        ]
      `);
    });
    it('ignores invalid bymonth values', () => {
      const rule = new RRule({
        dtstart: new Date(DATE_2019_DECEMBER_19),
        freq: Frequency.YEARLY,
        interval: 1,
        tzid: 'UTC',
        bymonth: [0],
      });
      expect(rule.all(14)).toMatchInlineSnapshot(`
        Array [
          2019-12-19T00:00:00.000Z,
          2020-12-19T00:00:00.000Z,
          2021-12-19T00:00:00.000Z,
          2022-12-19T00:00:00.000Z,
          2023-12-19T00:00:00.000Z,
          2024-12-19T00:00:00.000Z,
          2025-12-19T00:00:00.000Z,
          2026-12-19T00:00:00.000Z,
          2027-12-19T00:00:00.000Z,
          2028-12-19T00:00:00.000Z,
          2029-12-19T00:00:00.000Z,
          2030-12-19T00:00:00.000Z,
          2031-12-19T00:00:00.000Z,
          2032-12-19T00:00:00.000Z,
        ]
      `);
    });
  });

  describe('bymonthday', () => {
    it('works with monthly frequency', () => {
      const rule = new RRule({
        dtstart: new Date(DATE_2019_DECEMBER_19),
        freq: Frequency.MONTHLY,
        interval: 1,
        tzid: 'UTC',
        bymonthday: [1, 15],
      });
      expect(rule.all(14)).toMatchInlineSnapshot(`
        Array [
          2020-01-01T00:00:00.000Z,
          2020-01-15T00:00:00.000Z,
          2020-02-01T00:00:00.000Z,
          2020-02-15T00:00:00.000Z,
          2020-03-01T00:00:00.000Z,
          2020-03-15T00:00:00.000Z,
          2020-04-01T00:00:00.000Z,
          2020-04-15T00:00:00.000Z,
          2020-05-01T00:00:00.000Z,
          2020-05-15T00:00:00.000Z,
          2020-06-01T00:00:00.000Z,
          2020-06-15T00:00:00.000Z,
          2020-07-01T00:00:00.000Z,
          2020-07-15T00:00:00.000Z,
        ]
      `);
    });
    it('ignores invalid bymonthday values', () => {
      const rule = new RRule({
        dtstart: new Date(DATE_2019_DECEMBER_19),
        freq: Frequency.MONTHLY,
        interval: 1,
        tzid: 'UTC',
        bymonthday: [0, 32, -32],
      });
      expect(rule.all(14)).toMatchInlineSnapshot(`
        Array [
          2019-12-19T00:00:00.000Z,
          2020-01-19T00:00:00.000Z,
          2020-02-19T00:00:00.000Z,
          2020-03-19T00:00:00.000Z,
          2020-04-19T00:00:00.000Z,
          2020-05-19T00:00:00.000Z,
          2020-06-19T00:00:00.000Z,
          2020-07-19T00:00:00.000Z,
          2020-08-19T00:00:00.000Z,
          2020-09-19T00:00:00.000Z,
          2020-10-19T00:00:00.000Z,
          2020-11-19T00:00:00.000Z,
          2020-12-19T00:00:00.000Z,
          2021-01-19T00:00:00.000Z,
        ]
      `);
    });

    it('skips months that are too short for the requested day', () => {
      const rule = new RRule({
        dtstart: new Date(DATE_2019_DECEMBER_19),
        freq: Frequency.MONTHLY,
        interval: 1,
        tzid: 'UTC',
        bymonthday: [31],
      });
      expect(rule.all(8)).toMatchInlineSnapshot(`
        Array [
          2019-12-31T00:00:00.000Z,
          2020-01-31T00:00:00.000Z,
          2020-03-31T00:00:00.000Z,
          2020-05-31T00:00:00.000Z,
          2020-07-31T00:00:00.000Z,
          2020-08-31T00:00:00.000Z,
          2020-10-31T00:00:00.000Z,
          2020-12-31T00:00:00.000Z,
        ]
      `);
    });

    it('does not skip the period after an empty dtstart period', () => {
      const rule = new RRule({
        dtstart: new Date('2025-06-01T00:00:00.000Z'),
        freq: Frequency.MONTHLY,
        interval: 1,
        tzid: 'UTC',
        bymonthday: [31],
      });
      // June has 30 days, so the dtstart period is empty. July must still be examined.
      expect(rule.all(3)).toMatchInlineSnapshot(`
        Array [
          2025-07-31T00:00:00.000Z,
          2025-08-31T00:00:00.000Z,
          2025-10-31T00:00:00.000Z,
        ]
      `);
    });

    it('does not skip a year when the dtstart year has no matching day', () => {
      const rule = new RRule({
        dtstart: new Date('2019-06-01T00:00:00.000Z'),
        freq: Frequency.YEARLY,
        interval: 1,
        tzid: 'UTC',
        bymonth: [2],
        bymonthday: [29],
      });
      // February 2019 already passed and is not a leap year, so 2020 is the first match.
      expect(rule.all(2)).toMatchInlineSnapshot(`
        Array [
          2020-02-29T00:00:00.000Z,
          2024-02-29T00:00:00.000Z,
        ]
      `);
    });
  });

  describe('negative bymonthday', () => {
    it('recurs on the last day of every month, whatever its length', () => {
      const rule = new RRule({
        dtstart: new Date(DATE_2019_DECEMBER_19),
        freq: Frequency.MONTHLY,
        interval: 1,
        tzid: 'UTC',
        bymonthday: [-1],
      });
      expect(rule.all(14)).toMatchInlineSnapshot(`
        Array [
          2019-12-31T00:00:00.000Z,
          2020-01-31T00:00:00.000Z,
          2020-02-29T00:00:00.000Z,
          2020-03-31T00:00:00.000Z,
          2020-04-30T00:00:00.000Z,
          2020-05-31T00:00:00.000Z,
          2020-06-30T00:00:00.000Z,
          2020-07-31T00:00:00.000Z,
          2020-08-31T00:00:00.000Z,
          2020-09-30T00:00:00.000Z,
          2020-10-31T00:00:00.000Z,
          2020-11-30T00:00:00.000Z,
          2020-12-31T00:00:00.000Z,
          2021-01-31T00:00:00.000Z,
        ]
      `);
    });

    it('resolves the last day of February in a leap year', () => {
      const rule = new RRule({
        dtstart: new Date(DATE_2020),
        freq: Frequency.MONTHLY,
        interval: 1,
        tzid: 'UTC',
        bymonthday: [-1],
      });
      expect(rule.all(3)).toMatchInlineSnapshot(`
        Array [
          2020-01-31T00:00:00.000Z,
          2020-02-29T00:00:00.000Z,
          2020-03-31T00:00:00.000Z,
        ]
      `);
    });

    it('counts back from the end of the month for values below -1', () => {
      const rule = new RRule({
        dtstart: new Date(DATE_2020),
        freq: Frequency.MONTHLY,
        interval: 1,
        tzid: 'UTC',
        bymonthday: [-2],
      });
      expect(rule.all(6)).toMatchInlineSnapshot(`
        Array [
          2020-01-30T00:00:00.000Z,
          2020-02-28T00:00:00.000Z,
          2020-03-30T00:00:00.000Z,
          2020-04-29T00:00:00.000Z,
          2020-05-30T00:00:00.000Z,
          2020-06-29T00:00:00.000Z,
        ]
      `);
    });

    it('combines with positive days', () => {
      const rule = new RRule({
        dtstart: new Date(DATE_2020),
        freq: Frequency.MONTHLY,
        interval: 1,
        tzid: 'UTC',
        bymonthday: [1, -1],
      });
      expect(rule.all(6)).toMatchInlineSnapshot(`
        Array [
          2020-01-01T00:00:00.000Z,
          2020-01-31T00:00:00.000Z,
          2020-02-01T00:00:00.000Z,
          2020-02-29T00:00:00.000Z,
          2020-03-01T00:00:00.000Z,
          2020-03-31T00:00:00.000Z,
        ]
      `);
    });

    it('honours interval when tracking the end of the month', () => {
      const rule = new RRule({
        dtstart: new Date(DATE_2020),
        freq: Frequency.MONTHLY,
        interval: 2,
        tzid: 'UTC',
        bymonthday: [-1],
      });
      expect(rule.all(6)).toMatchInlineSnapshot(`
        Array [
          2020-01-31T00:00:00.000Z,
          2020-03-31T00:00:00.000Z,
          2020-05-31T00:00:00.000Z,
          2020-07-31T00:00:00.000Z,
          2020-09-30T00:00:00.000Z,
          2020-11-30T00:00:00.000Z,
        ]
      `);
    });

    it('skips months that are too short to contain the requested day', () => {
      const rule = new RRule({
        dtstart: new Date(DATE_2020),
        freq: Frequency.MONTHLY,
        interval: 1,
        tzid: 'UTC',
        bymonthday: [-30],
      });
      expect(rule.all(6)).toMatchInlineSnapshot(`
        Array [
          2020-01-02T00:00:00.000Z,
          2020-03-02T00:00:00.000Z,
          2020-04-01T00:00:00.000Z,
          2020-05-02T00:00:00.000Z,
          2020-06-01T00:00:00.000Z,
          2020-07-02T00:00:00.000Z,
        ]
      `);
    });

    it('works with yearly frequency', () => {
      const rule = new RRule({
        dtstart: new Date(DATE_2020),
        freq: Frequency.YEARLY,
        interval: 1,
        tzid: 'UTC',
        bymonth: [2],
        bymonthday: [-1],
      });
      expect(rule.all(5)).toMatchInlineSnapshot(`
        Array [
          2020-02-29T00:00:00.000Z,
          2021-02-28T00:00:00.000Z,
          2022-02-28T00:00:00.000Z,
          2023-02-28T00:00:00.000Z,
          2024-02-29T00:00:00.000Z,
        ]
      `);
    });

    it('ends the series when no month can ever match', () => {
      const rule = new RRule({
        dtstart: new Date(DATE_2020),
        freq: Frequency.MONTHLY,
        interval: 1,
        tzid: 'UTC',
        bymonth: [2],
        bymonthday: [-30],
      });
      expect(rule.all(5)).toEqual([]);
    });
  });

  describe('bymonth, bymonthday', () => {
    it('works with yearly frequency', () => {
      const rule = new RRule({
        dtstart: new Date(DATE_2019_DECEMBER_19),
        freq: Frequency.YEARLY,
        interval: 1,
        tzid: 'UTC',
        bymonth: [2, 5],
        bymonthday: [8],
      });
      expect(rule.all(14)).toMatchInlineSnapshot(`
        Array [
          2020-02-08T00:00:00.000Z,
          2020-05-08T00:00:00.000Z,
          2021-02-08T00:00:00.000Z,
          2021-05-08T00:00:00.000Z,
          2022-02-08T00:00:00.000Z,
          2022-05-08T00:00:00.000Z,
          2023-02-08T00:00:00.000Z,
          2023-05-08T00:00:00.000Z,
          2024-02-08T00:00:00.000Z,
          2024-05-08T00:00:00.000Z,
          2025-02-08T00:00:00.000Z,
          2025-05-08T00:00:00.000Z,
          2026-02-08T00:00:00.000Z,
          2026-05-08T00:00:00.000Z,
        ]
      `);
    });
    it('ignores valid dates that do not exist e.g. February 30th', () => {
      const rule = new RRule({
        dtstart: new Date(DATE_2019_DECEMBER_19),
        freq: Frequency.YEARLY,
        interval: 1,
        tzid: 'UTC',
        bymonth: [2, 5],
        bymonthday: [30],
      });
      expect(rule.all(14)).toMatchInlineSnapshot(`
        Array [
          2020-05-30T00:00:00.000Z,
          2021-05-30T00:00:00.000Z,
          2022-05-30T00:00:00.000Z,
          2023-05-30T00:00:00.000Z,
          2024-05-30T00:00:00.000Z,
          2025-05-30T00:00:00.000Z,
          2026-05-30T00:00:00.000Z,
          2027-05-30T00:00:00.000Z,
          2028-05-30T00:00:00.000Z,
          2029-05-30T00:00:00.000Z,
          2030-05-30T00:00:00.000Z,
          2031-05-30T00:00:00.000Z,
          2032-05-30T00:00:00.000Z,
          2033-05-30T00:00:00.000Z,
        ]
      `);
    });
  });

  describe('byhour, byminute, bysecond', () => {
    it('works with daily frequency', () => {
      const rule = new RRule({
        dtstart: new Date(DATE_2019_DECEMBER_19),
        freq: Frequency.DAILY,
        interval: 1,
        tzid: 'UTC',
        byhour: [14],
        byminute: [30],
        bysecond: [0, 15],
      });
      expect(rule.all(14)).toMatchInlineSnapshot(`
        Array [
          2019-12-19T14:30:00.000Z,
          2019-12-19T14:30:15.000Z,
          2019-12-20T14:30:00.000Z,
          2019-12-20T14:30:15.000Z,
          2019-12-21T14:30:00.000Z,
          2019-12-21T14:30:15.000Z,
          2019-12-22T14:30:00.000Z,
          2019-12-22T14:30:15.000Z,
          2019-12-23T14:30:00.000Z,
          2019-12-23T14:30:15.000Z,
          2019-12-24T14:30:00.000Z,
          2019-12-24T14:30:15.000Z,
          2019-12-25T14:30:00.000Z,
          2019-12-25T14:30:15.000Z,
        ]
      `);
    });
    it('works with hourly frequency', () => {
      const rule = new RRule({
        dtstart: new Date(DATE_2019_DECEMBER_19),
        freq: Frequency.HOURLY,
        interval: 1,
        tzid: 'UTC',
        byminute: [15, 30],
        bysecond: [30, 0],
      });
      expect(rule.all(14)).toMatchInlineSnapshot(`
        Array [
          2019-12-19T00:15:30.000Z,
          2019-12-19T00:15:00.000Z,
          2019-12-19T00:30:30.000Z,
          2019-12-19T00:30:00.000Z,
          2019-12-19T01:15:30.000Z,
          2019-12-19T01:15:00.000Z,
          2019-12-19T01:30:30.000Z,
          2019-12-19T01:30:00.000Z,
          2019-12-19T02:15:30.000Z,
          2019-12-19T02:15:00.000Z,
          2019-12-19T02:30:30.000Z,
          2019-12-19T02:30:00.000Z,
          2019-12-19T03:15:30.000Z,
          2019-12-19T03:15:00.000Z,
        ]
      `);
    });
    it('works with minutely frequency', () => {
      const rule = new RRule({
        dtstart: new Date(DATE_2019_DECEMBER_19),
        freq: Frequency.HOURLY,
        interval: 1,
        tzid: 'UTC',
        bysecond: [10, 30, 58],
      });
      expect(rule.all(14)).toMatchInlineSnapshot(`
        Array [
          2019-12-19T00:00:10.000Z,
          2019-12-19T00:00:30.000Z,
          2019-12-19T00:00:58.000Z,
          2019-12-19T00:01:10.000Z,
          2019-12-19T00:01:30.000Z,
          2019-12-19T00:01:58.000Z,
          2019-12-19T00:02:10.000Z,
          2019-12-19T00:02:30.000Z,
          2019-12-19T00:02:58.000Z,
          2019-12-19T00:03:10.000Z,
          2019-12-19T00:03:30.000Z,
          2019-12-19T00:03:58.000Z,
          2019-12-19T00:04:10.000Z,
          2019-12-19T00:04:30.000Z,
        ]
      `);
    });
  });

  describe('byyearday', () => {
    it('respects leap years', () => {
      const rule3 = new RRule({
        dtstart: new Date(DATE_2020),
        freq: Frequency.YEARLY,
        byyearday: [92],
        interval: 1,
        tzid: 'UTC',
      });

      expect(rule3.all(10)).toMatchInlineSnapshot(`
        Array [
          2020-04-01T00:00:00.000Z,
          2021-04-02T00:00:00.000Z,
          2022-04-02T00:00:00.000Z,
          2023-04-02T00:00:00.000Z,
          2024-04-01T00:00:00.000Z,
          2025-04-02T00:00:00.000Z,
          2026-04-02T00:00:00.000Z,
          2027-04-02T00:00:00.000Z,
          2028-04-01T00:00:00.000Z,
          2029-04-02T00:00:00.000Z,
        ]
      `);
    });
    it('ignores invalid byyearday values', () => {
      const rule = new RRule({
        dtstart: new Date(DATE_2020),
        freq: Frequency.YEARLY,
        byyearday: [0, -1],
        interval: 1,
        tzid: 'UTC',
      });

      expect(rule.all(10)).toMatchInlineSnapshot(`
        Array [
          2020-01-01T00:00:00.000Z,
          2021-01-01T00:00:00.000Z,
          2022-01-01T00:00:00.000Z,
          2023-01-01T00:00:00.000Z,
          2024-01-01T00:00:00.000Z,
          2025-01-01T00:00:00.000Z,
          2026-01-01T00:00:00.000Z,
          2027-01-01T00:00:00.000Z,
          2028-01-01T00:00:00.000Z,
          2029-01-01T00:00:00.000Z,
        ]
      `);
    });
  });

  describe('error handling', () => {
    it('throws an error on an invalid dtstart', () => {
      const testFn = () =>
        new RRule({
          dtstart: new Date(INVALID_DATE),
          freq: Frequency.HOURLY,
          interval: 1,
          tzid: 'UTC',
        });
      expect(testFn).toThrowErrorMatchingInlineSnapshot(
        `"Cannot create RRule: dtstart is an invalid date"`
      );
    });
    it('throws an error on an invalid until', () => {
      const testFn = () =>
        new RRule({
          dtstart: new Date(DATE_2020),
          until: new Date(INVALID_DATE),
          freq: Frequency.HOURLY,
          interval: 1,
          tzid: 'UTC',
        });
      expect(testFn).toThrowErrorMatchingInlineSnapshot(
        `"Cannot create RRule: until is an invalid date"`
      );
    });

    it('throws an error on an interval of 0', () => {
      const testFn = () =>
        new RRule({
          dtstart: new Date(DATE_2020),
          freq: Frequency.HOURLY,
          interval: 0,
          tzid: 'UTC',
        });
      expect(testFn).toThrowErrorMatchingInlineSnapshot(
        `"Cannot create RRule: interval must be greater than 0"`
      );
    });

    it('throws an error when exceeding the iteration limit', () => {
      const testFn = () => {
        const rule = new RRule({
          dtstart: new Date(DATE_2020),
          freq: Frequency.YEARLY,
          byyearday: [1],
          interval: 1,
          tzid: 'UTC',
        });
        rule.all(100001);
      };

      expect(testFn).toThrowErrorMatchingInlineSnapshot(`"RRule iteration limit exceeded"`);
    });
  });
});
