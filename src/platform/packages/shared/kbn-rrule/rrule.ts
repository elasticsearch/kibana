/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import moment, { type Moment, type unitOfTime } from 'moment-timezone';

import type { ConstructorOptions } from './types';
import { Frequency, Weekday, type WeekdayStr, type Options, type IterOptions } from './types';
import { sanitizeOptions } from './sanitize';
import { validateOptions } from './validate';

const ISO_WEEKDAYS = [
  Weekday.MO,
  Weekday.TU,
  Weekday.WE,
  Weekday.TH,
  Weekday.FR,
  Weekday.SA,
  Weekday.SU,
];

type AllResult = Date[] & {
  hasMore?: boolean;
};

const ALL_LIMIT = 10000;
const TIMEOUT_LIMIT = 100000;
// Enough to step over the longest run of skippable periods a month-length or bymonth gap can create
const MAX_CONSECUTIVE_EMPTY_PERIODS = 12;

export class RRule {
  private options: Options;

  constructor(options: ConstructorOptions) {
    this.options = sanitizeOptions(options as Options);
    if (typeof options.wkst === 'string') {
      this.options.wkst = Weekday[options.wkst];
      if (!this.options.wkst) delete this.options.wkst;
    }
    const weekdayParseResult = parseByWeekdayPos(options.byweekday);
    if (weekdayParseResult) {
      this.options.byweekday = weekdayParseResult[0];
      this.options.bysetpos = weekdayParseResult[1];
    }
  }

  private *dateset(start?: Date, end?: Date): Generator<Date, null> {
    const isAfterDtStart = (current: Date) => current.getTime() >= this.options.dtstart.getTime();
    const isInBounds = (current: Date) => {
      const afterStart = !start || current.getTime() >= start.getTime();
      const beforeEnd = !end || current.getTime() <= end.getTime();

      return afterStart && beforeEnd;
    };

    const { dtstart, tzid, count, until } = this.options;
    let isFirstIteration = true;
    let yieldedRecurrenceCount = 0;
    let current: Date = moment(dtstart ?? new Date())
      .tz(tzid)
      .toDate();

    const nextRecurrences: Moment[] = [];
    let iters = 0;
    let consecutiveEmptyPeriods = 0;

    while (!count || (count && yieldedRecurrenceCount < count)) {
      iters++;
      if (iters > TIMEOUT_LIMIT) {
        throw new Error('RRule iteration limit exceeded');
      }
      const next = nextRecurrences.shift()?.toDate();
      if (next) {
        current = next;

        // return if current date has exceeded until
        if (until && current.getTime() >= until.getTime()) {
          return null;
        }

        if (!isAfterDtStart(current)) continue;

        yieldedRecurrenceCount++;

        if (isInBounds(current)) {
          yield current;
        } else if (start && current.getTime() > start.getTime()) {
          return null;
        }
      } else {
        const refDT = moment(current).tz(tzid);
        // The first iteration examines the dtstart period itself, so no interval is applied.
        const appliedInterval = isFirstIteration ? 0 : this.options.interval ?? 1;
        getNextRecurrences({
          refDT,
          ...this.options,
          interval: appliedInterval,
          wkst: this.options.wkst ? (this.options.wkst as Weekday) : Weekday.MO,
        }).forEach((r) => nextRecurrences.push(r));
        isFirstIteration = false;

        if (nextRecurrences.length === 0) {
          // A period can legitimately contain no recurrence, e.g. bymonthday 31 in February. Step
          // over it instead of ending the series, but give up once too many are empty in a row so
          // that rules which can never match (e.g. bymonth 2 with bymonthday 30) still terminate.
          if (++consecutiveEmptyPeriods > MAX_CONSECUTIVE_EMPTY_PERIODS) {
            return null;
          }
          const freq = getDerivedFrequency({
            freq: this.options.freq ?? Frequency.YEARLY,
            byweekday: this.options.byweekday,
            bysetpos: this.options.bysetpos,
          });
          // Step by the interval that was actually applied, otherwise an empty dtstart period
          // would also skip the period right after it.
          current = moment(refDT).add(appliedInterval, FREQUENCY_UNITS[freq]).toDate();
        } else {
          consecutiveEmptyPeriods = 0;
        }
      }
    }

    return null;
  }

  between(start: Date, end: Date) {
    const dates = this.dateset(start, end);
    return [...dates];
  }

  before(dt: Date) {
    const dates = [...this.dateset(this.options.dtstart, dt)];
    return dates[dates.length - 1];
  }

  after(dt: Date) {
    const dates = this.dateset(dt);
    return dates.next().value;
  }

  all(limit: number = ALL_LIMIT): AllResult {
    const dateGenerator = this.dateset();

    const dates: AllResult = [];
    let next = dateGenerator.next();

    for (let i = 0; i < limit; i++) {
      if (!next.done) dates.push(next.value);
      else break;
      next = dateGenerator.next();
    }
    if (next.done) return dates;
    else {
      dates.hasMore = true;
      return dates;
    }
  }

