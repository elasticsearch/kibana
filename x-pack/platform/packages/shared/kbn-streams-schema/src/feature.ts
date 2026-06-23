/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';
import { isEqual, uniq } from 'lodash';
import objectHash from 'object-hash';
import { v5 } from 'uuid';
import { conditionSchema, type Condition } from '@kbn/streamlang';
import { MAX_ID_LENGTH } from './sig_events/constants';

export const DATASET_ANALYSIS_FEATURE_TYPE = 'dataset_analysis' as const;
export const LOG_SAMPLES_FEATURE_TYPE = 'log_samples' as const;
export const LOG_PATTERNS_FEATURE_TYPE = 'log_patterns' as const;
export const ERROR_LOGS_FEATURE_TYPE = 'error_logs' as const;
export const CODE_ANALYSIS_FEATURE_TYPE = 'code_analysis' as const;

export const COMPUTED_FEATURE_TYPES = [
  DATASET_ANALYSIS_FEATURE_TYPE,
  LOG_SAMPLES_FEATURE_TYPE,
  LOG_PATTERNS_FEATURE_TYPE,
  ERROR_LOGS_FEATURE_TYPE,
  CODE_ANALYSIS_FEATURE_TYPE,
] as const;

export const INFERRED_FEATURE_TYPES = [
  'entity',
  'infrastructure',
  'technology',
  'dependency',
  'schema',
] as const;

// TODO: it would be nice to rename id->slug and uuid->id for consistency with queries
export const baseFeatureSchema = z.object({
  id: z.string(),
  stream_name: z.string(),
  type: z.string(),
  subtype: z.string().optional(),
  title: z.string().optional(),
  description: z.string(),
  properties: z.record(z.string(), z.unknown()),
  confidence: z.number().min(0).max(100),
  evidence: z.array(z.string()).optional(),
  evidence_doc_ids: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  filter: conditionSchema.optional(),
  meta: z.record(z.string(), z.unknown()).optional(),
});

export type BaseFeature = z.infer<typeof baseFeatureSchema>;

// Stricter schema for LLM-identified features — makes subtype, title, evidence, tags required
export const identifiedFeatureSchema = baseFeatureSchema
  .omit({ subtype: true, title: true, evidence: true, tags: true })
  .and(
    z.object({
      subtype: z.string(),
      title: z.string(),
      evidence: z.array(z.string()),
      tags: z.array(z.string()),
    })
  );

export type IdentifiedFeature = z.infer<typeof identifiedFeatureSchema>;

export const ignoredFeatureSchema = z.object({
  feature_id: z.string(),
  feature_title: z.string(),
  excluded_feature_id: z.string(),
  reason: z.string(),
});

export type IgnoredFeature = z.infer<typeof ignoredFeatureSchema>;

// Creation/write payload. `uuid` is derived from (id, stream_name, type) at the
// storage boundary (see `computeFeatureUuid` / `toStoredFeature`), so it is not
// part of the input — callers never supply it.
export const featureUpsertSchema = baseFeatureSchema.and(
  z.object({
    run_id: z.string().optional(),
    excluded: z.boolean().optional(),
    updated_at: z.iso.datetime().optional(),
    expires_at: z.iso.datetime().optional(),
  })
);

export type FeatureUpsert = z.infer<typeof featureUpsertSchema>;

// Canonical persisted feature. Once a feature has been stored and read back it
// always carries its derived `uuid`.
export const featureSchema = featureUpsertSchema.and(
  z.object({
    uuid: z.string().max(MAX_ID_LENGTH),
  })
);

export type Feature = z.infer<typeof featureSchema>;
export type FeatureWithFilter = Feature & { filter: Condition };

/**
 * Normalizes a feature id into its canonical slug form. Slugs are always
 * trimmed and lowercased so they match `isDuplicateFeature`'s case-insensitive
 * semantics and so the persisted slug stays in sync with the value the uuid is
 * derived from.
 */
export function normalizeFeatureSlug(id: string): string {
  return id.trim().toLowerCase();
}

/**
 * Computes a deterministic, stable uuid for a feature from its identifying
 * triple (slug, stream_name, type). The slug is normalized via
 * `normalizeFeatureSlug`. Used as the storage document id and for
 * delete/exclude/restore operations.
 */
export function computeFeatureUuid(
  feature: Pick<BaseFeature, 'id' | 'stream_name' | 'type'>
): string {
  const slug = normalizeFeatureSlug(feature.id);
  return v5(objectHash([feature.stream_name, feature.type, slug]), v5.DNS);
}

export function isFeature(feature: unknown): feature is Feature {
  return featureSchema.safeParse(feature).success;
}

export function isFeatureWithFilter(feature: unknown): feature is FeatureWithFilter {
  const result = featureSchema.safeParse(feature);
  return result.success && Boolean(result.data.filter);
}

export function isComputedFeature(feature: BaseFeature): boolean {
  return (COMPUTED_FEATURE_TYPES as unknown as string[]).includes(feature.type);
}

export function hasSameFingerprint(feature: BaseFeature, other: BaseFeature): boolean {
  return (
    feature.type === other.type &&
    feature.subtype === other.subtype &&
    isEqual(feature.properties, other.properties)
  );
}

export function isDuplicateFeature(feature: BaseFeature, other: BaseFeature): boolean {
  return (
    normalizeFeatureSlug(feature.id) === normalizeFeatureSlug(other.id) ||
    hasSameFingerprint(feature, other)
  );
}

const mergeArrays = (a: string[] | undefined, b: string[] | undefined): string[] | undefined => {
  const merged = uniq([...(a ?? []), ...(b ?? [])]);
  return merged.length > 0 ? merged : undefined;
};

export function toBaseFeature(feature: Feature): BaseFeature {
  return {
    id: feature.id,
    stream_name: feature.stream_name,
    type: feature.type,
    subtype: feature.subtype,
    title: feature.title,
    description: feature.description,
    properties: feature.properties,
    confidence: feature.confidence,
    evidence: feature.evidence,
    evidence_doc_ids: feature.evidence_doc_ids,
    tags: feature.tags,
    filter: feature.filter,
    meta: feature.meta,
  };
}

export function mergeFeature(existing: BaseFeature, incoming: BaseFeature): BaseFeature {
  const mergedMeta = { ...(existing.meta ?? {}), ...(incoming.meta ?? {}) };
  const mergedProperties = { ...(existing.properties ?? {}), ...(incoming.properties ?? {}) };

  return {
    id: existing.id,
    stream_name: existing.stream_name,
    type: existing.type,
    subtype: existing.subtype,
    title: incoming.title,
    description: incoming.description,
    properties: mergedProperties,
    confidence: Math.round((existing.confidence + incoming.confidence) / 2),
    evidence: mergeArrays(existing.evidence, incoming.evidence),
    evidence_doc_ids: mergeArrays(existing.evidence_doc_ids, incoming.evidence_doc_ids),
    tags: mergeArrays(existing.tags, incoming.tags),
    filter: incoming.filter ?? existing.filter,
    meta: Object.keys(mergedMeta).length > 0 ? mergedMeta : undefined,
  };
}
