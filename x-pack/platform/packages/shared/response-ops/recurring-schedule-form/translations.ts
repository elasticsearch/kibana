/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';
import type { Moment } from 'moment';
import { Frequency } from '@kbn/rrule';
import { monthDayDate } from './utils/month_day_date';

export const RECURRING_SCHEDULE_FORM_TIMEZONE = i18n.translate(
  'responseOpsRecurringScheduleForm.timezone',
  {
    defaultMessage: 'Time zone',
  }
);

export const RECURRING_SCHEDULE_FORM_REPEAT = i18n.translate(
  'responseOpsRecurringScheduleForm.repeat',
  {
    defaultMessage: 'Repeat',
  }
);

export const RECURRING_SCHEDULE_FORM_FREQUENCY_HOURLY = i18n.translate(
  'responseOpsRecurringScheduleForm.frequency.hourly',
  {
    defaultMessage: 'Hourly',
  }
);

export const RECURRING_SCHEDULE_FORM_FREQUENCY_DAILY = i18n.translate(
  'responseOpsRecurringScheduleForm.frequency.daily',
  {
    defaultMessage: 'Daily',
  }
);

export const RECURRING_SCHEDULE_FORM_FREQUENCY_WEEKLY = i18n.translate(
  'responseOpsRecurringScheduleForm.frequency.weekly',
  {
    defaultMessage: 'Weekly',
  }
);

export const RECURRING_SCHEDULE_FORM_FREQUENCY_WEEKLY_ON = (dayOfWeek: string) =>
  i18n.translate('responseOpsRecurringScheduleForm.frequency.weeklyOnWeekday', {
    defaultMessage: 'Weekly on {dayOfWeek}',
    values: { dayOfWeek },
  });

export const RECURRING_SCHEDULE_FORM_FREQUENCY_MONTHLY = i18n.translate(
  'responseOpsRecurringScheduleForm.frequency.monthly',
  {
    defaultMessage: 'Monthly',
  }
);

export const RECURRING_SCHEDULE_FORM_FREQUENCY_NTH_WEEKDAY = (dayOfWeek: string) => [
  i18n.translate('responseOpsRecurringScheduleForm.frequency.last', {
    defaultMessage: 'Monthly on the last {dayOfWeek}',
    values: { dayOfWeek },
  }),
  i18n.translate('responseOpsRecurringScheduleForm.frequency.first', {
    defaultMessage: 'Monthly on the first {dayOfWeek}',
    values: { dayOfWeek },
  }),
  i18n.translate('responseOpsRecurringScheduleForm.frequency.second', {
    defaultMessage: 'Monthly on the second {dayOfWeek}',
    values: { dayOfWeek },
  }),
  i18n.translate('responseOpsRecurringScheduleForm.frequency.third', {
    defaultMessage: 'Monthly on the third {dayOfWeek}',
    values: { dayOfWeek },
  }),
  i18n.translate('responseOpsRecurringScheduleForm.frequency.fourth', {
    defaultMessage: 'Monthly on the fourth {dayOfWeek}',
    values: { dayOfWeek },
  }),
];

export const RECURRING_SCHEDULE_FORM_FREQUENCY_YEARLY = i18n.translate(
  'responseOpsRecurringScheduleForm.frequency.yearly',
  {
    defaultMessage: 'Yearly',
  }
);

export const RECURRING_SCHEDULE_FORM_FREQUENCY_YEARLY_ON = (startDate: Moment) =>
  i18n.translate('responseOpsRecurringScheduleForm.frequency.yearlyOn', {
    defaultMessage: 'Yearly on {date}',
    values: {
      date: monthDayDate(startDate),
    },
  });

export const RECURRING_SCHEDULE_FORM_FREQUENCY_CUSTOM = i18n.translate(
  'responseOpsRecurringScheduleForm.frequency.custom',
  {
    defaultMessage: 'Custom',
  }
);

export const RECURRING_SCHEDULE_FORM_ENDS = i18n.translate(
  'responseOpsRecurringScheduleForm.endsLabel',
  {
    defaultMessage: 'End',
  }
);

export const RECURRING_SCHEDULE_FORM_UNTIL_REQUIRED_MESSAGE = i18n.translate(
  'responseOpsRecurringScheduleForm.untilRequiredMessage',
  {
    defaultMessage: 'End date required',
  }
);

export const RECURRING_SCHEDULE_FORM_UNTIL_PLACEHOLDER = i18n.translate(
  'responseOpsRecurringScheduleForm.untilPlaceholder',
  {
    defaultMessage: 'Select an end date',
  }
);

export const RECURRING_SCHEDULE_FORM_ENDS_NEVER = i18n.translate(
  'responseOpsRecurringScheduleForm.ends.never',
  {
    defaultMessage: 'Never',
  }
);