  static isValid(options: ConstructorOptions): boolean {
    try {
      validateOptions(options);

      return true;
    } catch (e) {
      return false;
    }
  }
}

const parseByWeekdayPos = function (byweekday: ConstructorOptions['byweekday']) {
  if (byweekday?.some((d) => typeof d === 'string')) {
    const pos: number[] = [];
    const newByweekday = byweekday.map((d) => {
      if (typeof d !== 'string') return d;
      if (Object.keys(Weekday).includes(d)) return Weekday[d as WeekdayStr];
      const [sign, number, ...rest] = d.split('');
      if (sign === '-') pos.push(-Number(number));
      else pos.push(Number(number));
      return Weekday[rest.join('') as WeekdayStr];
    });
    return [newByweekday, pos];
  } else return null;
};

/**
 * If the frequency is DAILY but there's a byweekday, or if the frequency is MONTHLY with a byweekday
 * with no corresponding bysetpos, the WEEKLY code path determines recurrences.
 */
const getDerivedFrequency = function ({
  freq,
  byweekday,
  bysetpos,
}: Pick<IterOptions, 'byweekday' | 'bysetpos'> & { freq: Frequency }) {
  return byweekday &&
    (freq === Frequency.DAILY || (freq === Frequency.MONTHLY && !bysetpos?.length))
    ? Frequency.WEEKLY
    : freq;
};

const FREQUENCY_UNITS: Record<Frequency, unitOfTime.DurationConstructor> = {
  [Frequency.YEARLY]: 'y',
  [Frequency.MONTHLY]: 'M',
  [Frequency.WEEKLY]: 'w',
  [Frequency.DAILY]: 'd',
  [Frequency.HOURLY]: 'h',
  [Frequency.MINUTELY]: 'm',
  [Frequency.SECONDLY]: 's',
};

export const getNextRecurrences = function ({
  refDT,
  wkst = Weekday.MO,
  byyearday,
  bymonth,
  bymonthday,
  byweekday,
  byhour,
  byminute,
  bysecond,
  bysetpos,
  freq = Frequency.YEARLY,
  interval = 1,
}: IterOptions & {
  freq?: Frequency;
  interval?: number;
}) {
  const opts = {
    wkst,
    byyearday,
    bymonth,
    bymonthday,
    byweekday,
    byhour,
    byminute,
    bysecond,
    bysetpos,
  };

  const derivedFreq = getDerivedFrequency({ freq, byweekday, bysetpos });

  switch (derivedFreq) {
    case Frequency.YEARLY: {
      const nextRef = moment(refDT).add(interval, 'y');
      return getYearOfRecurrences({
        refDT: nextRef,
        ...opts,
      });
    }
    case Frequency.MONTHLY: {
      const nextRef = moment(refDT).add(interval, 'M');
      return getMonthOfRecurrences({
        refDT: nextRef,
        ...opts,
      });
    }
    case Frequency.WEEKLY: {
      const nextRef = moment(refDT).add(interval, 'w');
      return getWeekOfRecurrences({
        refDT: nextRef,
        ...opts,
      });
    }
    case Frequency.DAILY: {
      const nextRef = moment(refDT).add(interval, 'd');
      return getDayOfRecurrences({
        refDT: nextRef,
        ...opts,
      });
    }
    case Frequency.HOURLY: {
      const nextRef = moment(refDT).add(interval, 'h');
      return getHourOfRecurrences({
        refDT: nextRef,
        ...opts,
      });
    }
    case Frequency.MINUTELY: {
      const nextRef = moment(refDT).add(interval, 'm');
      return getMinuteOfRecurrences({
        refDT: nextRef,
        ...opts,
      });
    }
    case Frequency.SECONDLY: {
      const nextRef = moment(refDT).add(interval, 's');
      return getMinuteOfRecurrences({
        refDT: nextRef,
        ...opts,
      });
    }
  }
};

const sortByweekday = function ({
  wkst,
  byweekday,
}: {
  wkst?: Weekday | null;
  byweekday: Weekday[];
}) {
  const weekStart = wkst ?? Weekday.MO;
  const weekdays = ISO_WEEKDAYS.slice(weekStart - 1).concat(ISO_WEEKDAYS.slice(0, weekStart - 1));
  return [...byweekday].sort((a, b) => weekdays.indexOf(a) - weekdays.indexOf(b));
};

const getYearOfRecurrences = function ({
  refDT,
  wkst,
  byyearday,
  bymonth,
  bymonthday,
  byweekday,
  byhour,
  byminute,
  bysecond,
  bysetpos,
}: IterOptions) {
  const derivedByweekday = byweekday ?? ISO_WEEKDAYS;

  if (bymonth) {
    return bymonth.flatMap((month) => {
      const currentMonth = moment(refDT).month(month - 1);
      return getMonthOfRecurrences({
        refDT: currentMonth,
        wkst,
        bymonth,
        bymonthday,
        byweekday,
        byhour,
        byminute,
        bysecond,
        bysetpos,
      });
    });
  }

  const derivedByyearday = byyearday ?? [refDT.dayOfYear()];

  return derivedByyearday.flatMap((dayOfYear) => {
    const currentDate = moment(refDT).dayOfYear(dayOfYear);
    if (currentDate.year() !== refDT.year()) return [];
    if (!derivedByweekday.includes(currentDate.isoWeekday())) return [];
    return getDayOfRecurrences({ refDT: currentDate, byhour, byminute, bysecond });
  });
};

