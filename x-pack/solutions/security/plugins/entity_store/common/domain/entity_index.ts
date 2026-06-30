/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export const ENTITY_LATEST = 'latest' as const;
export const ENTITY_UPDATES = 'updates' as const;
export const ENTITY_HISTORY = 'history' as const;
export const ENTITY_METADATA = 'metadata' as const;

export const ENTITY_BASE_PREFIX = 'entities';

export const ENTITY_SCHEMA_VERSION_V2 = 'v2';

// Bump this integer whenever entity index mappings change.
export const MAPPING_VERSION = 1;

type SchemaVersion = `v${number}`;
type Dataset =
  | typeof ENTITY_LATEST
  | typeof ENTITY_UPDATES
  | typeof ENTITY_HISTORY
  | typeof ENTITY_METADATA;

interface IndexPatternOptions<TDataset extends Dataset> {
  dataset: TDataset;
  schemaVersion: SchemaVersion;
  namespace: string;
}

export const getEntityIndexPattern = <TDataset extends Dataset>({
  schemaVersion,
  dataset,
  namespace,
}: IndexPatternOptions<TDataset>) =>
  `.${ENTITY_BASE_PREFIX}.${schemaVersion}.${dataset}.security_${namespace}` as const;

// Returns the alias name for an entity dataset. Used for alias creation, privilege
// checks, and external consumers. Internal read/write operations should use
// getLatestEntitiesIndexName to target the concrete index directly.
export const getEntitiesAlias = (dataset: Dataset, namespace: string) =>
  `${ENTITY_BASE_PREFIX}-${dataset}-${namespace}` as const;

// Returns the index pattern matching all versioned latest entity indices.
export const getLatestEntityIndexPattern = (namespace: string) =>
  `${getEntityIndexPattern({
    schemaVersion: ENTITY_SCHEMA_VERSION_V2,
    dataset: ENTITY_LATEST,
    namespace,
  })}-*` as const;

// Returns the index pattern matching the entity metadata datastream.
export const getMetadataEntityIndexPattern = (namespace: string) =>
  `${getEntityIndexPattern({
    schemaVersion: ENTITY_SCHEMA_VERSION_V2,
    dataset: ENTITY_METADATA,
    namespace,
  })}-*` as const;

const padVersion = (version: number): string => String(version).padStart(5, '0');

// Returns the concrete index name for the latest entities index (with version suffix)
export const getLatestEntitiesIndexName = (namespace: string) =>
  `${getEntityIndexPattern({
    schemaVersion: ENTITY_SCHEMA_VERSION_V2,
    dataset: ENTITY_LATEST,
    namespace,
  })}-${padVersion(MAPPING_VERSION)}`;

// Returns the write alias for the entity metadata datastream.
export const getEntityMetadataAlias = (namespace: string) =>
  `${ENTITY_BASE_PREFIX}-${ENTITY_METADATA}-${namespace}` as const;
