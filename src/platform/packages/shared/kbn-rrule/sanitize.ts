/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import moment from 'moment-timezone';
import type { Options } from './types';

export function sanitizeOptions(opts: Options) {
  const options = { ...opts };

  // Guard against invalid options that can't be omitted
  if (!options.dtstart) {
    throw new Error('Cannot create RRule: dtstart is required');
  }

  if (!options.tzid) {
    throw new Error('Cannot create RRule: tzid is required');
  }

  if (isNaN(options.dtstart.getTime())) {
    throw new Error('Cannot create RRule: dtstart is an invalid date');
  }

  if (moment.tz.zone(options.tzid) == null) {
    throw new Error('Cannot create RRule: tzid is invalid');
  }

  if (options.until && isNaN(options.until.getTime())) {
    throw new Error('Cannot create RRule: until is an invalid date');
  }

  if (options.interval != null) {
    if (typeof options.interval !== 'number') {
      throw new Error('Cannot create RRule: interval must be a number');
    }

    if (options.interval < 1) {
      throw new Error('Cannot create RRule: interval must be greater than 0');
    }
  }

  if (options.bymonth) {
    // Only months between 1 and 12 are valid
    options.bymonth = options.bymonth.filter(
      (month) => typeof month === 'number' && month >= 1 && month <= 12
    );
    if (!options.bymonth.length) {
      delete options.bymonth;
    }
  }

  if (options.bymonthday) {
    // 1 to 31 counts forward from the start of the month, -31 to -1 backward from the end
    options.bymonthday = options.bymonthday.filter(
      (day) => typeof day === 'number' && day !== 0 && day >= -31 && day <= 31
    );
    if (!options.bymonthday.length) {
      delete options.bymonthday;
    }
  }

  if (options.byweekday) {
    // Only weekdays between 1 and 7 are valid
    options.byweekday = options.byweekday.filter(
      (weekday) => typeof weekday === 'number' && weekday >= 1 && weekday <= 7
    );
    if (!options.byweekday.length) {
      delete options.byweekday;
    }
  }

  if (options.byyearday) {
    // Only days between 1 and 366 are valid
    options.byyearday = options.byyearday.filter((day) => day >= 1 && day <= 366);
    if (!options.byyearday.length) {
      delete options.byyearday;
    }
  }

  return options;
}
