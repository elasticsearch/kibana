/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Moment } from 'moment';
import moment from 'moment';
import { Frequency } from '@kbn/rrule';
import { ISO_WEEKDAYS_TO_RRULE, RRULE_WEEKDAYS_TO_ISO_WEEKDAYS } from '../constants';
import { monthDayDate } from './month_day_date';
import { getNthByWeekday } from './get_nth_by_weekday';
import {
  RECURRING_SCHEDULE_FORM_FREQUENCY_SUMMARY,
  RECURRING_SCHEDULE_FORM_WEEKLY_SUMMARY,
  RECURRING_SCHEDULE_FORM_WEEKDAY_SHORT,
  RECURRING_SCHEDULE_FORM_MONTHLY_BY_DAY_SUMMARY,
  RECURRING_SCHEDULE_FORM_MONTHLY_BY_LAST_DAY_SUMMARY,
  RECURRING_SCHEDULE_FORM_YEARLY_BY_MONTH_SUMMARY,
  RECURRING_SCHEDULE_FORM_UNTIL_DATE_SUMMARY,
  RECURRING_SCHEDULE_FORM_OCURRENCES_SUMMARY,
  RECURRING_SCHEDULE_FORM_RECURRING_SUMMARY,
  RECURRING_SCHEDULE_FORM_TIME_SUMMARY,
  RECURRING_SCHEDULE_FORM_HOURLY_SUMMARY,
} from '../translations';
import type { RecurrenceFrequency, RecurringSchedule } from '../types';

export const recurringSummary = ({
  startDate,
  recurringSchedule,
  presets,
  showTime = false,
}: {
  startDate?: Moment;
  recurringSchedule?: RecurringSchedule;
  presets: Record<RecurrenceFrequency, Partial<RecurringSchedule>>;
  showTime?: boolean;
}) => {
  if (!recurringSchedule) return '';

  let schedule = recurringSchedule;
  if (recurringSchedule.frequency !== 'CUSTOM') {
    schedule = { ...recurringSchedule, ...presets[recurringSchedule.frequency] };
  }

  const frequency = schedule.customFrequency ?? (schedule.frequency as RecurrenceFrequency);
  const interval = schedule.interval || 1;
  const frequencySummary = RECURRING_SCHEDULE_FORM_FREQUENCY_SUMMARY(interval)[frequency];

  // daily and weekly
  let weeklySummary = null;
  let dailyWeekdaySummary = null;
  let dailyWithWeekdays = false;
  const byweekday = schedule.byweekday;
  if (byweekday) {
    const weekdays = Object.keys(byweekday)
      .filter((k) => byweekday[k] === true)
      .map((n) => ISO_WEEKDAYS_TO_RRULE[Number(n)]);
    const formattedWeekdays = weekdays.map((weekday) => toWeekdayName(weekday)).join(', ');

    weeklySummary = RECURRING_SCHEDULE_FORM_WEEKLY_SUMMARY(formattedWeekdays);
    dailyWeekdaySummary = formattedWeekdays;

    dailyWithWeekdays = frequency === Frequency.DAILY;
  }

  // monthly
  let monthlySummary = null;
  const bymonth = schedule.bymonth;
  if (bymonth) {
    if (bymonth === 'weekday') {
      const nthWeekday = startDate ? getNthByWeekday(startDate) : schedule.bymonthweekday;
      if (nthWeekday) {
        const nth = nthWeekday.startsWith('-1') ? 0 : Number(nthWeekday[1]);
        monthlySummary = RECURRING_SCHEDULE_FORM_WEEKDAY_SHORT(toWeekdayName(nthWeekday))[nth];
        monthlySummary = monthlySummary[0].toLocaleLowerCase() + monthlySummary.slice(1);
      }
    } else if (bymonth === 'day') {
      const monthDay = startDate?.date() ?? schedule.bymonthday;
      if (monthDay) {
        monthlySummary = RECURRING_SCHEDULE_FORM_MONTHLY_BY_DAY_SUMMARY(monthDay);
      }
    } else if (bymonth === 'lastday') {
      monthlySummary = RECURRING_SCHEDULE_FORM_MONTHLY_BY_LAST_DAY_SUMMARY;
    }
  }

  // yearly
  const yearlyByMonthSummary = startDate
    ? RECURRING_SCHEDULE_FORM_YEARLY_BY_MONTH_SUMMARY(
        monthDayDate(moment().month(startDate.month()).date(startDate.date()))
      )
    : null;

  const onSummary = dailyWithWeekdays
    ? dailyWeekdaySummary
    : frequency === Frequency.WEEKLY
    ? weeklySummary
    : frequency === Frequency.MONTHLY
    ? monthlySummary
    : frequency === Frequency.YEARLY
    ? yearlyByMonthSummary
    : null;

  const untilSummary = schedule.until
    ? RECURRING_SCHEDULE_FORM_UNTIL_DATE_SUMMARY(moment(schedule.until).format('LL'))
    : schedule.count
    ? RECURRING_SCHEDULE_FORM_OCURRENCES_SUMMARY(schedule.count)
    : null;

  let time: string | null = null;
  if (showTime) {
    const date =
      startDate ??
      (schedule.byhour && schedule.byminute
        ? moment().hour(schedule.byhour).minute(schedule.byminute)
        : null);
    if (date) {
      if (frequency === Frequency.HOURLY) {
        time = RECURRING_SCHEDULE_FORM_HOURLY_SUMMARY(date.format('HH:mm'));
      } else {
        time = RECURRING_SCHEDULE_FORM_TIME_SUMMARY(date.format('HH:mm'));
      }
    }
  }

  const every = RECURRING_SCHEDULE_FORM_RECURRING_SUMMARY(
    !dailyWithWeekdays ? frequencySummary : null,
    onSummary,
    untilSummary,
    time
  ).trim();

  return every;
};

export const toWeekdayName = (weekday: string) =>
  moment().isoWeekday(RRULE_WEEKDAYS_TO_ISO_WEEKDAYS[weekday.slice(-2)]).format('dddd');
