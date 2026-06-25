/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { Frequency, Weekday, type WeekdayStr } from '@kbn/rrule';
import type { RRuleScheduleConfig, ScheduleType } from '../../../common/schedule';
import type { RRuleFields } from '../../../common/utils/rrule_serializer';
import { parseRRule } from '../../../common/utils/rrule_parser';
import { serializeRRule } from '../../../common/utils/rrule_serializer';
import {
  parseSplayPermissive,
  serializeSplay,
  type SplayFormState,
} from '../../../common/utils/splay_utils';
import {
  DEFAULT_INTERVAL_SECONDS,
  type FrequencyMode,
  type RecurrenceFormState,
  type ScheduleFormData,
  type SplayFormStateUI,
  WEEKDAY_TOKENS,
  createDefaultRecurrence,
  createDefaultScheduleFormData,
  createDefaultSplay,
} from '../../components/schedule_section/types';

const WEEKDAY_TO_TOKEN: Record<Weekday, WeekdayStr> = {
  [Weekday.MO]: 'MO',
  [Weekday.TU]: 'TU',
  [Weekday.WE]: 'WE',
  [Weekday.TH]: 'TH',
  [Weekday.FR]: 'FR',
  [Weekday.SA]: 'SA',
  [Weekday.SU]: 'SU',
};

const TOKEN_TO_WEEKDAY: Record<WeekdayStr, Weekday> = {
  MO: Weekday.MO,
  TU: Weekday.TU,
  WE: Weekday.WE,
  TH: Weekday.TH,
  FR: Weekday.FR,
  SA: Weekday.SA,
  SU: Weekday.SU,
};

const FREQUENCY_TO_STRING: Partial<Record<Frequency, string>> = {
  [Frequency.YEARLY]: 'YEARLY',
  [Frequency.MONTHLY]: 'MONTHLY',
  [Frequency.WEEKLY]: 'WEEKLY',
  [Frequency.DAILY]: 'DAILY',
  [Frequency.HOURLY]: 'HOURLY',
  [Frequency.MINUTELY]: 'MINUTELY',
};

const STRING_TO_FREQUENCY: Record<string, Frequency> = {
  YEARLY: Frequency.YEARLY,
  MONTHLY: Frequency.MONTHLY,
  WEEKLY: Frequency.WEEKLY,
  DAILY: Frequency.DAILY,
  HOURLY: Frequency.HOURLY,
  MINUTELY: Frequency.MINUTELY,
};

const isValidDate = (date: unknown): date is Date =>
  date instanceof Date && !Number.isNaN(date.getTime());

const resolveDate = (value: unknown): Date | undefined => {
  if (value === undefined || value === null) return undefined;
  if (isValidDate(value)) return value;
  if (typeof value === 'string' && value.length > 0) {
    const parsed = new Date(value);

    return isValidDate(parsed) ? parsed : undefined;
  }

  return undefined;
};

/**
 * Map UI frequency token + recurrence form state → RFC 5545 RRULE fields. The
 * `'custom'` UI mode collapses to `WEEKLY + BYDAY` per the form spec.
 */
const recurrenceToRRuleFields = (recurrence: RecurrenceFormState): RRuleFields => {
  const fields: RRuleFields = (() => {
    switch (recurrence.frequency) {
      case 'daily':
        return { freq: Frequency.DAILY };
      case 'custom': {
        const byweekday =
          recurrence.byweekday.length > 0
            ? recurrence.byweekday
                .filter((token): token is WeekdayStr => token in TOKEN_TO_WEEKDAY)
                .map((token) => TOKEN_TO_WEEKDAY[token])
            : undefined;

        return {
          freq: Frequency.WEEKLY,
          ...(recurrence.interval > 1 ? { interval: recurrence.interval } : {}),
          ...(byweekday ? { byweekday } : {}),
        };
      }

      default:
        // Defensive: unknown frequency. Fall back to daily so we never throw at
        // the serializer boundary on malformed form state.
        return { freq: Frequency.DAILY };
    }
  })();

  if (recurrence._unknown && Object.keys(recurrence._unknown).length > 0) {
    const { FREQ: unknownFreq, ...restUnknown } = recurrence._unknown;
    const liftedFreq = unknownFreq ? STRING_TO_FREQUENCY[unknownFreq.toUpperCase()] : undefined;
    if (liftedFreq !== undefined) {
      fields.freq = liftedFreq;
    }

    const remainingUnknown = liftedFreq !== undefined ? restUnknown : recurrence._unknown;
    if (Object.keys(remainingUnknown).length > 0) {
      fields._unknown = remainingUnknown;
    }
  }

  return fields;
};

/**
 * Map parsed {@link RRuleFields} → UI recurrence form state. The reverse of
 * {@link recurrenceToRRuleFields}.
 */
