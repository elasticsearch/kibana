/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import { schema } from '@kbn/config-schema';
import { gapFillStatus, gapStatus } from '../../../../../constants';
import { optionalExcludedGapReasonsSchema } from '../../../../../schemas';
import { MAX_ID_LENGTH, ISO_DATE_MAX_LENGTH } from '../../../../../constants';

export const getRuleIdsWithGapBodySchema = schema.object(
  {
    end: schema.string({ maxLength: ISO_DATE_MAX_LENGTH }),
    start: schema.string({ maxLength: ISO_DATE_MAX_LENGTH }),
    // Filters the underlying gap documents before aggregation. Matches the raw
    // per-gap statuses.
    statuses: schema.maybe(
      schema.arrayOf(
        schema.oneOf([
          schema.literal(gapStatus.UNFILLED),
          schema.literal(gapStatus.PARTIALLY_FILLED),
          schema.literal(gapStatus.FILLED),
        ]),
        { maxSize: 3 }
      )
    ),
    // Filters by the derived, per-rule status that is calculated from gap
    // duration sums (unfilled > in_progress > filled precedence).
    highest_priority_gap_fill_statuses: schema.maybe(
      schema.arrayOf(
        schema.oneOf([
          schema.literal(gapFillStatus.UNFILLED),
          schema.literal(gapFillStatus.IN_PROGRESS),
          schema.literal(gapFillStatus.FILLED),
          schema.literal(gapFillStatus.ERROR),
        ]),
        { maxSize: 4 }
      )
    ),
    has_unfilled_intervals: schema.maybe(schema.boolean()),
    has_in_progress_intervals: schema.maybe(schema.boolean()),
    has_filled_intervals: schema.maybe(schema.boolean()),
    sort_order: schema.maybe(schema.oneOf([schema.literal('asc'), schema.literal('desc')])),
    excluded_reasons: optionalExcludedGapReasonsSchema,
    gap_auto_fill_scheduler_id: schema.maybe(schema.string({ maxLength: MAX_ID_LENGTH })),
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

      if (parsedStart >= parsedEnd) {
        return `[start]: query start must be before end`;
      }
    },
  }
);

export const gapsSummarySchema = schema.object(
  {
    total_unfilled_duration_ms: schema.number(),
    total_in_progress_duration_ms: schema.number(),
    total_filled_duration_ms: schema.number(),
    total_error_duration_ms: schema.number(),
    total_duration_ms: schema.number(),
    rules_by_gap_fill_status: schema.object({
      unfilled: schema.number(),
      in_progress: schema.number(),
      filled: schema.number(),
      error: schema.number(),
    }),
  },
  { meta: { id: 'gaps_summary' } }
);

export const getRuleIdsWithGapResponseSchema = schema.object(
  {
    total: schema.number(),
    rule_ids: schema.arrayOf(schema.string()),
    latest_gap_timestamp: schema.maybe(schema.number()),
    summary: gapsSummarySchema,
  },
  { meta: { id: 'get_rules_with_gaps_response' } }
);
