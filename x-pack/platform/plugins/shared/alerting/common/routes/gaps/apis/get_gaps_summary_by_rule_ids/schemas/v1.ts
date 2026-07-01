/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import { schema } from '@kbn/config-schema';
import { optionalExcludedGapReasonsSchema } from '../../../../../schemas';
import { MAX_ID_LENGTH, MAX_ARRAY_FIELDS, ISO_DATE_MAX_LENGTH } from '../../../../../constants';

export const getGapsSummaryByRuleIdsBodySchema = schema.object(
  {
    end: schema.string({ maxLength: ISO_DATE_MAX_LENGTH }),
    start: schema.string({ maxLength: ISO_DATE_MAX_LENGTH }),
    rule_ids: schema.arrayOf(schema.string({ maxLength: MAX_ID_LENGTH }), {
      maxSize: MAX_ARRAY_FIELDS,
    }),
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

export const getGapsSummaryByRuleIdsResponseSchema = schema.object(
  {
    data: schema.arrayOf(
      schema.object({
        rule_id: schema.string(),
        total_unfilled_duration_ms: schema.number(),
        total_in_progress_duration_ms: schema.number(),
        total_filled_duration_ms: schema.number(),
        gap_fill_status: schema.maybe(schema.string()),
      })
    ),
  },
  { meta: { id: 'get_gaps_summary_by_rule_ids_response' } }
);
