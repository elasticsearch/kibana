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
export const EVALS_EXPERIMENT_RUNS_URL =
  `${EVALS_INTERNAL_URL}/experiments/{experimentId}/runs` as const;
export const EVALS_EXPERIMENT_TRACES_URL =
  `${EVALS_INTERNAL_URL}/experiments/{experimentId}/traces` as const;
export const EVALS_SCORES_URL = `${EVALS_INTERNAL_URL}/scores` as const;
export const EVALS_EXPERIMENTS_COMPARE_URL = `${EVALS_INTERNAL_URL}/experiments/compare` as const;
export const EVALS_EXPERIMENTS_RUN_URL = `${EVALS_INTERNAL_URL}/experiments/_run` as const;
export const EVALS_EXPERIMENTS_SAVE_WORKFLOW_URL =
  `${EVALS_INTERNAL_URL}/experiments/_save_as_workflow` as const;
export const EVALS_EXPERIMENTS_PREVIEW_URL = `${EVALS_INTERNAL_URL}/experiments/_preview` as const;
export const EVALS_EXPERIMENT_TEMPLATES_URL =
  `${EVALS_INTERNAL_URL}/experiments/templates` as const;
export const EVALS_EXPERIMENT_EXECUTION_URL =
  `${EVALS_INTERNAL_URL}/experiments/executions/{workflowExecutionId}` as const;
export const EVALS_EXPERIMENT_EXECUTION_CANCEL_URL =
  `${EVALS_INTERNAL_URL}/experiments/executions/{workflowExecutionId}/_cancel` as const;
export const EVALS_EXPERIMENT_DATASET_EXAMPLES_URL =
  `${EVALS_INTERNAL_URL}/experiments/{experimentId}/datasets/{datasetId}/examples` as const;
export const EVALS_EXAMPLE_SCORES_URL =
  `${EVALS_INTERNAL_URL}/examples/{exampleId}/scores` as const;
export const EVALS_ONLINE_SCORES_URL = `${EVALS_INTERNAL_URL}/online_scores` as const;
export const EVALS_TRACE_URL = `${EVALS_INTERNAL_URL}/traces/{traceId}` as const;
export const EVALS_RESOLVE_INSTRUMENTATION_URL =
  `${EVALS_INTERNAL_URL}/traces/_resolve_instrumentation` as const;
export const EVALS_EVALUATORS_URL = `${EVALS_INTERNAL_URL}/evaluators` as const;
export const EVALS_EVALUATOR_URL = `${EVALS_EVALUATORS_URL}/{name}` as const;
export const EVALS_VALIDATE_URL = `${EVALS_INTERNAL_URL}/evaluators/_validate` as const;
export const EVALS_EVALUATE_URL = `${EVALS_INTERNAL_URL}/_evaluate` as const;
export const EVALS_TRACING_PROJECTS_URL = `${EVALS_INTERNAL_URL}/tracing/projects` as const;
export const EVALS_TRACING_PROJECT_TRACES_URL =
  `${EVALS_INTERNAL_URL}/tracing/projects/{projectName}/traces` as const;
export const EVALS_DATASETS_URL = `${EVALS_INTERNAL_URL}/datasets` as const;
export const EVALS_DATASET_URL = `${EVALS_DATASETS_URL}/{datasetId}` as const;
export const EVALS_DATASET_EXAMPLES_URL = `${EVALS_DATASET_URL}/examples` as const;
export const EVALS_DATASET_COPY_URL = `${EVALS_DATASET_URL}/_copy` as const;
export const EVALS_DATASET_EXAMPLE_URL = `${EVALS_DATASET_EXAMPLES_URL}/{exampleId}` as const;
export const EVALS_DATASET_UPSERT_URL = `${EVALS_DATASETS_URL}/_upsert` as const;
export const EVALS_DATASET_RESOLVE_URL = `${EVALS_DATASETS_URL}/_resolve` as const;

const EVALUATION_INDEX_PREFIX = '.evaluation' as const;

export const EvaluationIndices = {
  SCORES: `${EVALUATION_INDEX_PREFIX}-scores`,
  ONLINE_SCORES: `${EVALUATION_INDEX_PREFIX}-online-scores`,
  DATASETS: `${EVALUATION_INDEX_PREFIX}-datasets`,
  DATASET_EXAMPLES: `${EVALUATION_INDEX_PREFIX}-dataset-examples`,
  EVALUATORS: `${EVALUATION_INDEX_PREFIX}-evaluators`,
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
export const EVALUATOR_UUID_NAMESPACE = 'c1d6a0f2-8b4e-4a17-9c3d-5f2e7a9b0c41' as const;

export const MAX_EXAMPLES_PER_DATASET = 10_000 as const;
export const MAX_DATASET_EXAMPLES_REQUEST_BYTES = 5 * 1024 * 1024;
export const MAX_SCORES_PER_QUERY = 10_000 as const;

export const MAX_TAGS_PER_DATASET = 20 as const;
export const MAX_TAG_LENGTH = 64 as const;

export const MAX_DATASET_NAME_LENGTH = 256 as const;
export const MAX_DATASET_DESCRIPTION_LENGTH = 2048 as const;

export const MAX_EVALUATOR_NAME_LENGTH = 128 as const;

export const MAX_DATASET_TAG_FACETS = 100 as const;
