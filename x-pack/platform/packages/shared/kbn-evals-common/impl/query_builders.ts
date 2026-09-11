/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { QueryDslQueryContainer } from '@elastic/elasticsearch/lib/api/types';
import { DEFAULT_SPACE_ID } from './spaces';

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

interface ExperimentFilterOptions {
  suiteId?: string;
  modelId?: string;
  filterField?: 'experiment_id' | 'metadata.execution_id';
  spaceId?: string;
}

interface ExperimentsListingFilterOptions {
  suiteId?: string;
  modelId?: string;
  branch?: string;
  search?: string;
  datasetId?: string;
  datasetName?: string;
  buildId?: string;
  spaceId?: string;
}

interface ExperimentsListingPaginationOptions {
  page: number;
  perPage: number;
}

interface TermsBucket {
  buckets?: Array<{ key: string }>;
}

interface EvaluatorModelsAggregation {
  buckets?: Array<{ key: string; family?: TermsBucket; provider?: TermsBucket }>;
}

interface ExperimentBucket {
  key: string;
  doc_count: number;
  latest_timestamp?: { value_as_string?: string };
  experiment_count?: { value?: number };
  experiment_name?: TermsBucket;
  suite_id?: TermsBucket;
  dataset_id?: TermsBucket;
  dataset_name?: TermsBucket;
  task_model_id?: TermsBucket;
  task_model_family?: TermsBucket;
  task_model_provider?: TermsBucket;
  evaluator_models?: EvaluatorModelsAggregation;
  git_branch?: TermsBucket;
  git_commit_sha?: TermsBucket;
  total_repetitions?: { value?: number };
  build_url?: TermsBucket;
  pull_request?: TermsBucket;
}

interface ExperimentsListingAggregations {
  total_experiments?: { value: number };
  experiments?: { buckets?: ExperimentBucket[] };
}

export interface ExperimentsListingResult {
  experiments: Array<{
    execution_id: string;
    experiment_id: string;
    experiment_name: string | null;
    experiment_count: number;
    timestamp: string | undefined;
    suite_id: string | undefined;
    dataset_ids: string[];
    dataset_names: string[];
    task_model: { id: string; family: string | undefined; provider: string | undefined };
    evaluator_model?: EvaluatorJudgeModel;
    evaluator_models: EvaluatorJudgeModel[];
    git_branch: string | null;
    git_commit_sha: string | null;
    total_repetitions: number;
    ci: { build_url: string | undefined; pull_request: string | undefined };
  }>;
  total: number;
}

// ---------------------------------------------------------------------------
// Space filtering
// ---------------------------------------------------------------------------

/**
 * Builds a filter that matches documents visible in the given space: those
 * assigned to it, and in the default space those predating space-awareness.
 */
export const buildSpaceFilter = (spaceId: string): NonNullable<QueryDslQueryContainer> => {
  const should: Array<NonNullable<QueryDslQueryContainer>> = [{ terms: { space_ids: [spaceId] } }];
  if (spaceId === DEFAULT_SPACE_ID) {
    should.push({ bool: { must_not: { exists: { field: 'space_ids' } } } });
  }
  return { bool: { should, minimum_should_match: 1 } };
};

// ---------------------------------------------------------------------------
// Single-experiment filter query
// ---------------------------------------------------------------------------

/**
 * Builds a bool/must query that filters evaluation score documents by experiment ID
 * with optional suite and task model filters.
 */
export const buildExperimentFilterQuery = (
  experimentId: string,
  options?: ExperimentFilterOptions
): { bool: { must: Array<Record<string, unknown>> } } => {
  const field = options?.filterField ?? 'experiment_id';
  const must: Array<Record<string, unknown>> = [{ term: { [field]: experimentId } }];
  if (options?.suiteId) {
    must.push({ term: { 'metadata.suite_id': options.suiteId } });
  }
  if (options?.modelId) {
    must.push({ term: { 'task.model.id': options.modelId } });
  }
  if (options?.spaceId) {
    must.push(buildSpaceFilter(options.spaceId));
  }
  return { bool: { must } };
};

