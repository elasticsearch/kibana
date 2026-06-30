/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { PhoenixClient } from '@arizeai/phoenix-client';
import { createClient } from '@arizeai/phoenix-client';
import type { DatasetInfo } from '@arizeai/phoenix-client/types/datasets';
import type {
  ExperimentRun,
  ExperimentEvaluationRun,
} from '@arizeai/phoenix-client/types/experiments';
import type { SomeDevLog } from '@kbn/some-dev-log';
import type { Model } from '@kbn/inference-common';
import { withInferenceContext } from '@kbn/inference-tracing';
import type {
  EvalsExecutorClient,
  Evaluator,
  EvaluationDataset,
  ExperimentTask,
  DatasetRunResult,
  TaskOutput,
} from '@kbn/evals';
import { upsertDataset } from './upsert_dataset';
import type { PhoenixConfig } from './get_phoenix_config';

/**
 * Phoenix-backed eval runner. This remains supported as an option during the migration,
 * but the rest of `@kbn/evals` should depend only on the shared runner interface + types.
 */
export class KibanaPhoenixClient implements EvalsExecutorClient {
  private readonly phoenixClient: PhoenixClient;
  private readonly allowPhoenixDatasetDeleteRecreateFallback: boolean;

  private readonly datasetRunResults: DatasetRunResult[] = [];

  constructor(
    private readonly options: {
      config: PhoenixConfig;
      log: SomeDevLog;
      model: Model;
      executionId?: string;
      repetitions?: number;
    }
  ) {
    this.phoenixClient = createClient({
      options: this.options.config,
    });
    this.allowPhoenixDatasetDeleteRecreateFallback =
      process.env.KBN_EVALS_PHOENIX_ALLOW_DATASET_DELETE_RECREATE_FALLBACK === 'true';
  }

  private async syncDataSet(dataset: EvaluationDataset): Promise<{ datasetId: string }> {
    // `module: preserve` + bundler resolution wrap the ESM namespace as
    // `{ default: <namespace> }` when imported from a CJS-context package.
    // Unwrap at runtime; cast to `any` because TS sees only the wrapped shape.
    const datasetsImport = (await import('@arizeai/phoenix-client/datasets')) as any;
    const datasets = (datasetsImport.default ?? datasetsImport) as {
      createDataset: (args: {
        client: PhoenixClient;
        name: string;
        description?: string;
        examples: Array<{ input: unknown; output: unknown; metadata: unknown }>;
      }) => Promise<{ datasetId: string }>;
    };

    const getDatasetsByNameResponse = await this.phoenixClient.GET('/v1/datasets', {
      params: {
        query: {
          name: dataset.name,
        },
      },
    });

    if (!getDatasetsByNameResponse.data?.data.length) {
      const { datasetId } = await datasets.createDataset({
        client: this.phoenixClient,
        name: dataset.name,
        description: dataset.description,
        examples: dataset.examples.map((example) => {
          return {
            input: example.input ?? {},
            output: (example.output ?? null) as any,
            metadata: (example.metadata ?? {}) as any,
          };
        }),
      });

      return { datasetId };
    }

    const storedDataset = getDatasetsByNameResponse.data.data[0];

    const examplesResponse = await this.phoenixClient.GET('/v1/datasets/{id}/examples', {
      params: {
        path: {
          id: storedDataset.id,
        },
      },
    });

    try {
      await upsertDataset({
        phoenixClient: this.phoenixClient,
        datasetId: storedDataset.id,
        storedExamples: (examplesResponse.data?.data.examples ?? []) as any,
        nextExamples: dataset.examples as any,
      });
    } catch (error) {
      // Some Phoenix versions/environments intermittently fail the GraphQL dataset upsert.
      // Deleting a dataset wipes all past experiments on that dataset, so only do this with explicit consent.
      if (!this.allowPhoenixDatasetDeleteRecreateFallback) {
        this.options.log.warning(
          `Phoenix dataset upsert failed for "${dataset.name}" (id: ${storedDataset.id}). ` +
            `Refusing to delete+recreate without explicit opt-in. ` +
            `To allow the destructive fallback (will wipe past experiments), set ` +
            `KBN_EVALS_PHOENIX_ALLOW_DATASET_DELETE_RECREATE_FALLBACK=true.`
        );
        this.options.log.debug(error);
        throw error;
      }

      const message = `Phoenix dataset upsert failed for "${dataset.name}" (id: ${storedDataset.id}); falling back to delete+recreate`;
      this.options.log.warning(message);
      this.options.log.debug(error);

      await this.phoenixClient.DELETE('/v1/datasets/{id}', {
        params: { path: { id: storedDataset.id } },
      });

      const { datasetId } = await datasets.createDataset({
        client: this.phoenixClient,
        name: dataset.name,
        description: dataset.description,
        examples: dataset.examples.map((example) => {
          return {
            input: example.input ?? {},
            output: (example.output ?? null) as any,
            metadata: (example.metadata ?? {}) as any,
          };
        }),
      });

      return { datasetId };
    }

    return { datasetId: storedDataset.id };
  }

  async getDatasetByName(name: string): Promise<DatasetInfo> {
    const response = await this.phoenixClient.GET('/v1/datasets', {
      params: {
        query: {
          name,
        },
      },
    });

    const datasets = response.data?.data ?? [];

    if (datasets.length === 0) {
      throw new Error(`Phoenix dataset not found: ${name}`);
    }

    if (datasets.length > 1) {
      throw new Error(
        `Multiple Phoenix datasets found for name: ${name}. Please ensure dataset names are unique.`
      );
    }

    return datasets[0];
  }

