/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export { Streams, streamDefinitionSchema } from './src/models/streams';
export { IngestBase, type IngestStreamIndexMode } from './src/models/ingest/base';
export { Ingest, IngestStream, IngestUpsertRequest } from './src/models/ingest';
export {
  WiredIngest,
  WiredStream,
  WiredIngestUpsertRequest,
  isDraftStream,
  isDraftGetResponse,
  type DraftStreamDefinition,
} from './src/models/ingest/wired';
export {
  ClassicIngest,
  ClassicStream,
  ClassicIngestUpsertRequest,
} from './src/models/ingest/classic';
export { Query, QueryStream } from './src/models/query';
export {
  ESQL_VIEW_PREFIX,
  getEsqlViewName,
  getStreamNameFromViewName,
  getWiredStreamViewQuery,
} from './src/models/query/view_name';

export {
  type RoutingDefinition,
  routingStatus,
  type RoutingStatus,
  isRoutingEnabled,
  routingDefinitionListSchema,
} from './src/models/ingest/routing';

export { getStreamTypeFromDefinition } from './src/helpers/get_stream_type_from_definition';
export type { StreamType } from './src/helpers/get_stream_type_from_definition';
export { isRootStreamDefinition } from './src/helpers/is_root_stream_definition';
export {
  isOtelStream,
  OTEL_CONTENT_FIELD,
  ECS_CONTENT_FIELD,
  OTEL_SEVERITY_FIELD,
  ECS_SEVERITY_FIELD,
} from './src/helpers/is_otel_stream';
export { getIndexPatternsForStream, getSourcesForStream } from './src/helpers/hierarchy_helpers';
export { getDiscoverEsqlQuery } from './src/helpers/get_discover_esql_query';
export { definitionToESQLQuery } from './src/helpers/definition_to_esql_query';
export type { DefinitionToESQLQueryOptions } from './src/helpers/definition_to_esql_query';
export {
  convertUpsertRequestIntoDefinition,
  convertGetResponseIntoUpsertRequest,
} from './src/helpers/converters';

export {
  keepFields,
  namespacePrefixes,
  otelReservedFields,
  aliases as otelFieldAliases,
  isNamespacedEcsField,
  isOtelReservedField,
  getRegularEcsField,
} from './src/helpers/namespaced_ecs';
export { getAdvancedParameters } from './src/helpers/get_advanced_parameters';
export { getInheritedFieldsFromAncestors } from './src/helpers/get_inherited_fields_from_ancestors';
export { getInheritedSettings } from './src/helpers/get_inherited_settings';
export {
  buildMetadataOption,
  withUnmappedFieldsDirective,
  deriveQueryType,
  ensureMetadata,
  extractBucketColumnName,
  extractBucketIntervalMs,
  extractBucketTargetField,
  extractStatsGroupColumns,
  extractWhereExpression,
  getFromSources,
  getStatsQueryHints,
  hasStatsCommand,
  MS_PER_UNIT,
  normalizeEsqlQuery,
  normalizeEsqlSafe,
  hasSameEsql,
  replaceFromSources,
  rewriteFromSources,
  stripMetadata,
} from './src/helpers/esql_helpers';

export * from './src/ingest_pipeline_processors';

export {
  type SampleDocument,
  type FlattenRecord,
  flattenRecord,
  recursiveRecord,
} from './src/shared/record_types';
export { isSchema, createIsNarrowSchema, isRecord } from './src/shared/type_guards';

export {
  isChildOf,
  isDescendantOf,
  isParentName,
  getAncestors,
  getAncestorsAndSelf,
  getParentId,
  getSegments,
  getRoot,
  MAX_NESTING_LEVEL,
  isRoot,
  ROOT_STREAM_NAMES,
  LOGS_ROOT_STREAM_NAME,
  LOGS_OTEL_STREAM_NAME,
  LOGS_ECS_STREAM_NAME,
  type RootStreamName,
} from './src/shared/hierarchy';

export {
  type FieldDefinition,
  type NamedFieldDefinitionConfig,
  type FieldDefinitionConfig,
  type ClassicFieldDefinition,
  type ClassicFieldDefinitionConfig,
  type InheritedFieldDefinitionConfig,
  type InheritedFieldDefinition,
  type FieldDefinitionConfigAdvancedParameters,
  type FieldDefinitionType,
  type AllFieldDefinitionType,
  FIELD_DEFINITION_TYPES,
  ALL_FIELD_DEFINITION_TYPES,
  fieldDefinitionConfigSchema,
  namedFieldDefinitionConfigSchema,
} from './src/fields';

export {
  type EsqlQuery,
  esqlQuerySchema,
  type QueryFeature,
  queryFeatureSchema,
  type StreamQuery,
  type QueryLink,
  type QueryType,
  QUERY_TYPE_MATCH,
  QUERY_TYPE_STATS,
  HIGH_SEVERITY_THRESHOLD,
  queryTypeSchema,
  type QueriesGetResponse,
  type QueriesOccurrencesGetResponse,
  upsertStreamQueryRequestSchema,
  bulkStreamQueryInputSchema,
  streamQuerySchema,
} from './src/queries';

export {
  findInheritedLifecycle,
  findInheritingStreams,
  effectiveToIngestLifecycle,
} from './src/helpers/lifecycle';

export { findInheritedFailureStore } from './src/helpers/failure_store';

export { streamObjectNameSchema } from './src/shared/stream_object_name';

