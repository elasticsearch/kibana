/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Evaluator } from '@kbn/evals';
import type { EnrichTaxonomyExample, TaxonomyResponse } from '../types';

/**
 * Fraction of the labelled set that appears in the model output (recall), or
 * `null` when there is nothing to recall.
 *
 * An empty labelled set must be `null`, not `1`: score docs are aggregated with
 * `extended_stats`, which skips nulls but averages in 1s, so returning `1` for
 * "no labels to recall" would silently inflate the evaluator mean. `null` drops
 * the example from the mean instead. Callers surface it as an `N/A` result.
 */
const recall = (expected: string[] | undefined, actual: string[] | undefined): number | null => {
  if (!expected || expected.length === 0) return null;
  if (!Array.isArray(actual)) return 0;
  const actualSet = new Set(actual);
  const hits = expected.filter((value) => actualSet.has(value)).length;
  return hits / expected.length;
};

/**
 * CODE evaluator: recall of the labelled categories. Recall (not exact match)
 * because a model returning a reasonable superset should not be penalised;
 * missing a labelled category is the failure we care about.
 */
export const createCategoryRecallEvaluator = (): Evaluator<
  EnrichTaxonomyExample,
  TaxonomyResponse
> => ({
  name: 'CategoryRecall',
  kind: 'CODE',
  direction: 'maximize',
  evaluate: async ({ output, expected }) => {
    const score = recall(expected?.categories, output?.categories);
    if (score === null) {
      return { score: null, label: 'N/A', explanation: 'No labelled categories to recall' };
    }
    return { score, label: `recall_${score.toFixed(2)}` };
  },
});

/**
 * CODE evaluator: recall of the labelled regions.
 */
export const createRegionRecallEvaluator = (): Evaluator<
  EnrichTaxonomyExample,
  TaxonomyResponse
> => ({
  name: 'RegionRecall',
  kind: 'CODE',
  direction: 'maximize',
  evaluate: async ({ output, expected }) => {
    const score = recall(expected?.regions, output?.regions);
    if (score === null) {
      return { score: null, label: 'N/A', explanation: 'No labelled regions to recall' };
    }
    return { score, label: `recall_${score.toFixed(2)}` };
  },
});
