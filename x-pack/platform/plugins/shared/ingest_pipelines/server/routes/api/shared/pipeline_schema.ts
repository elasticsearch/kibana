/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema } from '@kbn/config-schema';

export const pipelineSchema = {
  description: schema.maybe(schema.string({ maxLength: 1000 })),
  processors: schema.arrayOf(schema.recordOf(schema.string(), schema.any()), { maxSize: 1000 }),
  version: schema.maybe(schema.number()),
  on_failure: schema.maybe(
    schema.arrayOf(schema.recordOf(schema.string(), schema.any()), { maxSize: 1000 })
  ),
  _meta: schema.maybe(schema.object({}, { unknowns: 'allow' })),
  field_access_pattern: schema.maybe(
    schema.oneOf([schema.literal('classic'), schema.literal('flexible')])
  ),
};
