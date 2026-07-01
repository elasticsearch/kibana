/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

// Intentionally copied from @kbn/evals — pending future extraction to @kbn/evals-common.

import { createPrompt } from '@kbn/inference-common';
import { z } from '@kbn/zod/v4';
import systemPromptText from './system_prompt.text';
import userPromptText from './user_prompt.text';

export const LlmCorrectnessEvaluationPrompt = createPrompt({
  name: 'llm_correctness_evaluation',
  description: 'Prompt for evaluating the correctness of LLM responses',
  input: z.object({
    user_query: z.string(),
    agent_response: z.string(),
    ground_truth_response: z.string().optional(),
  }),
})
  .version({
    system: {
      mustache: {
        template: systemPromptText,
      },
    },
    template: {
      mustache: {
        template: userPromptText,
      },
    },
    tools: {
      analyze: {
        description: 'Return correctness evaluation with summary and detailed claim analysis.',
        schema: {
          type: 'object',
          properties: {
            summary: {
              type: 'object',
              properties: {
                factual_accuracy_summary: {
                  type: 'string',
                  description: 'Overall factual accuracy assessment.',
                  enum: ['ACCURATE', 'MINOR_INACCURACIES', 'MAJOR_INACCURACIES'],
                },
                relevance_summary: {
                  type: 'string',
                  description: 'Overall relevance assessment of the response.',
                  enum: ['RELEVANT', 'PARTIALLY_RELEVANT', 'IRRELEVANT'],
                },
                sequence_accuracy_summary: {
                  type: 'string',
                  description: 'Overall sequence accuracy assessment for procedural queries.',
                  enum: ['MATCH', 'MISMATCH', 'NOT_APPLICABLE'],
                },
              },
              required: [
                'factual_accuracy_summary',
                'relevance_summary',
                'sequence_accuracy_summary',
              ],
              description: 'High-level summary of the correctness evaluation.',
            },
            analysis: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  claim: {
                    type: 'string',
                    description: 'The specific claim extracted from the agent response.',
                  },
                  centrality: {
                    type: 'string',
                    description:
                      'Whether the claim is central or peripheral to answering the user query.',
                    enum: ['central', 'peripheral'],
                  },
                  centrality_reason: {
                    type: 'string',
                    description: 'A brief explanation of why the claim is central or peripheral.',
                  },
                  verdict: {
                    type: 'string',
                    description: 'Factual accuracy verdict for the claim against ground truth.',
                    enum: [
                      'FULLY_SUPPORTED',
                      'PARTIALLY_SUPPORTED',
                      'CONTRADICTED',
                      'NOT_IN_GROUND_TRUTH',
                    ],
                  },
                  sequence_match: {
                    type: 'string',
                    description:
                      'Whether the claim appears in the correct sequence relative to other claims.',
                    enum: ['MATCH', 'MISMATCH', 'NOT_APPLICABLE'],
                  },
                  justification_snippet: {
                    type: 'string',
                    nullable: true,
                    description:
                      'A direct snippet from the Ground Truth Response supporting the verdict, or null if not applicable.',
                  },
                  explanation: {
                    type: 'string',
                    description: 'A brief explanation of the verdict reasoning.',
                  },
                },
                required: [
                  'claim',
                  'centrality',
                  'centrality_reason',
                  'verdict',
                  'sequence_match',
                  'justification_snippet',
                  'explanation',
                ],
              },
              description: 'Detailed analysis of each claim in the agent response.',
            },
          },
          required: ['summary', 'analysis'],
        },
      },
    },
  } as const)
  .get();
