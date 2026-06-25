/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Type } from '@kbn/config-schema';
import { schema } from '@kbn/config-schema';
import { INPUT_TYPES, TASK_STATUSES } from '../constants';
import { MAX_ID_LENGTH, MAX_VERSION_LENGTH, MIN_VERSION_LENGTH } from './constants';

export const dataStreamSchemaV1 = schema.object({
  integration_id: schema.string({ maxLength: MAX_ID_LENGTH, minLength: 1 }),
  data_stream_id: schema.string({ maxLength: MAX_ID_LENGTH, minLength: 1 }),
  created_by: schema.string({ minLength: 1 }),
  title: schema.string(),
  description: schema.string(),
  input_types: schema.arrayOf(
    schema.oneOf(
      Object.values(INPUT_TYPES).map((status) => schema.literal(status)) as [Type<string>]
    ),
    {
      minSize: 1,
      maxSize: 100,
    }
  ),
  job_info: schema.object({
    job_id: schema.string({ maxLength: MAX_ID_LENGTH, minLength: 1 }),
    job_type: schema.string({ maxLength: MAX_ID_LENGTH, minLength: 1 }), // TODO: Add Enum
    status: schema.oneOf(
      Object.values(TASK_STATUSES).map((status) => schema.literal(status)) as [Type<string>]
    ),
    phase: schema.maybe(schema.string()),
  }),
  metadata: schema.object(
    {
      sample_count: schema.maybe(schema.number()),
      created_at: schema.maybe(schema.string({ minLength: 1 })),
      version: schema.maybe(
        schema.string({
          minLength: MIN_VERSION_LENGTH,
          maxLength: MAX_VERSION_LENGTH,
          validate(value) {
            if (!/^\d+\.\d+\.\d+$/.test(value)) {
              return 'version must be in semantic versioning format (x.y.z)';
            }
          },
        })
      ),
      original_source: schema.maybe(
        schema.object({
          source_type: schema.oneOf([schema.literal('file'), schema.literal('index')]),
          source_value: schema.string({ minLength: 1, maxLength: 512 }),
        })
      ),
    },
    { unknowns: 'allow' }
  ),
  result: schema.maybe(
    schema.object({
      ingest_pipeline: schema.maybe(
        schema.object({
          processors: schema.arrayOf(schema.object({}, { unknowns: 'allow' }), { maxSize: 10000 }),
          on_failure: schema.maybe(
            schema.arrayOf(schema.object({}, { unknowns: 'allow' }), { maxSize: 10000 })
          ),
          name: schema.maybe(schema.string()),
        })
      ),
      field_mapping: schema.maybe(
        schema.arrayOf(
          schema.object({
            name: schema.string(),
            type: schema.string(),
            is_ecs: schema.boolean(),
          }),
          { maxSize: 10000 }
        )
      ),
      connector: schema.maybe(schema.string()),
      pipeline_docs: schema.maybe(
        schema.arrayOf(schema.object({}, { unknowns: 'allow' }), { maxSize: 100 })
      ),
    })
  ),
});
