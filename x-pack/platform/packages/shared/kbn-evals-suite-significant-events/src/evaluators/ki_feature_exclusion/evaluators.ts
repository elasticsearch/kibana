/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { BaseFeature } from '@kbn/significant-events-schema';
import type { BoundInferenceClient } from '@kbn/inference-common';
import type { ExcludedFeatureSummary, IgnoredFeature } from '@kbn/streams-ai';
import { executeUntilValid } from '@kbn/inference-prompt-utils';
import { ExcludeCompliancePrompt } from './prompt';

interface ExclusionViolation {
  run_index: number;
  excluded_feature: { id: string; title: string; type: string; subtype: string };
  regenerated_feature: { id: string; title: string; type: string; subtype: string };
  reason: string;
}

export interface ExcludeExperimentOutput {
  initialFeatures: BaseFeature[];
  excludedFeatures: ExcludedFeatureSummary[];
  followUpRuns: Array<{
    features: BaseFeature[];
    rawFeatures: BaseFeature[];
    ignoredFeatures: IgnoredFeature[];
  }>;
}

export const createExcludeSemanticEvaluator = ({
  inferenceClient,
}: {
  inferenceClient: BoundInferenceClient;
}) => ({
  name: 'llm_exclude_compliance',
  kind: 'LLM' as const,
  evaluate: async ({
    output,
  }: {
    output: (ExcludeExperimentOutput & { traceId: string | null }) | null;
  }) => {
    if (!output) {
      return {
        score: null,
        explanation: 'Inconclusive: experiment produced no output',
      };
    }

    const { initialFeatures, excludedFeatures, followUpRuns } = output;

    if (excludedFeatures.length === 0) {
      return {
        score: null,
        explanation:
          'Inconclusive: initial identification did not return enough features to fulfill the requested exclusion count',
      };
    }

    if (followUpRuns.length === 0) {
      return { score: null, explanation: 'Inconclusive: no follow-up runs to evaluate' };
    }

    const allFollowUpFeatures = followUpRuns.flatMap((run) => run.rawFeatures);

    if (allFollowUpFeatures.length === 0) {
      const allExcluded = initialFeatures.length === excludedFeatures.length;
      const filteringPerRun = followUpRuns.map((run) => ({
        raw_features: run.rawFeatures.length,
        llm_ignored: run.ignoredFeatures.length,
        code_filtered: run.rawFeatures.length - run.features.length,
      }));
      return {
        score: allExcluded ? 1 : 0,
        explanation: allExcluded
          ? 'All initial features were excluded, no features expected in follow-up runs'
          : `Follow-up runs returned 0 features, but only ${excludedFeatures.length} of ${initialFeatures.length} were excluded — the remaining features should have been preserved`,
        metadata: {
          initial_features_count: initialFeatures.length,
          excluded_count: excludedFeatures.length,
          follow_up_runs: followUpRuns.length,
          filtering_per_run: filteringPerRun,
        },
      };
    }

    const followUpRunsGrouped = followUpRuns.map((run, runIndex) => ({
      run_index: runIndex,
      features: run.rawFeatures.map(({ id, type, subtype, title, properties, description }) => ({
        id,
        type,
        subtype,
        title,
        properties,
        description,
      })),
    }));

    const response = await executeUntilValid({
      prompt: ExcludeCompliancePrompt,
      inferenceClient,
      input: {
        excluded_features: JSON.stringify(excludedFeatures),
        follow_up_runs: JSON.stringify(followUpRunsGrouped),
      },
      finalToolChoice: {
        function: 'analyze',
      },
      maxRetries: 3,
      toolCallbacks: {
        analyze: async (toolCall) => ({
          response: toolCall.function.arguments,
        }),
      },
    });

    const toolCall = response.toolCalls[0];
    if (!toolCall) {
      throw new Error('No tool call found in LLM response');
    }

    const { violations, explanation } = toolCall.function.arguments as {
      violations: ExclusionViolation[];
      explanation: string;
    };

    const perRunScores = followUpRuns.map((run, runIndex) => {
      const runViolationCount = violations.filter((v) => v.run_index === runIndex).length;
      const llmIgnored = run.ignoredFeatures.length;
      const codeFiltered = run.rawFeatures.length - run.features.length;
      return {
        score: Math.max(0, 1 - runViolationCount / excludedFeatures.length),
        violations: runViolationCount,
        llm_ignored: llmIgnored,
        code_filtered: codeFiltered,
      };
    });

    const score = perRunScores.reduce((sum, r) => sum + r.score, 0) / perRunScores.length;

    const totalLlmIgnored = perRunScores.reduce((sum, r) => sum + r.llm_ignored, 0);
    const totalCodeFiltered = perRunScores.reduce((sum, r) => sum + r.code_filtered, 0);

    return {
      score,
      explanation,
      metadata: {
        initial_features_count: initialFeatures.length,
        excluded_count: excludedFeatures.length,
        follow_up_runs: followUpRuns.length,
        follow_up_features_count: allFollowUpFeatures.length,
        violations_count: violations.length,
        per_run_scores: perRunScores,
        violations,
        llm_ignored_count: totalLlmIgnored,
        code_filtered_count: totalCodeFiltered,
      },
    };
  },
});
