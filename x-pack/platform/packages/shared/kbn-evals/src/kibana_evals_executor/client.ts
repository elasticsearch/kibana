/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import pLimit from 'p-limit';
import { v5 as uuidv5 } from 'uuid';
import { randomUUID } from 'crypto';
import { withInferenceContext } from '@kbn/inference-tracing';
import type { SomeDevLog } from '@kbn/some-dev-log';
import type { Model } from '@kbn/inference-common';
import { DEFAULT_SPACE_ID, getDatasetId } from '@kbn/evals-common';
import type {
  EvalsExecutorClient,
  Evaluator,
  EvaluationDataset,
  EvaluationDatasetWithId,
  ExperimentTask,
  OnEvaluationComplete,
  OnExperimentStart,
  DatasetRunResult,
  TaskOutput,
} from '../types';
import { getCurrentTraceId, withEvaluatorSpan, withTaskSpan } from '../utils/tracing';

const EXPERIMENT_UUID_NAMESPACE = 'c7e6c018-66dc-4511-b97d-046e2194d017';

function computeExperimentId(
  executionId: string | undefined,
  experimentName: string,
  modelId: string | undefined
): string {
  if (!executionId) {
    return randomUUID();
  }
  return uuidv5(
    `${executionId}::${experimentName}::${modelId ?? 'unknown'}`,
    EXPERIMENT_UUID_NAMESPACE
  );
}

export class KibanaEvalsClient implements EvalsExecutorClient {
  private readonly datasetRunResults: DatasetRunResult[] = [];

  constructor(
    private readonly options: {
      log: SomeDevLog;
      model: Model;
      executionId?: string;
      repetitions?: number;
      /**
       * Persists the dataset and resolves to the id the server stored it under,
       * which scores are stamped with. An id it didn't return would detach them.
       */
      upsertDataset?: (dataset: EvaluationDataset) => Promise<string>;
      getDatasetByName?: (
        datasetName: string
      ) => Promise<EvaluationDataset | EvaluationDatasetWithId | null>;
      onEvaluationComplete?: OnEvaluationComplete;
      onExperimentStart?: OnExperimentStart;
    }
  ) {}

  private async resolveDataset(
    dataset: EvaluationDataset,
    trustUpstreamDataset: boolean
  ): Promise<{ dataset: EvaluationDataset; upstreamId?: string }> {
    if (!trustUpstreamDataset) {
      return { dataset };
    }

    if (!this.options.getDatasetByName) {
      throw new Error(
        'KibanaEvalsClient runExperiment called with trustUpstreamDataset=true, but getDatasetByName is not configured'
      );
    }

    const upstreamDataset = await this.options.getDatasetByName(dataset.name);
    if (!upstreamDataset) {
      throw new Error(
        `KibanaEvalsClient could not resolve upstream dataset by name: "${dataset.name}"`
      );
    }

    const { id, name, description, tags, maturity, examples } = upstreamDataset;
    return {
      dataset: {
        name,
        description,
        tags,
        maturity,
        examples,
      },
      upstreamId: id,
    };
  }

  async runExperiment<
    TEvaluationDataset extends EvaluationDataset,
    TTaskOutput extends TaskOutput = TaskOutput
  >(
    {
      name,
      datasets,
      task,
      metadata: experimentMetadata,
      concurrency,
      trustUpstreamDataset = false,
    }: {
      name?: string;
      datasets: TEvaluationDataset[];
      metadata?: Record<string, unknown>;
      task: ExperimentTask<TEvaluationDataset['examples'][number], TTaskOutput>;
      concurrency?: number;
      trustUpstreamDataset?: boolean;
    },
    evaluators: Array<Evaluator<TEvaluationDataset['examples'][number], TTaskOutput>>
  ): Promise<DatasetRunResult[]> {
    const experimentName = name ?? datasets[0].name;

    const results: DatasetRunResult[] = [];
    for (const ds of datasets) {
      results.push(
        await this.runSingleDatasetExperiment(
          {
            experimentName,
            dataset: ds,
            task,
            metadata: experimentMetadata,
            concurrency,
            trustUpstreamDataset,
          },
          evaluators
        )
      );
    }
    return results;
  }

