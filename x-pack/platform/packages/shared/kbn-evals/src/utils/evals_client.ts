/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { KbnClient } from '@kbn/kbn-client';
import type { SomeDevLog } from '@kbn/some-dev-log';
import { z } from '@kbn/zod';
import {
  API_VERSIONS,
  DeleteEvaluationDatasetResponse,
  EVALS_DATASETS_URL,
  EVALS_DATASET_RESOLVE_URL,
  EVALS_DATASET_UPSERT_URL,
  EVALS_DATASET_URL,
  EVALS_EXPERIMENT_SCORES_URL,
  EVALS_EXPERIMENT_URL,
  EVALS_EXPERIMENTS_URL,
  EVALS_EXAMPLE_SCORES_URL,
  EVALS_SCORES_URL,
  GetEvaluationDatasetResponse,
  GetEvaluationExperimentResponse,
  GetEvaluationExperimentScoresResponse,
  GetEvaluationExperimentsResponse,
  GetExampleScoresResponse,
  IngestScoresRequestBody,
  IngestScoresResponse,
  MAX_SCORES_PER_QUERY,
  DEFAULT_SPACE_ID,
  ResolveEvaluationDatasetResponse,
  UpsertEvaluationDatasetResponse,
  getDatasetId,
  type DatasetMaturity,
  type EvaluationExperimentSummary,
  type EvaluationScoreDocument,
  type IngestScoresRequestBodyInput,
  type Model as EvalsModel,
} from '@kbn/evals-common';
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
  /** The judge most evaluators used, absent when only code evaluators scored the experiment. */
  evaluatorModel?: EvalsModel;
  totalRepetitions: number;
}

interface GetExperimentFilters {
  taskModelId?: string;
  suiteId?: string;
  executionId?: string;
}

