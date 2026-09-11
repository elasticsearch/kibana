/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema } from '@kbn/config-schema';
import {
  validateStartDateV1,
  validateEndDateV1,
  validateIntervalAndFrequencyV1,
  validateOnWeekDayV1,
  validateDurationV1,
  validateTimezoneV1,
  validateScheduleV1,
} from '../validation';
import { validateInteger } from '../validation/validate_integer/v1';
import { validateMonthDayV1 } from '../../r_rule/validation';

interface GetScheduleSchemaOptions {
  metaId?: string;
  recurringMetaId?: string;
  // Opt-in: consumers such as the alerting snooze API publish onMonthDay as 1-31 in their contracts.
  allowLastDayOfMonth?: boolean;
}

const MONTH_DAY_DESCRIPTION =
  'The specific days of the month for a recurring schedule. Valid values are 1-31.';

const LAST_DAY_OF_MONTH_DESCRIPTION =
  'The specific days of the month for a recurring schedule. Valid values are `1` to `31`, or `-1` for the last day of the month.';

const getRecurringRequestSchema = (
  recurringMetaId?: string,
  allowLastDayOfMonth: boolean = false
) =>
  schema.object(
    {
      end: schema.maybe(
        schema.string({
          validate: validateEndDateV1,
          maxLength: 100,
          meta: {
            description:
              'The end date of a recurring schedule, provided in ISO 8601 format and set to the UTC timezone. For example: `2025-04-01T00:00:00.000Z`.',
          },
        })
      ),
      every: schema.maybe(
        schema.string({
          validate: validateIntervalAndFrequencyV1,
          maxLength: 100,
          meta: {
            description:
              'The interval and frequency of a recurring schedule. It allows values in `<integer><unit>` format. `<unit>` is one of `d`, `w`, `M`, or `y` for days, weeks, months, years. For example: `15d`, `2w`, `3m`, `1y`.',
          },
        })
      ),
      onWeekDay: schema.maybe(
        schema.arrayOf(schema.string({ maxLength: 10 }), {
          minSize: 1,
          maxSize: 77,
          validate: validateOnWeekDayV1,
          meta: {
            description:
              'The specific days of the week (`[MO,TU,WE,TH,FR,SA,SU]`) or nth day of month (`[+1MO, -3FR, +2WE, -4SA, -5SU]`) for a recurring schedule.',
          },
        })
      ),
      onMonthDay: schema.maybe(
        schema.arrayOf(
          allowLastDayOfMonth
            ? schema.number({
                min: -1,
                max: 31,
                validate: (value: number) => validateMonthDayV1(value, 'schedule onMonthDay'),
              })
            : schema.number({
                min: 1,
                max: 31,
                validate: (value: number) => validateInteger(value, 'onMonthDay'),
              }),
          {
            minSize: 1,
            maxSize: 31,
            meta: {
              description: allowLastDayOfMonth
                ? LAST_DAY_OF_MONTH_DESCRIPTION
                : MONTH_DAY_DESCRIPTION,
            },
          }
        )
      ),
      onMonth: schema.maybe(
        schema.arrayOf(
          schema.number({
            min: 1,
            max: 12,
            validate: (value: number) => validateInteger(value, 'onMonth'),
          }),
          {
            minSize: 1,
            maxSize: 12,
            meta: {
              description: 'The specific months for a recurring schedule. Valid values are 1-12.',
            },
          }
        )
      ),
      occurrences: schema.maybe(
        schema.number({
          validate: (occurrences: number) => validateInteger(occurrences, 'occurrences'),
          min: 1,
          meta: {
            description: 'The total number of recurrences of the schedule.',
          },
        })
      ),
    },
    recurringMetaId ? { meta: { id: recurringMetaId } } : undefined
  );

