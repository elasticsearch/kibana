/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import moment from 'moment-timezone';
import type { ConstructorOptions } from './types';

export function validateOptions(opts: ConstructorOptions) {
  const byWeekDayRegex = new RegExp('^(((\\+|-)[1-4])?(MO|TU|WE|TH|FR|SA|SU))$');
  const options = { ...opts };

  if (options.dtstart == null) {
    throw new Error('dtstart is required');
  }

  if (options.tzid == null) {
    throw new Error('tzid is required');
  }

  if (isNaN(options.dtstart.getTime())) {
    throw new Error('dtstart is an invalid date');
  }

  if (moment.tz.zone(options.tzid) == null) {
    throw new Error('tzid is an invalid timezone');
  }

  if (options.interval != null && (!Number.isInteger(options.interval) || options.interval < 1)) {
    throw new Error('interval must be an integer greater than 0');
  }

  if (options.until != null && isNaN(options.until.getTime())) {
    throw new Error('until is an invalid date');
  }

  if (options.count != null && (!Number.isInteger(options.count) || options.count < 1)) {
    throw new Error('count must be an integer greater than 0');
  }

  if (
    options.bymonthday != null &&
    (options.bymonthday.length < 1 ||
      options.bymonthday.some(
        (monthDay) =>
          !Number.isInteger(monthDay) || monthDay === 0 || monthDay < -31 || monthDay > 31
      ))
  ) {
    throw new Error(
      'bymonthday must be an array of numbers between 1 and 31, or between -31 and -1'
    );
  }

  if (
    options.bymonth != null &&
    (options.bymonth.length < 1 ||
      options.bymonth.some((month) => !Number.isInteger(month) || month < 1 || month > 12))
  ) {
    throw new Error('bymonth must be an array of numbers between 1 and 12');
  }

  if (options.byweekday != null) {
    if (options.byweekday.length < 1) {
      throw new Error('byweekday must be an array of at least one string or number');
    }

    const byWeekDayNumbers = options.byweekday?.filter(
      (weekDay) => typeof weekDay === 'number'
    ) as number[];

    const byWeekDayStrings = options.byweekday?.filter(
      (weekDay) => typeof weekDay === 'string'
    ) as string[];

    if (byWeekDayNumbers.length > 0 && byWeekDayStrings.length > 0) {
      throw new Error('byweekday values can be either numbers or strings, not both');
    }

    if (
      byWeekDayNumbers.some(
        (weekDayNum) => !Number.isInteger(weekDayNum) || weekDayNum < 1 || weekDayNum > 7
      )
    ) {
      throw new Error('byweekday numbers must been between 1 and 7');
    }

    if (byWeekDayStrings.some((weekDayStr) => !byWeekDayRegex.test(weekDayStr))) {
      throw new Error('byweekday strings must be valid weekday strings');
    }
  }
}
