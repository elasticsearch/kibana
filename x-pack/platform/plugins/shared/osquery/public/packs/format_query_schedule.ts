/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';
import type { WeekdayStr } from '@kbn/rrule';
import type { RRuleScheduleConfig, ScheduleType } from '../../common/schedule';
import { parseRRule } from '../../common/utils/rrule_parser';
import { rruleFieldsToRecurrence } from './form/schedule_serializer';

/**
 * Effective schedule resolved per query row — either the query's own override
 * or the inherited pack schedule.
 */
export interface EffectiveSchedule {
  schedule_type?: ScheduleType;
  interval?: number;
  rrule_schedule?: RRuleScheduleConfig;
}

/**
 * Short weekday labels keyed by `@kbn/rrule` {@link WeekdayStr} token. These
 * mirror the labels used by the frequency selector so the table and the form
 * stay in sync.
 */
const WEEKDAY_SHORT_LABEL: Record<WeekdayStr, string> = {
  SU: i18n.translate('xpack.osquery.pack.queriesTable.scheduleWeekday.su', {
    defaultMessage: 'Sun',
  }),
  MO: i18n.translate('xpack.osquery.pack.queriesTable.scheduleWeekday.mo', {
    defaultMessage: 'Mon',
  }),
  TU: i18n.translate('xpack.osquery.pack.queriesTable.scheduleWeekday.tu', {
    defaultMessage: 'Tue',
  }),
  WE: i18n.translate('xpack.osquery.pack.queriesTable.scheduleWeekday.we', {
    defaultMessage: 'Wed',
  }),
  TH: i18n.translate('xpack.osquery.pack.queriesTable.scheduleWeekday.th', {
    defaultMessage: 'Thu',
  }),
  FR: i18n.translate('xpack.osquery.pack.queriesTable.scheduleWeekday.fr', {
    defaultMessage: 'Fri',
  }),
  SA: i18n.translate('xpack.osquery.pack.queriesTable.scheduleWeekday.sa', {
    defaultMessage: 'Sat',
  }),
};

/**
 * Display order for weekdays in the Schedule column — Sunday-first to match the
 * pack form layout.
 */
const WEEKDAY_DISPLAY_ORDER: readonly WeekdayStr[] = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

const formatInterval = (interval: number): string =>
  i18n.translate('xpack.osquery.pack.queriesTable.scheduleIntervalText', {
    defaultMessage: '{n}s',
    values: { n: interval },
  });

const DAILY_TEXT = i18n.translate('xpack.osquery.pack.queriesTable.scheduleDailyText', {
  defaultMessage: 'Daily',
});

const formatCustom = (interval: number, weekdays: string[]): string => {
  if (weekdays.length === 0) {
    return i18n.translate('xpack.osquery.pack.queriesTable.scheduleCustomNoDaysText', {
      defaultMessage: 'Every {interval, plural, one {week} other {# weeks}}',
      values: { interval },
    });
  }

  return i18n.translate('xpack.osquery.pack.queriesTable.scheduleCustomText', {
    defaultMessage: 'Every {interval, plural, one {week} other {# weeks}} on {weekdays}',
    values: { interval, weekdays: weekdays.join(', ') },
  });
};

/**
 * Format a query's effective schedule into human-readable text for the pack
 * queries table Schedule column.
 *
 * - interval mode → `"{n}s"` (e.g. `3600s`)
 * - RRULE daily → `"Daily"`
 * - RRULE custom (weekly + BYDAY) → `"Every {N} week(s) on {weekdays}"`
 *
 * Falls back to interval text when the schedule is interval mode, the rrule
 * string is missing, or it cannot be parsed.
 */
export const formatQuerySchedule = (schedule: EffectiveSchedule): string => {
  if (schedule.schedule_type === 'rrule' && schedule.rrule_schedule?.rrule) {
    try {
      const recurrence = rruleFieldsToRecurrence(parseRRule(schedule.rrule_schedule.rrule));

      if (recurrence.frequency === 'custom') {
        const weekdays = WEEKDAY_DISPLAY_ORDER.filter((token) =>
          recurrence.byweekday.includes(token)
        ).map((token) => WEEKDAY_SHORT_LABEL[token]);

        return formatCustom(recurrence.interval, weekdays);
      }

      return DAILY_TEXT;
    } catch {
      // Fall through to interval text on an unparseable rrule string.
    }
  }

  return formatInterval(schedule.interval ?? 0);
};