  private async runSingleDatasetExperiment<
    TEvaluationDataset extends EvaluationDataset,
    TTaskOutput extends TaskOutput = TaskOutput
  >(
    {
      experimentName,
      dataset,
      task,
      metadata: experimentMetadata,
      concurrency,
      trustUpstreamDataset = false,
    }: {
      experimentName: string;
      dataset: TEvaluationDataset;
      metadata?: Record<string, unknown>;
      task: ExperimentTask<TEvaluationDataset['examples'][number], TTaskOutput>;
      concurrency?: number;
      trustUpstreamDataset?: boolean;
    },
    evaluators: Array<Evaluator<TEvaluationDataset['examples'][number], TTaskOutput>>
  ): Promise<DatasetRunResult> {
    return withInferenceContext(async () => {
      const { dataset: resolvedDataset, upstreamId } = await this.resolveDataset(
        dataset,
        trustUpstreamDataset
      );
      const upsertedId = await this.options.upsertDataset?.(resolvedDataset);

      // Scores are stamped with this id, so it has to be the one the server
      // stored the dataset under. Deriving it locally is a last resort: ids
      // follow the owning space, which only the server knows here.
      const datasetId =
        upsertedId || upstreamId || getDatasetId(DEFAULT_SPACE_ID, resolvedDataset.name);
      const experimentId = computeExperimentId(
        this.options.executionId,
        experimentName,
        this.options.model.id
      );
      await this.options.onExperimentStart?.({ experimentId });
      const repetitions = this.options.repetitions ?? 3;
      const runConcurrency = Math.max(1, concurrency ?? 5);
      const limiter = pLimit(runConcurrency);

      const evaluationRuns: DatasetRunResult['evaluationRuns'] = [];
      const runs: DatasetRunResult['runs'] = {};
      const erroredRuns: string[] = [];
      const evaluatorAttempts = new Map<string, { errors: number; total: number }>();

      const runJobs: Array<Promise<void>> = [];

      this.options.log.info(
        `🧪 Starting experiment "${experimentName} - Dataset: ${resolvedDataset.name}" with ${evaluators.length} evaluators and ${runConcurrency} concurrent runs`
      );

      for (let rep = 0; rep < repetitions; rep++) {
        resolvedDataset.examples.forEach((example, exampleIndex) => {
          runJobs.push(
            limiter(async () => {
              const runKey = `${exampleIndex}-${rep}-${randomUUID()}`;

              this.options.log.info(
                `🔧 Running task "${resolvedDataset.name}" on dataset "${datasetId}" (exampleIndex=${exampleIndex}, repetition=${rep})`
              );

              const runTask = () =>
                withTaskSpan(
                  resolvedDataset.name,
                  {
                    attributes: {
                      'dataset.name': resolvedDataset.name,
                      'dataset.id': datasetId,
                    },
                  },
                  async () => {
                    const _traceId = getCurrentTraceId();
                    const _taskOutput = await task(example);
                    return {
                      taskOutput: _taskOutput,
                      traceId: _traceId,
                    };
                  }
                );

              let taskSpanResult: Awaited<ReturnType<typeof runTask>>;
              try {
                taskSpanResult = await runTask();
              } catch (error) {
                // One example failing (e.g. converse 500) must not abort the whole
                // experiment: record the run as errored, skip its evaluators, and
                // keep measuring the remaining examples. The aggregate check after
                // all jobs complete still fails the run so this never goes green.
                const message = error instanceof Error ? error.message : String(error);
                this.options.log.error(
                  `❌ Task failed on dataset "${datasetId}" (exampleIndex=${exampleIndex}, repetition=${rep}); continuing with remaining examples: ${message}`
                );
                runs[runKey] = {
                  exampleIndex,
                  repetition: rep,
                  input: example.input,
                  expected: example.output ?? null,
                  metadata: example.metadata ?? {},
                  output: null,
                  traceId: null,
                  error: message,
                };
                erroredRuns.push(`exampleIndex=${exampleIndex}, repetition=${rep}: ${message}`);
                return;
              }
              const { taskOutput, traceId } = taskSpanResult;

              // Prefer the trace id the task itself surfaced (e.g. converse's response
              // trace_id) over the eval client's own task-span trace id. See #276308.
              const taskOrClientTraceId = (taskOutput as { traceId?: string })?.traceId || traceId;

              runs[runKey] = {
                exampleIndex,
                repetition: rep,
                input: example.input,
                expected: example.output ?? null,
                metadata: example.metadata ?? {},
                output: taskOutput,
                traceId: taskOrClientTraceId,
              };

              this.options.log.info(
                `🧠 Evaluating run (exampleIndex=${exampleIndex}, repetition=${rep}) with ${evaluators.length} evaluators`
              );

              const results = await Promise.all(
                evaluators.map(async (evaluator) => {
                  this.options.log.info(
                    `🧠 Evaluating run (exampleIndex=${exampleIndex}, repetition=${rep}) with evaluator "${evaluator.name}"`
                  );
                  const attempts = evaluatorAttempts.get(evaluator.name) ?? { errors: 0, total: 0 };
                  attempts.total += 1;
                  evaluatorAttempts.set(evaluator.name, attempts);
                  try {
                    const { result, evaluatorTraceId } = await withEvaluatorSpan(
                      evaluator.name,
                      {},
                      async () => {
                        const _traceId = getCurrentTraceId();
                        const _result = await evaluator.evaluate({
                          input: example.input,
                          output: {
                            ...taskOutput,
                            traceId: taskOrClientTraceId,
                          },
                          expected: example.output ?? null,
                          metadata: example.metadata ?? {},
                        });
                        return {
                          result: _result,
                          evaluatorTraceId: _traceId,
                        };
                      }
                    );
                    this.options.log.info(
                      `✅ Evaluator "${evaluator.name}" on run (exampleIndex=${exampleIndex}, repetition=${rep}) completed`
                    );
                    return {
                      evaluatorName: evaluator.name,
                      result,
                      evaluatorTraceId,
                      kind: evaluator.kind,
                      direction: evaluator.direction,
                      // Read after `evaluate` so evaluators that learn their model from
                      // the `_evaluate` response have it by now.
                      model: evaluator.getModel?.(),
                      version: evaluator.getVersion?.(),
                    };
                  } catch (error) {
                    // A single evaluator failing (e.g. an LLM judge's inference call
                    // erroring out) must not take down the run's other measurements:
                    // record an explicit error result so the gap is visible in the
                    // exported scores instead of silently dropping the document.
                    const message = error instanceof Error ? error.message : String(error);
                    attempts.errors += 1;
                    this.options.log.error(
                      `❌ Evaluator "${evaluator.name}" failed on run (exampleIndex=${exampleIndex}, repetition=${rep}): ${message}`
                    );
                    return {
                      evaluatorName: evaluator.name,
                      result: {
                        score: null,
                        label: 'error',
                        explanation: `Evaluator threw: ${message}`,
                      },
                      evaluatorTraceId: undefined,
                      kind: evaluator.kind,
                      model: evaluator.getModel?.(),
                      version: evaluator.getVersion?.(),
                    };
                  }
                })
              );

              for (const {
                evaluatorName,
                direction,
                result,
                evaluatorTraceId,
                kind,
                model,
                version,
              } of results) {
                const evalRun = {
                  name: evaluatorName,
                  ...(version && { version }),
                  result,
                  experimentRunId: runKey,
                  traceId: evaluatorTraceId,
                  exampleId: example.id,
                  direction: direction ?? 'neutral',
                  kind,
                  ...(model && { model }),
                };
                evaluationRuns.push(evalRun);

                if (this.options.onEvaluationComplete) {
                  try {
                    await this.options.onEvaluationComplete({
                      experimentId,
                      experimentName,
                      datasetId,
                      datasetName: resolvedDataset.name,
                      taskRun: runs[runKey],
                      evaluationRun: evalRun,
                      exampleId: example.id ?? String(exampleIndex),
                    });
                  } catch (err) {
                    this.options.log.warning(
                      `Incremental score export failed for experiment "${experimentName}" (example=${exampleIndex}, repetition=${rep}): ${err}`
                    );
                  }
                }
              }
            })
          );
        });
      }

      await Promise.all(runJobs);

      const result: DatasetRunResult = {
        id: experimentId,
        experimentName,
        datasetId,
        datasetName: resolvedDataset.name,
        datasetDescription: resolvedDataset.description,
        runs,
        evaluationRuns,
        experimentMetadata: {
          ...experimentMetadata,
          model: this.options.model,
          executionId: this.options.executionId,
        },
      };

      this.datasetRunResults.push(result);

      const fullyBrokenEvaluators = [...evaluatorAttempts.entries()]
        .filter(([, { errors, total }]) => total > 0 && errors === total)
        .map(([name]) => name);
      if (erroredRuns.length > 0 || fullyBrokenEvaluators.length > 0) {
        // Every completed measurement is recorded and exported by now; failing the
        // experiment afterwards keeps errored examples visible instead of either
        // aborting the whole run (previous behavior) or silently going green. An
        // evaluator that failed on every single run is a broken instrument, not a
        // measurement, so that fails the experiment too.
        const details = [
          ...erroredRuns.map((run) => `errored run: ${run}`),
          ...fullyBrokenEvaluators.map(
            (name) =>
              `evaluator "${name}" failed on every run (broken instrument, not a measurement)`
          ),
        ];
        throw new Error(
          `Experiment "${experimentName}" finished with ${
            details.length
          } failure(s):\n${details.join('\n')}`
        );
      }

      this.options.log.info(`✅ Experiment ${experimentId} completed`);
      return result;
    });
  }

  async getDatasetRunResults(): Promise<DatasetRunResult[]> {
    return this.datasetRunResults;
  }
}
