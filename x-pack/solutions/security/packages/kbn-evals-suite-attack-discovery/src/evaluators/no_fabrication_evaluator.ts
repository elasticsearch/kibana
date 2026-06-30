/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Evaluator } from '@kbn/evals';
import type { AttackDiscoveryDatasetExample, AttackDiscoveryTaskOutput } from '../types';
import { isNegativeExample } from './is_negative_example';

export const NO_FABRICATION_EVALUATOR_NAME = 'No Fabrication';

/**
 * Deterministic evaluator (`kind: 'CODE'`, no LLM call) for negative cases:
 * benign or unrelated alert bundles that should NOT yield an attack discovery.
 * A correct response produces zero insights; fabricating an attack narrative
 * from benign context fails.
 *
 * Scores negative examples only (see {@link isNegativeExample}). On positive
 * examples it returns `score: null` (N/A) so it does not affect their averages —
 * the symmetric counterpart to gating the quality evaluators off negatives.
 *
 * A `null` insights array means the task errored (`runAttackDiscovery` returns
 * `{ insights: null, errors }` on failure), not that the model refrained, so it
 * is also scored N/A — otherwise a failed connector on a negative case would be
 * credited as a flawless refrain and mask infra failures behind a perfect metric.
 */
export const createNoFabricationEvaluator = (): Evaluator<
  AttackDiscoveryDatasetExample,
  AttackDiscoveryTaskOutput
> => {
  return {
    name: NO_FABRICATION_EVALUATOR_NAME,
    kind: 'CODE',
    evaluate: async ({ output, metadata }) => {
      if (!isNegativeExample(metadata)) {
        return {
          score: null,
          label: 'N/A',
          explanation: 'Not a negative case — fabrication check does not apply.',
        };
      }

      // `null` insights means the task errored, not that the model refrained.
      if (output?.insights == null) {
        return {
          score: null,
          label: 'N/A',
          explanation: 'Task produced no output (error) — fabrication check not applicable.',
        };
      }

      const count = output.insights.length;
      const refrained = count === 0;

      return {
        score: refrained ? 1 : 0,
        label: refrained ? 'PASS' : 'FAIL',
        explanation: refrained
          ? 'Correctly produced no attack discovery from benign input.'
          : `Fabricated ${count} attack discovery insight(s) from benign input.`,
        metadata: { insightCount: count },
      };
    },
  };
};
