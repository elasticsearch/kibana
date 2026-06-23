/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema } from '@kbn/config-schema';

export const calendarSchema = schema.object({
  calendarId: schema.string({ maxLength: 10000 }),
  calendar_id: schema.maybe(schema.string({ maxLength: 10000 })),
  job_ids: schema.arrayOf(schema.string({ maxLength: 10000 }), { maxSize: 10000 }),
  description: schema.maybe(schema.string({ maxLength: 10000 })),
  total_job_count: schema.maybe(schema.number()),
  events: schema.arrayOf(
    schema.object({
      event_id: schema.maybe(schema.string({ maxLength: 10000 })),
      calendar_id: schema.maybe(schema.string({ maxLength: 10000 })),
      description: schema.maybe(schema.string({ maxLength: 10000 })),
      start_time: schema.oneOf([schema.string({ maxLength: 10000 }), schema.number()]),
      end_time: schema.oneOf([schema.string({ maxLength: 10000 }), schema.number()]),
      skip_result: schema.maybe(schema.boolean()),
      skip_model_update: schema.maybe(schema.boolean()),
      force_time_shift: schema.maybe(schema.number()),
    }),
    { maxSize: 10000 }
  ),
});

export const calendarIdSchema = schema.object({ calendarId: schema.string({ maxLength: 10000 }) });

export const calendarIdsSchema = schema.object({
  calendarIds: schema.string({
    maxLength: 10000,
    meta: { description: 'Comma-separated list of calendar IDs' },
  }),
});
