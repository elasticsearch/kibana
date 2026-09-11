/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Evaluator } from '@kbn/evals';
import type { AssessRelevanceExample, RelevanceResponse } from '../types';

/**
 * CODE evaluator: the `is_intelligence` verdict must match the label. This is
 * the load-bearing gate for the whole pipeline (a false negative drops a real
 * report; a false positive spends model budget on noise).
 */
export const createIsIntelligenceEvaluator = (): Evaluator<
  AssessRelevanceExample,
  RelevanceResponse
> => ({
  name: 'IsIntelligenceMatch',
  kind: 'CODE',
  direction: 'maximize',
  evaluate: async ({ output, expected }) => {
    if (typeof output?.is_intelligence !== 'boolean') {
      return { score: 0, label: 'missing_is_intelligence' };
    }
    const match = output.is_intelligence === expected?.is_intelligence;
    return { score: match ? 1 : 0, label: match ? 'match' : 'mismatch' };
  },
});

const QUALITY_CLASSES = ['intel', 'marketing', 'rollup', 'thought_leadership'];
const EVIDENCE_TIERS = ['primary', 'pointer', 'mixed'];

/**
 * CODE evaluator: the response must be structurally well-formed (enums in
 * range, required fields present). Catches schema drift independently of the
 * semantic verdict.
 */
export const createRelevanceShapeEvaluator = (): Evaluator<
  AssessRelevanceExample,
  RelevanceResponse
> => ({
  name: 'RelevanceShapeValid',
  kind: 'CODE',
  direction: 'maximize',
  evaluate: async ({ output }) => {
    const valid =
      typeof output?.is_intelligence === 'boolean' &&
      QUALITY_CLASSES.includes(output?.quality_class) &&
      EVIDENCE_TIERS.includes(output?.evidence_tier) &&
      typeof output?.needs_render === 'boolean' &&
      Array.isArray(output?.primary_links) &&
      typeof output?.has_original_commentary === 'boolean' &&
      typeof output?.reason === 'string';
    return { score: valid ? 1 : 0, label: valid ? 'valid' : 'invalid' };
  },
});
