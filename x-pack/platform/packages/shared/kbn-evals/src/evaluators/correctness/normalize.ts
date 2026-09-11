/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { CorrectnessAnalysis } from './types';

const FACTUAL_ACCURACY_SUMMARIES = new Set([
  'ACCURATE',
  'MINOR_INACCURACIES',
  'MAJOR_INACCURACIES',
]);

const RELEVANCE_SUMMARIES = new Set(['RELEVANT', 'PARTIALLY_RELEVANT', 'IRRELEVANT']);

const SEQUENCE_ACCURACY_SUMMARIES = new Set(['MATCH', 'MISMATCH', 'NOT_APPLICABLE']);

const isBadVerdict = (verdict: string): boolean =>
  verdict === 'CONTRADICTED' || verdict === 'NOT_IN_GROUND_TRUTH';

/**
 * Judges sometimes copy claim-level verdict enums into summary fields
 * (e.g. factual_accuracy_summary=NOT_IN_GROUND_TRUTH). Quantitative scoring
 * already prefers claim analysis, so derive a valid summary when needed.
 */
export function normalizeCorrectnessAnalysis(
  analysisResult: CorrectnessAnalysis
): CorrectnessAnalysis {
  const analysis = Array.isArray(analysisResult.analysis) ? analysisResult.analysis : [];
  const summary = analysisResult.summary ?? {
    factual_accuracy_summary: '',
    relevance_summary: '',
    sequence_accuracy_summary: '',
  };

  return {
    ...analysisResult,
    analysis,
    summary: {
      factual_accuracy_summary: FACTUAL_ACCURACY_SUMMARIES.has(summary.factual_accuracy_summary)
        ? summary.factual_accuracy_summary
        : deriveFactualAccuracySummary(analysis),
      relevance_summary: RELEVANCE_SUMMARIES.has(summary.relevance_summary)
        ? summary.relevance_summary
        : deriveRelevanceSummary(analysis),
      sequence_accuracy_summary: SEQUENCE_ACCURACY_SUMMARIES.has(summary.sequence_accuracy_summary)
        ? summary.sequence_accuracy_summary
        : deriveSequenceAccuracySummary(analysis),
    },
  };
}

function deriveFactualAccuracySummary(analysis: CorrectnessAnalysis['analysis']): string {
  if (analysis.some((claim) => claim.centrality === 'central' && isBadVerdict(claim.verdict))) {
    return 'MAJOR_INACCURACIES';
  }
  if (analysis.some((claim) => claim.centrality === 'peripheral' && isBadVerdict(claim.verdict))) {
    return 'MINOR_INACCURACIES';
  }
  return 'ACCURATE';
}

function deriveRelevanceSummary(analysis: CorrectnessAnalysis['analysis']): string {
  if (analysis.length === 0) {
    return 'IRRELEVANT';
  }
  const centralCount = analysis.filter((claim) => claim.centrality === 'central').length;
  if (centralCount === analysis.length) {
    return 'RELEVANT';
  }
  if (centralCount === 0) {
    return 'IRRELEVANT';
  }
  return 'PARTIALLY_RELEVANT';
}

function deriveSequenceAccuracySummary(analysis: CorrectnessAnalysis['analysis']): string {
  const centralClaims = analysis.filter((claim) => claim.centrality === 'central');
  if (
    centralClaims.length === 0 ||
    centralClaims.every((claim) => claim.sequence_match === 'NOT_APPLICABLE')
  ) {
    return 'NOT_APPLICABLE';
  }
  if (centralClaims.some((claim) => claim.sequence_match === 'MISMATCH')) {
    return 'MISMATCH';
  }
  return 'MATCH';
}
