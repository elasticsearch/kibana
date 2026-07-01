/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

// Intentionally copied from @kbn/evals — pending future extraction to @kbn/evals-common.

import type { CorrectnessAnalysis } from './types';

// Scoring weights based on the severity of each error type
const CLAIM_FACTUAL_SCORE_MAP = {
  FULLY_SUPPORTED: 1.0,
  PARTIALLY_SUPPORTED: {
    central: 0.9,
    peripheral: 0.95,
  },
  CONTRADICTED: {
    central: 0.0,
    peripheral: 0.1,
  },
  NOT_IN_GROUND_TRUTH: {
    central: 0.1,
    peripheral: 0.5,
  },
} as const;

/**
 * Calculates the Factual Accuracy score using geometric mean of individual claim scores.
 *
 * This function computes the geometric mean of the scores assigned to each claim,
 * ensuring that a single critically incorrect claim (such as a contradicted central claim
 * with a score of 0.0) will result in an overall factual score of 0.0.
 */
export function calculateFactualScore(correctnessEvaluation: CorrectnessAnalysis): number {
  const analysis = correctnessEvaluation?.analysis;
  if (!analysis || !Array.isArray(analysis) || analysis.length === 0) {
    return 0.0;
  }

  let productOfScores = 1.0;
  for (const claim of analysis) {
    const verdict = claim.verdict || 'NOT_IN_GROUND_TRUTH';
    const centrality = claim.centrality || 'peripheral';

    const scoreMapEntry = CLAIM_FACTUAL_SCORE_MAP[verdict as keyof typeof CLAIM_FACTUAL_SCORE_MAP];

    let claimScore = 0.0;
    if (typeof scoreMapEntry === 'object') {
      claimScore = scoreMapEntry[centrality as keyof typeof scoreMapEntry] || 0.0;
    } else if (typeof scoreMapEntry === 'number') {
      claimScore = scoreMapEntry;
    }

    productOfScores *= claimScore;
  }

  // Geometric mean: n-th root of the product
  const numClaims = analysis.length;
  const score = productOfScores > 0 ? Math.pow(productOfScores, 1 / numClaims) : 0.0;

  return score;
}

/**
 * Calculates the Relevance score based on proportion of central vs peripheral claims.
 *
 * This function measures how effectively the response addresses the user's core query
 * by calculating the proportion of claims that are classified as 'central' compared to the total number of claims.
 */
export function calculateRelevanceScore(correctnessEvaluation: CorrectnessAnalysis): number {
  const analysis = correctnessEvaluation?.analysis;
  if (!analysis || !Array.isArray(analysis) || analysis.length === 0) {
    return 0.0;
  }

  const numClaims = analysis.length;
  const centralClaimsCount = analysis.filter((claim) => claim.centrality === 'central').length;

  return centralClaimsCount / numClaims;
}

/**
 * Calculates the Procedural Fidelity score for queries where order is critical.
 *
 * This score measures how well the agent's response follows the required order of
 * claims or steps from the ground truth. If sequence is not critical for the query,
 * it returns a perfect score of 1.0, as there is no order to evaluate.
 */
export function calculateProceduralFidelityScore(
  correctnessEvaluation: CorrectnessAnalysis
): number {
  const summary = correctnessEvaluation?.summary;
  const analysis = correctnessEvaluation?.analysis;

  // If sequence is not critical, return perfect score
  if (summary?.sequence_accuracy_summary === 'NOT_APPLICABLE') {
    return 1.0;
  }

  if (!analysis || !Array.isArray(analysis)) {
    return 1.0;
  }

  const centralClaims = analysis.filter((claim) => claim.centrality === 'central');

  // If there are no central claims to order, return perfect score
  if (centralClaims.length === 0) {
    return 1.0;
  }

  const matchedCentralClaims = centralClaims.filter(
    (claim) => claim.sequence_match === 'MATCH'
  ).length;

  return matchedCentralClaims / centralClaims.length;
}
