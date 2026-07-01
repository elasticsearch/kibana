/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import { schema } from '@kbn/config-schema';
import dateMath from '@kbn/datemath';
import {
  MAX_SCHEDULE_BACKFILL_LOOKBACK_WINDOW_DAYS,
  gapAutoFillSchedulerLimits,
  MAX_ID_LENGTH,
  MAX_NAME_LENGTH,
  MAX_ARRAY_FIELDS,
  MAX_FIELD_NAME_LENGTH,
  MAX_DURATION_STRING_LENGTH,
  ISO_DATE_MAX_LENGTH,
} from '../../../../../constants';
import { parseDuration } from '../../../../../parse_duration';
import { optionalExcludedGapReasonsSchema } from '../../../../../schemas';

const { maxBackfills, numRetries, minScheduleIntervalInMs } = gapAutoFillSchedulerLimits;

const validateGapAutoFillSchedulerPayload = (
  gapFillRange: string,
  schedule: { interval: string },
  ruleTypes: { type: string; consumer: string }[]
) => {
  const now = new Date();
  const parsed = dateMath.parse(gapFillRange, { forceNow: now });
  if (!parsed || !parsed.isValid()) {
    return 'gap_fill_range is invalid';
  }

  const maxLookbackExpression = `now-${MAX_SCHEDULE_BACKFILL_LOOKBACK_WINDOW_DAYS}d`;
  const lookbackLimit = dateMath.parse(maxLookbackExpression, { forceNow: now });
  if (!lookbackLimit || !lookbackLimit.isValid()) {
    return 'gap_fill_range is invalid';
  }

  if (parsed.isBefore(lookbackLimit)) {
    return `gap_fill_range cannot look back more than ${MAX_SCHEDULE_BACKFILL_LOOKBACK_WINDOW_DAYS} days`;
  }

  try {
    const intervalMs = parseDuration(schedule.interval);
    if (intervalMs < minScheduleIntervalInMs) {
      return 'schedule.interval must be at least 1 minute';
    }
  } catch (error) {
    return `schedule.interval is invalid: ${(error as Error).message}`;
  }

  // Duplicate check for rule_types
  const seen = new Set<string>();
  for (const ruleType of ruleTypes) {
    const key = `${ruleType.type}:${ruleType.consumer}`;
    if (seen.has(key)) {
      return `rule_types contains duplicate entry: type="${ruleType.type}" consumer="${ruleType.consumer}"`;
    }
    seen.add(key);
  }
};

export const getGapAutoFillSchedulerParamsSchema = schema.object({
  id: schema.string({ maxLength: MAX_ID_LENGTH }),
});

export const gapAutoFillSchedulerBodySchema = schema.object(
  {
    id: schema.maybe(schema.string({ maxLength: MAX_ID_LENGTH })),
    name: schema.string({ defaultValue: '', maxLength: MAX_NAME_LENGTH }),
    enabled: schema.boolean({ defaultValue: true }),
    max_backfills: schema.number(maxBackfills),
    num_retries: schema.number(numRetries),
    gap_fill_range: schema.string({
      defaultValue: 'now-90d',
      maxLength: MAX_DURATION_STRING_LENGTH,
    }),
    schedule: schema.object({
      interval: schema.string({ maxLength: MAX_DURATION_STRING_LENGTH }),
    }),
    scope: schema.arrayOf(schema.string({ maxLength: MAX_ID_LENGTH }), {
      maxSize: MAX_ARRAY_FIELDS,
    }),
    rule_types: schema.arrayOf(
      schema.object({
        type: schema.string({ maxLength: MAX_FIELD_NAME_LENGTH }),
        consumer: schema.string({ maxLength: MAX_NAME_LENGTH }),
      }),
      { maxSize: MAX_ARRAY_FIELDS }
    ),
    excluded_reasons: optionalExcludedGapReasonsSchema,
  },
  {
    validate(payload) {
      return validateGapAutoFillSchedulerPayload(
        payload.gap_fill_range,
        payload.schedule,
        payload.rule_types
      );
    },
  }
);

