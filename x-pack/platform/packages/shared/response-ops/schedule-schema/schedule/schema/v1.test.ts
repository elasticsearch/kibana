/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { getScheduleRequestSchema, scheduleRequestSchema } from './v1';

const recurring = {
  every: '1d',
  onWeekDay: ['TU', 'TH'],
  onMonthDay: [1, 31],
  onMonth: [1, 3, 5, 12],
  end: '2021-05-20T00:00:00.000Z',
};

const defaultSchedule = {
  start: '2021-05-10T00:00:00.000Z',
  duration: '2h',
  timezone: 'Europe/London',
  recurring,
};

describe('scheduleRequestSchema', () => {
  const mockCurrentDate = new Date('2021-05-05T00:00:00.000Z');

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers().setSystemTime(mockCurrentDate);
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('validates correctly with all fields', () => {
    expect(scheduleRequestSchema.validate(defaultSchedule)).toMatchInlineSnapshot(`
      Object {
        "duration": "2h",
        "recurring": Object {
          "end": "2021-05-20T00:00:00.000Z",
          "every": "1d",
          "onMonth": Array [
            1,
            3,
            5,
            12,
          ],
          "onMonthDay": Array [
            1,
            31,
          ],
          "onWeekDay": Array [
            "TU",
            "TH",
          ],
        },
        "start": "2021-05-10T00:00:00.000Z",
        "timezone": "Europe/London",
      }
    `);
  });

  it('validates correctly without recurring fields', () => {
    expect(
      scheduleRequestSchema.validate({
        start: defaultSchedule.start,
        duration: defaultSchedule.duration,
      })
    ).toMatchInlineSnapshot(`
      Object {
        "duration": "2h",
        "start": "2021-05-10T00:00:00.000Z",
      }
    `);
  });

  it('validates correctly with few of recurring fields', () => {
    expect(
      scheduleRequestSchema.validate({
        ...defaultSchedule,
        recurring: { every: '1d', onWeekDay: ['TU'] },
      })
    ).toMatchInlineSnapshot(`
      Object {
        "duration": "2h",
        "recurring": Object {
          "every": "1d",
          "onWeekDay": Array [
            "TU",
          ],
        },
        "start": "2021-05-10T00:00:00.000Z",
        "timezone": "Europe/London",
      }
    `);
  });

  it(`throws an error when onWeekDay is empty`, async () => {
    expect(() =>
      scheduleRequestSchema.validate({
        ...defaultSchedule,
        recurring: { ...recurring, onWeekDay: [] },
      })
    ).toThrowErrorMatchingInlineSnapshot(
      `"[recurring.onWeekDay]: array size is [0], but cannot be smaller than [1]"`
    );
  });

  it(`throws an error when onMonthDay is empty`, async () => {
    expect(() =>
      scheduleRequestSchema.validate({
        ...defaultSchedule,
        recurring: { ...recurring, onMonthDay: [] },
      })
    ).toThrowErrorMatchingInlineSnapshot(
      `"[recurring.onMonthDay]: array size is [0], but cannot be smaller than [1]"`
    );
  });

  it(`throws an error when onMonthDay is less than 1`, async () => {
    expect(() =>
      scheduleRequestSchema.validate({
        ...defaultSchedule,
        recurring: { ...recurring, onMonthDay: [0] },
      })
    ).toThrowErrorMatchingInlineSnapshot(
      `"[recurring.onMonthDay.0]: Value must be equal to or greater than [1]."`
    );
  });

  it(`throws an error when onMonthDay is more than 31`, async () => {
    expect(() =>
      scheduleRequestSchema.validate({
        ...defaultSchedule,
        recurring: { ...recurring, onMonthDay: [32] },
      })
    ).toThrowErrorMatchingInlineSnapshot(
      `"[recurring.onMonthDay.0]: Value must be equal to or lower than [31]."`
    );
  });

  it(`throws an error when onMonthDay is negative`, async () => {
    expect(() =>
      scheduleRequestSchema.validate({
        ...defaultSchedule,
        recurring: { ...recurring, onMonthDay: [-1] },
      })
    ).toThrowErrorMatchingInlineSnapshot(
      `"[recurring.onMonthDay.0]: Value must be equal to or greater than [1]."`
    );
  });

  it(`throws an error when onMonthDay is not an integer`, async () => {
    expect(() =>
      scheduleRequestSchema.validate({
        ...defaultSchedule,
        recurring: { ...recurring, onMonthDay: [25.5] },
      })
    ).toThrowErrorMatchingInlineSnapshot(
      `"[recurring.onMonthDay.0]: schedule onMonthDay must be a positive integer."`
    );
  });

  it(`throws an error when onMonth is empty`, async () => {
    expect(() =>
      scheduleRequestSchema.validate({
        ...defaultSchedule,
        recurring: { ...recurring, onMonth: [] },
      })
    ).toThrowErrorMatchingInlineSnapshot(
      `"[recurring.onMonth]: array size is [0], but cannot be smaller than [1]"`
    );
  });

  it(`throws an error when onMonth is less than 1`, async () => {
    expect(() =>
      scheduleRequestSchema.validate({
        ...defaultSchedule,
        recurring: { ...recurring, onMonth: [0] },
      })
    ).toThrowErrorMatchingInlineSnapshot(
      `"[recurring.onMonth.0]: Value must be equal to or greater than [1]."`
    );
  });

  it(`throws an error when onMonth is more than 12`, async () => {
    expect(() =>
      scheduleRequestSchema.validate({
        ...defaultSchedule,
        recurring: { ...recurring, onMonth: [13] },
      })
    ).toThrowErrorMatchingInlineSnapshot(
      `"[recurring.onMonth.0]: Value must be equal to or lower than [12]."`
    );
  });

  it(`throws an error when onMonth is not an integer`, async () => {
    expect(() =>
      scheduleRequestSchema.validate({
        ...defaultSchedule,
        recurring: { ...recurring, onMonth: [3.2] },
      })
    ).toThrowErrorMatchingInlineSnapshot(
      `"[recurring.onMonth.0]: schedule onMonth must be a positive integer."`
    );
  });

  it(`throws an error when occurrences is less than 0`, async () => {
    expect(() =>
      scheduleRequestSchema.validate({
        ...defaultSchedule,
        recurring: { ...recurring, occurrences: -1 },
      })
    ).toThrowErrorMatchingInlineSnapshot(
      `"[recurring.occurrences]: Value must be equal to or greater than [1]."`
    );
  });

  it(`throws an error when occurrences is not an integer`, async () => {
    expect(() =>
      scheduleRequestSchema.validate({
        ...defaultSchedule,
        recurring: { ...recurring, occurrences: 1.5 },
      })
    ).toThrowErrorMatchingInlineSnapshot(
      `"[recurring.occurrences]: schedule occurrences must be a positive integer."`
    );
  });
});

