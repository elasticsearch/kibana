/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { EvaluationCriterion, Evaluator, Example, TaskOutput } from '@kbn/evals';
import {
  createScenarioCriteriaLlmEvaluator,
  type CreateScenarioCriteriaLlmEvaluatorOptions,
} from '../../scenario_criteria/evaluators';

const EVIDENCE_DESCRIPTION_CRITERIA: EvaluationCriterion[] = [
  {
    id: 'evidence_description_is_hypothesis_test',
    text: 'Every evidences[] entry where the judge stamped confirmed: true (evidence the judge re-verified via execute_esql in this cycle) must document a hypothesis test using the four-part structure: "Testing: … Expected if true: … Found: … Verdict: …". Entries without a confirmed stamp (carried forward from input without re-verification in this cycle) are exempt and may retain whatever description they arrived with.',
    score: 1,
  },
  {
    id: 'evidence_description_informational_exempt',
    text: 'Informational entries are exempt and should be treated as acceptable: quiet-rule entries (esql_query is null, trusting the detection-pipeline kind:quiet signal) and "no confirming query available" dispositions do not need the four-part structure. Do not penalize them.',
    score: 1,
  },
  {
    id: 'evidence_description_no_payload',
    text: 'Evidence descriptions contain no raw payload values, PII, tokens, UUIDs, or raw log lines — only service names, error types/codes, field paths, and counts.',
    score: 1,
  },
];

/** LLM evaluator: grades whether each evidence `description` follows the 4-part hypothesis-test structure. */
export const createEvidenceDescriptionEvaluator = <
  TExample extends Example,
  TOutput extends TaskOutput
>({
  criteriaFn,
  transformOutput,
}: CreateScenarioCriteriaLlmEvaluatorOptions<TExample, TOutput>): Evaluator<TExample, TOutput> =>
  createScenarioCriteriaLlmEvaluator<TExample, TOutput>({
    name: 'evidence_description_quality',
    criteriaFn,
    criteria: EVIDENCE_DESCRIPTION_CRITERIA,
    transformOutput,
  });
