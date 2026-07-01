/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ToolChoice } from '@kbn/inference-common';
import pRetry from 'p-retry';
import { extractChatEvidence } from '../chat_evidence';
import type { EvaluatorDefinition } from '../types';
import { LlmCorrectnessEvaluationPrompt } from './prompt';
import {
  calculateFactualScore,
  calculateProceduralFidelityScore,
  calculateRelevanceScore,
} from './scoring';
import type { CorrectnessAnalysis } from './types';

const getCorrectnessAnalysis = (response: {
  toolCalls?: Array<{ function: { arguments: unknown } }>;
}): CorrectnessAnalysis | undefined => {
  const firstToolCall = response.toolCalls?.[0];
  if (!firstToolCall) {
    return undefined;
  }

  return firstToolCall.function.arguments as CorrectnessAnalysis;
};

export const correctnessEvaluator: EvaluatorDefinition = {
  name: 'correctness',
  version: '1.0.0',
  kind: 'llm',
  description: 'Measures factuality, relevance, and sequence accuracy against expected output.',
  supportedInputs: ['trace', 'reference_data'],
  async evaluate({ trace, referenceData, inferenceClient, log }) {
    if (!inferenceClient) {
      throw new Error('Inference client is required for correctness evaluator');
    }

    const groundTruthResponse = referenceData?.expected;
    if (groundTruthResponse == null || `${groundTruthResponse}`.trim().length === 0) {
      return {
        scores: [
          {
            name: 'factuality',
            label: 'unavailable',
            explanation: 'reference_data.expected is required for correctness evaluator',
          },
          {
            name: 'relevance',
            label: 'unavailable',
            explanation: 'reference_data.expected is required for correctness evaluator',
          },
          {
            name: 'sequence_accuracy',
            label: 'unavailable',
            explanation: 'reference_data.expected is required for correctness evaluator',
          },
        ],
      };
    }

    const chatEvidence = await extractChatEvidence(trace, log);

    const response = await pRetry(
      async () => {
        return inferenceClient.prompt({
          prompt: LlmCorrectnessEvaluationPrompt,
          input: {
            user_query: chatEvidence.user_query,
            agent_response: chatEvidence.agent_response,
            ground_truth_response: `${groundTruthResponse}`,
          },
          toolChoice: {
            function: 'analyze',
          } as ToolChoice,
        });
      },
      {
        retries: 3,
      }
    );

    const analysis = getCorrectnessAnalysis(response);
    if (!analysis) {
      throw new Error('No tool call in judge response');
    }

    return {
      scores: [
        {
          name: 'factuality',
          score: calculateFactualScore(analysis),
          label: analysis.summary.factual_accuracy_summary,
          explanation: analysis.summary.factual_accuracy_summary,
          metadata: { ...analysis },
        },
        {
          name: 'relevance',
          score: calculateRelevanceScore(analysis),
          label: analysis.summary.relevance_summary,
          explanation: analysis.summary.relevance_summary,
          metadata: { ...analysis },
        },
        {
          name: 'sequence_accuracy',
          score: calculateProceduralFidelityScore(analysis),
          label: analysis.summary.sequence_accuracy_summary,
          explanation: analysis.summary.sequence_accuracy_summary,
          metadata: { ...analysis },
        },
      ],
    };
  },
};
