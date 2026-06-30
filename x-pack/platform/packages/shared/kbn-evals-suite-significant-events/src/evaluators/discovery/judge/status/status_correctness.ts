/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { EvaluationCriterion, Evaluator } from '@kbn/evals';
import type { JudgeEvaluationExample, JudgeAgentOutput } from '../../types';

/** Status decision gates, mirrored from the judge instructions so the LLM grades evidence justification. */
const STATUS_DECISION_RUBRIC = [
  "As Incident Commander, each event's `status` must follow these gates:",
  '- `promoted` (kind:discovery only): credible signal (p_value ≤ 0.05) AND ≥1 `confirmed: true` evidence the judge verified this cycle AND criticality ≥ 76 AND a blocked user task or confirmed live sensitive-data (PII/credentials/secrets) exposure.',
  '- `acknowledged`: signal is real and credible but impact is bounded (criticality 31–75), recovery is uncertain, or evidence is credible but below the paging bar. This is the default when the call is borderline.',
  '- `demoted` (kind:discovery only): confirmed false alarm — p_value > 0.1 with no KI corroboration, or the current-state check shows the stream alive with errors cleared (criticality ≤ 30).',
  '- `resolved` (kind:clearance only): recovery independently confirmed, no active-failure evidence.',
  'Hard constraints: never `promoted`/`demoted` from a clearance input; never `resolved` from a discovery input. When genuinely uncertain, the correct call is the more conservative one (`acknowledged` over `promoted`, `acknowledged` over `demoted`).',
].join('\n');

/**
 * LLM evaluator: grades whether `status` matches the calibrated outcome and the IC decision gates.
 * Over/under-escalation and constraint violations fail. Score per scenario criteria.
 */
export const createStatusCorrectnessEvaluator = (
  criteriaFn: (criteria: EvaluationCriterion[]) => Evaluator
): Evaluator<JudgeEvaluationExample, JudgeAgentOutput> => ({
  name: 'status_correctness',
  kind: 'LLM',
  evaluate: async (params) => {
    const { output, expected } = params;
    const expectedGroundTruth = expected?.expected_ground_truth;

    if (!expectedGroundTruth) {
      return {
        score: null,
        label: 'unavailable',
        explanation: 'expected_ground_truth not specified — skipping status correctness check',
      };
    }

    const events = output?.significantEvents ?? [];
    const statusSummary = events.map((e) => `${e.discovery_slug}=${e.status}`).join(', ');

    const criteria: EvaluationCriterion[] = [
      {
        id: 'status_correctness',
        score: 1,
        text:
          `${STATUS_DECISION_RUBRIC}\n\n` +
          `Expected outcome: ${expectedGroundTruth}. ` +
          `The judge returned: [${statusSummary || 'none'}]. ` +
          `PASS only if each discovery's returned status matches the expected outcome (match by title/content, not by exact slug) AND is justified by the event's ` +
          `evidence, criticality, and the gates above. An over-escalation, under-escalation, or ` +
          `constraint violation is a FAIL even if it is "close".`,
      },
    ];

    return criteriaFn(criteria).evaluate({
      ...params,
      output,
    });
  },
});
