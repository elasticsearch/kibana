/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export { generateStreamDescription } from './src/description/generate_description';
export { descriptionPrompt, overviewDescriptionPrompt } from './src/description/prompt';
export { partitionStream } from './workflows/partition_stream';
export {
  suggestProcessingPipeline,
  mergeSeedParsingProcessorIntoSuggestedPipeline,
  buildDocumentStructureOverviewForPipelinePrompt,
  formatUpstreamSeedParsingContextForPromptMarkdown,
  fetchMappedFieldsForStreamProcessingSuggestions,
  getPipelineDefinitionJsonSchema,
  pipelineDefinitionSchema,
  postParsePipelineDefinitionSchema,
  formatZodPipelineErrors,
  buildSimulationFeedback,
  detectTemporaryFields,
  type SuggestProcessingPipelineResult,
  type SuggestPipelineAgentSchema,
  type SimulationFeedback,
} from './workflows/suggest_processing_pipeline';
export {
  identifyKIQueries,
  DEFAULT_MAX_EXISTING_QUERIES_FOR_CONTEXT,
  type ExistingQuerySummary,
} from './src/significant_events/identify_ki_queries';
export {
  createDefaultSignificantEventsToolUsage,
  type SignificantEventsToolUsage,
} from './src/significant_events/tools/tool_usage';
export { EMPTY_TOKENS, sumTokens } from './src/helpers/sum_tokens';
export {
  identifyFeatures,
  toPreviouslyIdentifiedFeature,
  type IdentifyFeaturesOptions,
  type PreviouslyIdentifiedFeature,
  type ExcludedFeatureSummary,
  type IgnoredFeature,
} from './src/features/identify_features';
export { generateAllComputedFeatures } from './src/features/computed';
export {
  CODE_ANALYSIS_PROVIDER_KEY,
  codeAnalysisGenerator,
} from './src/features/computed/code_analysis';
export type {
  ComputedFeatureProvider,
  ComputedFeatureGeneratorOptions,
} from './src/features/computed/types';

export {
  searchKnowledgeIndicators,
  DEFAULT_SEARCH_KNOWLEDGE_INDICATORS_LIMIT,
} from './src/knowledge_indicators/search';
export {
  featureToKnowledgeIndicatorFeature,
  queryLinkToKnowledgeIndicatorQuery,
} from './src/knowledge_indicators/mappers';
export type {
  SearchKnowledgeIndicatorsInput,
  SearchKnowledgeIndicatorsKind,
  SearchKnowledgeIndicatorsOutput,
  KnowledgeIndicator,
  KnowledgeIndicatorFeature,
  KnowledgeIndicatorQuery,
} from './src/knowledge_indicators/types';
