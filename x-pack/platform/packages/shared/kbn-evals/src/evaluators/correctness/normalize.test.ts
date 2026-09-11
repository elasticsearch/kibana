/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { normalizeCorrectnessAnalysis } from './normalize';
import type { CorrectnessAnalysis } from './types';

const baseClaim = {
  claim: 'c',
  centrality: 'central' as const,
  centrality_reason: 'r',
  verdict: 'NOT_IN_GROUND_TRUTH' as const,
  sequence_match: 'NOT_APPLICABLE' as const,
  justification_snippet: undefined,
  explanation: 'e',
};

const defaultArgs: CorrectnessAnalysis = {
  summary: {
    factual_accuracy_summary: 'NOT_IN_GROUND_TRUTH',
    relevance_summary: 'PARTIALLY_RELEVANT',
    sequence_accuracy_summary: 'NOT_APPLICABLE',
  },
  analysis: [baseClaim],
};

describe('normalizeCorrectnessAnalysis', () => {
  it('returns MAJOR_INACCURACIES when factual_accuracy_summary uses a claim verdict', () => {
    const result = normalizeCorrectnessAnalysis(defaultArgs);
    expect(result.summary.factual_accuracy_summary).toBe('MAJOR_INACCURACIES');
  });

  it('returns the original factual_accuracy_summary when already valid', () => {
    const result = normalizeCorrectnessAnalysis({
      ...defaultArgs,
      summary: {
        ...defaultArgs.summary,
        factual_accuracy_summary: 'ACCURATE',
      },
      analysis: [{ ...baseClaim, verdict: 'FULLY_SUPPORTED' }],
    });
    expect(result.summary.factual_accuracy_summary).toBe('ACCURATE');
  });

  it('returns NOT_APPLICABLE when sequence_accuracy_summary is invalid and claims are not sequenced', () => {
    const result = normalizeCorrectnessAnalysis({
      ...defaultArgs,
      summary: {
        ...defaultArgs.summary,
        factual_accuracy_summary: 'MAJOR_INACCURACIES',
        sequence_accuracy_summary: 'FULLY_SUPPORTED',
      },
    });
    expect(result.summary.sequence_accuracy_summary).toBe('NOT_APPLICABLE');
  });
});
