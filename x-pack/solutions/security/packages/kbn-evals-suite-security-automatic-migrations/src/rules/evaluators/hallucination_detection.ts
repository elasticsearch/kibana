/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { DefaultEvaluators, Evaluator, EvaluationResult } from '@kbn/evals';
import type { RuleExample, RuleInput } from '../../../datasets/rules/types';
import type { RuleMigrationResult } from '../migration_client';

export const createHallucinationDetectionEvaluator = (
  evaluators: DefaultEvaluators
): Evaluator<RuleExample, RuleMigrationResult> => ({
  name: 'Hallucination Detection',
  kind: 'LLM',
  direction: 'maximize',
  evaluate: async ({ input, output, expected, metadata }): Promise<EvaluationResult> => {
    const ruleInput = input as RuleInput;
    const query = output?.rule?.elastic_rule?.query;

    if (!query) {
      return { score: null, explanation: 'No ESQL query produced — nothing to check' };
    }

    const sourceQuery = ruleInput?.original_rule?.query;
    if (!sourceQuery) {
      return { score: null, explanation: 'No source query in input' };
    }

    const vendor = ruleInput.original_rule.vendor;
    const sourceLabel = vendor === 'splunk' ? 'Splunk SPL' : 'QRadar rule definition';

    const criteriaEval = evaluators.criteria([
      `You are evaluating whether a translated ES|QL query contains hallucinated content — ` +
        `details that are NOT present in the source ${sourceLabel} query.\n\n` +
        `SOURCE ${sourceLabel.toUpperCase()} QUERY:\n${sourceQuery.slice(0, 3000)}\n\n` +
        `TRANSLATED ES|QL QUERY:\n${query.slice(0, 2000)}\n\n` +
        `Check if the ES|QL query introduces:\n` +
        `- Filter conditions, thresholds, or constants not in the source\n` +
        `- Data sources or index patterns clearly not derivable from the source\n` +
        `- Logic inversions (AND↔OR, negation flips)\n\n` +
        `Note: The following are expected and MUST NOT be flagged:\n` +
        `- ECS field name equivalents (e.g. src_ip → source.ip, EventCode → winlog.event_id)\n` +
        `- Syntax differences due to ${sourceLabel}→ES|QL translation\n` +
        `- Index pattern selection based on source type/index names\n\n` +
        `Score YES if the ES|QL is faithful (no hallucinations). Score NO if it contains hallucinations.`,
    ]);

    try {
      return await criteriaEval.evaluate({ input, output, expected, metadata });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return { score: null, label: 'ERROR', explanation: `LLM judge failed: ${msg.slice(0, 200)}` };
    }
  },
});
