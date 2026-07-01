/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

// Intentionally copied from @kbn/evals — pending future extraction to @kbn/evals-common.

export interface GroundednessAnalysis {
  summary_verdict:
    | 'GROUNDED'
    | 'GROUNDED_WITH_DISCLOSURE'
    | 'MINOR_HALLUCINATIONS'
    | 'MAJOR_HALLUCINATIONS';
  analysis: Array<{
    claim: string;
    centrality: 'central' | 'peripheral';
    centrality_reason: string;
    verdict:
      | 'FULLY_SUPPORTED'
      | 'PARTIALLY_SUPPORTED'
      | 'CONTRADICTED'
      | 'NOT_FOUND'
      | 'UNGROUNDED_BUT_DISCLOSED';
    evidence:
      | {
          tool_call_id: string | undefined;
          tool_id: string | undefined;
          evidence_snippet: string | undefined;
        }
      | undefined;
    explanation: string;
  }>;
}