/**
 * Builds a bool/must query that filters evaluation score documents by example ID.
 */
export const buildExampleScoresQuery = (
  exampleId: string,
  options?: { spaceId?: string; datasetId?: string; executionId?: string; modelId?: string }
): { bool: { must: Array<Record<string, unknown>> } } => {
  const must: Array<Record<string, unknown>> = [{ term: { 'example.id': exampleId } }];
  if (options?.datasetId !== undefined) {
    must.push({ term: { 'example.dataset.id': options.datasetId } });
  }
  if (options?.executionId) {
    must.push({ term: { 'metadata.execution_id': options.executionId } });
  }
  if (options?.modelId) {
    must.push({ term: { 'task.model.id': options.modelId } });
  }
  if (options?.spaceId) {
    must.push(buildSpaceFilter(options.spaceId));
  }
  return { bool: { must } };
};

/**
 * Builds a bool/must query that filters evaluation score documents by
 * dataset ID and experiment ID (or metadata.execution_id when filterField is specified).
 */
export const buildDatasetExampleScoresQuery = (
  datasetId: string,
  experimentId: string,
  options?: { filterField?: 'experiment_id' | 'metadata.execution_id'; spaceId?: string }
): { bool: { must: Array<Record<string, unknown>> } } => {
  const field = options?.filterField ?? 'experiment_id';
  const must: Array<Record<string, unknown>> = [
    { term: { 'example.dataset.id': datasetId } },
    { term: { [field]: experimentId } },
  ];
  if (options?.spaceId) {
    must.push(buildSpaceFilter(options.spaceId));
  }
  return { bool: { must } };
};

// ---------------------------------------------------------------------------
// Evaluator judge models
// ---------------------------------------------------------------------------

/**
 * Cap on the distinct judge models reported for a single experiment. Matches the `maxItems` the
 * API schemas declare, which the SDK client enforces when it parses those responses.
 */
const MAX_EVALUATOR_MODELS = 20;

export interface EvaluatorJudgeModel {
  id: string;
  family: string | undefined;
  provider: string | undefined;
}

/**
 * Every distinct model an experiment's evaluators judged with, so callers can tell that the
 * evaluators differ rather than reporting whichever judge sorted first. Family and provider are
 * nested under the id so they stay correlated with their own model: sibling terms aggs would pair
 * one judge's id with another's family and describe a model that never existed.
 */
export const buildEvaluatorModelsAggregation = () => ({
  terms: { field: 'evaluator.model.id', size: MAX_EVALUATOR_MODELS },
  aggs: {
    family: { terms: { field: 'evaluator.model.family', size: 1 } },
    provider: { terms: { field: 'evaluator.model.provider', size: 1 } },
  },
});

const toEvaluatorModels = (
  aggregation: EvaluatorModelsAggregation | undefined
): EvaluatorJudgeModel[] =>
  (aggregation?.buckets ?? []).map((bucket) => {
    const family = firstBucket(bucket.family);
    const provider = firstBucket(bucket.provider);
    return { id: buildModelDisplayId(bucket.key, family, provider), family, provider };
  });

/**
 * Reads {@link buildEvaluatorModelsAggregation}, ordered by how many scores each judge produced,
 * so the first entry is the experiment's predominant judge. Empty for experiments only code
 * evaluators scored, which record no model at all.
 */
export const parseEvaluatorModelsAggregation = (
  aggregations: Record<string, unknown> | undefined
): EvaluatorJudgeModel[] =>
  toEvaluatorModels(
    (aggregations as { evaluator_models?: EvaluatorModelsAggregation } | undefined)
      ?.evaluator_models
  );

// ---------------------------------------------------------------------------
// Per-experiment stats aggregation
// ---------------------------------------------------------------------------

/**
 * Returns the aggregation tree for computing per-evaluator, per-dataset statistics
 * (mean, median, std_dev, min, max, count) along with the model each evaluator
 * judged with. Code evaluators have no model, so their buckets come back empty.
 */
