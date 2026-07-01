/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Client as EsClient } from '@elastic/elasticsearch';
import type { DefaultEvaluators, Evaluator, EvalsExecutorClient, TaskOutput } from '@kbn/evals';
import { createTrajectoryEvaluator, getToolCallSteps, withEvaluatorSpan } from '@kbn/evals';
import type { BoundInferenceClient } from '@kbn/inference-common';
import type { ToolingLog } from '@kbn/tooling-log';
import type { EsqlRegressionAgentBuilderChatClient } from './chat_client';
import { esqlGenerationDataset } from './dataset';
import { createEsqlValidityEvaluator } from './evaluators/esql_validity';
import { createEsqlExecutionEvaluator } from './evaluators/esql_execution';
import { createEsqlResultEquivalenceEvaluator } from './evaluators/esql_result_equivalence';
import { createCalibratedEsqlEquivalenceEvaluator } from './evaluators/esql_functional_equivalence';
import { extractEsqlFromConverseResponse } from './extract_esql';

/**
 * Task output shape. Mirrors the alerts-rag suite so the framework's
 * trace-based evaluators (`toolCalls`, `latency`, `inputTokens`, …) can
 * resolve the OTel trace by `traceId`. `esql` is the extracted prediction
 * the quality evaluators read.
 */
interface EsqlTaskOutput {
  esql: string;
  traceId?: string;
  messages: Array<{ message: string }>;
  steps: Array<{
    type?: string;
    tool_id?: string;
    results?: unknown[];
    [k: string]: unknown;
  }>;
}

const predictionExtractor = (output: unknown): string =>
  (output as EsqlTaskOutput | undefined)?.esql ?? '';

const groundTruthExtractor = (expected: unknown): string =>
  (expected as { query: string } | undefined)?.query ?? '';

const queryExtractor = (output: unknown): string[] => {
  const query = predictionExtractor(output);
  return query ? [query] : [];
};

/**
 * Honors `ESQL_GENERATION_DATASET_OFFSET` (skip first N) and
 * `ESQL_GENERATION_DATASET_LIMIT` (cap result size) to slice the dataset for
 * fast smoke iteration. Invalid values fall through to the full dataset.
 */
function sliceDataset<T>(examples: readonly T[]): T[] {
  const parsePositiveInt = (value: string | undefined): number | undefined => {
    if (!value) return undefined;
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
  };

  const offset = parsePositiveInt(process.env.ESQL_GENERATION_DATASET_OFFSET) ?? 0;
  const limit = parsePositiveInt(process.env.ESQL_GENERATION_DATASET_LIMIT);
  const end = limit !== undefined ? offset + limit : examples.length;
  return examples.slice(offset, end);
}

export type EvaluateEsqlGenerationDataset = () => Promise<void>;

/**
 * Ground-truth shape carried by each dataset example's `output`. `query` is the
 * canonical ES|QL the quality evaluators compare against; `expectedToolSequence`
 * is the optional golden tool path the trajectory evaluator scores against.
 */
interface EsqlExpectedOutput {
  query: string;
  expectedToolSequence?: string[];
}

/**
 * Trajectory evaluator wrapper. Scores the agent's tool-call sequence against a
 * per-example `expectedToolSequence` annotation using LCS (order) + set
 * intersection (coverage). Returns N/A when an example has no annotation so
 * partial-coverage datasets aren't penalised. Mirrors the pci-compliance suite's
 * `createPciTrajectoryEvaluator`.
 */