export const gapAutoFillSchedulerUpdateBodySchema = schema.object(
  {
    name: schema.string({ maxLength: MAX_NAME_LENGTH }),
    enabled: schema.boolean(),
    gap_fill_range: schema.string({ maxLength: MAX_DURATION_STRING_LENGTH }),
    max_backfills: schema.number(maxBackfills),
    num_retries: schema.number(numRetries),
    schedule: schema.object({
      interval: schema.string({ maxLength: MAX_DURATION_STRING_LENGTH }),
    }),
    scope: schema.arrayOf(schema.string({ maxLength: MAX_ID_LENGTH }), {
      maxSize: MAX_ARRAY_FIELDS,
    }),
    rule_types: schema.arrayOf(
      schema.object({
        type: schema.string({ maxLength: MAX_FIELD_NAME_LENGTH }),
        consumer: schema.string({ maxLength: MAX_NAME_LENGTH }),
      }),
      { maxSize: MAX_ARRAY_FIELDS }
    ),
    excluded_reasons: optionalExcludedGapReasonsSchema,
  },
  {
    validate(payload) {
      return validateGapAutoFillSchedulerPayload(
        payload.gap_fill_range,
        payload.schedule,
        payload.rule_types
      );
    },
  }
);

export const gapAutoFillSchedulerResponseSchema = schema.object({
  id: schema.string(),
  name: schema.string(),
  enabled: schema.boolean(),
  schedule: schema.object({
    interval: schema.string(),
  }),
  rule_types: schema.arrayOf(
    schema.object({
      type: schema.string(),
      consumer: schema.string(),
    })
  ),
  gap_fill_range: schema.string(),
  max_backfills: schema.number(),
  num_retries: schema.number(),
  scope: schema.arrayOf(schema.string()),
  excluded_reasons: schema.maybe(schema.arrayOf(schema.string())),
  created_by: schema.nullable(schema.string()),
  updated_by: schema.nullable(schema.string()),
  created_at: schema.string(),
  updated_at: schema.string(),
});

export const gapAutoFillSchedulerLogsRequestQuerySchema = schema.object(
  {
    start: schema.string({ maxLength: ISO_DATE_MAX_LENGTH }),
    end: schema.string({ maxLength: ISO_DATE_MAX_LENGTH }),
    page: schema.number({ defaultValue: 1, min: 1 }),
    per_page: schema.number({ defaultValue: 50, min: 1, max: 1000 }),
    sort_field: schema.oneOf([schema.literal('@timestamp')], { defaultValue: '@timestamp' }),
    sort_direction: schema.oneOf([schema.literal('asc'), schema.literal('desc')], {
      defaultValue: 'desc',
    }),
    statuses: schema.maybe(
      schema.arrayOf(
        schema.oneOf([
          schema.literal('success'),
          schema.literal('error'),
          schema.literal('skipped'),
          schema.literal('no_gaps'),
        ]),
        { maxSize: 4 }
      )
    ),
  },
  {
    validate({ start, end }) {
      const parsedStart = Date.parse(start);
      if (isNaN(parsedStart)) {
        return `[start]: query start must be valid date`;
      }

      const parsedEnd = Date.parse(end);
      if (isNaN(parsedEnd)) {
        return `[end]: query end must be valid date`;
      }
    },
  }
);

export const gapAutoFillSchedulerLogEntrySchema = schema.object({
  id: schema.string(),
  timestamp: schema.maybe(schema.string()),
  status: schema.maybe(schema.string()),
  message: schema.maybe(schema.string()),
  results: schema.maybe(
    schema.arrayOf(
      schema.object({
        rule_id: schema.maybe(schema.string()),
        processed_gaps: schema.maybe(schema.number()),
        status: schema.maybe(schema.string()),
        error: schema.maybe(schema.string()),
      })
    )
  ),
});

export const gapAutoFillSchedulerLogsResponseSchema = schema.object({
  data: schema.arrayOf(gapAutoFillSchedulerLogEntrySchema),
  total: schema.number(),
  page: schema.number(),
  per_page: schema.number(),
});

export const findGapAutoFillSchedulerLogsParamsSchema = schema.object({
  id: schema.string({ maxLength: MAX_ID_LENGTH }),
});