export const buildStatsAggregation = () => ({
  by_dataset: {
    terms: { field: 'example.dataset.id', size: 10000 },
    aggs: {
      dataset_name: { terms: { field: 'example.dataset.name', size: 1 } },
      example_count: { cardinality: { field: 'example.id' } },
      by_evaluator: {
        terms: { field: 'evaluator.name', size: 1000 },
        aggs: {
          score_stats: { extended_stats: { field: 'evaluator.score' } },
          score_median: { percentiles: { field: 'evaluator.score', percents: [50] } },
          // Family and provider are nested under the id so they stay correlated with their own
          // model. Sibling terms aggs would pair one judge's id with another's family when a
          // bucket spans several judges, describing a model that never existed.
          evaluator_model_id: {
            terms: { field: 'evaluator.model.id', size: 1 },
            aggs: {
              family: { terms: { field: 'evaluator.model.family', size: 1 } },
              provider: { terms: { field: 'evaluator.model.provider', size: 1 } },
            },
          },
        },
      },
    },
  },
});

/**
 * Standard sort order for retrieving individual score documents,
 * grouped by dataset, example, evaluator, then repetition.
 */
type SortField = Record<string, { order: 'asc' | 'desc' }>;

export const SCORES_SORT_ORDER: SortField[] = [
  { 'example.dataset.name': { order: 'asc' } },
  { 'example.index': { order: 'asc' } },
  { 'evaluator.name': { order: 'asc' } },
  { 'task.repetition_index': { order: 'asc' } },
];

// ---------------------------------------------------------------------------
// Experiments listing query, aggregation, and response parser
// ---------------------------------------------------------------------------

const PREFLIGHT_EXPERIMENT_ID = 'kbn-evals-preflight';

/**
 * Escapes Elasticsearch wildcard metacharacters (`\`, `*`, `?`) in user input so the literal
 * characters are matched rather than interpreted as wildcards.
 */
export const escapeWildcard = (input: string): string =>
  input.replace(/[\\*?]/g, (ch) => `\\${ch}`);

/**
 * Builds the filter query for the experiments listing endpoint.
 * Supports optional suite, model, and branch filters.
 * Always excludes preflight check experiments.
 */
export const buildExperimentsListingFilterQuery = (
  options?: ExperimentsListingFilterOptions
): Record<string, unknown> => {
  const filters: Array<Record<string, unknown>> = [];

  if (options?.suiteId) {
    filters.push({ term: { 'metadata.suite_id': options.suiteId } });
  }
  if (options?.modelId) {
    filters.push({ term: { 'task.model.id': options.modelId } });
  }
  if (options?.branch) {
    filters.push({
      wildcard: {
        'metadata.git.branch': {
          value: `*${escapeWildcard(options.branch)}*`,
          case_insensitive: true,
        },
      },
    });
  }
  if (options?.search) {
    const pattern = `*${escapeWildcard(options.search)}*`;
    filters.push({
      bool: {
        should: [
          { wildcard: { experiment_name: { value: pattern, case_insensitive: true } } },
          { wildcard: { 'metadata.git.branch': { value: pattern, case_insensitive: true } } },
        ],
        minimum_should_match: 1,
      },
    });
  }
  if (options?.datasetId) {
    filters.push({ term: { 'example.dataset.id': options.datasetId } });
  }
  if (options?.datasetName) {
    filters.push({ term: { 'example.dataset.name': options.datasetName } });
  }
  if (options?.buildId) {
    filters.push({ term: { 'metadata.ci.build_id': options.buildId } });
  }
  if (options?.spaceId) {
    filters.push(buildSpaceFilter(options.spaceId));
  }
  return {
    bool: {
      must_not: [{ term: { experiment_id: PREFLIGHT_EXPERIMENT_ID } }],
      ...(filters.length > 0 ? { filter: filters } : {}),
    },
  };
};

/**
 * Returns the aggregation definition for listing experiments with summary metadata.
 * Groups score documents by experiment_id and extracts the latest timestamp,
 * model info, git metadata, and CI info for each experiment.
 *
 * Terms aggregations don't support a native offset, so we over-fetch
 * (page * perPage buckets) and let `parseExperimentsListingResponse` slice the
 * correct window.
 */
