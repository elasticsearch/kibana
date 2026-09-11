/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export const publicApiPath = '/api/context_engine';
export const internalApiPath = '/internal/context_engine';

export const aiIndexPath = `${publicApiPath}/ai_index`;
export const aiIndexByIdPath = `${aiIndexPath}/{aiIndexId}`;
/** Id-less; ids cannot start with `_` (`AI_INDEX_ID_PATTERN`), so this never collides with `{aiIndexId}`. */
export const aiIndexQueryPath = `${aiIndexPath}/_query`;
export const aiIndexDescribePath = `${aiIndexByIdPath}/_describe`;
export const aiIndexKiSummaryPath = `${internalApiPath}/ai_index/{aiIndexId}/ki_summary`;
export const aiIndexFeedbackAnalysisPath = `${internalApiPath}/ai_index/{aiIndexId}/feedback_analysis`;
export const aiIndexKiListPath = `${internalApiPath}/ai_index/{aiIndexId}/kis`;
export const aiIndexKiByIdPath = `${aiIndexKiListPath}/{kiId}`;

/** Default and maximum page size when listing Knowledge Indicators for an AI index. */
export const DEFAULT_KI_PAGE_SIZE = 25;
export const MAX_KI_PAGE_SIZE = 100;
/** Page size for summary-only KI list requests, no rows. */
export const KI_SUMMARY_PAGE_SIZE = 0;

export const MAX_KI_TYPE_FILTER_LENGTH = 256;

/** Read-only Signals routes (internal): a preaggregated grouped list and a per-group fetch. */
export const signalGroupsPath = `${internalApiPath}/signals/groups`;
export const signalsPath = `${internalApiPath}/signals`;

/** Version of the internal Signals API, shared between route registration and the browser client. */
export const SIGNALS_INTERNAL_API_VERSION = '1';

/** Max number of tag groups returned by the grouped Signals list. */
export const MAX_SIGNAL_GROUPS = 100;

/** Default and maximum page size when fetching the individual signals in a group. */
export const DEFAULT_SIGNALS_PAGE_SIZE = 25;
export const MAX_SIGNALS_PAGE_SIZE = 100;

/** Default and maximum page size when listing improvements (one entry per improvement lineage). */
export const DEFAULT_IMPROVEMENTS_PAGE_SIZE = 25;
export const MAX_IMPROVEMENTS_PAGE_SIZE = 100;

/**
 * Cap on the improvement history handed to an analysis run's briefing. The runner needs to see
 * what was already rejected so it does not re-propose it, but the briefing shares the run's
 * context window.
 */
export const MAX_IMPROVEMENTS_HISTORY_SIZE = 200;

/**
 * Version of the public AI index API, shared between the server route
 * registration and browser clients.
 */
export const AI_INDEX_API_VERSION = '2023-10-31';

/**
 * Version of internal Context Engine AI index routes.
 */
export const AI_INDEX_INTERNAL_API_VERSION = '1';

/**
 * Backing data streams and indices follow type-specific naming conventions,
 * both sharing the common `ai-index-` base.
 */
export const AI_INDEX_DEST_PREFIX = 'ai-index-';
export const AI_INDEX_DATA_STREAM_PREFIX = `${AI_INDEX_DEST_PREFIX}ds-`;
export const AI_INDEX_INDEX_PREFIX = `${AI_INDEX_DEST_PREFIX}idx-`;

/**
 * Hard limit on the number of AI indices returned by the list API.
 * TODO: Remove this limit (or make it configurable) and add pagination support to List API.
 */
export const MAX_AI_INDICES = 100;