export interface UpsertDatasetInput {
  name: string;
  description: string;
  tags?: string[];
  maturity?: DatasetMaturity;
  /** Spaces to assign the dataset to. Omitted means the space the request lands in. */
  spaceIds?: string[];
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
  tags?: string[];
  maturity?: DatasetMaturity;
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

export interface BaselineExperiment {
  executionId: string;
  timestamp: string | undefined;
  gitCommitSha: string | null;
  gitBranch: string | null;
}

const EVALS_PLUGIN_DISABLED_MESSAGE =
  'Evaluations plugin is not enabled on the target Kibana. Ensure xpack.evals.enabled=true is set in the Kibana configuration.';

const SPACES_URL = '/api/spaces/space';
// Serverless turns away a public api call that doesn't say which version it
// was written against.
const SPACES_HEADERS = { 'elastic-api-version': '2023-10-31' };

const SpacesResponse = z.array(z.object({ id: z.string() }));

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
  if (!taskModel) {
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

export interface ListExperimentsFilters {
  suiteId?: string;
  taskModelId?: string;
  branch?: string;
  datasetId?: string;
  buildId?: string;
  /** Maximum number of experiments to return (newest first). Defaults to and capped at 100 (the route's per_page maximum). */
  limit?: number;
}

export const MAX_LIST_EXPERIMENTS = 100;

export class EvalsClient {
  /** The spaces this run writes to, in the order they were listed. */
  private readonly spaceIds: string[];
  /** The space every request is sent to, when it isn't the default one. */
  private readonly homeSpaceId?: string;

  constructor(
    private readonly kbnClient: KbnClient,
    private readonly log: SomeDevLog,
    { spaceIds = [] }: { spaceIds?: string[] } = {}
  ) {
    this.spaceIds = spaceIds;
    // Runs in the space the datasets are written to, rather than writing to it
    // from the default space, so ids resolve and privileges are checked where
    // the data lands. The first space listed, so a run that widens an existing
    // dataset's spaces still works from the one already holding it.
    const homeSpaceId = spaceIds[0] ?? DEFAULT_SPACE_ID;
    this.homeSpaceId = homeSpaceId === DEFAULT_SPACE_ID ? undefined : homeSpaceId;
  }

  private path(path: string): string {
    return this.homeSpaceId ? `/s/${encodeURIComponent(this.homeSpaceId)}${path}` : path;
  }

  async ingestScores(request: IngestScoresRequestBodyInput): Promise<IngestScoresResult> {
    const body = IngestScoresRequestBody.parse(request);
    const response = await this.kbnClient.request({
      path: this.path(EVALS_SCORES_URL),
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

  async getExperimentStats(
    experimentId: string,
    options?: GetExperimentFilters
  ): Promise<ExperimentStats | null> {
    try {
      const response = await this.kbnClient.request({
        path: this.path(
          EVALS_EXPERIMENT_URL.replace('{experimentId}', encodeURIComponent(experimentId))
        ),
        method: 'GET',
        query: buildExperimentQuery(options),
        headers: VERSIONED_HEADERS,
      });

      return mapStatsResponse(GetEvaluationExperimentResponse.parse(getResponseData(response)));
    } catch (error: unknown) {
      this.log.error(
        `Failed to retrieve stats for experiment ID ${experimentId}: ${
          error instanceof Error ? error.message : String(error)
        }`
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
        path: this.path(
          EVALS_EXPERIMENT_SCORES_URL.replace('{experimentId}', encodeURIComponent(experimentId))
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
      this.log.error(
        `Failed to retrieve scores for experiment ID ${experimentId}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      return [];
    }
  }

  /**
   * Retrieves scores for a single example across all experiments that include
   * it. Unlike {@link getExperimentScores}, the response is NOT stripped of
   * unbounded fields (`task.output`, `example.input`, `example.metadata`),
   * because this route does not apply `_source_excludes`.
   */
  async getExampleScores(
    exampleId: string,
    filters?: { executionId?: string; modelId?: string }
  ): Promise<EvaluationScoreDocument[]> {
    try {
      const query: Record<string, string> = {};
      if (filters?.executionId) {
        query.execution_id = filters.executionId;
      }
      if (filters?.modelId) {
        query.model_id = filters.modelId;
      }
      const response = await this.kbnClient.request({
        path: this.path(
          EVALS_EXAMPLE_SCORES_URL.replace('{exampleId}', encodeURIComponent(exampleId))
        ),
        method: 'GET',
        headers: VERSIONED_HEADERS,
        ...(Object.keys(query).length > 0 ? { query } : {}),
      });
      const parsed = GetExampleScoresResponse.parse(getResponseData(response));

      if (parsed.total > MAX_SCORES_PER_QUERY) {
        throw new Error(
          `Example ${exampleId} returned ${parsed.total} scores, which exceeds MAX_SCORES_PER_QUERY (${MAX_SCORES_PER_QUERY})`
        );
      }

      return parsed.scores;
    } catch (error: unknown) {
      this.log.error(
        `Failed to retrieve scores for example ID ${exampleId}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      return [];
    }
  }

  /**
   * Creates or updates a dataset and returns the id the server assigned it. Ids
   * derive from the owning space, so the caller can't compute one.
   */
  async upsertDataset(dataset: UpsertDatasetInput): Promise<string> {
    const response = await this.kbnClient.request({
      path: this.path(EVALS_DATASET_UPSERT_URL),
      method: 'POST',
      body: {
        name: dataset.name,
        description: dataset.description,
        // Omitted rather than sent as `undefined` so a suite that doesn't
        // declare tags leaves the stored ones alone.
        ...(dataset.tags ? { tags: dataset.tags } : {}),
        ...(dataset.maturity ? { maturity: dataset.maturity } : {}),
        ...(dataset.spaceIds?.length ? { space_ids: dataset.spaceIds } : {}),
        examples: dataset.examples,
      },
      headers: VERSIONED_HEADERS,
      retries: 0,
    });

    return UpsertEvaluationDatasetResponse.parse(getResponseData(response)).dataset_id;
  }

  private async fetchDatasetById(datasetId: string): Promise<DatasetWithId | null> {
    try {
      const response = await this.kbnClient.request({
        path: this.path(EVALS_DATASET_URL.replace('{datasetId}', encodeURIComponent(datasetId))),
        method: 'GET',
        headers: VERSIONED_HEADERS,
        retries: 0,
      });

      const parsed = GetEvaluationDatasetResponse.parse(getResponseData(response));

      return {
        id: parsed.id,
        name: parsed.name,
        description: parsed.description,
        tags: parsed.tags,
        maturity: parsed.maturity,
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

  /**
   * Looks a dataset up by name within the run's space, guessing the legacy id
   * first — all an older Kibana understands — then asking the server.
   */
  async getDatasetByName(datasetName: string): Promise<DatasetWithId | null> {
    const defaultSpaceDataset = await this.fetchDatasetById(
      getDatasetId(DEFAULT_SPACE_ID, datasetName)
    );
    if (defaultSpaceDataset) {
      return defaultSpaceDataset;
    }

    try {
      const response = await this.kbnClient.request({
        path: this.path(EVALS_DATASET_RESOLVE_URL),
        method: 'GET',
        query: { name: datasetName },
        headers: VERSIONED_HEADERS,
        retries: 0,
      });

      const { id } = ResolveEvaluationDatasetResponse.parse(getResponseData(response));
      return await this.fetchDatasetById(id);
    } catch (error: unknown) {
      // A Kibana without this route reads `_resolve` as a dataset id and also
      // answers 404, same as a genuinely unknown name.
      if (getStatusCode(error) === 404) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Deletes a dataset, or detaches it from the run's space when other spaces
   * still use it. The server decides which and reports it back as `unshared`.
   *
   * Takes an id rather than a name: names are only unique within a space, so a
   * wrong one could resolve to a dataset the caller never meant to touch.
   */
  async deleteDataset(datasetId: string): Promise<{ unshared: boolean }> {
    const response = await this.kbnClient.request({
      path: this.path(EVALS_DATASET_URL.replace('{datasetId}', encodeURIComponent(datasetId))),
      method: 'DELETE',
      headers: VERSIONED_HEADERS,
      retries: 0,
    });

    const { unshared } = DeleteEvaluationDatasetResponse.parse(getResponseData(response));

    return { unshared: unshared ?? false };
  }

  async findLatestExperimentForBuild({
    suiteId,
    branch,
    baseExecutionId,
  }: {
    suiteId: string;
    branch?: string;
    baseExecutionId: string;
  }): Promise<BaselineExperiment | undefined> {
    try {
      // metadata.ci.build_id stores the raw BUILDKITE_BUILD_ID without the "bk-" prefix.
      const rawBuildId = baseExecutionId.startsWith('bk-')
        ? baseExecutionId.slice(3)
        : baseExecutionId;

      const response = await this.kbnClient.request({
        path: this.path(EVALS_EXPERIMENTS_URL),
        method: 'GET',
        query: {
          suite_id: suiteId,
          build_id: rawBuildId,
          ...(branch != null && { branch }),
          page: 1,
          per_page: 20,
        },
        headers: VERSIONED_HEADERS,
      });

      const parsed = GetEvaluationExperimentsResponse.parse(getResponseData(response));
      const match = parsed.experiments.find(
        (exp) => exp.execution_id != null && exp.execution_id.startsWith(`${baseExecutionId}::`)
      );

      if (!match || !match.execution_id) {
        return undefined;
      }

      return {
        executionId: match.execution_id,
        timestamp: match.timestamp,
        gitCommitSha: match.git_commit_sha ?? null,
        gitBranch: match.git_branch ?? null,
      };
    } catch (error: unknown) {
      this.log.error(
        `Failed to find experiment for build ${baseExecutionId} on branch ${branch}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      return undefined;
    }
  }

  async findLatestBaselineExperiment({
    suiteId,
    branch,
    taskModelId,
    excludeExecutionId,
  }: {
    suiteId: string;
    branch: string;
    taskModelId?: string;
    excludeExecutionId?: string;
  }): Promise<BaselineExperiment | undefined> {
    try {
      const response = await this.kbnClient.request({
        path: this.path(EVALS_EXPERIMENTS_URL),
        method: 'GET',
        query: {
          suite_id: suiteId,
          branch,
          ...(taskModelId && { model_id: taskModelId }),
          page: 1,
          per_page: 5,
        },
        headers: VERSIONED_HEADERS,
      });

      const parsed = GetEvaluationExperimentsResponse.parse(getResponseData(response));
      const match = parsed.experiments.find(
        (exp) => exp.execution_id != null && exp.execution_id !== excludeExecutionId
      );

      if (!match || !match.execution_id) {
        return undefined;
      }

      return {
        executionId: match.execution_id,
        timestamp: match.timestamp,
        gitCommitSha: match.git_commit_sha ?? null,
        gitBranch: match.git_branch ?? null,
      };
    } catch (error: unknown) {
      this.log.error(
        `Failed to find baseline experiment for suite ${suiteId} on branch ${branch}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      return undefined;
    }
  }

  async assertPluginEnabled(): Promise<void> {
    try {
      await this.kbnClient.request({
        path: this.path(EVALS_DATASETS_URL),
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

  /**
   * Refuses a run aimed at a space that isn't there. Kibana only checks that a
   * space exists when it serves a page, so requests prefixed with a mistyped
   * one are answered as though it were real, and the run would write datasets
   * and scores that no space can reach.
   */
  async assertSpacesExist(): Promise<void> {
    if (this.spaceIds.length === 0) {
      return;
    }

    const existingSpaceIds = await this.fetchSpaceIds();

    // Nothing to check against. Stopping every run whose credentials can't read
    // the space list would cost more than the mistyped id this catches.
    if (!existingSpaceIds) {
      this.log.warning(
        'Could not read the spaces on the target Kibana, so --space-ids goes unverified.'
      );
      return;
    }

    const unknownSpaceIds = this.spaceIds.filter((spaceId) => !existingSpaceIds.has(spaceId));

    if (unknownSpaceIds.length > 0) {
      throw new Error(
        `Unknown space id(s): ${unknownSpaceIds.join(
          ', '
        )}. --space-ids must name spaces that exist on the target Kibana.`
      );
    }
  }

  private async fetchSpaceIds(): Promise<Set<string> | undefined> {
    try {
      const response = await this.kbnClient.request({
        path: SPACES_URL,
        method: 'GET',
        headers: SPACES_HEADERS,
        retries: 0,
      });

      return new Set(SpacesResponse.parse(getResponseData(response)).map(({ id }) => id));
    } catch (error) {
      return undefined;
    }
  }

  async listExperiments(filters?: ListExperimentsFilters): Promise<EvaluationExperimentSummary[]> {
    const limit = Math.min(filters?.limit ?? MAX_LIST_EXPERIMENTS, MAX_LIST_EXPERIMENTS);
    const response = await this.kbnClient.request({
      path: EVALS_EXPERIMENTS_URL,
      method: 'GET',
      query: {
        suite_id: filters?.suiteId,
        model_id: filters?.taskModelId,
        branch: filters?.branch,
        dataset_id: filters?.datasetId,
        build_id: filters?.buildId,
        page: 1,
        per_page: limit,
      },
      headers: VERSIONED_HEADERS,
    });

    const parsed = GetEvaluationExperimentsResponse.parse(getResponseData(response));
    if (!filters?.branch) {
      return parsed.experiments;
    }
    return parsed.experiments.filter((experiment) => experiment.git_branch === filters.branch);
  }
}
