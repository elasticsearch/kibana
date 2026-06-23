/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export { QUERY_STATUSES } from './queries';
export type { Query, QueryStatus } from './queries';
export type {
  ProcessorSuggestion,
  ProcessorPropertySuggestion,
  ProcessorSuggestionsResponse,
} from './ingest_processor_suggestions';

export {
  STREAMS_SIGNIFICANT_EVENTS_MEMORY_ENABLED_FLAG,
  STREAMS_SIGNIFICANT_EVENTS_SEMANTIC_CODE_SEARCH_GROUNDING_ENABLED_FLAG,
} from './feature_flags';

export {
  STREAMS_TIERED_FEATURES,
  STREAMS_TIERED_ML_FEATURE,
  STREAMS_TIERED_AI_FEATURE,
  STREAMS_TIERED_SIGNIFICANT_EVENT_FEATURE,
  ATTACHMENT_SUGGESTIONS_LIMIT,
  DEFAULT_EXTRACTION_INTERVAL_HOURS,
  MIN_EXTRACTION_INTERVAL_HOURS,
  FAILURE_STORE_SELECTOR,
} from './constants';

export type { StreamDocsStat } from './doc_counts';
export {
  excludeFrozenQuery,
  kqlQuery,
  rangeQuery,
  isKqlQueryValid,
  buildEsqlFilter,
} from './query_helpers';

export {
  PRIORITIZED_CONTENT_FIELDS,
  getDefaultTextField,
  extractMessagesFromField,
} from './pattern_extraction_helpers';

export type { SigEventsTuningConfig } from './sig_events_tuning_config';
export { DEFAULT_SIG_EVENTS_TUNING_CONFIG } from './sig_events_tuning_config';
export {
  SIGNIFICANT_EVENT_ATTACHMENT_TYPE,
  SIGNIFICANT_EVENT_SML_TYPE,
  type SignificantEventAttachment,
  type PendingSignificantEventAttachment,
} from './significant_event_attachment';
export {
  type StreamsAppLocation,
  type StreamsAppLocationParams,
  getStreamsLocation,
} from './get_streams_location/get_streams_location';

export type { StreamSummary } from './stream_summary';
export type { PaginatedResponse } from './pagination';

export { SIGNIFICANT_EVENTS_REQUIRED_PLUGINS } from './significant_events_availability';
export type {
  SignificantEventsRequiredPlugin,
  SignificantEventsUnavailableReason,
  SignificantEventsAvailabilityResponse,
} from './significant_events_availability';
