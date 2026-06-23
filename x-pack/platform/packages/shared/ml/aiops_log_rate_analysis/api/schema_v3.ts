/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { TypeOf } from '@kbn/config-schema';
import { schema } from '@kbn/config-schema';

import { aiopsLogRateAnalysisBase, significantItem } from './schema_v2';

const overridesV3 = schema.object({
  loaded: schema.maybe(schema.number()),
  remainingKeywordFieldCandidates: schema.maybe(
    schema.arrayOf(schema.string({ maxLength: 10000 }), { maxSize: 10000 })
  ),
  remainingTextFieldCandidates: schema.maybe(
    schema.arrayOf(schema.string({ maxLength: 10000 }), { maxSize: 10000 })
  ),
  significantItems: schema.maybe(schema.arrayOf(significantItem, { maxSize: 10000 })),
  regroupOnly: schema.maybe(schema.boolean()),
});

export const aiopsLogRateAnalysisSchemaV3 = schema.intersection([
  aiopsLogRateAnalysisBase,
  /** Overrides to skip steps of the analysis with existing data */
  schema.object({ overrides: schema.maybe(overridesV3) }),
]);

export type AiopsLogRateAnalysisSchemaV3 = TypeOf<typeof aiopsLogRateAnalysisSchemaV3>;
export type AiopsLogRateAnalysisSchemaSignificantItem = TypeOf<typeof significantItem>;
