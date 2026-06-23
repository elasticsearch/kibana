/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { TypeOf } from '@kbn/config-schema';
import { schema } from '@kbn/config-schema';

export const significantItem = schema.object({
  key: schema.string({ maxLength: 10000 }),
  type: schema.oneOf([schema.literal('keyword'), schema.literal('log_pattern')]),
  fieldName: schema.string({ maxLength: 10000 }),
  fieldValue: schema.oneOf([schema.string({ maxLength: 10000 }), schema.number()]),
  doc_count: schema.number(),
  bg_count: schema.number(),
  total_doc_count: schema.number(),
  total_bg_count: schema.number(),
  score: schema.number(),
  pValue: schema.nullable(schema.number()),
  normalizedScore: schema.number(),
  histogram: schema.maybe(
    schema.arrayOf(
      schema.object({
        doc_count_overall: schema.number(),
        doc_count_significant_item: schema.number(),
        key: schema.number(),
        key_as_string: schema.string({ maxLength: 10000 }),
      }),
      { maxSize: 10000 }
    )
  ),
  unique: schema.maybe(schema.boolean()),
});

const overridesV2 = schema.object({
  loaded: schema.maybe(schema.number()),
  remainingFieldCandidates: schema.maybe(
    schema.arrayOf(schema.string({ maxLength: 10000 }), { maxSize: 10000 })
  ),
  significantItems: schema.maybe(schema.arrayOf(significantItem, { maxSize: 10000 })),
  regroupOnly: schema.maybe(schema.boolean()),
});

export const aiopsLogRateAnalysisBase = schema.object({
  start: schema.number(),
  end: schema.number(),
  searchQuery: schema.string({ maxLength: 10000 }),
  timeFieldName: schema.string({ maxLength: 10000 }),
  // when v2 is removed, includeFrozen should not carry over to v3+
  includeFrozen: schema.maybe(schema.boolean()),
  grouping: schema.maybe(schema.boolean()),
  /** Analysis selection time ranges */
  baselineMin: schema.number(),
  baselineMax: schema.number(),
  deviationMin: schema.number(),
  deviationMax: schema.number(),
  /** The index to query for log rate analysis */
  index: schema.string({ maxLength: 10000 }),
  /** Settings to override headers derived compression and flush fix */
  compressResponse: schema.maybe(schema.boolean()),
  flushFix: schema.maybe(schema.boolean()),
  /** Probability used for the random sampler aggregations */
  sampleProbability: schema.maybe(schema.number()),
  projectRouting: schema.maybe(schema.string({ maxLength: 10000 })),
});

export const aiopsLogRateAnalysisSchemaV2 = schema.intersection([
  aiopsLogRateAnalysisBase,
  /** Overrides to skip steps of the analysis with existing data */
  schema.object({ overrides: schema.maybe(overridesV2) }),
]);

export type AiopsLogRateAnalysisSchemaV2 = TypeOf<typeof aiopsLogRateAnalysisSchemaV2>;
export type AiopsLogRateAnalysisSchemaSignificantItem = TypeOf<typeof significantItem>;