export const rruleFieldsToRecurrence = (fields: RRuleFields): RecurrenceFormState => {
  const base = createDefaultRecurrence();
  let frequency: FrequencyMode = base.frequency;
  let byweekday: WeekdayStr[] = base.byweekday;
  let interval = base.interval;

  const foldedUnknown: Record<string, string> = {};

  if (fields.freq === Frequency.WEEKLY && fields.byweekday && fields.byweekday.length > 0) {
    frequency = 'custom';
    byweekday = fields.byweekday
      .map((day) => WEEKDAY_TO_TOKEN[day])
      .filter((token): token is WeekdayStr => token !== undefined);

    if (fields.interval && fields.interval > 0) {
      interval = fields.interval;
    }

    // WEEKLY does not render BYMONTHDAY / BYMONTH — preserve them.
    if (fields.bymonthday && fields.bymonthday.length > 0) {
      foldedUnknown.BYMONTHDAY = fields.bymonthday.join(',');
    }

    if (fields.bymonth && fields.bymonth.length > 0) {
      foldedUnknown.BYMONTH = fields.bymonth.join(',');
    }
  } else if (fields.freq === Frequency.WEEKLY) {
    // WEEKLY with no BYDAY ("every N weeks on the start date's weekday") is a
    // valid externally-authored rule the form cannot render — it has no Custom
    // weekday selection to populate. Land on the editable 'daily' default and
    // preserve the rule verbatim in `_unknown` so a no-op save round-trips it
    // unchanged and the advisory fires, rather than injecting a Mon–Fri BYDAY.
    frequency = 'daily';
    foldedUnknown.FREQ = 'WEEKLY';

    if (fields.interval && fields.interval > 1) {
      foldedUnknown.INTERVAL = String(fields.interval);
    }

    if (fields.bymonthday && fields.bymonthday.length > 0) {
      foldedUnknown.BYMONTHDAY = fields.bymonthday.join(',');
    }

    if (fields.bymonth && fields.bymonth.length > 0) {
      foldedUnknown.BYMONTH = fields.bymonth.join(',');
    }
  } else if (fields.freq === Frequency.DAILY) {
    frequency = 'daily';

    // The daily branch renders no sub-fields, so INTERVAL / BYDAY / BYMONTHDAY /
    // BYMONTH would otherwise be silently dropped. Preserve them in `_unknown`.
    if (fields.interval && fields.interval > 1) {
      foldedUnknown.INTERVAL = String(fields.interval);
    }

    if (fields.byweekday && fields.byweekday.length > 0) {
      foldedUnknown.BYDAY = fields.byweekday
        .map((day) => WEEKDAY_TO_TOKEN[day])
        .filter((token): token is WeekdayStr => token !== undefined)
        .join(',');
    }

    if (fields.bymonthday && fields.bymonthday.length > 0) {
      foldedUnknown.BYMONTHDAY = fields.bymonthday.join(',');
    }

    if (fields.bymonth && fields.bymonth.length > 0) {
      foldedUnknown.BYMONTH = fields.bymonth.join(',');
    }
  } else {
    // Future-proofing: any other supported frequency (MINUTELY/HOURLY/MONTHLY/
    // YEARLY) is not yet rendered in the form. Land on 'daily' as the safest
    // editable default and preserve the distinguishing parts in `_unknown` so
    // the user is warned and the round-trip stays lossless if they don't
    // touch the frequency selector.
    frequency = 'daily';
    const freqLabel = FREQUENCY_TO_STRING[fields.freq];
    if (freqLabel) {
      foldedUnknown.FREQ = freqLabel;
    }

    if (fields.interval && fields.interval > 1) {
      foldedUnknown.INTERVAL = String(fields.interval);
    }

    if (fields.byweekday && fields.byweekday.length > 0) {
      foldedUnknown.BYDAY = fields.byweekday
        .map((day) => WEEKDAY_TO_TOKEN[day])
        .filter((token): token is WeekdayStr => token !== undefined)
        .join(',');
    }

    if (fields.bymonthday && fields.bymonthday.length > 0) {
      foldedUnknown.BYMONTHDAY = fields.bymonthday.join(',');
    }

    if (fields.bymonth && fields.bymonth.length > 0) {
      foldedUnknown.BYMONTH = fields.bymonth.join(',');
    }
  }

  const mergedUnknown: Record<string, string> = { ...foldedUnknown, ...(fields._unknown ?? {}) };

  return {
    frequency,
    interval,
    byweekday,
    ...(Object.keys(mergedUnknown).length > 0 ? { _unknown: mergedUnknown } : {}),
  };
};

/**
 * Deserialize a Go duration splay string into the UI form-state shape. Compound
 * durations (`"1h30m"`) are tolerated via {@link parseSplayPermissive} and the
 * raw string is stashed in `rawCompound` so the form re-emits it verbatim
 * unless the user touches the splay control.
 */
