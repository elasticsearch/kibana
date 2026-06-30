/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { KbnClient } from '@kbn/kbn-client';
import type { SomeDevLog } from '@kbn/some-dev-log';
import {
  API_VERSIONS,
  DATASET_UUID_NAMESPACE,
  EVALS_DATASETS_URL,
  EVALS_DATASET_UPSERT_URL,
  EVALS_DATASET_URL,
  EVALS_EXPERIMENT_SCORES_URL,
  EVALS_EXPERIMENT_URL,
  EVALS_EXPERIMENTS_URL,
  EVALS_SCORES_URL,
  GetEvaluationDatasetResponse,
  GetEvaluationExperimentResponse,
  GetEvaluationExperimentScoresResponse,
  GetEvaluationExperimentsResponse,
  IngestScoresRequestBody,
  IngestScoresResponse,
  MAX_SCORES_PER_QUERY,
  type EvaluationExperimentSummary,
  type EvaluationScoreDocument,
  type IngestScoresRequestBodyInput,
  type Model as EvalsModel,
} from '@kbn/evals-common';
import { v5 as uuidv5 } from 'uuid';
import { getStatusCode } from './retry_utils';

export interface EvaluatorStats {
  datasetId: string;
  datasetName: string;
  evaluatorName: string;
  stats: {
    mean: number;
    median: number;
    stdDev: number;
    min: number;
    max: number;
    count: number;
  };
}

export interface ExperimentStats {
  stats: EvaluatorStats[];
  taskModel: EvalsModel;
  evaluatorModel: EvalsModel;
  totalRepetitions: number;
}

interface GetExperimentFilters {
  taskModelId?: string;
  suiteId?: string;
  /**
   * When provided, the experiment detail route filters by `metadata.execution_id`
   * instead of the path `experiment_id`. The experiments listing route returns
   * `execution_id` as the grouping key, so callers that paginate experiments and
   * then fetch stats must pass it here (the bare `experiment_id` path lookup will
   * 404 because it targets a different field).
   */
  executionId?: string;
}

export interface ListExperimentsFilters {
  suiteId?: string;
  taskModelId?: string;
  branch?: string;
  datasetId?: string;
  buildId?: string;
}

const LIST_EXPERIMENTS_PER_PAGE = 100;

export interface UpsertDatasetInput {
  name: string;
  description: string;
  examples: Array<{
    input?: Record<string, unknown>;
    output?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
  }>;
}

export interface DatasetWithId {
  id: string;
  name: string;
  description: string;
  examples: Array<{
    id: string;
    input?: Record<string, unknown>;
    output?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
  }>;
}

interface IngestScoresResult {
  ingested: number;
  conflicted: number;
  failed: Array<{
    index: number;
    status: number;
    reason: string;
  }>;
}

export interface IngestScoresError extends Error {
  statusCode: 400 | 429 | 500;
  body: IngestScoresResult;
}

const EVALS_PLUGIN_DISABLED_MESSAGE =
  'Evaluations plugin is not enabled on the target Kibana. Ensure xpack.evals.enabled=true is set in the Kibana configuration.';

const getResponseData = (response: unknown): unknown => {
  if (typeof response === 'object' && response !== null && 'data' in response) {
    return (response as { data: unknown }).data;
  }

  return response;
};

const getResponseStatusCode = (response: unknown): number | undefined => {
  if (typeof response !== 'object' || response === null || !('status' in response)) {
    return undefined;
  }

  const status = (response as { status: unknown }).status;
  return typeof status === 'number' ? status : undefined;
};

const toIngestScoresError = (statusCode: 400 | 429 | 500, body: IngestScoresResult) =>
  Object.assign(new Error(`Failed to ingest scores (status ${statusCode})`), {
    statusCode,
    body,
  }) as IngestScoresError;

const mapStatsResponse = (
  response: ReturnType<typeof GetEvaluationExperimentResponse.parse>
): ExperimentStats => {
  const { task_model: taskModel, evaluator_model: evaluatorModel } = response;
  if (!taskModel || !evaluatorModel) {
    throw new Error('Evaluation experiment is missing model metadata');
  }

  return {
    taskModel,
    evaluatorModel,
    totalRepetitions: response.total_repetitions ?? 1,
    stats: response.stats.map((stat) => ({
      datasetId: stat.dataset_id,
      datasetName: stat.dataset_name,
      evaluatorName: stat.evaluator_name,
      stats: {
        mean: stat.stats.mean,
        median: stat.stats.median,
        stdDev: stat.stats.std_dev,
        min: stat.stats.min,
        max: stat.stats.max,
        count: stat.stats.count,
      },
    })),
  };
};

const buildExperimentQuery = (options?: GetExperimentFilters) => ({
  suite_id: options?.suiteId,
  model_id: options?.taskModelId,
  execution_id: options?.executionId,
});

const VERSIONED_HEADERS = { 'elastic-api-version': API_VERSIONS.internal.v1 };

export class EvalsClient {
  constructor(private readonly kbnClient: KbnClient, private readonly log: SomeDevLog) {}

