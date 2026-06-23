/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { DataStreamDefinition } from '@kbn/data-streams';
import type { Condition } from '@kbn/streamlang';
import type { MappingsDefinition } from '@kbn/es-mappings';
import { mappings } from '@kbn/es-mappings';
import type { QueryFeature, QueryType } from '@kbn/streams-schema';
import { KI_TYPE_FEATURE, KI_TYPE_QUERY, type KnowledgeIndicatorType } from './fields';

export const KNOWLEDGE_INDICATORS_DATA_STREAM = '.significant_events-knowledge_indicators';

/**
 * Mapping definition for the unified knowledge indicators data stream.
 *
 * Document layout:
 *  - Root-level shared KI fields (`id`, `type`, `title`, `description`, …).
 *  - `feature.*` payload populated when `type === 'feature'`.
 *  - `query.*` payload populated when `type === 'query'`.
 */
export const knowledgeIndicatorsMappings = {
  dynamic: false,
  properties: {
    '@timestamp': mappings.date({ format: 'strict_date_optional_time' }),
    id: mappings.keyword(),
    type: mappings.keyword(),
    title: mappings.keyword(),
    description: mappings.text(),
    tags: mappings.keyword(),
    evidence: mappings.keyword(),
    stream: mappings.object({
      properties: {
        name: mappings.keyword(),
      },
    }),
    deleted: mappings.boolean(),
    excluded: mappings.boolean(),
    run_id: mappings.keyword(),
    expires_at: mappings.date({ format: 'strict_date_optional_time' }),
    search_embedding: mappings.semanticText(),
    feature: mappings.object({
      properties: {
        type: mappings.keyword(),
        subtype: mappings.keyword(),
        slug: mappings.keyword(),
        properties: mappings.object({ enabled: false, properties: {} }),
        confidence: mappings.long(),
        evidence_doc_ids: mappings.keyword(),
        filter: mappings.object({ enabled: false, properties: {} }),
        meta: mappings.object({ enabled: false, properties: {} }),
      },
    }),
    query: mappings.object({
      properties: {
        esql: mappings.matchOnlyText(),
        query_type: mappings.keyword(),
        severity_score: mappings.long(),
        rule_backed: mappings.boolean(),
        rule_id: mappings.keyword(),
        features: mappings.object({
          properties: {
            id: mappings.keyword(),
            run_id: mappings.keyword(),
          },
        }),
      },
    }),
  },
} satisfies MappingsDefinition;

interface StoredKiRevisionIdentity {
  '@timestamp': string;
  id: string;
  'stream.name': string;
}

export interface StoredFeature {
  type: string;
  slug: string;
  properties: Record<string, unknown>;
  confidence: number;
  subtype?: string;
  evidence_doc_ids?: string[];
  filter?: Condition;
  meta?: Record<string, unknown>;
}

export interface StoredQuery {
  esql: string;
  query_type: QueryType;
  rule_backed: boolean;
  rule_id: string;
  severity_score?: number;
  features?: QueryFeature[];
}

export interface StoredFeatureKnowledgeIndicator extends StoredKiRevisionIdentity {
  type: typeof KI_TYPE_FEATURE;
  description: string;
  title?: string;
  tags?: string[];
  evidence?: string[];
  excluded?: boolean;
  run_id?: string;
  expires_at?: string;
  search_embedding?: string;
  feature: StoredFeature;
}

export interface StoredQueryKnowledgeIndicator extends StoredKiRevisionIdentity {
  type: typeof KI_TYPE_QUERY;
  title: string;
  description: string;
  evidence?: string[];
  excluded?: boolean;
  expires_at?: string;
  search_embedding?: string;
  query: StoredQuery;
}

export interface StoredTombstone {
  '@timestamp': string;
  id: string;
  type: KnowledgeIndicatorType;
  'stream.name': string;
  deleted: true;
}

/**
 * Server-side stored shape of a single revision in the knowledge indicators
 * data stream. Feature and query payloads are mutually exclusive; tombstones
 * carry only identity fields plus `deleted: true`.
 */
export type StoredKnowledgeIndicator =
  | StoredFeatureKnowledgeIndicator
  | StoredQueryKnowledgeIndicator
  | StoredTombstone;

export function isStoredFeatureKnowledgeIndicator(
  doc: StoredKnowledgeIndicator
): doc is StoredFeatureKnowledgeIndicator {
  return doc.type === KI_TYPE_FEATURE && 'feature' in doc;
}

export function isStoredQueryKnowledgeIndicator(
  doc: StoredKnowledgeIndicator
): doc is StoredQueryKnowledgeIndicator {
  return doc.type === KI_TYPE_QUERY && 'query' in doc;
}

/**
 * Data stream definition consumed by `DataStreamClient`. We keep the typed
 * document shape opt-in via `as` so that `feature.*` / `query.*` can stay
 * mutually exclusive even though the mapping expresses both as `object`.
 */
export const knowledgeIndicatorsDataStream: DataStreamDefinition<
  typeof knowledgeIndicatorsMappings,
  // Cast: the mapping describes both feature.* and query.*; the doc shape is
  // discriminated by `type`. EnsureSubsetOf can't express that natively.
  StoredKnowledgeIndicator & Record<string, unknown>
> = {
  name: KNOWLEDGE_INDICATORS_DATA_STREAM,
  version: 2,
  hidden: true,
  template: {
    priority: 500,
    lifecycle: { data_retention: '90d' },
    mappings: knowledgeIndicatorsMappings,
  },
};