export function createEsqlTrajectoryEvaluator(): Evaluator {
  const inner = createTrajectoryEvaluator({
    extractToolCalls: (output) =>
      getToolCallSteps(output as TaskOutput)
        .map((step) => step.tool_id)
        .filter((id): id is string => Boolean(id)),
    goldenPathExtractor: (expected) =>
      (expected as EsqlExpectedOutput | undefined)?.expectedToolSequence ?? [],
    orderWeight: 0.4,
    coverageWeight: 0.6,
  });

  return {
    ...inner,
    name: 'Trajectory',
    evaluate: async (args) => {
      const seq = (args.expected as EsqlExpectedOutput | undefined)?.expectedToolSequence;
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

export function createEvaluateEsqlGenerationDataset({
  chatClient,
  evaluators,
  executorClient,
  inferenceClient,
  esClient,
  traceEsClient,
  log,
}: {
  chatClient: EsqlRegressionAgentBuilderChatClient;
  evaluators: DefaultEvaluators;
  executorClient: EvalsExecutorClient;
  inferenceClient: BoundInferenceClient;
  esClient: EsClient;
  // `traceEsClient` is wired through for symmetry with the alerts-rag suite
  // and so trace-based evaluators sourced from `evaluators.traceBasedEvaluators`
  // can resolve OTel traces. It is intentionally unused here directly.
  traceEsClient: EsClient;
  log: ToolingLog;
}): EvaluateEsqlGenerationDataset {
  void traceEsClient;

  const { inputTokens, outputTokens, cachedTokens, toolCalls, latency } =
    evaluators.traceBasedEvaluators;

  // Suite-local calibrated FuncEq judge replaces the framework default
  // (`@kbn/evals` `createEsqlEquivalenceEvaluator`). Same evaluator name +
  // `kind: 'LLM'` so the golden-cluster history is continuous, but the
  // rubric is calibrated (three-point scale, explicit allow/deny lists
  // for common ES|QL transformations, conservative tie-breaker). See
  // `evaluators/esql_functional_equivalence.ts` for the full rubric and
  // the `judgeVersion=v2` stamp that lets dashboards partition out the
  // v1 framework history.
  const baseEquivalenceEvaluator = createCalibratedEsqlEquivalenceEvaluator({
    inferenceClient,
    log,
    predictionExtractor,
    groundTruthExtractor,
  });

  const esqlEquivalenceEvaluator: Evaluator = {
    ...baseEquivalenceEvaluator,
    evaluate: (args) =>
      withEvaluatorSpan('EsqlFunctionalEquivalence', {}, () =>
        baseEquivalenceEvaluator.evaluate(args)
      ),
  };

  const baseValidityEvaluator = createEsqlValidityEvaluator({ queryExtractor });

  const esqlValidityEvaluator: Evaluator = {
    ...baseValidityEvaluator,
    evaluate: (args) =>
      withEvaluatorSpan('EsqlValidity', {}, () => baseValidityEvaluator.evaluate(args)),
  };

  const baseExecutionEvaluator = createEsqlExecutionEvaluator({
    esClient,
    queryExtractor,
  });

  const esqlExecutionEvaluator: Evaluator = {
    ...baseExecutionEvaluator,
    evaluate: (args) =>
      withEvaluatorSpan('EsqlExecution', {}, () => baseExecutionEvaluator.evaluate(args)),
  };

  const baseResultEquivalenceEvaluator = createEsqlResultEquivalenceEvaluator({
    esClient,
    predictionExtractor,
    groundTruthExtractor,
  });

  const esqlResultEquivalenceEvaluator: Evaluator = {
    ...baseResultEquivalenceEvaluator,
    evaluate: (args) =>
      withEvaluatorSpan('EsqlResultEquivalence', {}, () =>
        baseResultEquivalenceEvaluator.evaluate(args)
      ),
  };

  return async function evaluateEsqlGenerationDataset(): Promise<void> {
    const examples = sliceDataset(esqlGenerationDataset);
    await executorClient.runExperiment(
      {
        datasets: [
          {
            name: 'security-esql-generation: regression suite',
            description: `Security ES|QL generation: ${examples.length} examples (natural-language question → ground-truth query)`,
            examples,
          },
        ],
        task: async ({ input }) => {
          const question = input?.question ?? '';
          // Drive the full Agent Builder default agent (`elastic-ai-agent`)
          // via `/api/agent_builder/converse`, mirroring the alerts-rag
          // suite. This is the supported successor to the LangSmith-era
          // `DefaultAssistantGraph.invoke()` path: the agent runs its own
          // tool loop (list_indices, get_index_mapping, generate_esql)
          // before surfacing a result, so the suite measures the same
          // production code path users hit from the assistant UI.
          const response = await chatClient.converse({ message: question });
          const esql = extractEsqlFromConverseResponse(response);

          const output: EsqlTaskOutput = {
            esql,
            traceId: response.traceId,
            messages: response.messages,
            steps: response.steps,
          };
          return output;
        },
      },
      [
        // Quality (LLM- and code-judged): functional correctness of generated ES|QL.
        esqlEquivalenceEvaluator,
        esqlValidityEvaluator,
        esqlExecutionEvaluator,
        esqlResultEquivalenceEvaluator,
        // Trajectory (LLM-free): scores the agent's tool-call path against a
        // per-example golden sequence. Reports N/A until annotations land.
        createEsqlTrajectoryEvaluator(),
        // Observability (trace-based, zero per-example LLM cost): baseline
        // signals derived from OTel spans for this task's trace.id. Used to
        // track regressions in latency / token usage / tool-call counts over
        // time without paying for additional LLM judging.
        toolCalls,
        latency,
        inputTokens,
        outputTokens,
        cachedTokens,
      ]
    );
  };
}
