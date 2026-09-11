/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { Frequency } from '@kbn/rrule';
import { invert, mapValues } from 'lodash';
import moment from 'moment';
import {
  RECURRING_SCHEDULE_FORM_FREQUENCY_HOURLY,
  RECURRING_SCHEDULE_FORM_FREQUENCY_DAILY,
  RECURRING_SCHEDULE_FORM_FREQUENCY_WEEKLY,
  RECURRING_SCHEDULE_FORM_FREQUENCY_MONTHLY,
  RECURRING_SCHEDULE_FORM_FREQUENCY_YEARLY,
  RECURRING_SCHEDULE_FORM_FREQUENCY_CUSTOM,
  RECURRING_SCHEDULE_FORM_ENDS_NEVER,
  RECURRING_SCHEDULE_FORM_ENDS_ON_DATE,
  RECURRING_SCHEDULE_FORM_ENDS_AFTER_X,
  RECURRING_SCHEDULE_FORM_CUSTOM_FREQUENCY_HOURLY,
  RECURRING_SCHEDULE_FORM_CUSTOM_FREQUENCY_DAILY,
  RECURRING_SCHEDULE_FORM_CUSTOM_FREQUENCY_WEEKLY,
  RECURRING_SCHEDULE_FORM_CUSTOM_FREQUENCY_MONTHLY,
  RECURRING_SCHEDULE_FORM_CUSTOM_FREQUENCY_YEARLY,
} from './translations';

export const ISO_WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;

// RFC 5545 BYMONTHDAY counts backward from the end of the month for negative values
export const LAST_DAY_OF_MONTH = -1;

export const DEFAULT_FREQUENCY_OPTIONS = [
  {
    text: RECURRING_SCHEDULE_FORM_FREQUENCY_HOURLY,
    value: Frequency.HOURLY,
  },
  {
    text: RECURRING_SCHEDULE_FORM_FREQUENCY_DAILY,
    value: Frequency.DAILY,
  },
  {
    text: RECURRING_SCHEDULE_FORM_FREQUENCY_WEEKLY,
    value: Frequency.WEEKLY,
  },
  {
    text: RECURRING_SCHEDULE_FORM_FREQUENCY_MONTHLY,
    value: Frequency.MONTHLY,
  },
  {
    text: RECURRING_SCHEDULE_FORM_FREQUENCY_YEARLY,
    value: Frequency.YEARLY,
  },
  {
    text: RECURRING_SCHEDULE_FORM_FREQUENCY_CUSTOM,
    value: 'CUSTOM',
  },
];

export const DEFAULT_PRESETS = {
  [Frequency.HOURLY]: {
    interval: 1,
  },
  [Frequency.DAILY]: {
    interval: 1,
  },
  [Frequency.WEEKLY]: {
    interval: 1,
  },
  [Frequency.MONTHLY]: {
    interval: 1,
  },
  [Frequency.YEARLY]: {
    interval: 1,
  },
};

export enum RecurrenceEnd {
  NEVER = 'never',
  ON_DATE = 'ondate',
  AFTER_X = 'afterx',
}

export const RECURRENCE_END_NEVER = {
  id: 'never',
  label: RECURRING_SCHEDULE_FORM_ENDS_NEVER,
  'data-test-subj': 'recurrenceEndOptionNever',
};

export const RECURRENCE_END_OPTIONS = [
  {
    id: 'ondate',
    label: RECURRING_SCHEDULE_FORM_ENDS_ON_DATE,
    'data-test-subj': 'recurrenceEndOptionOnDate',
  },
  {
    id: 'afterx',
    label: RECURRING_SCHEDULE_FORM_ENDS_AFTER_X,
    'data-test-subj': 'recurrenceEndOptionAfterX',
  },
];

export const ISO_WEEKDAYS_TO_RRULE: Record<number, string> = {
  1: 'MO',
  2: 'TU',
  3: 'WE',
  4: 'TH',
  5: 'FR',
  6: 'SA',
  7: 'SU',
};

export const RRULE_TO_ISO_WEEKDAYS: Record<string, number> = {
  MO: 1,
  TU: 2,
  WE: 3,
  TH: 4,
  FR: 5,
  SA: 6,
  SU: 7,
};

export const WEEKDAY_OPTIONS = ISO_WEEKDAYS.map((n) => ({
  id: String(n),
  label: moment().isoWeekday(n).format('ddd'),
  'data-test-subj': `isoWeekdays${n}`,
}));

export const RRULE_WEEKDAYS_TO_ISO_WEEKDAYS = mapValues(invert(ISO_WEEKDAYS_TO_RRULE), (v) =>
  Number(v)
);

export const RECURRING_SCHEDULE_FORM_CUSTOM_FREQUENCY = (interval = 1) => [
  {
    text: RECURRING_SCHEDULE_FORM_CUSTOM_FREQUENCY_HOURLY(interval),
    value: Frequency.HOURLY,
    'data-test-subj': 'customFrequencyHourly',
  },
  {
    text: RECURRING_SCHEDULE_FORM_CUSTOM_FREQUENCY_DAILY(interval),
    value: Frequency.DAILY,
    'data-test-subj': 'customFrequencyDaily',
  },
  {
    text: RECURRING_SCHEDULE_FORM_CUSTOM_FREQUENCY_WEEKLY(interval),
    value: Frequency.WEEKLY,
    'data-test-subj': 'customFrequencyWeekly',
  },
  {
    text: RECURRING_SCHEDULE_FORM_CUSTOM_FREQUENCY_MONTHLY(interval),
    value: Frequency.MONTHLY,
    'data-test-subj': 'customFrequencyMonthly',
  },
  {
    text: RECURRING_SCHEDULE_FORM_CUSTOM_FREQUENCY_YEARLY(interval),
    value: Frequency.YEARLY,
    'data-test-subj': 'customFrequencyYearly',
  },
];
