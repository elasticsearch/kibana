/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema } from '@kbn/config-schema';
import { runtimeMappingsSchema } from './runtime_mappings_schema';

export const indexPatternSchema = schema.object({
  /** Pattern of index or indices for which to return stats. */
  indexPattern: schema.string({ maxLength: 10000 }),
});

const querySchemaBasic = {
  query: schema.any({ meta: { description: 'Query to match documents in the index' } }),
};

export const dataVisualizerFieldHistogramsSchema = schema.object({
  ...querySchemaBasic,
  /** The fields to return histogram data. */
  fields: schema.arrayOf(schema.any(), { maxSize: 10000 }),
  /** Number of documents to be collected in the sample processed on each shard, or -1 for no sampling. */
  samplerShardSize: schema.number(),
  /** Optional search time runtime fields */
  runtimeMappings: runtimeMappingsSchema,
  /** Optional project routing */
  projectRouting: schema.maybe(schema.string({ maxLength: 10000 })),
});

export const dataVisualizerFieldStatsSchema = schema.object({
  /** Query to match documents in the index. */
  query: schema.any(),
  fields: schema.arrayOf(schema.any(), { maxSize: 10000 }),
  /** Number of documents to be collected in the sample processed on each shard, or -1 for no sampling. */
  samplerShardSize: schema.number(),
  /** Name of the time field in the index (optional). */
  timeFieldName: schema.maybe(schema.string({ maxLength: 10000 })),
  /** Earliest timestamp for search, as epoch ms (optional). */
  earliest: schema.maybe(schema.number()),
  /** Latest timestamp for search, as epoch ms (optional). */
  latest: schema.maybe(schema.number()),
  /** Aggregation interval, in milliseconds, to use for obtaining document counts over time (optional). */
  interval: schema.maybe(schema.number()),
  /** Maximum number of examples to return for text type fields.  */
  maxExamples: schema.number(),
  /** Optional search time runtime fields */
  runtimeMappings: runtimeMappingsSchema,
});

export const dataVisualizerOverallStatsSchema = schema.object({
  /** Query to match documents in the index. */
  query: schema.any(),
  /** Names of aggregatable fields for which to return stats. */
  aggregatableFields: schema.arrayOf(schema.string({ maxLength: 10000 }), { maxSize: 10000 }),
  /** Names of non-aggregatable fields for which to return stats. */
  nonAggregatableFields: schema.arrayOf(schema.string({ maxLength: 10000 }), { maxSize: 10000 }),
  /** Number of documents to be collected in the sample processed on each shard, or -1 for no sampling. */
  samplerShardSize: schema.number(),
  /** Name of the time field in the index (optional). */
  timeFieldName: schema.maybe(schema.string({ maxLength: 10000 })),
  /** Earliest timestamp for search, as epoch ms (optional). */
  earliest: schema.maybe(schema.number()),
  /** Latest timestamp for search, as epoch ms (optional). */
  latest: schema.maybe(schema.number()),
  /** Optional search time runtime fields */
  runtimeMappings: runtimeMappingsSchema,
});

export const dataVisualizerFieldHistogramsResponse = () => {
  return schema.any();
};
