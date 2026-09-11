/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { BoundInferenceClient, ToolChoice } from '@kbn/inference-common';
import type { ToolingLog } from '@kbn/tooling-log';
import pRetry from 'p-retry';
import type { Evaluator } from '../../types';
import { LlmCorrectnessEvaluationPrompt } from './prompt';
import {
  calculateFactualScore,
  calculateRelevanceScore,
  calculateProceduralFidelityScore,
} from './scoring';
import type { CorrectnessAnalysis } from './types';
import { normalizeCorrectnessAnalysis } from './normalize';
import { parseSelectedEvaluators } from '../filter';

const QUALITATIVE_EVALUATOR_NAME = 'Correctness Analysis';
const FACTUALITY_EVALUATOR_NAME = 'Factuality';
const RELEVANCE_EVALUATOR_NAME = 'Relevance';
const SEQUENCE_ACCURACY_EVALUATOR_NAME = 'Sequence Accuracy';

/**
 * Avoiding cost and lantecy by running qualitative analysis only when either qualitative or one of the quantitative evaluators for correctness are selected,
 */
function shouldRunCorrectnessAnalysis() {
  const evaluatorSelection = parseSelectedEvaluators();

  return (
    evaluatorSelection.length === 0 ||
    [
      QUALITATIVE_EVALUATOR_NAME,
      FACTUALITY_EVALUATOR_NAME,
      RELEVANCE_EVALUATOR_NAME,
      SEQUENCE_ACCURACY_EVALUATOR_NAME,
    ].some((evaluator) => evaluatorSelection.includes(evaluator))
  );
}

export function createCorrectnessAnalysisEvaluator({
  inferenceClient,
  log,
}: {
  inferenceClient: BoundInferenceClient;
  log: ToolingLog;
}): Evaluator {
  return {
    evaluate: async ({ input, output, expected }) => {
      if (!shouldRunCorrectnessAnalysis()) {
        return {};
      }

      async function runCorrectnessAnalysis(): Promise<CorrectnessAnalysis> {
        const userQuery = input?.question;
        const messages = (output as any)?.messages ?? [];
        const latestMessage = messages[messages.length - 1]?.message;
        const groundTruthResponse = expected?.expected;

        const response = await inferenceClient.prompt({
          prompt: LlmCorrectnessEvaluationPrompt,
          input: {
            user_query: `${userQuery}`,
            agent_response: `${latestMessage}`,
            ground_truth_response: `${groundTruthResponse}`,
          },
          // toolChoice must be specified in the API call, as `createPrompt` currently discards it from the prompt definition
          toolChoice: {
            function: 'analyze',
          } as ToolChoice,
        });

        // Extract the correctness evaluation from the tool call
        const toolCall = response.toolCalls[0];
        if (!toolCall) {
          throw new Error('No tool call found in LLM response');
        }

        return normalizeCorrectnessAnalysis(toolCall.function.arguments);
      }

      const correctnessAnalysisResult = await pRetry(runCorrectnessAnalysis, {
        retries: 3,
        onFailedAttempt: (error) => {
          const isLastAttempt = error.attemptNumber === error.retriesLeft + error.attemptNumber;

          if (isLastAttempt) {
            log.error(
              new Error(
                `Failed to retrieve correctness analysis after ${error.attemptNumber} attempts (no valid tool call or malformed response)`,
                {
                  cause: error,
                }
              )
            );
          } else {
            log.warning(
              new Error(
                `Correctness analysis returned an invalid or missing tool call on attempt ${error.attemptNumber}; retrying...`,
                {
                  cause: error,
                }
              )
            );
          }
        },
      });

      const summary = correctnessAnalysisResult.summary;
      const explanation = `Factuality: ${summary.factual_accuracy_summary}, Relevance: ${summary.relevance_summary}, Sequence: ${summary.sequence_accuracy_summary}`;

      return {
        score: null,
        label: 'correctness-analysis',
        explanation,
        metadata: { ...correctnessAnalysisResult },
      };
    },
    kind: 'LLM',
    direction: 'maximize',
    name: 'correctness',
  };
}

export function createQuantitativeCorrectnessEvaluators(): Evaluator[] {
  // Extract and validate correctness analysis from output
  const extractCorrectnessAnalysis = (output: any): CorrectnessAnalysis | null => {
    return ((output as any)?.correctnessAnalysis as CorrectnessAnalysis) || null;
  };

  // Helper function to create evaluator with common validation logic
  const quantitativeEvaluator = (
    name: string,
    scoreCalculator: (analysis: CorrectnessAnalysis) => number,
    summaryKey: keyof CorrectnessAnalysis['summary']
  ): Evaluator => ({
    evaluate: async ({ output, metadata }) => {
      const correctnessAnalysis = extractCorrectnessAnalysis(output);

      if (!correctnessAnalysis) {
        return {
          score: null,
          label: 'unavailable',
          explanation: 'No correctness analysis available',
          metadata: metadata ?? undefined,
        };
      }

      const score = scoreCalculator(correctnessAnalysis);
      const summaryText = correctnessAnalysis.summary[summaryKey];

      return {
        score,
        label: summaryText,
        explanation: summaryText,
        metadata: { ...(metadata ?? {}), correctnessAnalysis },
      };
    },
    kind: 'LLM',
    direction: 'maximize',
    name,
  });

  return [
    quantitativeEvaluator('Factuality', calculateFactualScore, 'factual_accuracy_summary'),
    quantitativeEvaluator('Relevance', calculateRelevanceScore, 'relevance_summary'),
    quantitativeEvaluator(
      'Sequence Accuracy',
      calculateProceduralFidelityScore,
      'sequence_accuracy_summary'
    ),
  ];
}