  async runExperiment<TEvaluationDataset extends EvaluationDataset, TTaskOutput extends TaskOutput>(
    options: {
      name?: string;
      datasets: TEvaluationDataset[];
      metadata?: Record<string, unknown>;
      task: ExperimentTask<TEvaluationDataset['examples'][number], TTaskOutput>;
      concurrency?: number;
      trustUpstreamDataset?: boolean;
    },
    evaluators: Array<Evaluator<TEvaluationDataset['examples'][number], TTaskOutput>>
  ): Promise<DatasetRunResult[]> {
    const { datasets, ...rest } = options;
    const experimentName = rest.name ?? datasets[0].name;
    const results: DatasetRunResult[] = [];
    for (const ds of datasets) {
      results.push(
        await this.runSingleDataset({ ...rest, name: experimentName, dataset: ds }, evaluators)
      );
    }
    return results;
  }

  private async runSingleDataset<
    TEvaluationDataset extends EvaluationDataset,
    TTaskOutput extends TaskOutput
  >(
    options: {
      name: string;
      dataset: TEvaluationDataset;
      metadata?: Record<string, unknown>;
      task: ExperimentTask<TEvaluationDataset['examples'][number], TTaskOutput>;
      concurrency?: number;
      trustUpstreamDataset?: boolean;
    },
    evaluators: Array<Evaluator<TEvaluationDataset['examples'][number], TTaskOutput>>
  ): Promise<DatasetRunResult> {
    return withInferenceContext(async () => {
      const {
        name,
        dataset,
        task,
        metadata: experimentMetadata,
        concurrency,
        trustUpstreamDataset,
      } = options;
      const experimentName = name;

      const datasetId = trustUpstreamDataset
        ? (await this.getDatasetByName(dataset.name)).id
        : (await this.syncDataSet(dataset)).datasetId;

      const experimentsImport = (await import('@arizeai/phoenix-client/experiments')) as any;
      const experiments = (experimentsImport.default ?? experimentsImport) as {
        runExperiment: (args: any) => Promise<any>;
      };

      const ran = await experiments.runExperiment({
        client: this.phoenixClient,
        dataset: { datasetId },
        experimentName: `Experiment: ${experimentName} - Dataset: ${dataset.name}`,
        // Phoenix expects its own task/evaluator types. Keep the adapter boundary here.
        task: task as any,
        experimentMetadata: {
          ...experimentMetadata,
          model: this.options.model,
          executionId: this.options.executionId,
        },
        setGlobalTracerProvider: false,
        evaluators: evaluators.map((evaluator) => {
          return {
            name: evaluator.name,
            kind: evaluator.kind,
            evaluate: ({ input, output, expected, metadata: md }: any) => {
              return evaluator.evaluate({
                expected: expected ?? null,
                input,
                metadata: md ?? {},
                output,
              });
            },
          };
        }) as any,
        logger: {
          error: this.options.log.error.bind(this.options.log),
          info: this.options.log.info.bind(this.options.log),
          log: this.options.log.info.bind(this.options.log),
        },
        repetitions: this.options.repetitions ?? 1,
        concurrency,
      });

      // Translate Phoenix's ExperimentRun structure to Kibana's TaskRun format
      const phoenixRuns: Record<string, ExperimentRun> = ran.runs ?? {};

      // Group runs by datasetExampleId to compute repetition indices
      const runsByExampleId = new Map<
        string,
        Array<{ runKey: string; phoenixRun: ExperimentRun }>
      >();
      for (const [runKey, phoenixRun] of Object.entries(phoenixRuns)) {
        const group = runsByExampleId.get(phoenixRun.datasetExampleId) ?? [];
        group.push({ runKey, phoenixRun });
        runsByExampleId.set(phoenixRun.datasetExampleId, group);
      }

      // Assign stable example indices based on insertion order
      const exampleIds = Array.from(runsByExampleId.keys());
      const exampleIdToIndex = new Map(exampleIds.map((id, index) => [id, index]));

      // Build TaskRun records
      const runs: DatasetRunResult['runs'] = {};
      for (const [exampleId, group] of runsByExampleId) {
        const exampleIndex = exampleIdToIndex.get(exampleId)!;
        const matchingExample = dataset.examples[exampleIndex] ?? {};

        group.forEach(({ runKey, phoenixRun }, repetition) => {
          runs[runKey] = {
            exampleIndex,
            repetition,
            input: matchingExample.input ?? {},
            expected: matchingExample.output ?? null,
            metadata: matchingExample.metadata ?? {},
            output: phoenixRun.output,
            traceId: phoenixRun.traceId,
          };
        });
      }

      // Map evaluation runs with their corresponding exampleId
      const evaluationRuns: DatasetRunResult['evaluationRuns'] = (ran.evaluationRuns ?? []).map(
        (evalRun: ExperimentEvaluationRun) => ({
          name: evalRun.name,
          result: evalRun.result ?? undefined,
          experimentRunId: evalRun.experimentRunId,
          traceId: evalRun.traceId,
          exampleId: phoenixRuns[evalRun.experimentRunId]?.datasetExampleId,
        })
      );

      const result: DatasetRunResult = {
        id: ran.id ?? '',
        experimentName,
        datasetId: ran.datasetId,
        datasetName: dataset.name,
        datasetDescription: dataset.description,
        runs,
        evaluationRuns,
        experimentMetadata: (ran as any).experimentMetadata as any,
      };

      this.datasetRunResults.push(result);
      return result;
    });
  }

  async getDatasetRunResults(): Promise<DatasetRunResult[]> {
    return this.datasetRunResults;
  }
}
