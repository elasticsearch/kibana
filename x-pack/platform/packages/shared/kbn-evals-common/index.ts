/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export * from './impl/schemas';
export * from './constants';
export { goldenClusterPrivileges } from './golden_cluster_privileges';
export {
  buildExperimentFilterQuery,
  buildExampleScoresQuery,
  buildDatasetExampleScoresQuery,
  buildSpaceFilter,
  buildStatsAggregation,
  parseStatsAggregationResponse,
  buildEvaluatorModelsAggregation,
  parseEvaluatorModelsAggregation,
  buildExperimentEvaluatorsAggregation,
  parseExperimentEvaluatorsAggregation,
  buildExperimentRunsAggregation,
  parseExperimentRunsAggregation,
  buildExperimentRunsFetchQuery,
  buildExperimentTracesAggregation,
  parseExperimentTracesAggregation,
  SCORES_SORT_ORDER,
  buildExperimentsListingFilterQuery,
  buildExperimentsListingAggregation,
  parseExperimentsListingResponse,
  buildModelDisplayId,
  escapeWildcard,
} from './impl/query_builders';
export type {
  ExperimentsListingResult,
  ExperimentDetailEvaluatorStat,
  EvaluatorJudgeModel,
  ExperimentRunKey,
} from './impl/query_builders';
export { getDatasetId } from './impl/dataset_ids';
export { getEvaluatorDefinitionId } from './impl/evaluator_ids';
export { ALL_SPACES_ID, DEFAULT_SPACE_ID, resolveDatasetHomeSpace } from './impl/spaces';
export {
  pairScores,
  computePairedTTestResults,
  resolveDirection,
  isImproved,
} from './impl/statistical_analysis';
export type { PairedScore } from './impl/statistical_analysis';
