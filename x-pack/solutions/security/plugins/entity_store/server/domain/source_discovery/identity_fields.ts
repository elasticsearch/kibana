/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { EntityType } from '../../../common/domain/definitions/entity_schema';

/**
 * Identity source fields per entity type — the fields whose presence in an
 * index source qualifies that source for the corresponding engine.
 *
 * These mirror each static engine's identity contract as expressed in the
 * entity definitions under `common/domain/definitions/`:
 * - `user`   → `user.{email,id,name,domain}`.
 * - `host`   → `host.{id,name,hostname}`.
 * - `service`→ `service.name`.
 * - `generic`→ `entity.id`.
 *
 * Keeping this list here (rather than deriving it from the `euidRanking`
 * branches at runtime) is deliberate: the ranking branches encode precedence
 * and composition rules that are irrelevant to "does this source carry any of
 * this engine's identity fields?". Expanding an engine's identity contract is
 * an audited change that should update this constant in lockstep.
 */
export const ENTITY_TYPE_IDENTITY_FIELDS = {
  user: ['user.email', 'user.id', 'user.name', 'user.domain'],
  host: ['host.id', 'host.name', 'host.hostname'],
  service: ['service.name'],
  generic: ['entity.id'],
} as const satisfies Record<EntityType, readonly string[]>;

export const ENTITY_TYPES = Object.keys(ENTITY_TYPE_IDENTITY_FIELDS) as EntityType[];

/** Union of every identity field across all entity types. */
export const ALL_IDENTITY_FIELDS: readonly string[] = Array.from(
  new Set(Object.values(ENTITY_TYPE_IDENTITY_FIELDS).flat())
);

/**
 * Elasticsearch field types accepted as identity sources. `keyword` is
 * exact-match and aggregatable, so it is safe to extract/group on; `text` /
 * `match_only_text` and unmapped fields are intentionally excluded. Pushed into
 * the `field_caps` `types` filter, and centralized here so the safe set can be
 * widened later (e.g. `constant_keyword`, `wildcard`, `ip`) without touching
 * call sites.
 */
export const SAFE_IDENTITY_FIELD_TYPES: readonly string[] = ['keyword'];

/** Per-type resolved source index patterns. One array per entity type; deduped, order-stable. */
export type PerTypeSourceIndices = Record<EntityType, string[]>;

/** Provenance for the visibility surface: which source qualified for which type, and why. */
export interface PerTypeSourceProvenance {
  entityType: EntityType;
  /** The clean source name (data stream / alias / standalone index) that qualified. */
  sourceName: string;
  /** The identity fields that caused this source to qualify for `entityType`. */
  matchedFields: string[];
}

export interface DiscoveredPerTypeSources {
  sources: PerTypeSourceIndices;
  provenance: PerTypeSourceProvenance[];
}

/** A fresh, fully-keyed empty per-type source map. */
export const emptySources = (): PerTypeSourceIndices => ({
  user: [],
  host: [],
  service: [],
  generic: [],
});
