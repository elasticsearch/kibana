/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Client as EsClient } from '@elastic/elasticsearch';
import type { ToolingLog } from '@kbn/tooling-log';
import type {
  DefaultEvaluators,
  EvaluationDataset,
  Evaluator,
  EvalsExecutorClient,
  Example,
  TaskOutput,
} from '@kbn/evals';
import {
  createSkillInvocationEvaluator,
  createTrajectoryEvaluator,
  getToolCallSteps,
} from '@kbn/evals';
import type { PciEvalChatClient } from './chat_client';

export interface PciDatasetExample extends Example {
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

export type EvaluatePciDataset = (options: {
  dataset: {
    name: string;
    description: string;
    examples: PciDatasetExample[];
  };
}) => Promise<void>;

/**
 * Criteria baked into every PCI example. The PCI skill guarantees:
 *  - PCI DSS v4.0.1 is cited (or `4.0.1`) in the answer.
 *  - The QSA disclaimer is surfaced so the answer never reads as a compliance
 *    determination.
 *  - A `scopeClaim` describing the indices + time range actually evaluated is referenced,
 *    either verbatim or by paraphrase.
 *
 * Keeping these as shared criteria (vs. copy-pasting into every spec) prevents drift when
 * the contract evolves.
 */
export const BASELINE_PCI_CRITERIA = [
  'The response explicitly references PCI DSS v4.0.1 (or the string "4.0.1").',
  'The response includes a QSA / Qualified Security Assessor disclaimer — the agent does not claim the finding is a formal compliance determination.',
  'The response references a scope (evaluated indices and the time range) the tool actually used, rather than a vague "I checked everything".',
  'If the tool results include any esql or query fields, they must contain valid ES|QL syntax (e.g. starting with FROM, ROW, or SHOW) — not descriptive text labels that would cause an ES|QL parse error.',
];

export function createPciCriteriaEvaluator({
  evaluators,
  extraCriteria = [],
}: {
  evaluators: DefaultEvaluators;
  extraCriteria?: string[];
}): Evaluator {
  return {
    name: 'PCI Criteria',
    kind: 'LLM' as const,
    evaluate: async ({ expected, ...rest }) => {
      const exampleCriteria: string[] = (expected as PciDatasetExample['output'])?.criteria ?? [];
      const allCriteria = [...BASELINE_PCI_CRITERIA, ...extraCriteria, ...exampleCriteria];
      return evaluators.criteria(allCriteria).evaluate({ expected, ...rest });
    },
  };
}

/**
 * Trajectory evaluator wrapper. Scores the agent's tool-call sequence against a
 * per-example `expectedToolSequence` annotation using LCS (order) + set
 * intersection (coverage). Returns N/A when an example has no annotation so
 * partial-coverage datasets aren't penalised. Mirrors the alerts-rag suite's
 * `createAlertsRagTrajectoryEvaluator`. Annotations are authored per-example in
 * follow-up work; until then every example reports N/A (the infra is in place
 * to start scoring the moment golden paths land).
 */
export function createPciTrajectoryEvaluator(): Evaluator {
  const inner = createTrajectoryEvaluator({
    extractToolCalls: (output) =>
      getToolCallSteps(output as TaskOutput)
        .map((step) => step.tool_id)
        .filter((id): id is string => Boolean(id)),
    goldenPathExtractor: (expected) =>
      (expected as PciDatasetExample['output'] | undefined)?.expectedToolSequence ?? [],
    orderWeight: 0.4,
    coverageWeight: 0.6,
  });

  return {
    ...inner,
    name: 'Trajectory',
    evaluate: async (args) => {
      const seq = (args.expected as PciDatasetExample['output'] | undefined)?.expectedToolSequence;
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

export function createEvaluatePciDataset({
  evaluators,
  executorClient,
  chatClient,
  traceEsClient,
  log,
}: {
  evaluators: DefaultEvaluators;
  executorClient: EvalsExecutorClient;
  chatClient: PciEvalChatClient;
  traceEsClient: EsClient;
  log: ToolingLog;
}): EvaluatePciDataset {
  return async function evaluatePciDataset({
    dataset: { name, description, examples },
  }: {
    dataset: {
      name: string;
      description: string;
      examples: PciDatasetExample[];
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
    // additional LLM judging. Sourced from the framework fixture so the queries
    // stay consistent across suites.
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
        createPciCriteriaEvaluator({ evaluators }),
        createSkillInvocationEvaluator({
          traceEsClient,
          log,
          skillName: 'pci-compliance',
        }),
        createPciTrajectoryEvaluator(),
        toolCalls,
        latency,
        inputTokens,
        outputTokens,
        cachedTokens,
      ]
    );
  };
}
