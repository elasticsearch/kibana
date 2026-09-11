/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { BoundInferenceClient, Model } from '@kbn/inference-common';
import type { HttpHandler } from '@kbn/core/public';
import type { AvailableConnectorWithId } from '@kbn/gen-ai-functional-testing';
import type { DatasetMaturity, Direction, Model as ScoreModel } from '@kbn/evals-common';
import type { EsClient, ScoutWorkerFixtures } from '@kbn/scout';
import type { EvaluationCriterion } from './evaluators/criteria';
import { type EvaluationReporter } from './utils/reporting/evaluation_reporter';
import type {
  EvaluatorDisplayOptions,
  EvaluatorDisplayGroup,
} from './utils/reporting/report_table';
import type { EvalsClient, EvaluatorStats } from './utils/evals_client';
import type { EvaluatorApiClient } from './utils/evaluator_api_client';
import type { AgentBuilderClient } from './utils/agent_builder_client';

export interface EvaluationDataset<TExample extends Example = Example> {
  name: string;
  description: string;
  tags?: string[];
  /** How curated this dataset is. Omitting it leaves the stored value as-is. */
  maturity?: DatasetMaturity;
  examples: TExample[];
  id?: undefined;
}

export interface EvaluationDatasetWithId<TExample extends Example = Example>
  extends Omit<EvaluationDataset<TExample>, 'id'> {
  id: string;
}

export type TaskOutput = unknown;

export interface Example<
  TInput extends Record<string, unknown> = Record<string, unknown>,
  TExpected = any,
  TMetadata extends Record<string, unknown> | null = Record<string, unknown> | null
> {
  /**
   * Stable identifier for this example, typically a content hash.
   * Optional because inline datasets may not have persisted IDs.
   */
  id?: string;
  input?: TInput;
  /**
   * Expected output/ground truth for the example.
   */
  output?: TExpected;
  metadata?: TMetadata;
}

export interface EvaluatorParams<TExample extends Example, TTaskOutput extends TaskOutput> {
  input: TExample['input'];
  output: TTaskOutput;
  expected: TExample['output'];
  metadata: TExample['metadata'];
}

/**
 * Evaluation output returned by evaluators.
 *
 * Follows the trace-first evaluator contract (vision Section 5.2.1): evaluators produce
 * standardized score/label/explanation outputs. The `metadata` field can carry trace
 * references and evaluator-specific details for explainability.
 *
 * This shape is intentionally compatible with the existing evaluator implementations:
 * - `score` may be omitted or `null` for "unavailable"/"error" cases
 * - `label`/`explanation` are used widely in tests and reporting
 */
export interface EvaluationResult {
  score?: number | null;
  label?: string | null;
  explanation?: string | null;
  reasoning?: string;
  metadata?: Record<string, unknown> | undefined;
}

type EvaluatorCallback<TExample extends Example, TTaskOutput extends TaskOutput> = (
  params: EvaluatorParams<TExample, TTaskOutput>
) => Promise<EvaluationResult>;

/**
 * Core evaluator interface.
 *
 * All evaluators — whether CODE-kind (deterministic) or LLM-kind (model-scored) — implement
 * this interface. Per the @kbn/evals vision (Section 5.2.1), evaluators should progressively
 * migrate to deriving signals from OTel traces stored in Elasticsearch rather than only
 * operating on in-memory task output. Use {@link createTraceBasedEvaluator} for trace-native
 * evaluators.
 *
 * @see TraceBasedEvaluatorConfig for the trace-first evaluator factory configuration
 */
export type EvaluatorKind = 'LLM' | 'CODE';

export interface Evaluator<
  TExample extends Example = Example,
  TTaskOutput extends TaskOutput = TaskOutput
> {
  name: string;
  kind: EvaluatorKind;
  evaluate: EvaluatorCallback<TExample, TTaskOutput>;
  /**
   * Whether a higher score is an improvement (`maximize`), a lower score is
   * an improvement (`minimize`), or the score cannot be compared across arms
   * at all (`neutral`).
   */
  direction: Direction;
  /**
   * Model this evaluator judges with, used to attribute its scores. Read after
   * `evaluate` resolves because evaluators backed by `POST /_evaluate` only learn
   * their model from the response. Undefined for CODE evaluators.
   */
  getModel?: () => ScoreModel | undefined;
  /** Resolved evaluator version, read after `evaluate` for API-backed evaluators. */
  getVersion?: () => string | undefined;
}
export interface DefaultEvaluators {
  criteria: (criteria: EvaluationCriterion[]) => Evaluator;
  correctnessAnalysis: () => Evaluator;
  groundednessAnalysis: () => Evaluator;
  traceBasedEvaluators: {
    inputTokens: Evaluator;
    outputTokens: Evaluator;
    latency: Evaluator;
    toolCalls: Evaluator;
    cachedTokens: Evaluator;
  };
}

export type ExperimentTask<TExample extends Example, TTaskOutput extends TaskOutput> = (
  example: TExample
) => Promise<TTaskOutput>;

/**
 * Shared executor interface for eval runners.
 *
 * Note: the eval suites should depend on this interface (or structural typing), not executor-specific types.
 */
