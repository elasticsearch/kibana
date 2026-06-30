/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export {
  type EsqlQuery,
  type QueriesGetResponse,
  type QueriesOccurrencesGetResponse,
  type QueryFeature,
  type QueryLink,
  type QueryType,
  type StreamQuery,
  HIGH_SEVERITY_THRESHOLD,
  QUERY_TYPE_MATCH,
  QUERY_TYPE_STATS,
  bulkStreamQueryInputSchema,
  esqlQuerySchema,
  queryFeatureSchema,
  queryTypeSchema,
  streamQuerySchema,
  upsertStreamQueryRequestSchema,
} from './src/queries';

export type {
  EventLifecycleResponse,
  GeneratedSignificantEventQuery,
  LifecycleDetection,
  SignificantEventsGetResponse,
  SignificantEventsQueriesGenerationResult,
  SignificantEventsQueriesGenerationTaskResult,
  SignificantEventsResponse,
} from './src/api/significant_events';

export { generatedSignificantEventQuerySchema } from './src/api/significant_events';

export {
  type BaseFeature,
  type Feature,
  type FeatureUpsert,
  type FeatureWithFilter,
  type IdentifiedFeature,
  type IgnoredFeature,
  CODE_ANALYSIS_FEATURE_TYPE,
  COMPUTED_FEATURE_TYPES,
  DATASET_ANALYSIS_FEATURE_TYPE,
  ERROR_LOGS_FEATURE_TYPE,
  INFERRED_FEATURE_TYPES,
  LOG_PATTERNS_FEATURE_TYPE,
  LOG_SAMPLES_FEATURE_TYPE,
  baseFeatureSchema,
  computeFeatureUuid,
  featureSchema,
  featureUpsertSchema,
  hasSameFingerprint,
  identifiedFeatureSchema,
  ignoredFeatureSchema,
  isComputedFeature,
  isDuplicateFeature,
  isFeature,
  isFeatureWithFilter,
  mergeFeature,
  normalizeFeatureSlug,
  toBaseFeature,
} from './src/feature';

export { FeatureAccumulator } from './src/feature_accumulator';

export type { IdentifyFeaturesResult, IterationResult } from './src/api/features';

export { tokenCountSchema, iterationResultSchema } from './src/api/features';

export {
  type Detection,
  type Discovery,
  type KnowledgeIndicator,
  type SignificantEvent,
  type SignificantEventStatus,
  type SignificantEventInvestigation,
  type SignificantEventInvestigationStatus,
  SIGNIFICANT_EVENT_STATUS_OPTIONS,
  SIGNIFICANT_EVENT_INVESTIGATION_STATUS_OPTIONS,
  detectionSchema,
  discoverySchema,
  significantEventSchema,
  significantEventStatusSchema,
  significantEventInvestigationSchema,
  significantEventInvestigationStatusSchema,
} from './src/significant_events';

export type {
  KIsOnboardingResult,
  KIsOnboardingFeaturesResult,
  KIsOnboardingQueriesResult,
  KIsOnboardingStatusResult,
} from './src/onboarding';

export { KIsOnboardingStep, KIS_ONBOARDING_IN_PROGRESS_STATUSES } from './src/onboarding';

export type { SignificantEventsWorkflowStatusResult } from './src/workflows';

export { SignificantEventsWorkflowStatus } from './src/workflows';

export {
  SIGNIFICANT_EVENTS_INFERENCE_PARENT_FEATURE_ID,
  SIGNIFICANT_EVENTS_KI_EXTRACTION_INFERENCE_FEATURE_ID,
  SIGNIFICANT_EVENTS_KI_QUERY_GENERATION_INFERENCE_FEATURE_ID,
  SIGNIFICANT_EVENTS_DISCOVERY_INFERENCE_FEATURE_ID,
  SIGNIFICANT_EVENTS_INVESTIGATION_INFERENCE_FEATURE_ID,
} from './src/inference_feature_ids';
