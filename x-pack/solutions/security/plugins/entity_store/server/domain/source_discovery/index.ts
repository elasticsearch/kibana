/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export {
  ALL_IDENTITY_FIELDS,
  ENTITY_TYPES,
  ENTITY_TYPE_IDENTITY_FIELDS,
  SAFE_IDENTITY_FIELD_TYPES,
  emptySources,
  type DiscoveredPerTypeSources,
  type PerTypeSourceIndices,
  type PerTypeSourceProvenance,
} from './identity_fields';
export { buildConcreteIndexToSourceNameMap } from './resolve_source_index_map';
export { discoverPerTypeSourceIndices } from './discover_per_type_source_indices';
export {
  DISCOVERED_SOURCE_CACHE_TTL_MS,
  clearDiscoveredSourceCache,
  getCachedPerTypeSourceIndices,
} from './source_discovery_cache';
