/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export const EVALS_INTERNAL_URL = '/internal/evals' as const;

export const EVALS_EXPERIMENTS_URL = `${EVALS_INTERNAL_URL}/experiments` as const;
export const EVALS_EXPERIMENT_URL = `${EVALS_INTERNAL_URL}/experiments/{experimentId}` as const;
export const EVALS_EXPERIMENT_SCORES_URL =
  `${EVALS_INTERNAL_URL}/experiments/{experimentId}/scores` as const;
export const EVALS_SCORES_URL = `${EVALS_INTERNAL_URL}/scores` as const;
export const EVALS_EXPERIMENTS_COMPARE_URL = `${EVALS_INTERNAL_URL}/experiments/compare` as const;
export const EVALS_EXPERIMENT_DATASET_EXAMPLES_URL =
  `${EVALS_INTERNAL_URL}/experiments/{experimentId}/datasets/{datasetId}/examples` as const;
export const EVALS_EXAMPLE_SCORES_URL =
  `${EVALS_INTERNAL_URL}/examples/{exampleId}/scores` as const;
export const EVALS_TRACE_URL = `${EVALS_INTERNAL_URL}/traces/{traceId}` as const;
export const EVALS_EVALUATORS_URL = `${EVALS_INTERNAL_URL}/evaluators` as const;
export const EVALS_EVALUATE_URL = `${EVALS_INTERNAL_URL}/_evaluate` as const;
export const EVALS_TRACING_PROJECTS_URL = `${EVALS_INTERNAL_URL}/tracing/projects` as const;
export const EVALS_TRACING_PROJECT_TRACES_URL =
  `${EVALS_INTERNAL_URL}/tracing/projects/{projectName}/traces` as const;
export const EVALS_DATASETS_URL = `${EVALS_INTERNAL_URL}/datasets` as const;
export const EVALS_DATASET_URL = `${EVALS_DATASETS_URL}/{datasetId}` as const;
export const EVALS_DATASET_EXAMPLES_URL = `${EVALS_DATASET_URL}/examples` as const;
export const EVALS_DATASET_EXAMPLE_URL = `${EVALS_DATASET_EXAMPLES_URL}/{exampleId}` as const;
export const EVALS_DATASET_UPSERT_URL = `${EVALS_DATASETS_URL}/_upsert` as const;

const EVALUATION_INDEX_PREFIX = '.evaluation' as const;

export const EvaluationIndices = {
  SCORES: `${EVALUATION_INDEX_PREFIX}-scores`,
  DATASETS: `${EVALUATION_INDEX_PREFIX}-datasets`,
  DATASET_EXAMPLES: `${EVALUATION_INDEX_PREFIX}-dataset-examples`,
} as const;

export const TRACES_INDEX_PATTERN = 'traces-*' as const;
export const LOGS_INDEX_PATTERN = 'logs-*' as const;

export const API_VERSIONS = {
  internal: {
    v1: '1',
  },
} as const;

export const INTERNAL_API_ACCESS = 'internal' as const;

export const DATASET_UUID_NAMESPACE = 'f77b3ee3-7bc6-4bf8-9e43-d7fca9e69ae0' as const;

export const MAX_EXAMPLES_PER_DATASET = 10_000 as const;
export const MAX_SCORES_PER_QUERY = 10_000 as const;
