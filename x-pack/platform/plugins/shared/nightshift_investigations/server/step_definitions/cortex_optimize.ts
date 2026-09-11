/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';
import { StepCategory } from '@kbn/workflows';
import { createServerStepDefinition } from '@kbn/workflows-extensions/server';
import type { Logger } from '@kbn/core/server';
import type { InferenceServerStart } from '@kbn/inference-plugin/server';
import type { SearchInferenceEndpointsPluginStart } from '@kbn/search-inference-endpoints/server';
import { runCortexOptimize } from '../cortex/register_cortex';

const MAX_ROUND_TEXT_LENGTH = 65_536;

export const cortexOptimizeStepDefinition = ({
  getInference,
  getSearchInferenceEndpoints,
  logger,
}: {
  getInference: () => InferenceServerStart | undefined;
  getSearchInferenceEndpoints: () => SearchInferenceEndpointsPluginStart | undefined;
  logger: Logger;
}) =>
  createServerStepDefinition({
    id: 'nightshift.cortexOptimize',
    label: 'Optimize Nightshift Cortex',
    category: StepCategory.Ai,
    description:
      'Proposes Cortex wiki edits from a completed investigation round and writes them ' +
      'to the Context Engine AI index.',
    inputSchema: z.object({
      prompt: z
        .string()
        .max(MAX_ROUND_TEXT_LENGTH)
        .describe('The user message that started the round.'),
      response: z
        .string()
        .max(MAX_ROUND_TEXT_LENGTH)
        .describe("The assistant's final response for the round."),
      agent_id: z.string().max(1024).optional().describe('Agent id that produced the round.'),
    }),
    outputSchema: z.object({
      status: z.literal('ok').describe('The optimizer finished without throwing.'),
    }),
    handler: async (context) => {
      await runCortexOptimize({
        request: context.contextManager.getFakeRequest(),
        agentId: context.input.agent_id,
        userMessage: context.input.prompt,
        assistantMessage: context.input.response,
        esClient: context.contextManager.getScopedEsClient(),
        getInference,
        getSearchInferenceEndpoints,
        logger,
      });

      return { output: { status: 'ok' as const } };
    },
  });
