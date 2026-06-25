/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';

export const SCHEDULE_SECTION_TITLE = i18n.translate('xpack.osquery.scheduleSection.sectionTitle', {
  defaultMessage: 'Schedule',
});

export const SCHEDULE_TYPE_INTERVAL_LABEL = i18n.translate(
  'xpack.osquery.scheduleSection.scheduleTypeIntervalLabel',
  { defaultMessage: 'Interval' }
);

export const SCHEDULE_TYPE_RECURRENCE_LABEL = i18n.translate(
  'xpack.osquery.scheduleSection.scheduleTypeRecurrenceLabel',
  { defaultMessage: 'Date & time' }
);

export const SCHEDULE_TYPE_LOCKED_HELP = i18n.translate(
  'xpack.osquery.scheduleSection.scheduleTypeLockedHelp',
  {
    defaultMessage: 'Overrides change the schedule details; mode is set at the pack level.',
  }
);

export const INTERVAL_FIELD_LABEL = i18n.translate(
  'xpack.osquery.scheduleSection.intervalFieldLabel',
  { defaultMessage: 'Intervals' }
);

export const INTERVAL_FIELD_UNIT = i18n.translate(
  'xpack.osquery.scheduleSection.intervalFieldUnit',
  { defaultMessage: 'second(s)' }
);

export const FREQUENCY_LABEL = i18n.translate('xpack.osquery.scheduleSection.frequencyLabel', {
  defaultMessage: 'Frequency',
});

export const FREQUENCY_MINUTELY = i18n.translate(
  'xpack.osquery.scheduleSection.frequency.minutely',
  { defaultMessage: 'Minutely' }
);

export const FREQUENCY_HOURLY = i18n.translate('xpack.osquery.scheduleSection.frequency.hourly', {
  defaultMessage: 'Hourly',
});

export const FREQUENCY_DAILY = i18n.translate('xpack.osquery.scheduleSection.frequency.daily', {
  defaultMessage: 'Daily',
});

export const FREQUENCY_CUSTOM = i18n.translate('xpack.osquery.scheduleSection.frequency.custom', {
  defaultMessage: 'Custom',
});

export const FREQUENCY_MONTHLY = i18n.translate('xpack.osquery.scheduleSection.frequency.monthly', {
  defaultMessage: 'Monthly',
});

export const FREQUENCY_YEARLY = i18n.translate('xpack.osquery.scheduleSection.frequency.yearly', {
  defaultMessage: 'Yearly',
});

export const REPEAT_EVERY_LABEL = i18n.translate('xpack.osquery.scheduleSection.repeatEveryLabel', {
  defaultMessage: 'Repeat every',
});

export const UNIT_WEEKS = i18n.translate('xpack.osquery.scheduleSection.unitWeeks', {
  defaultMessage: 'Week(s)',
});

export const DAYS_OF_WEEK_LABEL = i18n.translate('xpack.osquery.scheduleSection.daysOfWeekLabel', {
  defaultMessage: 'Days',
});

export const DAY_MO = i18n.translate('xpack.osquery.scheduleSection.day.mo', {
  defaultMessage: 'Mon',
});
export const DAY_TU = i18n.translate('xpack.osquery.scheduleSection.day.tu', {
  defaultMessage: 'Tue',
});
export const DAY_WE = i18n.translate('xpack.osquery.scheduleSection.day.we', {
  defaultMessage: 'Wed',
});
export const DAY_TH = i18n.translate('xpack.osquery.scheduleSection.day.th', {
  defaultMessage: 'Thu',
});
export const DAY_FR = i18n.translate('xpack.osquery.scheduleSection.day.fr', {
  defaultMessage: 'Fri',
});
export const DAY_SA = i18n.translate('xpack.osquery.scheduleSection.day.sa', {
  defaultMessage: 'Sat',
});
export const DAY_SU = i18n.translate('xpack.osquery.scheduleSection.day.su', {
  defaultMessage: 'Sun',
});

export const AT_LEAST_ONE_DAY_ERROR = i18n.translate(
  'xpack.osquery.scheduleSection.atLeastOneDayError',
  { defaultMessage: 'Select at least one day of the week.' }
);

export const START_DATE_LABEL = i18n.translate('xpack.osquery.scheduleSection.startDateLabel', {
  defaultMessage: 'Start date and time',
});

export const SCHEDULE_TYPE_INTERVAL_DESCRIPTION = i18n.translate(
  'xpack.osquery.scheduleSection.scheduleTypeIntervalDescription',
  {
    defaultMessage:
      'Run queries based on specified time intervals, calculated from when each agent was deployed.',
  }
);

export const SCHEDULE_TYPE_RECURRENCE_DESCRIPTION = i18n.translate(
  'xpack.osquery.scheduleSection.scheduleTypeRecurrenceDescription',
  {
    defaultMessage: 'Run queries at a set date and time, such as every Saturday at 9am.',
  }
);