export const getScheduleRequestSchema = ({
  metaId = 'schedule_request',
  recurringMetaId,
  allowLastDayOfMonth,
}: GetScheduleSchemaOptions = {}) =>
  schema.object(
    {
      start: schema.string({
        validate: validateStartDateV1,
        maxLength: 100,
        meta: {
          description:
            'The start date and time of the schedule, provided in ISO 8601 format and set to the UTC timezone. For example: `2025-03-12T12:00:00.000Z`.',
        },
      }),
      duration: schema.string({
        validate: validateDurationV1,
        maxLength: 100,
        meta: {
          description:
            'The duration of the schedule. It allows values in `<integer><unit>` format. `<unit>` is one of `d`, `h`, `m`, or `s` for hours, minutes, seconds. For example: `1d`, `5h`, `30m`, `5000s`.',
        },
      }),
      timezone: schema.maybe(
        schema.string({
          validate: validateTimezoneV1,
          maxLength: 64,
          meta: {
            description: 'The timezone of the schedule. The default timezone is UTC.',
          },
        })
      ),
      recurring: schema.maybe(getRecurringRequestSchema(recurringMetaId, allowLastDayOfMonth)),
    },
    {
      validate: validateScheduleV1,
      meta: { id: metaId },
    }
  );

export const scheduleRequestSchema = getScheduleRequestSchema();

const getRecurringResponseSchema = (
  recurringMetaId?: string,
  allowLastDayOfMonth: boolean = false
) =>
  schema.object(
    {
      end: schema.maybe(
        schema.string({
          meta: {
            description:
              'The end date of a recurring schedule, provided in ISO 8601 format and set to the UTC timezone. For example: `2025-04-01T00:00:00.000Z`.',
          },
        })
      ),
      every: schema.maybe(
        schema.string({
          meta: {
            description:
              'The interval and frequency of a recurring schedule. It allows values in `<integer><unit>` format. `<unit>` is one of `d`, `w`, `M`, or `y` for days, weeks, months, years. For example: `15d`, `2w`, `3m`, `1y`.',
          },
        })
      ),
      onWeekDay: schema.maybe(
        schema.arrayOf(schema.string({ maxLength: 10 }), {
          maxSize: 77,
          meta: {
            description:
              'The specific days of the week (`[MO,TU,WE,TH,FR,SA,SU]`) or nth day of month (`[+1MO, -3FR, +2WE, -4SA, -5SU]`) for a recurring schedule.',
          },
        })
      ),
      onMonthDay: schema.maybe(
        schema.arrayOf(schema.number(), {
          maxSize: 31,
          meta: {
            description: allowLastDayOfMonth
              ? LAST_DAY_OF_MONTH_DESCRIPTION
              : MONTH_DAY_DESCRIPTION,
          },
        })
      ),
      onMonth: schema.maybe(
        schema.arrayOf(schema.number(), {
          maxSize: 12,
          meta: {
            description: 'The specific months for a recurring schedule. Valid values are 1-12.',
          },
        })
      ),
      occurrences: schema.maybe(
        schema.number({
          meta: {
            description: 'The total number of recurrences of the schedule.',
          },
        })
      ),
    },
    recurringMetaId ? { meta: { id: recurringMetaId } } : undefined
  );

// The response schema has the same fields but without validation
export const getScheduleResponseSchema = ({
  metaId = 'schedule_response',
  recurringMetaId,
  allowLastDayOfMonth,
}: GetScheduleSchemaOptions = {}) =>
  schema.object(
    {
      start: schema.string({
        meta: {
          description:
            'The start date and time of the schedule, provided in ISO 8601 format and set to the UTC timezone. For example: `2025-03-12T12:00:00.000Z`.',
        },
      }),
      duration: schema.string({
        meta: {
          description:
            'The duration of the schedule. It allows values in `<integer><unit>` format. `<unit>` is one of `d`, `h`, `m`, or `s` for hours, minutes, seconds. For example: `1d`, `5h`, `30m`, `5000s`.',
        },
      }),
      timezone: schema.maybe(
        schema.string({
          meta: {
            description: 'The timezone of the schedule. The default timezone is UTC.',
          },
        })
      ),
      recurring: schema.maybe(getRecurringResponseSchema(recurringMetaId, allowLastDayOfMonth)),
    },
    { meta: { id: metaId } }
  );

export const scheduleResponseSchema = getScheduleResponseSchema();