export const RECURRING_SCHEDULE_FORM_ENDS_ON_DATE = i18n.translate(
  'responseOpsRecurringScheduleForm.ends.onDate',
  {
    defaultMessage: 'On date',
  }
);

export const RECURRING_SCHEDULE_FORM_ENDS_AFTER_X = i18n.translate(
  'responseOpsRecurringScheduleForm.ends.afterX',
  {
    defaultMessage: `After '{x}'`,
  }
);

export const RECURRING_SCHEDULE_FORM_COUNT_AFTER = i18n.translate(
  'responseOpsRecurringScheduleForm.count.after',
  {
    defaultMessage: 'After',
  }
);

export const RECURRING_SCHEDULE_FORM_COUNT_OCCURRENCE = i18n.translate(
  'responseOpsRecurringScheduleForm.count.occurrence',
  {
    defaultMessage: 'occurrence',
  }
);

export const RECURRING_SCHEDULE_FORM_COUNT_REQUIRED = i18n.translate(
  'responseOpsRecurringScheduleForm.countFieldRequiredError',
  {
    defaultMessage: 'A count is required.',
  }
);

export const RECURRING_SCHEDULE_FORM_INTERVAL_REQUIRED = i18n.translate(
  'responseOpsRecurringScheduleForm.intervalFieldRequiredError',
  {
    defaultMessage: 'An interval is required.',
  }
);

export const RECURRING_SCHEDULE_FORM_INTERVAL_EVERY = i18n.translate(
  'responseOpsRecurringScheduleForm.interval.every',
  {
    defaultMessage: 'Every',
  }
);

export const RECURRING_SCHEDULE_FORM_CUSTOM_FREQUENCY_HOURLY = (interval: number) =>
  i18n.translate('responseOpsRecurringScheduleForm.customFrequency.hourly', {
    defaultMessage: '{interval, plural, one {hour} other {hours}}',
    values: { interval },
  });

export const RECURRING_SCHEDULE_FORM_CUSTOM_FREQUENCY_DAILY = (interval: number) =>
  i18n.translate('responseOpsRecurringScheduleForm.customFrequency.daily', {
    defaultMessage: '{interval, plural, one {day} other {days}}',
    values: { interval },
  });

export const RECURRING_SCHEDULE_FORM_CUSTOM_FREQUENCY_WEEKLY = (interval: number) =>
  i18n.translate('responseOpsRecurringScheduleForm.customFrequency.weekly', {
    defaultMessage: '{interval, plural, one {week} other {weeks}}',
    values: { interval },
  });

export const RECURRING_SCHEDULE_FORM_CUSTOM_FREQUENCY_MONTHLY = (interval: number) =>
  i18n.translate('responseOpsRecurringScheduleForm.customFrequency.monthly', {
    defaultMessage: '{interval, plural, one {month} other {months}}',
    values: { interval },
  });

export const RECURRING_SCHEDULE_FORM_CUSTOM_FREQUENCY_YEARLY = (interval: number) =>
  i18n.translate('responseOpsRecurringScheduleForm.customFrequency.yearly', {
    defaultMessage: '{interval, plural, one {year} other {years}}',
    values: { interval },
  });

export const RECURRING_SCHEDULE_FORM_WEEKDAY_SHORT = (dayOfWeek: string) => [
  i18n.translate('responseOpsRecurringScheduleForm.lastShort', {
    defaultMessage: 'On the last {dayOfWeek}',
    values: { dayOfWeek },
  }),
  i18n.translate('responseOpsRecurringScheduleForm.firstShort', {
    defaultMessage: 'On the 1st {dayOfWeek}',
    values: { dayOfWeek },
  }),
  i18n.translate('responseOpsRecurringScheduleForm.secondShort', {
    defaultMessage: 'On the 2nd {dayOfWeek}',
    values: { dayOfWeek },
  }),
  i18n.translate('responseOpsRecurringScheduleForm.thirdShort', {
    defaultMessage: 'On the 3rd {dayOfWeek}',
    values: { dayOfWeek },
  }),
  i18n.translate('responseOpsRecurringScheduleForm.fourthShort', {
    defaultMessage: 'On the 4th {dayOfWeek}',
    values: { dayOfWeek },
  }),
];

export const RECURRING_SCHEDULE_FORM_BYWEEKDAY_REQUIRED = i18n.translate(
  'responseOpsRecurringScheduleForm.byweekdayFieldRequiredError',
  {
    defaultMessage: 'A week day is required.',
  }
);

export const RECURRING_SCHEDULE_FORM_CUSTOM_REPEAT_MONTHLY_ON_DAY = (startDate: Moment) =>
  i18n.translate('responseOpsRecurringScheduleForm.repeatOnMonthlyDay', {
    defaultMessage: 'On day {dayNumber}',
    values: { dayNumber: startDate.date() },
  });