export interface EvalsExecutorClient {
  runExperiment<
    TEvaluationDataset extends EvaluationDataset,
    TTaskOutput extends TaskOutput = TaskOutput
  >(
    options: {
      /**
       * Human-readable experiment name (e.g. the task name)
       */
      name?: string;
      /**
       * Datasets to run the experiment against.
       * Each dataset is processed independently and a separate
       * {@link DatasetRunResult} is returned per dataset.
       */
      datasets: TEvaluationDataset[];
      metadata?: Record<string, unknown>;
      task: ExperimentTask<TEvaluationDataset['examples'][number], TTaskOutput>;
      concurrency?: number;
      trustUpstreamDataset?: boolean;
    },
    evaluators: Array<Evaluator<TEvaluationDataset['examples'][number], TTaskOutput>>
  ): Promise<DatasetRunResult[]>;

  getDatasetRunResults(): Promise<DatasetRunResult[]>;
}

export interface ExampleWithId extends Example {
  id: string;
}

export interface TaskRun {
  exampleIndex: number;
  repetition: number;
  input: Example['input'];
  expected: Example['output'];
  metadata: Example['metadata'];
  output: TaskOutput;
  traceId?: string | null;
  /** Set when the task itself threw; evaluators are skipped for such runs. */
  error?: string;
}

export interface EvaluationRun {
  name: string;
  version?: string;
  result?: EvaluationResult;
  experimentRunId: string;
  traceId?: string | null;
  exampleId?: string;
  direction: Direction;
  kind?: EvaluatorKind;
  /** Model the evaluator judged with; absent for CODE evaluators. */
  model?: ScoreModel;
}

export interface DatasetRunResult {
  id: string;
  experimentName: string;
  datasetId: string;
  datasetName: string;
  datasetDescription?: string;
  runs: Record<string, TaskRun>;
  evaluationRuns: EvaluationRun[];
  experimentMetadata?: Record<string, unknown>;
}

/**
 * Emitted by the executor client when an experiment starts.
 */
export interface ExperimentStartEvent {
  experimentId: string;
}

export type OnExperimentStart = (event: ExperimentStartEvent) => Promise<void>;

/**
 * Emitted by the executor client after each evaluator completes for a single
 * example+repetition. Consumers (e.g. the Playwright fixture) can use this to
 * incrementally export score documents to Elasticsearch so that results survive
 * worker crashes.
 */
export interface EvaluationCompleteEvent {
  experimentId: string;
  experimentName: string;
  datasetId: string;
  datasetName: string;
  taskRun: TaskRun;
  evaluationRun: EvaluationRun;
  exampleId: string;
}

export type OnEvaluationComplete = (event: EvaluationCompleteEvent) => Promise<void>;

export interface ReportDisplayOptions {
  /**
   * Display options for individual evaluators, keyed by evaluator name.
   * Controls decimal places, units, and which statistics to show.
   */
  evaluatorDisplayOptions: Map<string, EvaluatorDisplayOptions>;

  /**
   * Grouping configuration for combining multiple evaluators into a single column.
   * For example, grouping Input/Output/Cached tokens into a "Tokens" column.
   */
  evaluatorDisplayGroups: EvaluatorDisplayGroup[];
}
export interface EvaluationReport {
  stats: EvaluatorStats[];
  model: Model;
  evaluatorModel: Model;
  repetitions: number;
  experimentId: string;
}

export interface WorkerExperimentIdRef {
  current: string | undefined;
}

export interface WorkerExecutionIdRef {
  current: string | undefined;
}

export interface EvaluationSpecificWorkerFixtures {
  inferenceClient: BoundInferenceClient;
  agentBuilderClient: AgentBuilderClient;
  evalsClient: EvalsClient;
  evaluatorClient: EvaluatorApiClient;
  /**
   * Executor client used to run experiments.
   */
  executorClient: EvalsExecutorClient;
  evaluators: DefaultEvaluators;
  fetch: HttpHandler;
  workerExperimentId: WorkerExperimentIdRef;
  workerExecutionId: WorkerExecutionIdRef;
  connector: AvailableConnectorWithId;
  evaluationConnector: AvailableConnectorWithId;
  /**
   * User-selected connector descriptors set per-project in the Playwright config.
   * These are Playwright options (`{ option: true }`) consumed by the `connector` /
   * `evaluationConnector` fixtures, which create/resolve the actual connectors.
   * They default to `undefined` and must be set per-project (see createPlaywrightEvalsConfig).
   */
  connectorParam: AvailableConnectorWithId | undefined;
  evaluationConnectorParam: AvailableConnectorWithId | undefined;
  repetitions: number;
  reportDisplayOptions: ReportDisplayOptions;
  reportModelScore: EvaluationReporter;
  traceEsClient: EsClient;
}

export interface EvaluationWorkerFixtures extends ScoutWorkerFixtures {
  inferenceClient: BoundInferenceClient;
  agentBuilderClient: AgentBuilderClient;
  /**
   * Executor client used to run experiments.
   */
  executorClient: EvalsExecutorClient;
  evaluators: DefaultEvaluators;
  fetch: HttpHandler;
  connector: AvailableConnectorWithId;
  evaluationConnector: AvailableConnectorWithId;
  repetitions: number;
}
