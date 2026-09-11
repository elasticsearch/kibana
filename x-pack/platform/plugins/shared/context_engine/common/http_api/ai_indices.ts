/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { EsqlEsqlColumnInfo, FieldValue } from '@elastic/elasticsearch/lib/api/types';
import type { ImprovementAction } from './improvement_actions';

/**
 * The type of backing store an AI index is attached to. `index` covers a
 * concrete index name or an index pattern (e.g. `foo`, `foo,bar`, `foo*`).
 */
export type AiIndexType = 'data_stream' | 'index';

export interface AiIndexDest {
  type: AiIndexType;
  value: string;
}

export type AiIndexSourceType = 'esql' | 'connector';

export interface AiIndexSource {
  type: AiIndexSourceType;
  value: string;
}

export type AiIndexAutomationType = 'workflow';

export interface AiIndexAutomation {
  type: AiIndexAutomationType;
  value: string;
}

/**
 * Which signals the feedback analysis reads. A read filter only: it narrows the
 * `@timestamp` range the analysis selects over, and never deletes or retains
 * signals. `relative` is date math evaluated per run (`now-30d`); `absolute` is
 * an open-ended "since this ISO date".
 */
export type AiIndexSignalTimeRange =
  | { type: 'relative'; from: string }
  | { type: 'absolute'; from: string };

/**
 * Per-index control plane for the feedback loop: whether to analyze this
 * index's signals, with which agent, how often, and over what window.
 */
export interface AiIndexFeedbackAnalysis {
  /**
   * Desired state. The scheduler remains authoritative for whether analysis is
   * actually running, because a schedule also needs credentials bound to it.
   */
  enabled: boolean;
  /** Agent Builder agent to analyze with. */
  agent_id?: string;
  schedule?: { interval: string };
  signal_time_range?: AiIndexSignalTimeRange;
  /**
   * KQL narrowing which signals a run analyzes, applied on top of
   * `signal_time_range`. It belongs here rather than in the generation pipeline
   * because generation is global and stateful: every index reads the same
   * signals, and dropping a signal at write time would drop it for every
   * consumer, permanently.
   */
  signal_filter?: string;
  /**
   * Which improvement actions this index's analysis may propose. Prompting an
   * agent to stay away from an action does not stop it, so the allowed set is
   * config rather than instruction. An empty list is observe-only: the run
   * still reports what it found but may not propose a change.
   */
  allowed_actions?: ImprovementAction[];
}

export interface AiIndexProperties {
  description?: string;
  dest: AiIndexDest;
  automations: AiIndexAutomation[];
  sources: AiIndexSource[];
  feedback_analysis?: AiIndexFeedbackAnalysis;
}

export interface AiIndexHttpItem extends AiIndexProperties {
  id: string;
  managed: boolean;
  date_created: string;
  date_modified: string;
}

export type GetAiIndexResponse = AiIndexHttpItem;

export interface ListAiIndexResponse {
  ai_indices: AiIndexHttpItem[];
}

export interface CreateAiIndexRequest extends AiIndexProperties {
  id: string;
}

export type PutAiIndexFeedbackAnalysisRequest = AiIndexFeedbackAnalysis;

export interface PutAiIndexFeedbackAnalysisResponse {
  /** The stored block with defaults resolved, so callers see what will actually run. */
  feedback_analysis: AiIndexFeedbackAnalysis;
}

export interface CreateAiIndexResponse {
  status: 'created';
}

export interface PutAiIndexResponse {
  status: 'created' | 'updated';
}

export interface DeleteAiIndexResponse {
  acknowledged: boolean;
}

export interface KiTypeCount {
  type: string;
  count: number;
}

export type AiIndexQueryParamValue = string | number | boolean;

/** The query decides the target; the server injects the space filter and a row limit. */
export interface QueryAiIndicesRequest {
  query: string;
  params?: Record<string, AiIndexQueryParamValue>;
  /** Defaults to `DEFAULT_AI_INDEX_QUERY_LIMIT`. Capped at `MAX_AI_INDEX_QUERY_LIMIT`. */
  limit?: number;
}

export interface QueryAiIndicesResponse {
  columns: EsqlEsqlColumnInfo[];
  values: FieldValue[][];
}

/** Free-form context block for an agent: what the index is, its fields, and how to query it. */
export interface DescribeAiIndexResponse {
  response: string;
}
