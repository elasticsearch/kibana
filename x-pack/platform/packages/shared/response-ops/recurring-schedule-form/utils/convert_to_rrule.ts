/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import moment from 'moment';
import { Frequency } from '@kbn/rrule';
import { ISO_WEEKDAYS_TO_RRULE, LAST_DAY_OF_MONTH } from '../constants';
import { getPresets } from './get_presets';
import { parseSchedule } from './parse_schedule';
import { getNthByWeekday } from './get_nth_by_weekday';
import type { RRuleParams, RecurringSchedule } from '../types';

export const convertToRRule = ({
  startDate,
  timezone,
  recurringSchedule,
  includeTime = false,
}: {
  startDate: string;
  timezone: string;
  recurringSchedule?: RecurringSchedule;
  includeTime?: boolean;
}): RRuleParams => {
  const startDateMoment = moment(startDate);
  const presets = getPresets(startDateMoment);

  const parsedSchedule = parseSchedule(recurringSchedule);

  const rRule: RRuleParams = {
    dtstart: startDateMoment.toISOString(),
    tzid: timezone,
  };

  if (Boolean(includeTime)) {
    // Do not include the byhour field if the frequency is hourly as we do not support the byhourly field for this frequency
    if (
      parsedSchedule?.frequency !== Frequency.HOURLY &&
      parsedSchedule?.customFrequency !== Frequency.HOURLY
    ) {
      rRule.byhour = [startDateMoment.get('hour')];
    }
    rRule.byminute = [startDateMoment.get('minute')];
  }

  if (!parsedSchedule) {
    return {
      ...rRule,
      // default to yearly and a count of 1
      // if the maintenance window is not recurring
      freq: Frequency.YEARLY,
      count: 1,
    };
  }

  let form = parsedSchedule;
  if (parsedSchedule.frequency !== 'CUSTOM') {
    form = { ...parsedSchedule, ...presets[parsedSchedule.frequency] };
  }

  const frequency = form.customFrequency ?? (form.frequency as Frequency);
  rRule.freq = frequency;

  rRule.interval = form.interval;

  if (form.until) {
    rRule.until = form.until;
  }

  if (form.count) {
    rRule.count = form.count;
  }

  if (form.byweekday) {
    const byweekday = form.byweekday;
    rRule.byweekday = Object.keys(byweekday)
      .filter((k) => byweekday[k] === true)
      .map((n) => ISO_WEEKDAYS_TO_RRULE[Number(n)]);
  }

  if (form.bymonth) {
    if (form.bymonth === 'day') {
      rRule.bymonthday = [startDateMoment.date()];
    } else if (form.bymonth === 'weekday') {
      rRule.byweekday = [getNthByWeekday(startDateMoment)];
    } else if (form.bymonth === 'lastday') {
      rRule.bymonthday = [LAST_DAY_OF_MONTH];
    }
  }

  if (frequency === Frequency.YEARLY) {
    // rRule expects 1 based indexing for months
    rRule.bymonth = [startDateMoment.month() + 1];
    rRule.bymonthday = [startDateMoment.date()];
  }

  return rRule;
};
