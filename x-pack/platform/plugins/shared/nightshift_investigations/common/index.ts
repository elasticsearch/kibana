/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  InvestigationBlindSpot,
  InvestigationHypothesis,
  InvestigationImpact,
  InvestigationRecommendation,
  Severity,
  TriggerFeedback,
} from '@kbn/significant-events-schema';
import type { InvestigationSubjectType, InvestigationTriggerType } from './workflows/triggers';

/**
 * Re-exported so consumers of these responses do not need their own dependency on
 * `@kbn/significant-events-schema`. Investigations rate themselves on the same severity tier scale
 * significant events use, so a tier added there widens these responses too.
 */
export type { Severity } from '@kbn/significant-events-schema';

export {
  INVESTIGATION_SUBJECT_TYPES,
  type InvestigationSubjectType,
  INVESTIGATION_TRIGGER_TYPES,
  DEFAULT_INVESTIGATION_TRIGGER_TYPE,
  type InvestigationTriggerType,
} from './workflows/triggers';

/**
 * The alert-facing types are derived from the zod schemas in `./schemas`, so the validation a
 * caller is held to and the type the code is written against cannot disagree.
 */
export type {
  AlertInvestigationContext,
  AlertSnapshot,
  AlertSnapshotEvaluation,
  AlertSnapshotGroup,
  InvestigationContext,
  InvestigationSubject,
} from './schemas';

export {
  alertInvestigationContextSchema,
  alertSnapshotSchema,
  freeFormContextSchema,
  investigationSubjectSchema,
  MAX_ALERTS_PER_INVESTIGATION,
} from './schemas';

import type {
  AlertInvestigationContext,
  InvestigationContext,
  InvestigationSubject,
} from './schemas';

export interface StartInvestigationRequest {
  subject: InvestigationSubject;
  /**
   * What initiated the investigation. Defaults to "manual" when omitted.
   */
  trigger_type?: InvestigationTriggerType;
  /**
   * Caller-supplied prompt for the investigation agent. Falls back to a generic
   * message derived from the subject when omitted.
   */
  message?: string;
  /**
   * Stream names the investigation should scope its signal search to.
   */
  stream_names?: string[];
  /**
   * Caller-supplied key for concurrency control. Passed to the workflow engine as
   * `concurrency_key`, which maps to `concurrencyGroupKey` in the execution index.
   * Two starts with the same key cancel-and-replace the in-flight run (cancel-in-progress
   * strategy). Use a stable, unique caller-side ID — e.g. the alert _id or event UUID.
   */
  concurrency_key?: string;
  context?: InvestigationContext | AlertInvestigationContext;
}

export interface StartInvestigationResponse {
  investigation_id: string;
}

/** Bound for investigation ids, concurrency keys, and other keyword-sized strings. */
export const MAX_KEYWORD_LENGTH = 500;

/** Subject id a manual investigation persists under when the caller supplies none. */
export const DEFAULT_MANUAL_INVESTIGATION_SUBJECT_ID = 'manual';

export const INVESTIGATION_STATUSES = [
  'pending',
  'running',
  'completed',
  'failed',
  'cancelled',
] as const;
export type InvestigationStatus = (typeof INVESTIGATION_STATUSES)[number];

export const UPDATABLE_INVESTIGATION_STATUSES = [
  'running',
  'completed',
  'failed',
  'cancelled',
] as const;
export type UpdatableInvestigationStatus = (typeof UPDATABLE_INVESTIGATION_STATUSES)[number];

export interface InvestigationStructuredOutput {
  summary?: string;
  conclusion?: string;
  severity?: Severity;
  hypotheses?: InvestigationHypothesis[];
  recommendations?: InvestigationRecommendation[];
  blind_spots?: InvestigationBlindSpot[];
  trigger_feedback?: TriggerFeedback[];
  impact?: InvestigationImpact;
}

/** Body of PATCH /internal/nightshift/investigations/{id}. */
export interface UpdateInvestigationRequest extends InvestigationStructuredOutput {
  status: UpdatableInvestigationStatus;
  error?: string;
  conversation_id?: string;
}

export interface GetInvestigationResponse extends InvestigationStructuredOutput {
  investigation_id: string;
  subject: InvestigationSubject;
  trigger_type?: InvestigationTriggerType;
  status: InvestigationStatus;
  created_at: string;
  /** Unset until the run leaves `pending`, so it can lag `created_at` by minutes. */
  started_at?: string;
  completed_at?: string;
  concurrency_key?: string;
  executed_by?: string;
  error?: string;
  conversation_id?: string;
}

export interface InvestigationStatusEvent {
  type: 'investigation_status';
  investigation_id: string;
  status: InvestigationStatus;
}

export interface ListInvestigationsRequest {
  statuses?: InvestigationStatus[];
  severities?: Severity[];
  subject_types?: InvestigationSubjectType[];
  /**
   * Full-text query matched against subject_summary, summary, and conclusion.
   */
  query?: string;
  concurrency_key?: string;
  created_after?: string;
  created_before?: string;
  started_after?: string;
  started_before?: string;
  completed_after?: string;
  completed_before?: string;
  sort_field?: 'created_at' | 'completed_at' | 'severity';
  sort_order?: 'asc' | 'desc';
  page?: number;
  size?: number;
}

export type ListInvestigationItem = Pick<
  GetInvestigationResponse,
  | 'investigation_id'
  | 'status'
  | 'created_at'
  | 'started_at'
  | 'completed_at'
  | 'severity'
  | 'concurrency_key'
  | 'executed_by'
  | 'subject'
  | 'summary'
  | 'impact'
>;

export interface PaginatedResponse<T> {
  results: T[];
  page: number;
  size: number;
  total: number;
}

export type ListInvestigationsResponse = PaginatedResponse<ListInvestigationItem>;

/**
 * Filters for the severity-count facet. A subset of `ListInvestigationsRequest`: no pagination,
 * no sort, and no `severities` — the counts describe how many investigations sit in each tier
 * under the other active filters, so narrowing by tier would make them self-referential.
 */
export type SeverityCountsRequest = Omit<
  ListInvestigationsRequest,
  'severities' | 'sort_field' | 'sort_order' | 'page' | 'size'
>;

/** Counts of investigations at each severity tier, zero-filled for all four tiers. */
export type SeverityCounts = Record<Severity, number>;

export interface SeverityCountsResponse {
  severity_counts: SeverityCounts;
}

export {
  CORTEX_AI_INDEX_ID,
  CORTEX_AI_INDEX_DEST,
  CORTEX_ENTITY_TYPES,
  CORTEX_PAGE_STATUSES,
  CORTEX_ENTITY_TYPE_BUCKETS,
  type CortexEntityType,
  type CortexPageStatus,
  type CortexPageSummary,
  type CortexPage,
  type CortexStats,
  type ListCortexPagesResponse,
  type GetCortexPageResponse,
} from './cortex';

export {
  INVESTIGATION_STARTED_TRIGGER_ID,
  INVESTIGATION_COMPLETED_TRIGGER_ID,
  INVESTIGATION_FAILED_TRIGGER_ID,
  type InvestigationsTriggerId,
  type InvestigationsTriggerPayloadMap,
  type InvestigationsTriggerBasePayload,
  type InvestigationCompletedTriggerPayload,
  type InvestigationFailedTriggerPayload,
} from './workflows/triggers';
