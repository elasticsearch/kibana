/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema } from '@kbn/config-schema';

const optionalString = schema.maybe(schema.string({ maxLength: 4096 }));
const optionalShortString = schema.maybe(schema.string({ maxLength: 256 }));

/**
 * Request body for `PUT .../data_sets/{id}`: {@link Dataset} (no top-level `name`;
 * the path supplies the id).
 */
export const datasetSchema = schema.object({
  data_source: schema.string({ maxLength: 256 }),
  resource: schema.string({ maxLength: 4096 }),
  description: optionalString,
  mappings: schema.maybe(
    schema.object({
      dynamic: schema.maybe(schema.oneOf([schema.literal('true'), schema.literal('false')])),
      properties: schema.recordOf(
        schema.string({ maxLength: 256 }),
        schema.object({
          type: schema.oneOf([
            schema.literal('keyword'),
            schema.literal('text'),
            schema.literal('long'),
            schema.literal('integer'),
            schema.literal('double'),
            schema.literal('boolean'),
            schema.literal('date'),
            schema.literal('unsigned_long'),
            schema.literal('ip'),
          ]),
          path: optionalShortString,
          format: optionalString,
        })
      ),
      _id: schema.maybe(
        schema.object({
          path: schema.string({ maxLength: 256 }),
        })
      ),
    })
  ),
  settings: schema.maybe(
    schema.object({
      format: schema.maybe(
        schema.oneOf([
          schema.literal('parquet'),
          schema.literal('csv'),
          schema.literal('tsv'),
          schema.literal('ndjson'),
          schema.literal('orc'),
        ])
      ),
      // Universal
      partition_detection: schema.maybe(
        schema.oneOf([schema.literal('auto'), schema.literal('hive'), schema.literal('none')])
      ),
      schema_resolution: schema.maybe(
        schema.oneOf([
          schema.literal('first_file_wins'),
          schema.literal('strict'),
          schema.literal('union_by_name'),
        ])
      ),
      partition_path: optionalString,
      hive_partitioning: schema.maybe(schema.boolean()),
      // CSV/TSV + NDJSON
      schema_sample_size: schema.maybe(schema.number({ min: 1 })),
      // CSV/TSV commonly changed
      delimiter: optionalString,
      mode: schema.maybe(
        schema.oneOf([schema.literal('quoted'), schema.literal('escaped'), schema.literal('plain')])
      ),
      header_row: schema.maybe(schema.boolean()),
      null_value: optionalString,
      encoding: optionalString,
      // CSV/TSV error handling
      error_mode: schema.maybe(
        schema.oneOf([
          schema.literal('fail_fast'),
          schema.literal('skip_row'),
          schema.literal('null_field'),
        ])
      ),
      max_errors: schema.maybe(schema.number({ min: 0 })),
      max_error_ratio: schema.maybe(schema.number({ min: 0, max: 1 })),
      // CSV/TSV advanced
      quote: optionalString,
      escape: optionalString,
      comment: optionalString,
      column_prefix: optionalString,
      datetime_format: optionalString,
      multi_value_syntax: schema.maybe(
        schema.oneOf([schema.literal('none'), schema.literal('brackets')])
      ),
      max_field_size: schema.maybe(schema.number({ min: 0 })),
      // NDJSON advanced
      segment_size: optionalString,
      // Parquet advanced
      optimized_reader: schema.maybe(schema.boolean()),
      late_materialization: schema.maybe(schema.boolean()),
      // API-only (not shown in the UI)
      target_split_size: optionalString,
    })
  ),
});