export const buildExperimentsListingAggregation = ({
  page,
  perPage,
}: ExperimentsListingPaginationOptions) => ({
  total_experiments: {
    cardinality: { field: 'metadata.execution_id' },
  },
  experiments: {
    terms: {
      field: 'metadata.execution_id',
      size: page * perPage,
      order: { latest_timestamp: 'desc' as const },
    },
    aggs: {
      latest_timestamp: { max: { field: '@timestamp' } },
      experiment_count: { cardinality: { field: 'experiment_id' } },
      experiment_name: { terms: { field: 'experiment_name', size: 1 } },
      suite_id: { terms: { field: 'metadata.suite_id', size: 1 } },
      dataset_id: { terms: { field: 'example.dataset.id', size: 50 } },
      dataset_name: { terms: { field: 'example.dataset.name', size: 50 } },
      task_model_id: { terms: { field: 'task.model.id', size: 1 } },
      task_model_family: { terms: { field: 'task.model.family', size: 1 } },
      task_model_provider: { terms: { field: 'task.model.provider', size: 1 } },
      // The singular `evaluator_model` is the first of these rather than its own agg, so the
      // listing cannot report a predominant judge that disagrees with the set it lists.
      evaluator_models: buildEvaluatorModelsAggregation(),
      git_branch: { terms: { field: 'metadata.git.branch', size: 1 } },
      git_commit_sha: { terms: { field: 'metadata.git.commit_sha', size: 1 } },
      total_repetitions: { max: { field: 'metadata.total_repetitions' } },
      build_url: { terms: { field: 'metadata.ci.build_url', size: 1 } },
      pull_request: { terms: { field: 'metadata.ci.pull_request', size: 1 } },
    },
  },
});

/**
 * Parses the raw ES aggregation response from an experiments listing query
 * into a typed array of experiment summaries with a total count.
 *
 * Because terms aggregations don't support offset, the aggregation
 * over-fetches and this function slices to the requested page window.
 */
export const parseExperimentsListingResponse = (
  aggregations: Record<string, unknown> | undefined,
  { page, perPage }: ExperimentsListingPaginationOptions
): ExperimentsListingResult => {
  const aggs: ExperimentsListingAggregations | undefined = aggregations
    ? (aggregations as ExperimentsListingAggregations)
    : undefined;
  const totalExperiments = aggs?.total_experiments?.value ?? 0;
  const allBuckets = aggs?.experiments?.buckets ?? [];
  const offset = (page - 1) * perPage;
  const experimentBuckets = allBuckets.slice(offset, offset + perPage);

  const experiments = experimentBuckets.map((bucket) => {
    const taskFamily = firstBucket(bucket.task_model_family);
    const taskProvider = firstBucket(bucket.task_model_provider);
    const evaluatorModels = toEvaluatorModels(bucket.evaluator_models);

    return {
      execution_id: bucket.key,
      experiment_id: bucket.key,
      experiment_name: firstBucket(bucket.experiment_name) ?? null,
      experiment_count: bucket.experiment_count?.value ?? 1,
      timestamp: bucket.latest_timestamp?.value_as_string,
      suite_id: firstBucket(bucket.suite_id),
      dataset_ids: allBucketKeys(bucket.dataset_id),
      dataset_names: allBucketKeys(bucket.dataset_name),
      task_model: {
        id: buildModelDisplayId(firstBucket(bucket.task_model_id), taskFamily, taskProvider),
        family: taskFamily,
        provider: taskProvider,
      },
      // The judge that produced the most scores, and unset for experiments judged only by code
      // evaluators, which have no model at all. Reporting them as the "unknown" that
      // buildModelDisplayId synthesizes for empty buckets would read as an unidentified judge.
      ...(evaluatorModels.length > 0 && { evaluator_model: evaluatorModels[0] }),
      evaluator_models: evaluatorModels,
      git_branch: firstBucket(bucket.git_branch) ?? null,
      git_commit_sha: firstBucket(bucket.git_commit_sha) ?? null,
      total_repetitions: bucket.total_repetitions?.value ?? 1,
      ci: {
        build_url: firstBucket(bucket.build_url),
        pull_request: firstBucket(bucket.pull_request),
      },
    };
  });

  return { experiments, total: totalExperiments };
};