export const RECURRING_SCHEDULE_FORM_CUSTOM_REPEAT_MONTHLY_ON_LAST_DAY = i18n.translate(
  'responseOpsRecurringScheduleForm.repeatOnMonthlyLastDay',
  {
    defaultMessage: 'On the last day',
  }
);

export const RECURRING_SCHEDULE_FORM_RECURRING_SUMMARY_PREFIX = (summary: string) =>
  i18n.translate('responseOpsRecurringScheduleForm.recurringSummaryPrefix', {
    defaultMessage: 'Repeats {summary}',
    values: { summary },
  });

export const RECURRING_SCHEDULE_FORM_FREQUENCY_SUMMARY = (interval: number) => ({
  [Frequency.HOURLY]: i18n.translate('responseOpsRecurringScheduleForm.hourSummary', {
    defaultMessage: '{interval, plural, one {hour} other {# hours}}',
    values: { interval },
  }),
  [Frequency.DAILY]: i18n.translate('responseOpsRecurringScheduleForm.daySummary', {
    defaultMessage: '{interval, plural, one {day} other {# days}}',
    values: { interval },
  }),
  [Frequency.WEEKLY]: i18n.translate('responseOpsRecurringScheduleForm.weekSummary', {
    defaultMessage: '{interval, plural, one {week} other {# weeks}}',
    values: { interval },
  }),
  [Frequency.MONTHLY]: i18n.translate('responseOpsRecurringScheduleForm.monthSummary', {
    defaultMessage: '{interval, plural, one {month} other {# months}}',
    values: { interval },
  }),
  [Frequency.YEARLY]: i18n.translate('responseOpsRecurringScheduleForm.yearSummary', {
    defaultMessage: '{interval, plural, one {year} other {# years}}',
    values: { interval },
  }),
});

export const RECURRING_SCHEDULE_FORM_UNTIL_DATE_SUMMARY = (date: string) =>
  i18n.translate('responseOpsRecurringScheduleForm.untilDateSummary', {
    defaultMessage: 'until {date}',
    values: { date },
  });

export const RECURRING_SCHEDULE_FORM_OCURRENCES_SUMMARY = (count: number) =>
  i18n.translate('responseOpsRecurringScheduleForm.occurrencesSummary', {
    defaultMessage: 'for {count, plural, one {# occurrence} other {# occurrences}}',
    values: { count },
  });

export const RECURRING_SCHEDULE_FORM_RECURRING_SUMMARY = (
  frequencySummary: string | null,
  onSummary: string | null,
  untilSummary: string | null,
  time: string | null
) =>
  i18n.translate('responseOpsRecurringScheduleForm.recurrenceSummary', {
    defaultMessage: 'every {frequencySummary}{on}{until}{time}',
    values: {
      frequencySummary: frequencySummary ? `${frequencySummary} ` : '',
      on: onSummary ? `${onSummary} ` : '',
      until: untilSummary ? `${untilSummary}` : '',
      time: time ? `${time}` : '',
    },
  });

export const RECURRING_SCHEDULE_FORM_WEEKLY_SUMMARY = (weekdays: string) =>
  i18n.translate('responseOpsRecurringScheduleForm.weeklySummary', {
    defaultMessage: 'on {weekdays}',
    values: {
      weekdays,
    },
  });

export const RECURRING_SCHEDULE_FORM_MONTHLY_BY_DAY_SUMMARY = (monthday: number) =>
  i18n.translate('responseOpsRecurringScheduleForm.monthlyByDaySummary', {
    defaultMessage: 'on day {monthday}',
    values: {
      monthday,
    },
  });

export const RECURRING_SCHEDULE_FORM_MONTHLY_BY_LAST_DAY_SUMMARY = i18n.translate(
  'responseOpsRecurringScheduleForm.monthlyByLastDaySummary',
  {
    defaultMessage: 'on the last day of the month',
  }
);

export const RECURRING_SCHEDULE_FORM_YEARLY_BY_MONTH_SUMMARY = (date: string) =>
  i18n.translate('responseOpsRecurringScheduleForm.yearlyBymonthSummary', {
    defaultMessage: 'on {date}',
    values: { date },
  });

export const RECURRING_SCHEDULE_FORM_HOURLY_SUMMARY = (time: string) =>
  i18n.translate('responseOpsRecurringScheduleForm.hourlySummary', {
    defaultMessage: 'starting from {time}',
    values: { time },
  });

export const RECURRING_SCHEDULE_FORM_TIME_SUMMARY = (time: string) =>
  i18n.translate('responseOpsRecurringScheduleForm.timeSummary', {
    defaultMessage: 'at {time}',
    values: { time },
  });
