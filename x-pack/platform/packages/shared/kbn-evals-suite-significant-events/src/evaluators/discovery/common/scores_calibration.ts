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

/** Static calibration criteria, shared by the investigator and judge, run as their own tracked signals. */
const CRITICALITY_CALIBRATION_CRITERIA: EvaluationCriterion[] = [
  {
    id: 'criticality_reflects_user_impact',
    text: 'Criticality reflects user-experience impact — blocked user tasks, blast radius, confirmed sensitive-data exposure — not raw signal or anomaly strength.',
    score: 1,
  },
  {
    id: 'high_criticality_requires_confirmed_impact',
    text: 'High criticality (>=76) is warranted only for confirmed user-task-blocking failures or confirmed live sensitive-data exposure; bounded or partial impact belongs in the mid range (31-75).',
    score: 1,
  },
  {
    id: 'weak_signals_low_criticality',
    text: 'Weak or unconfirmed signals (no confirmed evidence rows, stationary change type, negligible alert volume) should not claim high criticality.',
    score: 1,
  },
];

const CONFIDENCE_CALIBRATION_CRITERIA: EvaluationCriterion[] = [
  {
    id: 'confidence_reflects_support',
    text: 'Confidence reflects how well-supported the assessment is — KI backing, number of confirmed evidences, and corroboration — not the raw anomaly strength.',
    score: 1,
  },
  {
    id: 'no_ki_caps_confidence',
    text: 'Failure findings with no KI match and no confirmed failure evidence should not claim high confidence (kept at or below ~65 without KI backing). Exception: refuted discoveries — where queries returned healthy rows (`row_count > 0`, no error signature) confirming the signal is a non-event — are confirmed non-events, not unconfirmed findings, so they may sit in the 65–75 range without KI backing and are exempt from this cap.',
    score: 1,
  },
  {
    id: 'strong_corroboration_high_confidence',
    text: 'Only strongly corroborated findings (multiple confirmed evidences plus aligned KI backing, with no contradiction) may claim high confidence (>=85).',
    score: 1,
  },
];

/** LLM evaluator: scores whether `criticality` is justified by signal strength and confirmed impact. */
export const createCriticalityCalibrationEvaluator = <
  TExample extends Example,
  TOutput extends TaskOutput
>({
  criteriaFn,
  transformOutput,
}: CreateScenarioCriteriaLlmEvaluatorOptions<TExample, TOutput>): Evaluator<TExample, TOutput> =>
  createScenarioCriteriaLlmEvaluator<TExample, TOutput>({
    name: 'criticality_calibration',
    criteriaFn,
    criteria: CRITICALITY_CALIBRATION_CRITERIA,
    transformOutput,
  });

/** LLM evaluator: scores whether `confidence` reflects evidence/KI backing, with the no-KI ceiling. */
export const createConfidenceCalibrationEvaluator = <
  TExample extends Example,
  TOutput extends TaskOutput
>({
  criteriaFn,
  transformOutput,
}: CreateScenarioCriteriaLlmEvaluatorOptions<TExample, TOutput>): Evaluator<TExample, TOutput> =>
  createScenarioCriteriaLlmEvaluator<TExample, TOutput>({
    name: 'confidence_calibration',
    criteriaFn,
    criteria: CONFIDENCE_CALIBRATION_CRITERIA,
    transformOutput,
  });
