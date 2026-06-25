/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  evaluate as base,
  createToolCallsEvaluator,
  createSpanLatencyEvaluator,
  type EvaluationDataset,
  type Example,
} from '@kbn/evals';
import { agentBuilderDefaultAgentId } from '@kbn/agent-builder-common';
import { AgentBuilderClient } from './agent_builder_client';
import type { ConverseAttachment } from './agent_builder_client';
import { createCriteriaEvaluator } from './criteria_evaluator';

export interface RcaEvalExample extends Example {
  input: {
    question: string;
    attachments?: ConverseAttachment[];
  };
  output: {
    criteria: string[];
  };
  metadata?: Record<string, string>;
}

export type EvaluateRcaDataset = (params: {
  dataset: {
    name: string;
    description: string;
    examples: RcaEvalExample[];
  };
}) => Promise<void>;

export const evaluate = base.extend<
  {},
  {
    chatClient: AgentBuilderClient;
    evaluateDataset: EvaluateRcaDataset;
  }
>({
  chatClient: [
    async ({ fetch, log, connector }, use) => {
      const client = new AgentBuilderClient(fetch, log, connector.id, agentBuilderDefaultAgentId);
      await use(client);
    },
    { scope: 'worker' },
  ],

  evaluateDataset: [
    ({ chatClient, evaluators, executorClient, traceEsClient, log }, use) => {
      use(async ({ dataset: { name, description, examples } }) => {
        await executorClient.runExperiment(
          {
            datasets: [{ name, description, examples } satisfies EvaluationDataset],
            concurrency: 1,
            task: async ({ input }) => {
              const { question, attachments } = input as RcaEvalExample['input'];

              const response = await chatClient.converse({ messages: question, attachments });

              return {
                errors: response.errors,
                messages: response.messages,
                steps: response.steps,
                traceId: response.traceId,
              };
            },
          },
          [
            createCriteriaEvaluator({ evaluators }),
            createToolCallsEvaluator({ traceEsClient, log }),
            evaluators.traceBasedEvaluators.inputTokens,
            evaluators.traceBasedEvaluators.outputTokens,
            evaluators.traceBasedEvaluators.cachedTokens,
            createSpanLatencyEvaluator({ traceEsClient, log, spanName: 'ChatComplete' }),
          ]
        );
      });
    },
    { scope: 'worker' },
  ],
});
