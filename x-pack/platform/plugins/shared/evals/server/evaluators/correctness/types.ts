/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

// Intentionally copied from @kbn/evals — pending future extraction to @kbn/evals-common.

export interface CorrectnessAnalysis {
  summary: {
    factual_accuracy_summary: string;
    relevance_summary: string;
    sequence_accuracy_summary: string;
  };
  analysis: Array<{
    claim: string;
    centrality: 'central' | 'peripheral';
    centrality_reason: string;
    verdict: 'FULLY_SUPPORTED' | 'PARTIALLY_SUPPORTED' | 'CONTRADICTED' | 'NOT_IN_GROUND_TRUTH';
    sequence_match: 'MATCH' | 'MISMATCH' | 'NOT_APPLICABLE';
    justification_snippet: string | undefined;
    explanation: string;
  }>;
}
