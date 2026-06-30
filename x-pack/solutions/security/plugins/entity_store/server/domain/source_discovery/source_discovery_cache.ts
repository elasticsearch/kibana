/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElasticsearchClient, Logger } from '@kbn/core/server';
import { discoverPerTypeSourceIndices } from './discover_per_type_source_indices';
import type { DiscoveredPerTypeSources } from './identity_fields';

/**
 * POC refresh window. The `extract_entity_task` ticks every minute per entity
 * type (4 type tasks per namespace), so discovery must not run on every tick.
 * 15 minutes keeps `resolveIndex` + `field_caps` traffic negligible while still
 * picking up newly-onboarded sources within a bounded delay.
 */
export const DISCOVERED_SOURCE_CACHE_TTL_MS = 15 * 60 * 1000;

interface CacheEntry {
  expiresAt: number;
  value: DiscoveredPerTypeSources;
}

// Module-level, per-namespace. Shared across the type tasks in a Kibana node.
// Per-node and lost on restart — acceptable for a POC; the productionization
// path is a dedicated low-frequency discovery task persisting the map.
const cacheByNamespace = new Map<string, CacheEntry>();
// In-flight refreshes, so 4 concurrent type-task ticks trigger one discovery.
const inFlightByNamespace = new Map<string, Promise<DiscoveredPerTypeSources>>();

interface GetCachedParams {
  esClient: ElasticsearchClient;
  namespace: string;
  logger: Logger;
  /** Injectable clock for deterministic TTL tests. Defaults to `Date.now`. */
  now?: () => number;
}

/**
 * Returns the per-type discovered sources for a namespace, refreshing via
 * {@link discoverPerTypeSourceIndices} only when the cached entry is missing or
 * expired. Concurrent refreshes for the same namespace are deduped onto a single
 * in-flight promise. Discovery never throws (it degrades to empty sources), so
 * this resolver never throws either.
 */
export const getCachedPerTypeSourceIndices = async ({
  esClient,
  namespace,
  logger,
  now = Date.now,
}: GetCachedParams): Promise<DiscoveredPerTypeSources> => {
  const cached = cacheByNamespace.get(namespace);
  if (cached && cached.expiresAt > now()) {
    return cached.value;
  }

  const existing = inFlightByNamespace.get(namespace);
  if (existing) {
    return existing;
  }

  const refresh = (async () => {
    try {
      const value = await discoverPerTypeSourceIndices({ esClient, namespace, logger });
      cacheByNamespace.set(namespace, {
        value,
        expiresAt: now() + DISCOVERED_SOURCE_CACHE_TTL_MS,
      });
      return value;
    } finally {
      inFlightByNamespace.delete(namespace);
    }
  })();

  inFlightByNamespace.set(namespace, refresh);
  return refresh;
};

/** Clears cached discovery state. Pass a namespace to scope the reset; omit to clear all. */
export const clearDiscoveredSourceCache = (namespace?: string): void => {
  if (namespace === undefined) {
    cacheByNamespace.clear();
    inFlightByNamespace.clear();
    return;
  }
  cacheByNamespace.delete(namespace);
  inFlightByNamespace.delete(namespace);
};
