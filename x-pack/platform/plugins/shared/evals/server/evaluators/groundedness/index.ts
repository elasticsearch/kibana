/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ToolChoice } from '@kbn/inference-common';
import pRetry from 'p-retry';
import type { EvaluatorDefinition } from '../types';
import { IncompleteGroundednessEvidenceError, extractGroundednessEvidence } from './extractor';
import { LlmGroundednessEvaluationPrompt } from './prompt';
import { calculateGroundednessScore } from './scoring';
import type { GroundednessAnalysis } from './types';

const getGroundednessAnalysis = (response: {
  toolCalls?: Array<{ function: { arguments: unknown } }>;
}): GroundednessAnalysis | undefined => {
  const firstToolCall = response.toolCalls?.[0];
  if (!firstToolCall) {
    return undefined;
  }

  return firstToolCall.function.arguments as GroundednessAnalysis;
};

export const groundednessEvaluator: EvaluatorDefinition = {
  name: 'groundedness',
  version: '1.0.0',
  kind: 'llm',
  description: 'Measures whether the response is grounded in tool-call outputs from the trace.',
  supportedInputs: ['trace'],
  async evaluate({ trace, inferenceClient, log }) {
    if (!inferenceClient) {
      return {
        scores: [
          {
            name: 'groundedness',
            label: 'error',
            explanation: 'Inference client is required for groundedness evaluator',
          },
        ],
      };
    }

    let evidence;
    try {
      evidence = await extractGroundednessEvidence(trace, log);
    } catch (error) {
      if (error instanceof IncompleteGroundednessEvidenceError) {
        return {
          scores: [
            {
              name: 'groundedness',
              label: 'potentially_incomplete',
              metadata: {
                incomplete: true,
              },
            },
          ],
        };
      }

      throw error;
    }

    const response = await pRetry(
      async () => {
        return inferenceClient.prompt({
          prompt: LlmGroundednessEvaluationPrompt,
          input: {
            user_query: evidence.user_query,
            agent_response: evidence.agent_response,
            tool_call_history: JSON.stringify(evidence.tool_call_history),
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

    const analysis = getGroundednessAnalysis(response);
    if (!analysis) {
      return {
        scores: [
          {
            name: 'groundedness',
            label: 'error',
            explanation: 'No tool call in judge response',
          },
        ],
      };
    }

    return {
      scores: [
        {
          name: 'groundedness',
          score: calculateGroundednessScore(analysis),
          label: analysis.summary_verdict,
          explanation: analysis.summary_verdict,
          metadata: {
            ...analysis,
          },
        },
      ],
    };
  },
};