const getMonthOfRecurrences = function ({
  refDT,
  wkst,
  bymonthday,
  bymonth,
  byweekday,
  byhour,
  byminute,
  bysecond,
  bysetpos,
}: IterOptions) {
  const derivedByweekday = byweekday ?? ISO_WEEKDAYS;
  const currentMonth = refDT.month();
  if (bymonth && !bymonth.includes(currentMonth + 1)) return [];

  let derivedBymonthday = bymonthday ?? [refDT.date()];
  if (bysetpos) {
    const firstOfMonth = moment(refDT).month(currentMonth).date(1);
    const dowLookup: Record<Weekday, number[]> = {
      1: [],
      2: [],
      3: [],
      4: [],
      5: [],
      6: [],
      7: [],
    };
    const trackedDate = firstOfMonth;
    while (trackedDate.month() === currentMonth) {
      const currentDow = trackedDate.isoWeekday() as Weekday;
      dowLookup[currentDow].push(trackedDate.date());
      trackedDate.add(1, 'd');
    }
    const sortedByweekday = sortByweekday({ wkst, byweekday: derivedByweekday });
    const bymonthdayFromPos = bysetpos.map((pos, i) => {
      const correspondingWeekday = sortedByweekday[i];
      const lookup = dowLookup[correspondingWeekday];
      if (pos > 0) return [lookup[pos - 1], pos];
      return [lookup.slice(pos)[0], pos];
    });

    const posPositions = [
      // Start with positive numbers in ascending order
      ...bymonthdayFromPos
        .filter(([, p]) => p > 0)
        .sort(([, a], [, b]) => a - b)
        .map(([date]) => date),
    ];
    const negPositions = [
      // then negative numbers in descending order]
      ...bymonthdayFromPos
        .filter(([, p]) => p < 0)
        .sort(([, a], [, b]) => a - b)
        .map(([date]) => date),
    ];
    derivedBymonthday = [...posPositions, ...negPositions];
  }

  const daysInMonth = refDT.daysInMonth();

  return derivedBymonthday.flatMap((date) => {
    const dayOfMonth = resolveMonthday(date, daysInMonth);
    if (dayOfMonth === null) return [];
    const currentDate = moment(refDT).date(dayOfMonth);
    if (bymonth && !bymonth.includes(currentDate.month() + 1)) return [];
    if (!derivedByweekday.includes(currentDate.isoWeekday())) return [];
    return getDayOfRecurrences({ refDT: currentDate, byhour, byminute, bysecond });
  });
};

/**
 * Resolves an RFC 5545 BYMONTHDAY value to a day of the month, returning null when the month is
 * too short to contain it (e.g. 31 or -30 in February).
 */
const resolveMonthday = function (monthday: number, daysInMonth: number): number | null {
  const dayOfMonth = monthday < 0 ? daysInMonth + monthday + 1 : monthday;
  if (!Number.isInteger(dayOfMonth) || dayOfMonth < 1 || dayOfMonth > daysInMonth) return null;
  return dayOfMonth;
};

const getWeekOfRecurrences = function ({
  refDT,
  wkst = Weekday.MO,
  byweekday,
  byhour,
  byminute,
  bysecond,
}: IterOptions) {
  const derivedByweekday = byweekday ? sortByweekday({ wkst, byweekday }) : [refDT.isoWeekday()];

  return derivedByweekday.flatMap((day) => {
    const currentDay = moment(refDT).isoWeekday(day);
    return getDayOfRecurrences({ refDT: currentDay, byhour, byminute, bysecond });
  });
};

const getDayOfRecurrences = function ({ refDT, byhour, byminute, bysecond }: IterOptions) {
  const derivedByhour =
    byhour ?? (byminute || bysecond ? Array.from(Array(24), (_, i) => i) : [refDT.hour()]);

  return derivedByhour.flatMap((h) => {
    const currentHour = moment(refDT).hour(h);
    return getHourOfRecurrences({ refDT: currentHour, byminute, bysecond });
  });
};

const getHourOfRecurrences = function ({ refDT, byminute, bysecond }: IterOptions) {
  const derivedByminute =
    byminute ?? (bysecond ? Array.from(Array(60), (_, i) => i) : [refDT.minute()]);

  return derivedByminute.flatMap((m) => {
    const currentMinute = moment(refDT).minute(m);
    return getMinuteOfRecurrences({ refDT: currentMinute, bysecond });
  });
};

const getMinuteOfRecurrences = function ({ refDT, bysecond }: IterOptions) {
  const derivedBysecond = bysecond ?? [refDT.second()];

  return derivedBysecond.map((s) => {
    return moment(refDT).second(s);
  });
};
