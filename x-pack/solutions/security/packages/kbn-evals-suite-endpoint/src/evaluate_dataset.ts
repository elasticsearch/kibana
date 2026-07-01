/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  DefaultEvaluators,
  EvaluationDataset,
  Evaluator,
  EvalsExecutorClient,
  Example,
  TaskOutput,
} from '@kbn/evals';
import { createTrajectoryEvaluator, getToolCallSteps } from '@kbn/evals';
import type { SecurityEvalChatClient } from './chat_client';

export interface SecurityDatasetExample extends Example {
  input: {
    question: string;
  };
  output: {
    criteria: string[];
    /**
     * Optional golden tool-call sequence. When present, the trajectory
     * evaluator scores the agent's actual tool path (order + coverage)
     * against it. Examples without an annotation report N/A so partial
     * datasets don't dilute averages. Authored per-example in follow-up work.
     */
    expectedToolSequence?: string[];
  };
}

export type EvaluateSecurityDataset = (options: {
  dataset: {
    name: string;
    description: string;
    examples: SecurityDatasetExample[];
  };
}) => Promise<void>;

export function createEndpointCriteriaEvaluator({
  evaluators,
}: {
  evaluators: DefaultEvaluators;
}): Evaluator {
  return {
    name: 'Criteria',
    kind: 'LLM' as const,
    evaluate: async ({ expected, ...rest }) => {
      const criteria: string[] = (expected as SecurityDatasetExample['output'])?.criteria ?? [];
      return evaluators.criteria(criteria).evaluate({ expected, ...rest });
    },
  };
}

export function createEndpointTrajectoryEvaluator(): Evaluator {
  const inner = createTrajectoryEvaluator({
    extractToolCalls: (output) =>
      getToolCallSteps(output as TaskOutput)
        .map((step) => step.tool_id)
        .filter((id): id is string => Boolean(id)),
    goldenPathExtractor: (expected) =>
      (expected as SecurityDatasetExample['output'] | undefined)?.expectedToolSequence ?? [],
    orderWeight: 0.4,
    coverageWeight: 0.6,
  });

  return {
    ...inner,
    name: 'Trajectory',
    evaluate: async (args) => {
      const seq = (args.expected as SecurityDatasetExample['output'] | undefined)
        ?.expectedToolSequence;
      if (!seq || seq.length === 0) {
        return {
          score: null,
          label: 'N/A',
          explanation: 'No expectedToolSequence annotation — skipping trajectory evaluation.',
        };
      }
      return inner.evaluate(args);
    },
  };
}

export function createEvaluateSecurityDataset({
  evaluators,
  executorClient,
  chatClient,
}: {
  evaluators: DefaultEvaluators;
  executorClient: EvalsExecutorClient;
  chatClient: SecurityEvalChatClient;
}): EvaluateSecurityDataset {
  return async function evaluateSecurityDataset({
    dataset: { name, description, examples },
  }: {
    dataset: {
      name: string;
      description: string;
      examples: SecurityDatasetExample[];
    };
  }) {
    const dataset = {
      name,
      description,
      examples,
    } satisfies EvaluationDataset;

    // Observability (trace-based, zero per-example LLM cost): baseline signals
    // derived from OTel spans for this task's trace.id. Tracks regressions in
    // latency / token usage / tool-call counts over time without paying for
    // additional LLM judging.
    const { inputTokens, outputTokens, cachedTokens, toolCalls, latency } =
      evaluators.traceBasedEvaluators;

    await executorClient.runExperiment(
      {
        datasets: [dataset],
        task: async ({ input }) => {
          const response = await chatClient.converse({ message: input.question });

          return {
            messages: response.messages,
            steps: response.steps,
            errors: response.errors,
            traceId: response.traceId,
          };
        },
      },
      [
        createEndpointCriteriaEvaluator({ evaluators }),
        createEndpointTrajectoryEvaluator(),
        toolCalls,
        latency,
        inputTokens,
        outputTokens,
        cachedTokens,
      ]
    );
  };
}