export {
  type IngestStreamLifecycle,
  type ClassicIngestStreamEffectiveLifecycle,
  type IlmPolicyPhases,
  type IlmPolicyPhase,
  type IlmPolicyHotPhase,
  type IlmPolicyDeletePhase,
  type IngestStreamLifecycleAll,
  type IngestStreamLifecycleILM,
  type IngestStreamLifecycleDSL,
  type IngestStreamLifecycleDisabled,
  type IngestStreamLifecycleInherit,
  type IngestStreamEffectiveLifecycle,
  type PhaseName,
  type IlmPolicy,
  type IlmPolicyWithUsage,
  type IlmPolicyUsage,
  isDslLifecycle,
  isIlmLifecycle,
  isInheritLifecycle,
  isErrorLifecycle,
  isDisabledLifecycle,
} from './src/models/ingest/lifecycle';

export {
  type IngestStreamSettings,
  type WiredIngestStreamEffectiveSettings,
} from './src/models/ingest/settings';

export {
  type FailureStore,
  type EffectiveFailureStore,
  type WiredIngestStreamEffectiveFailureStore,
  type FailureStoreStatsResponse,
  isEnabledFailureStore,
  isInheritFailureStore,
  isDisabledLifecycleFailureStore,
  isEnabledLifecycleFailureStore,
} from './src/models/ingest/failure_store';

export type {
  SignificantEventsResponse,
  SignificantEventsGetResponse,
  GeneratedSignificantEventQuery,
  SignificantEventsQueriesGenerationResult,
  SignificantEventsQueriesGenerationTaskResult,
  LifecycleDetection,
  EventLifecycleResponse,
} from './src/api/significant_events';
export { generatedSignificantEventQuerySchema } from './src/api/significant_events';

export { emptyAssets } from './src/helpers/empty_assets';
export {
  validateStreamName,
  type StreamNameValidationError,
  type StreamNameValidationResult,
  MAX_STREAM_NAME_LENGTH,
  INVALID_STREAM_NAME_CHARACTERS,
} from './src/helpers/stream_name_validation';

export {
  type Feature,
  type FeatureUpsert,
  type FeatureWithFilter,
  type BaseFeature,
  type IdentifiedFeature,
  type IgnoredFeature,
  DATASET_ANALYSIS_FEATURE_TYPE,
  LOG_SAMPLES_FEATURE_TYPE,
  LOG_PATTERNS_FEATURE_TYPE,
  ERROR_LOGS_FEATURE_TYPE,
  COMPUTED_FEATURE_TYPES,
  INFERRED_FEATURE_TYPES,
  isFeature,
  isFeatureWithFilter,
  isComputedFeature,
  isDuplicateFeature,
  hasSameFingerprint,
  computeFeatureUuid,
  normalizeFeatureSlug,
  mergeFeature,
  toBaseFeature,
  featureSchema,
  featureUpsertSchema,
  baseFeatureSchema,
  identifiedFeatureSchema,
  ignoredFeatureSchema,
} from './src/feature';

export { FeatureAccumulator } from './src/feature_accumulator';

export {
  type BaseSimulationError,
  type SimulationError,
  type DocSimulationStatus,
  type SimulationDocReport,
  type ProcessorMetrics,
  type DetectedField,
  type WithNameAndEsType,
  type DocumentsMetrics,
  type ProcessingSimulationResponse,
} from './src/models/processing_simulation';

export { type IngestStreamProcessing } from './src/models/ingest/processing';

export { TaskStatus, type TaskResult } from './src/tasks/types';

export type { GenerateDescriptionResult } from './src/api/description_generation';
export type { IdentifyFeaturesResult, IterationResult } from './src/api/features';
export { tokenCountSchema, iterationResultSchema } from './src/api/features';

export {
  SIG_EVENT_STATUS_OPTIONS,
  SIG_EVENT_IMPACT_OPTIONS,
  detectionSchema,
  type Detection,
  discoverySchema,
  type Discovery,
  sigEventSchema,
  sigEventStatusSchema,
  sigEventImpactSchema,
  type SigEvent,
  type KnowledgeIndicator,
  type SigEventStatus,
  type SigEventImpact,
} from './src/sig_events';
export type {
  StreamsKIsOnboardingResult,
  StreamsKIsOnboardingFeaturesResult,
  StreamsKIsOnboardingQueriesResult,
  StreamsKIsOnboardingStatusResult,
} from './src/onboarding';
export {
  StreamsKIsOnboardingStep,
  STREAMS_KIS_ONBOARDING_IN_PROGRESS_STATUSES,
} from './src/onboarding';
export type { SigEventsWorkflowStatusResult } from './src/workflows';
export { SigEventsWorkflowStatus } from './src/workflows';

export { streamsOasDefinitions } from './src/oas_definitions';
export type { StreamsOasDefinitions } from './src/oas_definitions';

export { stripOtelAliases } from './src/helpers/strip_otel_aliases';
export { mergeSourceIntoDocuments } from './src/helpers/merge_esql_source';

export { streamMatchesIndexPatterns } from './src/helpers/stream_matches_index_patterns';
export { DEFAULT_INDEX_PATTERNS } from './src/helpers/default_index_patterns';

export {
  STREAMS_SIGNIFICANT_EVENTS_INFERENCE_PARENT_FEATURE_ID,
  STREAMS_SIG_EVENTS_KI_EXTRACTION_INFERENCE_FEATURE_ID,
  STREAMS_SIG_EVENTS_KI_QUERY_GENERATION_INFERENCE_FEATURE_ID,
  STREAMS_SIG_EVENTS_DISCOVERY_INFERENCE_FEATURE_ID,
  STREAMS_SIG_EVENTS_INVESTIGATION_INFERENCE_FEATURE_ID,
  STREAMS_INFERENCE_PARENT_FEATURE_ID,
  STREAMS_PARTITIONING_SUGGESTIONS_INFERENCE_FEATURE_ID,
  STREAMS_PROCESSING_SUGGESTIONS_INFERENCE_FEATURE_ID,
} from './src/inference_feature_ids';
