/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { DefaultEvaluators, Evaluator } from '@kbn/evals';
import type {
  AttackDiscovery,
  AttackDiscoveryAgentBuilderExample,
  AttackDiscoveryAgentBuilderTaskOutput,
} from '../types';

/**
 * The seven rubric requirements, one per criterion.
 *
 * Exported because the matrix rejudge harness grades recorded AD runs through
 * its own jury and previously restated this list verbatim. Two copies drift:
 * the first per-item version of this rubric shipped while the harness copy
 * still collapsed all seven into a single "5 of 7 -> Y or N" question, so a
 * rejudge silently scored a different thing under the same column name.
 */
export const ATTACK_DISCOVERY_RUBRIC_ITEMS = [
  'Is the submission non-empty and well-formed JSON with an array of attackDiscoveries?',
  'Do the detailsMarkdown values capture the overall essence of the reference, allowing slight differences in wording but not omitting or misrepresenting key incidents?',
  'Does the submission mention at least half of the same entities (host or user) as the reference?',
  'Are the summaryMarkdown values at least partially similar and summarizing the same incidents?',
  'Are the title values at least partially similar and mentioning the same incidents?',
  'Do more than half of the alertIds in the submission overlap with the alertIds in the reference?',
  'Are the MITRE tactics consistent with the reference?',
] as const;

/** Appends the serialized reference to each item so criteria stay self-contained. */
export const buildAttackDiscoveryRubricCriteria = (reference: string): string[] =>
  ATTACK_DISCOVERY_RUBRIC_ITEMS.map((item) => `${item} Reference: ${reference}`);

const truncateInsightsForRubric = (
  insights: AttackDiscovery[] | null | undefined
): Array<{
  title: string;
  summaryMarkdown: string;
  detailsMarkdown: string;
  entitySummaryMarkdown?: string;
  mitreAttackTactics?: string[];
  alertIds: string[];
}> => {
  if (!insights || !Array.isArray(insights)) {
    return [];
  }

  return insights.map((insight) => ({
    title: insight.title ?? '',
    summaryMarkdown: insight.summaryMarkdown ?? '',
    detailsMarkdown: insight.detailsMarkdown ?? '',
    entitySummaryMarkdown: insight.entitySummaryMarkdown ?? '',
    mitreAttackTactics: insight.mitreAttackTactics ?? [],
    alertIds: insight.alertIds ?? [],
  }));
};

export const createAttackDiscoveryRubricEvaluator = ({
  evaluators,
}: {
  evaluators: DefaultEvaluators;
}): Evaluator<AttackDiscoveryAgentBuilderExample, AttackDiscoveryAgentBuilderTaskOutput> => {
  return {
    name: 'Rubric',
    kind: 'LLM',
    direction: 'maximize',
    evaluate: async ({ expected, output, input, metadata }) => {
      const referenceInsights = truncateInsightsForRubric(expected?.attackDiscoveries);
      // Without a reference discovery there is nothing for the judge to compare
      // against: rubric item 1 alone would score the submission N and pin the
      // aggregate at a ceiling. Mirrors the `criteria.length === 0` guard in
      // attack_discovery_criteria_evaluator.
      if (referenceInsights.length === 0) {
        return {
          score: null,
          label: 'N/A',
          explanation: 'No reference attack discoveries — skipping rubric evaluation.',
        };
      }

      const submissionInsights = truncateInsightsForRubric(output?.insights);

      const submission = JSON.stringify({ attackDiscoveries: submissionInsights }, null, 2);
      const reference = JSON.stringify({ attackDiscoveries: referenceInsights }, null, 2);

      // Each rubric item is passed as its own criterion so the judge scores it
      // independently and `evaluators.criteria` returns the weighted pass rate.
      // Collapsing all 7 into one string with a "5 of 7 -> Y/N" threshold, as
      // this evaluator used to, discards every partial result: a submission
      // that misses two items scores identically to a perfect one. Measured on
      // 295 regraded cells that produced 95.6% perfect scores (sd 0.205,
      // effectively binary) and left the column unable to rank.
      const rubricCriteria = buildAttackDiscoveryRubricCriteria(reference);

      try {
        return await evaluators.criteria(rubricCriteria).evaluate({
          input,
          expected: { expected: reference },
          output: {
            messages: [{ message: submission }],
            steps: [],
            errors: output?.errors ?? [],
          },
          metadata,
        });
      } catch (error) {
        return {
          score: null,
          label: 'judge_failed',
          explanation: `Rubric judge failed to evaluate the submission: ${
            error instanceof Error ? error.message : String(error)
          }`,
        };
      }
    },
  };
};