  async ingestScores(request: IngestScoresRequestBodyInput): Promise<IngestScoresResult> {
    const body = IngestScoresRequestBody.parse(request);
    const response = await this.kbnClient.request({
      path: EVALS_SCORES_URL,
      method: 'POST',
      body,
      headers: VERSIONED_HEADERS,
      ignoreErrors: [400, 429, 500],
    });
    const statusCode = getResponseStatusCode(response);
    const data = getResponseData(response);

    if (statusCode === 400 || statusCode === 429 || statusCode === 500) {
      const parseResult = IngestScoresResponse.safeParse(data);
      if (parseResult.success) {
        throw toIngestScoresError(statusCode, parseResult.data);
      }
      const message =
        typeof data === 'object' && data !== null && 'message' in data
          ? String((data as { message: unknown }).message)
          : `Server returned ${statusCode}`;
      throw toIngestScoresError(statusCode, {
        ingested: 0,
        conflicted: 0,
        failed: [{ index: -1, status: statusCode, reason: message }],
      });
    }

    return IngestScoresResponse.parse(data);
  }

  /**
   * Lists evaluation experiment summaries, transparently paginating through the
   * route's `page`/`per_page` window until all matching experiments are fetched.
   */
  async listExperiments(filters?: ListExperimentsFilters): Promise<EvaluationExperimentSummary[]> {
    const all: EvaluationExperimentSummary[] = [];
    let page = 1;

    for (;;) {
      const response = await this.kbnClient.request({
        path: EVALS_EXPERIMENTS_URL,
        method: 'GET',
        query: {
          suite_id: filters?.suiteId,
          model_id: filters?.taskModelId,
          branch: filters?.branch,
          dataset_id: filters?.datasetId,
          build_id: filters?.buildId,
          page,
          per_page: LIST_EXPERIMENTS_PER_PAGE,
        },
        headers: VERSIONED_HEADERS,
      });

      const parsed = GetEvaluationExperimentsResponse.parse(getResponseData(response));
      all.push(...parsed.experiments);

      if (parsed.experiments.length === 0 || all.length >= parsed.total) {
        break;
      }
      page += 1;
    }

    return all;
  }

  async getExperimentStats(
    experimentId: string,
    options?: GetExperimentFilters
  ): Promise<ExperimentStats | null> {
    try {
      const response = await this.kbnClient.request({
        path: EVALS_EXPERIMENT_URL.replace('{experimentId}', encodeURIComponent(experimentId)),
        method: 'GET',
        query: buildExperimentQuery(options),
        headers: VERSIONED_HEADERS,
      });

      return mapStatsResponse(GetEvaluationExperimentResponse.parse(getResponseData(response)));
    } catch (error: unknown) {
      const status = getStatusCode(error);
      const message = error instanceof Error ? error.message : String(error);
      this.log.error(
        `Failed to retrieve stats for experiment ID ${experimentId}: ${
          status ? `[HTTP ${status}] ` : ''
        }${message}`
      );
      return null;
    }
  }

  async getExperimentScores(
    experimentId: string,
    options?: GetExperimentFilters
  ): Promise<EvaluationScoreDocument[]> {
    try {
      const response = await this.kbnClient.request({
        path: EVALS_EXPERIMENT_SCORES_URL.replace(
          '{experimentId}',
          encodeURIComponent(experimentId)
        ),
        method: 'GET',
        query: buildExperimentQuery(options),
        headers: VERSIONED_HEADERS,
      });
      const parsed = GetEvaluationExperimentScoresResponse.parse(getResponseData(response));

      if (parsed.total > MAX_SCORES_PER_QUERY) {
        throw new Error(
          `Experiment ${experimentId} returned ${parsed.total} scores, which exceeds MAX_SCORES_PER_QUERY (${MAX_SCORES_PER_QUERY})`
        );
      }

      return parsed.scores;
    } catch (error: unknown) {
      this.log.error(`Failed to retrieve scores for experiment ID ${experimentId}:`, error);
      return [];
    }
  }

  async upsertDataset(dataset: UpsertDatasetInput): Promise<void> {
    await this.kbnClient.request({
      path: EVALS_DATASET_UPSERT_URL,
      method: 'POST',
      body: {
        name: dataset.name,
        description: dataset.description,
        examples: dataset.examples,
      },
      headers: VERSIONED_HEADERS,
      retries: 0,
    });
  }

  async getDatasetByName(datasetName: string): Promise<DatasetWithId | null> {
    try {
      const datasetId = uuidv5(datasetName, DATASET_UUID_NAMESPACE);
      const response = await this.kbnClient.request({
        path: EVALS_DATASET_URL.replace('{datasetId}', encodeURIComponent(datasetId)),
        method: 'GET',
        headers: VERSIONED_HEADERS,
        retries: 0,
      });

      const parsed = GetEvaluationDatasetResponse.parse(getResponseData(response));

      return {
        id: parsed.id,
        name: parsed.name,
        description: parsed.description,
        examples: parsed.examples.map(({ id, input, output, metadata }) => ({
          id,
          input,
          output,
          metadata,
        })),
      };
    } catch (error: unknown) {
      if (getStatusCode(error) === 404) {
        return null;
      }
      throw error;
    }
  }

  async assertPluginEnabled(): Promise<void> {
    try {
      await this.kbnClient.request({
        path: EVALS_DATASETS_URL,
        method: 'GET',
        query: { page: 1, per_page: 1 },
        headers: VERSIONED_HEADERS,
        retries: 0,
      });
    } catch (error: unknown) {
      if (getStatusCode(error) === 404) {
        throw new Error(EVALS_PLUGIN_DISABLED_MESSAGE);
      }
      throw error;
    }
  }
}
