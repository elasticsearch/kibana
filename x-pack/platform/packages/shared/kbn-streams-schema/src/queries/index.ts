/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';
import type { QueryDslQueryContainer } from '@elastic/elasticsearch/lib/api/types';
import { NonEmptyString } from '@kbn/zod-helpers/v4';
import { primitive } from '../shared/record_types';
import type { Feature } from '../feature';
import type { SignificantEventsResponse } from '../api/significant_events';

export interface EsqlQuery {
  query: string;
}

export const esqlQuerySchema: z.Schema<EsqlQuery> = z.object({
  query: z.string(),
});

interface StreamQueryBase {
  id: string;
  title: string;
  description: string;
}

export const QUERY_TYPE_MATCH = 'match' as const;
export const QUERY_TYPE_STATS = 'stats' as const;

export type QueryType = typeof QUERY_TYPE_MATCH | typeof QUERY_TYPE_STATS;

/**
 * Minimum severity score for auto-creating backing rules.
 * Severity bands: Low < 40, Medium [40, 60), High [60, 80), Critical >= 80.
 * High + Critical queries are eligible for automatic rule creation.
 */
export const HIGH_SEVERITY_THRESHOLD = 60;

export const queryTypeSchema = z.enum([QUERY_TYPE_MATCH, QUERY_TYPE_STATS]);

export const queryFeatureSchema = z.object({
  id: z.string(),
  run_id: z.string().optional(),
});

export type QueryFeature = z.infer<typeof queryFeatureSchema>;

export interface StreamQuery extends StreamQueryBase {
  type: QueryType;
  esql: EsqlQuery;
  // from 0 to 100. aligned with anomaly detection scoring
  severity_score?: number;
  evidence?: string[];
  features?: QueryFeature[];
  expires_at?: string;
}

const streamQueryBaseSchema = z.object({
  id: NonEmptyString,
  title: NonEmptyString,
  description: z.string(),
}) satisfies z.Schema<StreamQueryBase>;

/**
 * The `type` default exists for backward compatibility with pre-migration
 * stored documents that lack a type field. For all new writes the type MUST
 * be derived server-side via {@link deriveQueryType} — never trust the default.
 */
export const streamQuerySchema: z.Schema<StreamQuery> = streamQueryBaseSchema.extend({
  type: queryTypeSchema.default(QUERY_TYPE_MATCH),
  severity_score: z.number().optional(),
  evidence: z.array(z.string()).optional(),
  features: z.array(queryFeatureSchema).optional(),
  esql: esqlQuerySchema,
  expires_at: z.iso.datetime().optional(),
});

export const querySchema: z.ZodType<QueryDslQueryContainer> = z.lazy(() =>
  z.record(
    z.string(),
    z.union([primitive, z.array(z.union([primitive, querySchema])), querySchema])
  )
);

/**
 * Wire schema for creating/updating a query. The `type` field is intentionally
 * omitted — the server derives it from the ES|QL content via `deriveQueryType`
 * on every write, so client-supplied values would be ignored.
 */
export const upsertStreamQueryRequestSchema = z.object({
  title: NonEmptyString,
  esql: esqlQuerySchema,
  severity_score: z.number().optional(),
  evidence: z.array(z.string()).optional(),
  description: z.string().default(''),
  expires_at: z.iso.datetime().optional(),
});

/**
 * Wire schema for the bulk endpoint index operations.
 * Same as {@link upsertStreamQueryRequestSchema} but with `id` included,
 * and `type` intentionally omitted — derived server-side.
 */
export const bulkStreamQueryInputSchema = upsertStreamQueryRequestSchema.extend({
  id: NonEmptyString,
});

export interface QueriesGetResponse {
  queries: SignificantEventsResponse[];
  page: number;
  perPage: number;
  total: number;
}

export interface QueriesOccurrencesGetResponse {
  occurrences_histogram: Array<{ x: string; y: number }>;
  total_occurrences: number;
}

export interface QueryLink {
  query: StreamQuery;
  stream_name: string;
  /** Whether a Kibana rule exists for this query. */
  rule_backed: boolean;
  /** The deterministic ID of the Kibana rule associated with this query. */
  rule_id: string;
  /**
   * ISO timestamp of the latest revision in storage. Bumped by every write.
   * Read-only at the domain layer.
   */
  updated_at?: string;
  /**
   * ISO timestamp after which this query is considered stale.
   * Computed as `updated_at + ki_ttl_days` from the tuning config.
   */
  expires_at?: string;
}

/**
 * Unified knowledge indicator on the wire. Discriminated by the root `type`
 * field. Used by server callers that handle both feature and query KIs.
 */
export type KnowledgeIndicator =
  | { type: 'feature'; feature: Feature }
  | { type: 'query'; query: QueryLink };
