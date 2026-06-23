/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema } from '@kbn/config-schema';
import { runtimeMappingsSchema } from './runtime_mappings_schema';
import { indicesOptionsSchema } from './datafeeds_schema';

const indexPatternSchema = {
  index: schema.oneOf(
    [
      schema.string({ maxLength: 10000 }),
      schema.arrayOf(schema.string({ maxLength: 10000 }), { maxSize: 10000 }),
    ],
    {
      meta: { description: 'Index or indexes for which to return the time range.' },
    }
  ),
};

const querySchema = {
  query: schema.maybe(
    schema.any({ meta: { description: 'Query to match documents in the index(es).' } })
  ),
};

const timeFieldNameSchema = {
  timeFieldName: schema.maybe(
    schema.string({
      maxLength: 10000,
      meta: { description: 'Name of the time field in the index' },
    })
  ),
};

export const getCardinalityOfFieldsSchema = schema.object({
  ...indexPatternSchema,
  fieldNames: schema.maybe(
    schema.arrayOf(schema.string({ maxLength: 10000 }), {
      maxSize: 10000,
      meta: { description: 'Name(s) of the field(s) to return cardinality information.' },
    })
  ),
  ...querySchema,
  ...timeFieldNameSchema,
  earliestMs: schema.maybe(
    schema.oneOf([schema.number(), schema.string({ maxLength: 10000 })], {
      meta: { description: 'Earliest timestamp for search, as epoch ms' },
    })
  ),
  latestMs: schema.maybe(
    schema.oneOf([schema.number(), schema.string({ maxLength: 10000 })], {
      meta: { description: 'Latest timestamp for search, as epoch ms' },
    })
  ),
});

export const getTimeFieldRangeSchema = schema.object({
  ...indexPatternSchema,
  ...timeFieldNameSchema,
  ...querySchema,
  runtimeMappings: runtimeMappingsSchema,
  indicesOptions: indicesOptionsSchema,
  allowFutureTime: schema.maybe(
    schema.boolean({ meta: { description: 'Return times from the future' } })
  ),
  projectRouting: schema.maybe(schema.string({ maxLength: 10000 })),
});

export const getCardinalityOfFieldsResponse = () => {
  return schema.recordOf(schema.string({ maxLength: 10000 }), schema.number());
};

export const getTimeFieldRangeResponse = () => {
  return schema.object({
    start: schema.number(),
    end: schema.number(),
    success: schema.boolean(),
  });
};