export const MAX_AI_INDEX_ID_LENGTH = 256;
export const MAX_AI_INDEX_FEEDBACK_AGENT_ID_LENGTH = 256;
export const MAX_AI_INDEX_DESCRIPTION_LENGTH = 2048;
export const MAX_AI_INDEX_DEST_VALUE_LENGTH = 1024;
export const MAX_INDEX_NAME_BYTES = 255;
export const MAX_AI_INDEX_AUTOMATION_LENGTH = 1024;
export const MAX_AI_INDEX_SOURCE_VALUE_LENGTH = 10240;
export const MAX_AI_INDEX_AUTOMATIONS = 100;
export const MAX_AI_INDEX_SOURCES = 100;

/** AI-index ES|QL query API bounds. */
export const MAX_AI_INDEX_QUERY_LENGTH = 10000;
export const MAX_AI_INDEX_QUERY_PARAMS = 100;
export const MAX_AI_INDEX_QUERY_PARAM_KEY_LENGTH = 256;
export const MAX_AI_INDEX_QUERY_PARAM_VALUE_LENGTH = 4096;

/** Row limit the server always enforces; a larger trailing `LIMIT` in the query is capped to it. */
export const DEFAULT_AI_INDEX_QUERY_LIMIT = 100;
export const MAX_AI_INDEX_QUERY_LIMIT = 1000;
export const MAX_AI_INDEX_QUERY_RESPONSE_BYTES = 20 * 1024 * 1024;

/** AI-index describe API bounds. */
export const MAX_AI_INDEX_DESCRIBE_FIELDS = 500;
/** Byte cap per `_mapping` / `_field_caps` response; field cap applies after download. */
export const MAX_AI_INDEX_DESCRIBE_METADATA_BYTES = 20 * 1024 * 1024;
export const MAX_AI_INDEX_DESCRIBE_TYPE_COUNTS = 20;
export const MAX_AI_INDEX_DESCRIBE_TAG_COUNTS = 20;

export const MAX_FEEDBACK_ANALYSIS_INTERVAL_LENGTH = 16;
export const MAX_FEEDBACK_ANALYSIS_TIME_RANGE_FROM_LENGTH = 64;
export const MAX_FEEDBACK_ANALYSIS_SIGNAL_FILTER_LENGTH = 4096;

/**
 * Floor on the feedback-analysis schedule interval. Every run is an LLM
 * analysis over a window of signals, so the interval is a cost control rather
 * than only a scheduling detail.
 */
export const MIN_FEEDBACK_ANALYSIS_INTERVAL_MINUTES = 15;

/** Applied when a feedback-analysis block omits the corresponding field. */
export const DEFAULT_FEEDBACK_ANALYSIS_INTERVAL = '24h';
export const DEFAULT_FEEDBACK_ANALYSIS_SIGNAL_TIME_RANGE_FROM = 'now-30d';

/** Advanced setting that gates the Context Engine feedback loop. */
export const CONTEXT_ENGINE_FEEDBACK_LOOP_ENABLED_SETTING_ID = 'contextEngine:feedbackLoopEnabled';

/** Task Manager type, id, and schedule for the global signal-generation task. */
export const SIGNAL_GENERATOR_TASK_TYPE = 'contextEngine:signalGenerator';
export const SIGNAL_GENERATOR_TASK_ID = 'contextengine-signal-generator';
export const SIGNAL_GENERATOR_SCHEDULE_INTERVAL = '1h';

/** Agent id whose tool calls are left untagged. */
export const MANAGEMENT_AGENT_ID = 'platform.context_engine.agent';

/**
 * Prefix for the per-space Agent Builder OTel traces indices (one per Kibana space). Kept
 * in-plugin — mirrors Agent Builder's exported `buildAgentBuilderTracesIndexPattern` contract —
 * so Context Engine does not take a dependency on `@kbn/agent-builder-plugin`.
 */
export const AGENT_BUILDER_TRACES_INDEX_PREFIX = 'traces-agent_builder.otel-';

/** The Agent Builder OTel traces index name for a given Kibana space. */
export const buildAgentBuilderTracesIndexName = (spaceId: string): string =>
  `${AGENT_BUILDER_TRACES_INDEX_PREFIX}${spaceId}`;
