/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Evaluator, Example } from '@kbn/evals';
import { selectEvaluators } from '@kbn/evals';

/** One investigator invocation in a sequential "detections over time" run. */
export interface ContinuationCycle {
  /** rule_name of the detection fed this cycle — for human-readable explanations only. */
  ruleName?: string;
  /** discovery_slug(s) the agent emitted this cycle (one per produced discovery). */
  producedSlugs: string[];
}

export interface ContinuationStabilityResult {
  /** Fraction of post-establishing cycles that reused an already-seen slug; null when not gradable. */
  score: number | null;
  /** Cycles after the establishing cycle that reused a prior slug. */
  reusedCycles: number;
  /** Cycles after the establishing cycle that were gradable (produced at least one slug). */
  comparableCycles: number;
  /** Distinct slugs across the whole run — ideal is 1 for a single cascade. */
  distinctSlugs: number;
  explanation: string;
}

/**
 * Score whether related detections arriving one-at-a-time fold into the SAME slug rather than
 * proliferating new ones. score = reusedCycles / comparableCycles (a cycle is "reused" when any slug
 * it produced was already seen). Null when there are fewer than two gradable cycles.
 */
export function scoreContinuationStability(
  cycles: ContinuationCycle[]
): ContinuationStabilityResult {
  const seen = new Set<string>();
  const allSlugs = new Set<string>();
  let reusedCycles = 0;
  let comparableCycles = 0;
  let establishedFirstCycle = false;

  cycles.forEach((cycle) => {
    const slugs = cycle.producedSlugs.filter(Boolean);

    if (!establishedFirstCycle) {
      // The establishing cycle seeds the "seen" set; it is never graded for reuse. Skip empty
      // leading cycles so the first cycle that actually produces a slug establishes the episode.
      if (slugs.length > 0) {
        slugs.forEach((slug) => {
          seen.add(slug);
          allSlugs.add(slug);
        });
        establishedFirstCycle = true;
      }
      return;
    }

    comparableCycles += 1;
    const reused = slugs.some((slug) => seen.has(slug));
    if (reused) {
      reusedCycles += 1;
    }
    slugs.forEach((slug) => {
      seen.add(slug);
      allSlugs.add(slug);
    });
  });

  if (comparableCycles === 0) {
    return {
      score: null,
      reusedCycles: 0,
      comparableCycles: 0,
      distinctSlugs: allSlugs.size,
      explanation:
        'Fewer than two gradable cycles — nothing to continue (need an establishing cycle plus at least one follow-up)',
    };
  }

  const score = reusedCycles / comparableCycles;
  return {
    score,
    reusedCycles,
    comparableCycles,
    distinctSlugs: allSlugs.size,
    explanation:
      `${reusedCycles}/${comparableCycles} follow-up cycle(s) reused an established slug ` +
      `(${allSlugs.size} distinct slug(s) across the run; ideal is 1 for a single cascade)`,
  };
}

/** Output shape produced by the sequential "continuation over time" investigator task. */
export interface ContinuationStabilityOutput {
  cycles: ContinuationCycle[];
}

export type ContinuationEvaluator = Evaluator<Example, ContinuationStabilityOutput>;

/** CODE evaluator: scores whether re-arriving detections reuse one stable slug. Score = reused / comparable cycles. */
export const continuationStabilityEvaluator: ContinuationEvaluator = {
  name: 'continuation_stability',
  kind: 'CODE',
  evaluate: ({ output }) => Promise.resolve(scoreContinuationStability(output.cycles ?? [])),
};

/** Factory mirroring `createInvestigatorEvaluators` so the spec wires it the same way. */
export const createContinuationEvaluators = (): ContinuationEvaluator[] =>
  selectEvaluators([continuationStabilityEvaluator]);