const deserializeSplay = (raw: string | undefined): SplayFormStateUI => {
  if (!raw) {
    return createDefaultSplay();
  }

  try {
    const result = parseSplayPermissive(raw);
    if (result.kind === 'simple') {
      return { enabled: true, value: result.value, unit: result.unit };
    }

    return {
      enabled: true,
      // Surface a representative single-unit fallback in the form controls so
      // the inputs are not blank — the actual emit uses `rawCompound`.
      value: 1,
      unit: 'hours',
      rawCompound: result.raw,
    };
  } catch {
    return createDefaultSplay();
  }
};

/**
 * Build the wire-shape splay string from form state. Returns `undefined` when
 * splay is disabled. Preserves a previously-loaded compound string verbatim
 * unless the user touched the single-unit input.
 */
const serializeSplayState = (splay: SplayFormStateUI): string | undefined => {
  if (!splay.enabled) return undefined;
  if (splay.rawCompound) {
    return splay.rawCompound;
  }

  const state: SplayFormState = { value: splay.value, unit: splay.unit };
  try {
    return serializeSplay(state);
  } catch {
    return undefined;
  }
};

/**
 * Shape of the pack-level schedule fields produced by the form serializer.
 * Mirrors the API request payload — empty / undefined slots are omitted at the
 * call site before sending to the server.
 */
export interface SerializedScheduleFields {
  schedule_type: ScheduleType;
  interval?: number;
  rrule_schedule?: RRuleScheduleConfig;
}

/**
 * Read the form's pack-level schedule state out of {@link ScheduleFormData} and
 * produce the wire-shape fields the API expects. Pack form `onSubmit` spreads
 * the result onto the request body.
 *
 * - When `scheduleType === 'interval'`: emit `{ schedule_type, interval }`.
 * - When `scheduleType === 'rrule'`: emit `{ schedule_type, rrule_schedule }`.
 *   Mutually exclusive at the boundary.
 */
export const serializeSchedule = (data: ScheduleFormData): SerializedScheduleFields => {
  if (data.scheduleType === 'interval') {
    return {
      schedule_type: 'interval',
      interval: data.interval,
    };
  }

  const rruleFields = recurrenceToRRuleFields(data.recurrence);
  const rrule = serializeRRule(rruleFields);
  const startDate = isValidDate(data.startDate) ? data.startDate : new Date();
  const endDate =
    data.stopAfter.enabled && isValidDate(data.stopAfter.date) ? data.stopAfter.date : undefined;

  const rruleSchedule: RRuleScheduleConfig = {
    rrule,
    start_date: startDate.toISOString(),
    ...(endDate ? { end_date: endDate.toISOString() } : {}),
  };

  const splay = serializeSplayState(data.splay);
  if (splay) {
    rruleSchedule.splay = splay;
  }

  return {
    schedule_type: 'rrule',
    rrule_schedule: rruleSchedule,
  };
};

/**
 * Inputs accepted by {@link deserializeSchedule}. Mirrors the read-side shape
 * of pack SO attributes that the form initializes from.
 */
export interface DeserializeScheduleInput {
  schedule_type?: ScheduleType;
  interval?: number;
  rrule_schedule?: RRuleScheduleConfig;
}

/**
 * Hydrate {@link ScheduleFormData} from a pack (or per-query) SO slice. Legacy
 * packs that pre-date the schedule_type field deserialize to interval mode
 * with the form's default interval, matching the legacy form contract.
 */
export const deserializeSchedule = (
  input: DeserializeScheduleInput | undefined
): ScheduleFormData => {
  if (!input) return createDefaultScheduleFormData('interval');

  if (input.schedule_type === 'rrule' && input.rrule_schedule) {
    const startDate = resolveDate(input.rrule_schedule.start_date) ?? new Date();
    const endDate = resolveDate(input.rrule_schedule.end_date);

    let recurrence: RecurrenceFormState;
    try {
      recurrence = rruleFieldsToRecurrence(parseRRule(input.rrule_schedule.rrule));
    } catch {
      recurrence = createDefaultRecurrence();
    }

    // When the saved object has no end_date, seed the toggle-off placeholder
    // with `startDate + 1d` so flipping "Stop after" on lands in a valid
    // state (UNTIL must be strictly after DTSTART for the rule to ever fire).
    const ONE_DAY_MS = 24 * 60 * 60 * 1000;

    return {
      scheduleType: 'rrule',
      interval: DEFAULT_INTERVAL_SECONDS,
      startDate,
      stopAfter: {
        enabled: endDate !== undefined,
        date: endDate ?? new Date(startDate.getTime() + ONE_DAY_MS),
      },
      recurrence,
      splay: deserializeSplay(input.rrule_schedule.splay),
    };
  }

  // Interval mode (explicit or legacy fallback).
  const interval =
    typeof input.interval === 'number' && input.interval > 0
      ? input.interval
      : DEFAULT_INTERVAL_SECONDS;

  return {
    ...createDefaultScheduleFormData('interval'),
    interval,
  };
};

export { WEEKDAY_TOKENS };