// ---------------------------------------------------------------------------
// Experiment detail response parser
// ---------------------------------------------------------------------------

interface StatsAggregations {
  by_dataset?: {
    buckets?: Array<{
      key: string;
      dataset_name?: TermsBucket;
      example_count?: { value?: number | null };
      by_evaluator?: {
        buckets?: Array<{
          key: string;
          score_stats?: {
            avg?: number;
            std_deviation?: number;
            min?: number;
            max?: number;
            count?: number;
          };
          score_median?: { values?: Record<string, number | null> };
          evaluator_model_id?: {
            buckets?: Array<{ key: string; family?: TermsBucket; provider?: TermsBucket }>;
          };
        }>;
      };
    }>;
  };
}

export interface ExperimentDetailEvaluatorStat {
  dataset_id: string;
  dataset_name: string;
  evaluator_name: string;
  example_count: number;
  /** Model this evaluator judged with; absent for code evaluators. */
  evaluator_model?: { id: string; family: string | undefined; provider: string | undefined };
  stats: {
    mean: number;
    median: number;
    std_dev: number;
    min: number;
    max: number;
    count: number;
  };
}

/**
 * Parses the stats aggregation response from an experiment detail query
 * into a typed array of per-evaluator, per-dataset statistics.
 */
export const parseStatsAggregationResponse = (
  aggregations: Record<string, unknown> | undefined
): ExperimentDetailEvaluatorStat[] => {
  const aggs = aggregations as StatsAggregations | undefined;
  const datasetBuckets = aggs?.by_dataset?.buckets ?? [];

  return datasetBuckets.flatMap((datasetBucket) => {
    const datasetId = datasetBucket.key;
    const datasetName = firstBucket(datasetBucket.dataset_name) ?? datasetId;
    const exampleCount = datasetBucket.example_count?.value ?? 0;
    const evaluatorBuckets = datasetBucket.by_evaluator?.buckets ?? [];

    return evaluatorBuckets.map((evaluatorBucket) => {
      const scoreStats = evaluatorBucket.score_stats;
      const median = evaluatorBucket.score_median?.values?.['50.0'];
      const modelBucket = evaluatorBucket.evaluator_model_id?.buckets?.[0];
      const modelId = modelBucket?.key;
      const modelFamily = firstBucket(modelBucket?.family);
      const modelProvider = firstBucket(modelBucket?.provider);

      return {
        dataset_id: datasetId,
        dataset_name: datasetName,
        evaluator_name: evaluatorBucket.key,
        example_count: exampleCount,
        // Absent rather than 'unknown' when nothing matched, so code evaluators read as
        // "no model" instead of an unidentified one.
        ...((modelId || modelFamily || modelProvider) && {
          evaluator_model: {
            id: buildModelDisplayId(modelId, modelFamily, modelProvider),
            family: modelFamily,
            provider: modelProvider,
          },
        }),
        stats: {
          mean: scoreStats?.avg ?? 0,
          median: median ?? 0,
          std_dev: scoreStats?.std_deviation ?? 0,
          min: scoreStats?.min ?? 0,
          max: scoreStats?.max ?? 0,
          count: scoreStats?.count ?? 0,
        },
      };
    });
  });
};

// ---------------------------------------------------------------------------
// Model display helpers
// ---------------------------------------------------------------------------

/**
 * Derives a human-readable model identifier from its component parts.
 * Falls back through id -> provider/family -> family -> provider -> 'unknown'.
 */
export const buildModelDisplayId = (id?: string, family?: string, provider?: string): string => {
  if (id) return id;
  if (family && provider) return `${provider}/${family}`;
  return family ?? provider ?? 'unknown';
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const firstBucket = (agg: TermsBucket | undefined): string | undefined => agg?.buckets?.[0]?.key;
const allBucketKeys = (agg: TermsBucket | undefined): string[] =>
  agg?.buckets?.map((b) => b.key) ?? [];
