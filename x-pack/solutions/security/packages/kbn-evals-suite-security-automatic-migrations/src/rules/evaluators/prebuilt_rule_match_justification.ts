/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { DefaultEvaluators, Evaluator, EvaluationResult } from '@kbn/evals';
import type { RuleExample, RuleInput } from '../../../datasets/rules/types';
import type { RuleMigrationResult } from '../migration_client';

export const createPrebuiltRuleMatchJustificationEvaluator = (
  evaluators: DefaultEvaluators
): Evaluator<RuleExample, RuleMigrationResult> => ({
  name: 'Prebuilt Rule Match Justification',
  kind: 'LLM',
  direction: 'maximize',
  evaluate: async ({ input, output, expected, metadata }): Promise<EvaluationResult> => {
    const ruleInput = input as RuleInput;
    const comments = output?.rule?.comments;

    if (!comments || comments.length === 0) {
      return { score: null, explanation: 'No comments produced — nothing to judge' };
    }

    const summary = comments.map((comment) => comment.message).join('\n\n');
    const matchedId = output?.rule?.elastic_rule?.prebuilt_rule_id ?? null;
    const sourceRule = ruleInput.original_rule;

    const criteriaEval = evaluators.criteria([
      `You are evaluating whether the reasoning for a prebuilt-rule matching decision is well ` +
        `grounded in the source detection rule being migrated, independent of whether the final ` +
        `decision was actually correct.\n\n` +
        `SOURCE RULE:\n` +
        `Title: ${sourceRule?.title}\n` +
        `Description: ${sourceRule?.description}\n` +
        `Query:\n${(sourceRule?.query ?? '').slice(0, 2000)}\n\n` +
        `MATCH DECISION: ${
          matchedId ? `matched prebuilt rule "${matchedId}"` : 'no prebuilt rule matched'
        }\n\n` +
        `MIGRATION COMMENTS (explanation produced by the migration):\n${summary.slice(
          0,
          3000
        )}\n\n` +
        `Check whether the comments:\n` +
        `- Reference concrete details from the source rule (behavior detected, log source, fields, ` +
        `MITRE technique, etc.) rather than generic boilerplate\n` +
        `- Give a specific reason for matching or not matching, rather than an unsupported assertion\n` +
        `- Are internally consistent with the match decision above (e.g. don't describe a strong ` +
        `match while concluding no match, or vice versa)\n\n` +
        `Note: This checks the QUALITY of the reasoning, not whether the matched rule id is the ` +
        `"right" one — a well-reasoned rejection of a plausible-looking candidate should score YES.\n\n` +
        `Score YES if the reasoning is well-grounded and consistent. Score NO if it is generic, ` +
        `unsupported, or inconsistent with the decision.`,
    ]);

    try {
      return await criteriaEval.evaluate({ input, output, expected, metadata });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return { score: null, label: 'ERROR', explanation: `LLM judge failed: ${msg.slice(0, 200)}` };
    }
  },
});