export const STOP_AFTER_LABEL = i18n.translate('xpack.osquery.scheduleSection.stopAfterLabel', {
  defaultMessage: 'Stop after',
});

export const STOP_AFTER_DESCRIPTION = i18n.translate(
  'xpack.osquery.scheduleSection.stopAfterDescription',
  { defaultMessage: 'Set an end date for this schedule.' }
);

export const STOP_AFTER_DATE_LABEL = i18n.translate(
  'xpack.osquery.scheduleSection.stopAfterDateLabel',
  { defaultMessage: 'Stop date' }
);

export const STOP_AFTER_BEFORE_START_ERROR = i18n.translate(
  'xpack.osquery.scheduleSection.stopAfterBeforeStartError',
  { defaultMessage: 'Stop date must be after the start date.' }
);

export const START_DATE_IN_PAST_ERROR = i18n.translate(
  'xpack.osquery.scheduleSection.startDateInPastError',
  { defaultMessage: 'Start date and time must not be in the past.' }
);

export const SPLAY_LABEL = i18n.translate('xpack.osquery.scheduleSection.splayLabel', {
  defaultMessage: 'Splay time',
});

export const SPLAY_DESCRIPTION = i18n.translate('xpack.osquery.scheduleSection.splayDescription', {
  defaultMessage: "Randomly delay execution within the query's interval (1 second – 12 hours).",
});

export const SPLAY_VALUE_LABEL = i18n.translate('xpack.osquery.scheduleSection.splayValueLabel', {
  defaultMessage: 'Splay value',
});

export const SPLAY_UNIT_LABEL = i18n.translate('xpack.osquery.scheduleSection.splayUnitLabel', {
  defaultMessage: 'Splay unit',
});

export const SPLAY_UNIT_SECONDS = i18n.translate(
  'xpack.osquery.scheduleSection.splayUnit.seconds',
  { defaultMessage: 'Seconds' }
);
export const SPLAY_UNIT_MINUTES = i18n.translate(
  'xpack.osquery.scheduleSection.splayUnit.minutes',
  { defaultMessage: 'Minutes' }
);
export const SPLAY_UNIT_HOURS = i18n.translate('xpack.osquery.scheduleSection.splayUnit.hours', {
  defaultMessage: 'Hours',
});

export const SPLAY_MAX_ERROR = i18n.translate('xpack.osquery.scheduleSection.splayMaxError', {
  defaultMessage: 'Splay must be a positive integer no greater than 12 hours.',
});

export const PACK_QUERY_STALE_INTERVAL_ERROR = i18n.translate(
  'xpack.osquery.scheduleSection.packQueryStaleIntervalError',
  {
    defaultMessage:
      'One or more queries still use an interval schedule. Per-query intervals do not apply while the pack uses a date & time schedule and will not be saved.',
  }
);

export const SCHEDULE_ERRORS_TOAST_TITLE = i18n.translate(
  'xpack.osquery.scheduleSection.scheduleErrorsToastTitle',
  {
    defaultMessage: 'Fix the schedule before saving',
  }
);

export const SPLAY_QUERY_STORM_WARNING = i18n.translate(
  'xpack.osquery.scheduleSection.splayQueryStormWarning',
  {
    defaultMessage:
      'Splay is recommended for fleets larger than ~100 agents. Without it, every agent runs at the same wall-clock moment.',
  }
);

export const ADVANCED_PARTS_ADVISORY_TITLE = i18n.translate(
  'xpack.osquery.scheduleSection.advancedPartsAdvisoryTitle',
  { defaultMessage: 'Advanced schedule settings preserved' }
);

export const ADVANCED_PARTS_ADVISORY_BODY = i18n.translate(
  'xpack.osquery.scheduleSection.advancedPartsAdvisoryBody',
  {
    defaultMessage:
      'This schedule contains advanced settings that this Kibana version cannot edit. Saving will preserve them. Changing the frequency will discard them.',
  }
);

export const QUERY_OVERRIDE_SCHEDULE_TOGGLE_LABEL = i18n.translate(
  'xpack.osquery.scheduleSection.queryOverrideToggleLabel',
  { defaultMessage: 'Override pack schedule' }
);

export const QUERY_OVERRIDE_SCHEDULE_TOGGLE_DESCRIPTION = i18n.translate(
  'xpack.osquery.scheduleSection.queryOverrideToggleDescription',
  {
    defaultMessage:
      "When enabled, this query runs on its own schedule instead of inheriting the pack's. The mode (interval or recurrence) stays the same as the pack.",
  }
);

export const QUERY_USING_PACK_SCHEDULE_LABEL = i18n.translate(
  'xpack.osquery.scheduleSection.queryUsingPackScheduleLabel',
  { defaultMessage: 'Using pack schedule' }
);

export const TIMEOUT_RRULE_INHERIT_HELP = i18n.translate(
  'xpack.osquery.scheduleSection.timeoutRruleInheritHelp',
  {
    defaultMessage:
      'Timeout does not apply to recurrence-scheduled queries. The schedule timeout is used instead.',
  }
);