describe('getScheduleRequestSchema with allowLastDayOfMonth', () => {
  const lastDayOfMonthSchema = getScheduleRequestSchema({ allowLastDayOfMonth: true });
  const mockCurrentDate = new Date('2021-05-05T00:00:00.000Z');

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers().setSystemTime(mockCurrentDate);
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  it('accepts -1 for the last day of the month', async () => {
    expect(
      lastDayOfMonthSchema.validate({
        ...defaultSchedule,
        recurring: { ...recurring, onMonthDay: [-1] },
      }).recurring?.onMonthDay
    ).toEqual([-1]);
  });

  it('throws an error when onMonthDay is zero', async () => {
    expect(() =>
      lastDayOfMonthSchema.validate({
        ...defaultSchedule,
        recurring: { ...recurring, onMonthDay: [0] },
      })
    ).toThrowErrorMatchingInlineSnapshot(
      `"[recurring.onMonthDay.0]: schedule onMonthDay must be an integer between 1 and 31, or -1 for the last day of the month."`
    );
  });

  it('throws an error for negative onMonthDay values other than -1', async () => {
    // The recurring schedule form cannot express -31 to -2, so the API does not accept them.
    expect(() =>
      lastDayOfMonthSchema.validate({
        ...defaultSchedule,
        recurring: { ...recurring, onMonthDay: [-30] },
      })
    ).toThrowErrorMatchingInlineSnapshot(
      `"[recurring.onMonthDay.0]: Value must be equal to or greater than [-1]."`
    );
  });

  it('throws an error when onMonthDay is not an integer', async () => {
    expect(() =>
      lastDayOfMonthSchema.validate({
        ...defaultSchedule,
        recurring: { ...recurring, onMonthDay: [25.5] },
      })
    ).toThrowErrorMatchingInlineSnapshot(
      `"[recurring.onMonthDay.0]: schedule onMonthDay must be an integer between 1 and 31, or -1 for the last day of the month."`
    );
  });
});
