/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

// ===== Root-level shared fields =====

export const TIMESTAMP = '@timestamp';
export const ID = 'id';
export const TYPE = 'type';
export const TITLE = 'title';
export const DESCRIPTION = 'description';
export const TAGS = 'tags';
export const EVIDENCE = 'evidence';
export const STREAM_NAME = 'stream.name';
export const SEARCH_EMBEDDING = 'search_embedding';
export const EXCLUDED = 'excluded';
export const RUN_ID = 'run_id';
export const EXPIRES_AT = 'expires_at';

// ===== Feature-specific fields =====

export const FEATURE_SUBTYPE = 'feature.subtype';
export const FEATURE_SLUG = 'feature.slug';
export const FEATURE_TYPE = 'feature.type';
export const FEATURE_PROPERTIES = 'feature.properties';
export const FEATURE_CONFIDENCE = 'feature.confidence';
export const FEATURE_EVIDENCE_DOC_IDS = 'feature.evidence_doc_ids';
export const FEATURE_FILTER = 'feature.filter';
export const FEATURE_META = 'feature.meta';

// ===== Query-specific fields =====

export const QUERY_ESQL = 'query.esql';
export const QUERY_TYPE = 'query.query_type';
export const QUERY_SEVERITY_SCORE = 'query.severity_score';
export const QUERY_RULE_BACKED = 'query.rule_backed';
export const QUERY_RULE_ID = 'query.rule_id';
export const QUERY_FEATURES = 'query.features';

// ===== Discriminator values =====

export const KI_TYPE_FEATURE = 'feature' as const;
export const KI_TYPE_QUERY = 'query' as const;

export type KnowledgeIndicatorType = typeof KI_TYPE_FEATURE | typeof KI_TYPE_QUERY;
