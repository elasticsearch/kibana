/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Feature, FeatureUpsert, QueryLink, StreamQuery } from '@kbn/streams-schema';
import {
  QUERY_TYPE_STATS,
  computeFeatureUuid,
  normalizeFeatureSlug,
  deriveQueryType,
} from '@kbn/streams-schema';
import type {
  StoredFeatureKnowledgeIndicator,
  StoredKnowledgeIndicator,
  StoredQueryKnowledgeIndicator,
  StoredTombstone,
} from '../data_stream';
import { KI_TYPE_FEATURE, KI_TYPE_QUERY } from '../fields';
import { computeRuleId } from '../helpers/compute_rule_id';

export function buildSearchEmbeddingFeature(feature: FeatureUpsert, streamName: string): string {
  const parts: string[] = [`Stream: ${streamName}`];
  if (feature.title) parts.push(`Title: ${feature.title}`);
  if (feature.description) parts.push(`Description: ${feature.description}`);
  if (feature.type) parts.push(`Type: ${feature.type}`);
  if (feature.subtype) parts.push(`Subtype: ${feature.subtype}`);
  if ((feature.tags?.length ?? 0) > 0) parts.push(`Tags: ${feature.tags?.join(', ')}`);
  return parts.join('\n');
}

export function buildSearchEmbeddingQuery(
  query: Pick<StreamQuery, 'title' | 'description'>,
  streamName: string
): string {
  const parts: string[] = [`Stream: ${streamName}`, `Title: ${query.title}`];
  if (query.description) parts.push(`Description: ${query.description}`);
  return parts.join('\n');
}

export function computeExpiresAt(timestamp: string, ttlDays: number): string {
  return new Date(new Date(timestamp).getTime() + ttlDays * 24 * 60 * 60 * 1000).toISOString();
}

export function toStoredFeature(
  streamName: string,
  feature: FeatureUpsert,
  includeEmbedding: boolean,
  expiresAt?: string
): StoredFeatureKnowledgeIndicator {
  const embedding = buildSearchEmbeddingFeature(feature, streamName);
  const timestamp = new Date().toISOString();
  const slug = normalizeFeatureSlug(feature.id);
  return {
    '@timestamp': timestamp,
    id: computeFeatureUuid({ id: slug, stream_name: streamName, type: feature.type }),
    type: KI_TYPE_FEATURE,
    title: feature.title,
    description: feature.description,
    tags: feature.tags,
    evidence: feature.evidence,
    'stream.name': streamName,
    excluded: feature.excluded,
    run_id: feature.run_id,
    ...(expiresAt ? { expires_at: expiresAt } : {}),
    feature: {
      type: feature.type,
      subtype: feature.subtype,
      properties: feature.properties,
      confidence: feature.confidence,
      evidence_doc_ids: feature.evidence_doc_ids,
      filter: feature.filter,
      meta: feature.meta,
      slug,
    },
    ...(includeEmbedding && embedding ? { search_embedding: embedding } : {}),
  };
}

export function toStoredQuery(
  streamName: string,
  query: StreamQuery & { rule_backed?: boolean; rule_id?: string },
  includeEmbedding: boolean,
  expiresAt?: string
): StoredQueryKnowledgeIndicator {
  const embedding = buildSearchEmbeddingQuery(query, streamName);
  const derivedType = deriveQueryType(query.esql.query);
  // STATS queries are never rule-backed.
  const ruleBacked = derivedType === QUERY_TYPE_STATS ? false : Boolean(query.rule_backed);
  const ruleId = query.rule_id ?? computeRuleId(streamName, query.id, query.esql.query);
  const timestamp = new Date().toISOString();
  return {
    '@timestamp': timestamp,
    id: query.id,
    type: KI_TYPE_QUERY,
    title: query.title,
    description: query.description,
    evidence: query.evidence,
    'stream.name': streamName,
    ...(expiresAt ? { expires_at: expiresAt } : {}),
    query: {
      esql: query.esql.query,
      query_type: derivedType,
      severity_score: query.severity_score,
      rule_backed: ruleBacked,
      rule_id: ruleId,
      features: query.features,
    },
    ...(includeEmbedding && embedding ? { search_embedding: embedding } : {}),
  };
}

export function toTombstone(
  streamName: string,
  identity: Pick<StoredKnowledgeIndicator, 'id' | 'type'>
): StoredTombstone {
  return {
    '@timestamp': new Date().toISOString(),
    id: identity.id,
    type: identity.type,
    'stream.name': streamName,
    deleted: true,
  };
}

export function queryFromLink(link: QueryLink): StreamQuery {
  return { ...link.query, expires_at: link.expires_at };
}

export function fromStoredFeature(doc: StoredFeatureKnowledgeIndicator): Feature {
  return {
    id: doc.feature.slug,
    uuid: doc.id,
    stream_name: doc['stream.name'],
    type: doc.feature.type,
    description: doc.description,
    properties: doc.feature.properties,
    confidence: doc.feature.confidence,
    title: doc.title,
    subtype: doc.feature.subtype,
    evidence: doc.evidence,
    evidence_doc_ids: doc.feature.evidence_doc_ids,
    tags: doc.tags,
    filter: doc.feature.filter,
    meta: doc.feature.meta,
    run_id: doc.run_id,
    excluded: doc.excluded,
    updated_at: doc['@timestamp'],
    expires_at: doc.expires_at,
  };
}

export function fromStoredQuery(doc: StoredQueryKnowledgeIndicator): QueryLink {
  const {
    query_type: type,
    rule_backed,
    rule_id,
    esql: esqlQuery,
    severity_score,
    features,
  } = doc.query;
  const ruleBacked = type === QUERY_TYPE_STATS ? false : rule_backed;

  return {
    stream_name: doc['stream.name'],
    rule_backed: ruleBacked,
    rule_id,
    updated_at: doc['@timestamp'],
    expires_at: doc.expires_at,
    query: {
      id: doc.id,
      type,
      title: doc.title,
      description: doc.description,
      esql: { query: esqlQuery },
      severity_score,
      features,
      evidence: doc.evidence,
    },
  };
}
