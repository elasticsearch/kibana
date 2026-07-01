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

export const LlmGroundednessEvaluationPrompt = createPrompt({
  name: 'llm_groundedness_evaluation',
  description: 'Prompt for evaluating the groundedness of LLM responses',
  input: z.object({
    user_query: z.string(),
    agent_response: z.string(),
    tool_call_history: z.string().optional(),
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
        description: 'Return groundedness evaluation with summary and detailed claim analysis.',
        schema: {
          type: 'object',
          properties: {
            analysis: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  claim: {
                    type: 'string',
                    description: "The specific claim extracted from the agent's response.",
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
                    description: 'Groundedness verdict for the claim against evidence.',
                    enum: [
                      'FULLY_SUPPORTED',
                      'PARTIALLY_SUPPORTED',
                      'CONTRADICTED',
                      'NOT_FOUND',
                      'UNGROUNDED_BUT_DISCLOSED',
                    ],
                  },
                  evidence: {
                    type: 'object',
                    nullable: true,
                    properties: {
                      tool_call_id: {
                        type: 'string',
                        nullable: true,
                        description: 'The ID of the tool call or null.',
                      },
                      tool_id: {
                        type: 'string',
                        nullable: true,
                        description: 'The name of the tool or null.',
                      },
                      evidence_snippet: {
                        type: 'string',
                        nullable: true,
                        description: 'A direct snippet from the tool result or null.',
                      },
                    },
                    required: ['tool_call_id', 'tool_id', 'evidence_snippet'],
                    description: 'Evidence supporting the verdict from tool calls.',
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
                  'evidence',
                  'explanation',
                ],
              },
              description: 'Detailed analysis of each claim in the agent response.',
            },
            summary_verdict: {
              type: 'string',
              description: 'Overall groundedness assessment of the response.',
              enum: [
                'GROUNDED',
                'GROUNDED_WITH_DISCLOSURE',
                'MINOR_HALLUCINATIONS',
                'MAJOR_HALLUCINATIONS',
              ],
            },
          },
          required: ['summary_verdict', 'analysis'],
        },
      },
    },
  } as const)
  .get();
