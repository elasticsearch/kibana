/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema } from '@kbn/config-schema';
import { GAP_AUTO_FILL_STATUS } from '../../../../../../../common/constants';

const statusValues = Object.values(GAP_AUTO_FILL_STATUS);

export const findGapAutoFillSchedulerLogsParamsSchema = schema.object({
  id: schema.string(),
  start: schema.string(),
  end: schema.string(),
  page: schema.number({ defaultValue: 1, min: 1 }),
  perPage: schema.number({ defaultValue: 50, min: 1, max: 100 }),
  sortField: schema.oneOf([schema.literal('@timestamp')], { defaultValue: '@timestamp' }),
  sortDirection: schema.oneOf([schema.literal('asc'), schema.literal('desc')], {
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
      { maxSize: statusValues.length }
    )
  ),
});

export const gapAutoFillSchedulerLogEntrySchema = schema.object({
  id: schema.string(),
  timestamp: schema.maybe(schema.string()),
  status: schema.maybe(schema.string()),
  message: schema.maybe(schema.string()),
  results: schema.maybe(
    schema.arrayOf(
      schema.object({
        ruleId: schema.maybe(schema.string()),
        processedGaps: schema.maybe(schema.number()),
        status: schema.maybe(schema.string()),
        error: schema.maybe(schema.string()),
      })
    )
  ),
});

export const gapAutoFillSchedulerLogsResultSchema = schema.object({
  data: schema.arrayOf(gapAutoFillSchedulerLogEntrySchema),
  total: schema.number(),
  page: schema.number(),
  perPage: schema.number(),
});
