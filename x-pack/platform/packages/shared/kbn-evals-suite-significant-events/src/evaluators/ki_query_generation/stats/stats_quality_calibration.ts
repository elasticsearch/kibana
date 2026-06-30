/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { deriveQueryType } from '@kbn/streams-schema';
import { QUERY_TYPE_STATS } from '@kbn/significant-events-schema';
import type { EvaluationCriterion, Evaluator } from '@kbn/evals';
import { createScenarioCriteriaLlmEvaluator } from '../../scenario_criteria/evaluators';
import type { KIQueryGenerationEvaluationExample, KIQueryGenerationOutput, Query } from '../types';
import { getQueriesFromOutput } from '../types';

const STATS_QUALITY_CRITERIA: EvaluationCriterion[] = [
  {
    id: 'threshold_reasoning',
    text: 'STATS query descriptions should explain threshold choices relative to baseline data and mention when adjustment may be needed.',
    score: 1,
  },
  {
    id: 'signal_diversity',
    text: 'Each STATS query should cover a distinct failure dimension (error rate, latency, auth failures, traffic volume). Overlapping signals should be consolidated.',
    score: 1,
  },
  {
    id: 'detection_evidence_pairing',
    text: 'Important signals should have both a STATS query (aggregate detection) and a complementary match query (evidence retrieval).',
    score: 1,
  },
];

const getStatsQueries = (output: KIQueryGenerationOutput): Query[] => {
  const queries = getQueriesFromOutput(output);
  return queries.filter((q: Query) => deriveQueryType(q.esql) === QUERY_TYPE_STATS);
};

/**
 * LLM-judge evaluator that checks the quality of STATS queries:
 * threshold reasoning, signal diversity, and detection+evidence pairing.
 *
 * Short-circuits with `score: null` when no STATS queries are present.
 * Analogous to `confidence_calibration` in feature extraction.
 */
export const createStatsQualityCalibrationEvaluator = ({
  criteriaFn,
}: {
  criteriaFn: (criteria: EvaluationCriterion[]) => Evaluator;
}): Evaluator<KIQueryGenerationEvaluationExample, KIQueryGenerationOutput> => {
  const inner = createScenarioCriteriaLlmEvaluator<
    KIQueryGenerationEvaluationExample,
    KIQueryGenerationOutput
  >({
    name: 'stats_quality_calibration',
    criteriaFn: (c) =>
      criteriaFn(c) as Evaluator<KIQueryGenerationEvaluationExample, KIQueryGenerationOutput>,
    criteria: STATS_QUALITY_CRITERIA,
    transformOutput: (output) => getStatsQueries(output) as unknown as KIQueryGenerationOutput,
  });

  return {
    ...inner,
    evaluate: async (params) => {
      if (getStatsQueries(params.output).length === 0) {
        return { score: null, explanation: 'No STATS queries to evaluate' };
      }
      return inner.evaluate(params);
    },
  };
};
