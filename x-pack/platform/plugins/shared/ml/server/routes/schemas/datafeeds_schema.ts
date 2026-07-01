/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema } from '@kbn/config-schema';

export const startDatafeedSchema = schema.object({
  start: schema.maybe(schema.oneOf([schema.number(), schema.string({ maxLength: 10000 })])),
  end: schema.maybe(schema.oneOf([schema.number(), schema.string({ maxLength: 10000 })])),
  timeout: schema.maybe(schema.any()),
});

export const indicesOptionsSchema = schema.object({
  expand_wildcards: schema.maybe(
    schema.arrayOf(
      schema.oneOf([
        schema.literal('all'),
        schema.literal('open'),
        schema.literal('closed'),
        schema.literal('hidden'),
        schema.literal('none'),
      ]),
      { maxSize: 10000 }
    )
  ),
  ignore_unavailable: schema.maybe(schema.boolean()),
  allow_no_indices: schema.maybe(schema.boolean()),
  // retaining the deprecated ignore_throttled in case an older jobs are used
  // we don't want to fail the schema validation if this is present
  ignore_throttled: schema.maybe(schema.boolean()),
  failure_store: schema.maybe(schema.string({ maxLength: 10000 })),
});

export const datafeedConfigSchema = schema.object({
  datafeed_id: schema.maybe(schema.string({ maxLength: 10000 })),
  feed_id: schema.maybe(schema.string({ maxLength: 10000 })),
  aggregations: schema.maybe(schema.any()),
  aggs: schema.maybe(schema.any()),
  chunking_config: schema.maybe(
    schema.object({
      mode: schema.oneOf([schema.literal('auto'), schema.literal('manual'), schema.literal('off')]),
      time_span: schema.maybe(schema.oneOf([schema.string({ maxLength: 10000 }), schema.number()])),
    })
  ),
  frequency: schema.maybe(schema.string({ maxLength: 10000 })),
  indices: schema.maybe(schema.arrayOf(schema.string({ maxLength: 10000 }), { maxSize: 10000 })),
  indexes: schema.maybe(schema.arrayOf(schema.string({ maxLength: 10000 }), { maxSize: 10000 })),
  job_id: schema.maybe(schema.string({ maxLength: 10000 })),
  query: schema.maybe(schema.any()),
  max_empty_searches: schema.maybe(schema.number()),
  query_delay: schema.maybe(schema.string({ maxLength: 10000 })),
  script_fields: schema.maybe(schema.any()),
  runtime_mappings: schema.maybe(schema.any()),
  project_routing: schema.maybe(schema.string()),
  scroll_size: schema.maybe(schema.number()),
  delayed_data_check_config: schema.maybe(schema.any()),
  indices_options: schema.maybe(indicesOptionsSchema),
});

export const datafeedIdSchema = schema.object({ datafeedId: schema.string({ maxLength: 10000 }) });

export const deleteDatafeedQuerySchema = schema.object({ force: schema.maybe(schema.boolean()) });
